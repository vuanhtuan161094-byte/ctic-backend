import { BadRequestException } from '@nestjs/common';
import { parseTaxonomyRows } from './taxonomy-lookup.query';
import {
  TAXONOMY_OPERATIONAL_REVISIONS,
  TaxonomyRuntimePolicyService,
} from './taxonomy-runtime-policy.service';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const at = date('2026-09-14');
const code = (
  id: string,
  type: 'ISIC' | 'NACE',
  value: string,
  level = 4,
  parent: string | null = null,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  classification_type: type,
  revision: TAXONOMY_OPERATIONAL_REVISIONS[type],
  code: value,
  title_en: value,
  title_vi: null,
  parent_code: parent,
  level,
  valid_from: null,
  valid_to: null,
  is_active: true,
  ...overrides,
});
const iaf = (id: string, value: string, active = true) => ({
  id,
  iaf_code: value,
  iaf_name: `IAF ${value}`,
  is_active: active,
});
const industryMap = (
  id: string,
  source: ReturnType<typeof code>,
  target: ReturnType<typeof code>,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  source_code_id: source.id,
  target_code_id: target.id,
  mapping_type: 'EXACT',
  mapping_status: 'APPROVED',
  valid_from: null,
  valid_to: null,
  source_code: source,
  target_code: target,
  ...overrides,
});
const iafMap = (
  id: string,
  nace: ReturnType<typeof code>,
  scope: ReturnType<typeof iaf>,
  system = 'QMS',
  overrides: Record<string, unknown> = {},
) => ({
  id,
  nace_code_id: nace.id,
  iaf_scope_id: scope.id,
  management_system: system,
  mapping_status: 'APPROVED',
  source_document: 'IAF ID 1',
  valid_from: null,
  valid_to: null,
  nace_code: nace,
  iaf_scope: scope,
  ...overrides,
});
const policy = (
  classifications: unknown[],
  industryMappings: unknown[] = [],
  naceIafMappings: unknown[] = [],
  iafScopes: unknown[] = [],
) =>
  new TaxonomyRuntimePolicyService({
    $queryRaw: jest.fn().mockResolvedValue([{
      classifications: JSON.stringify(classifications),
      industryMappings: JSON.stringify(industryMappings),
      naceIafMappings: JSON.stringify(naceIafMappings),
    }]),
    industry_classifications: {
      findMany: jest.fn().mockResolvedValue(classifications),
    },
    industry_code_mappings: {
      findMany: jest.fn().mockResolvedValue(industryMappings),
    },
    nace_iaf_mappings: {
      findMany: jest.fn().mockResolvedValue(naceIafMappings),
    },
    iaf_scopes: { findMany: jest.fn().mockResolvedValue(iafScopes) },
  } as any);

describe('TaxonomyRuntimePolicyService canonical resolution', () => {
  it('preserves Prisma UUID/date/null semantics for SQL JSON', () => {
    expect(parseTaxonomyRows(null)).toEqual([]);
    expect(parseTaxonomyRows('null')).toEqual([]);
    expect(parseTaxonomyRows('[{"id":"963F1221-07F4-496F-AEC8-3ED659B3CB5B","updated_at":"2026-08-26T01:42:38.953","valid_to":null}]')).toEqual([
      { id: '963f1221-07f4-496f-aec8-3ed659b3cb5b', updated_at: new Date('2026-08-26T01:42:38.953Z'), valid_to: null },
    ]);
  });
  it('resolves 2 ISIC x 3 systems with one parameterized DB call and unchanged mapping IDs', async () => {
    const isics = [code('i1', 'ISIC', '2220'), code('i2', 'ISIC', '3330')];
    const nace = code('n', 'NACE', '22.29');
    const scope = iaf('s', '14');
    const instance = policy([...isics, nace], isics.map((i) => industryMap(`in-${i.id}`, i, nace)),
      ['QMS', 'EMS', 'OHSMS'].map((s) => iafMap(`ni-${s}`, nace, scope, s)), [scope]);
    const requests = isics.flatMap((i) => ['QMS', 'EMS', 'OHSMS'].map((s) => ({
      classification_type: 'ISIC', revision: 'ISIC_REV_4', code: i.code, management_system: s,
    })));
    const results = await instance.resolveBatch(requests, at);
    expect(results).toHaveLength(6);
    const prisma = (instance as any).prisma;
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    for (const table of ['industry_classifications', 'industry_code_mappings', 'nace_iaf_mappings', 'iaf_scopes']) {
      expect(prisma[table].findMany).not.toHaveBeenCalled();
    }
    results.forEach((r, index) => {
      expect(r.iaf_summary.iaf_codes).toEqual(['14']);
      expect(r.nace_candidates[0]).toMatchObject({ mapping_id: `in-${isics[Math.floor(index / 3)].id}` });
      expect(r.nace_candidates[0].iaf_candidates[0].mapping_id).toBe(`ni-${requests[index].management_system}`);
    });
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toContain(JSON.stringify(requests));
    expect(query.sql).not.toContain('2220');
  });
  it('resolves exact ISIC to NACE to IAF', async () => {
    const isic = code('isic', 'ISIC', '2220');
    const nace = code('nace', 'NACE', '22.29');
    const scope = iaf('iaf14', '14');
    const result = await policy(
      [isic, nace],
      [industryMap('in', isic, nace)],
      [iafMap('ni', nace, scope)],
      [scope],
    ).resolve('ISIC', 'ISIC_REV_4', '2220', 'QMS', at);
    expect(result.iaf_summary.status).toBe('UNIQUE');
    expect(result.nace_candidates[0].iaf_candidates[0].mapping_id).toBe('ni');
  });

  it('retains one-to-many NACE candidates for an ISIC', async () => {
    const isic = code('isic', 'ISIC', '2220');
    const n1 = code('n1', 'NACE', '22.21');
    const n2 = code('n2', 'NACE', '22.22');
    const scope = iaf('iaf14', '14');
    const result = await policy(
      [isic, n1, n2],
      [industryMap('m1', isic, n1), industryMap('m2', isic, n2)],
      [iafMap('i1', n1, scope), iafMap('i2', n2, scope)],
      [scope],
    ).resolve('ISIC', 'ISIC_REV_4', '2220', 'QMS', at);
    expect(result.nace_candidates).toHaveLength(2);
    expect(result.requires_selection).toBe(true);
  });

  it('resolves direct NACE to IAF', async () => {
    const nace = code('nace', 'NACE', '22.29');
    const scope = iaf('iaf14', '14');
    const result = await policy(
      [nace],
      [],
      [iafMap('ni', nace, scope)],
      [scope],
    ).resolve('NACE', 'NACE_REV_2', '22.29', 'QMS', at);
    expect(result.nace_candidates[0].resolution_status).toBe('DIRECT_UNIQUE');
  });

  it('derives unique IAF from homogeneous child mappings', async () => {
    const parent = code('p', 'NACE', '26.5', 3, '26');
    const c1 = code('c1', 'NACE', '26.51', 4, '26.5');
    const c2 = code('c2', 'NACE', '26.52', 4, '26.5');
    const scope = iaf('iaf19', '19');
    const result = await policy(
      [parent, c1, c2],
      [],
      [iafMap('m1', c1, scope), iafMap('m2', c2, scope)],
      [scope],
    ).resolve('NACE', 'NACE_REV_2', '26.5', 'QMS', at);
    expect(result.nace_candidates[0].resolution_status).toBe('DERIVED_UNIQUE');
    expect(result.iaf_summary.iaf_codes).toEqual(['19']);
  });

  it('returns multiple when child mappings span IAF scopes', async () => {
    const parent = code('p', 'NACE', '23', 2, 'C');
    const g1 = code('g1', 'NACE', '23.1', 3, '23');
    const g2 = code('g2', 'NACE', '23.5', 3, '23');
    const c1 = code('c1', 'NACE', '23.11', 4, '23.1');
    const c2 = code('c2', 'NACE', '23.51', 4, '23.5');
    const s15 = iaf('i15', '15');
    const s16 = iaf('i16', '16');
    const result = await policy(
      [parent, g1, g2, c1, c2],
      [],
      [iafMap('m1', c1, s15), iafMap('m2', c2, s16)],
      [s15, s16],
    ).resolve('NACE', 'NACE_REV_2', '23', 'QMS', at);
    expect(result.iaf_summary.status).toBe('MULTIPLE');
  });

  it('gives direct parent mapping precedence over child mappings', async () => {
    const parent = code('p', 'NACE', '26.5', 3, '26');
    const child = code('c', 'NACE', '26.51', 4, '26.5');
    const direct = iaf('i19', '19');
    const childScope = iaf('i20', '20');
    const result = await policy(
      [parent, child],
      [],
      [iafMap('direct', parent, direct), iafMap('child', child, childScope)],
      [direct, childScope],
    ).resolve('NACE', 'NACE_REV_2', '26.5', 'QMS', at);
    expect(result.iaf_summary.iaf_codes).toEqual(['19']);
    expect(result.nace_candidates[0].resolution_status).toBe('DIRECT_UNIQUE');
  });

  it.each(['97.00', '98.10', '99'])(
    'marks NACE %s outside the IAF table',
    async (value) => {
      const nace = code('nace', 'NACE', value);
      const result = await policy([nace]).resolve(
        'NACE',
        'NACE_REV_2',
        value,
        'QMS',
        at,
      );
      expect(result.iaf_summary.status).toBe('OUTSIDE_IAF_TABLE');
    },
  );

  it('returns unresolved for certifiable NACE without current IAF mapping', async () => {
    const nace = code('nace', 'NACE', '22.29');
    const result = await policy([nace]).resolve(
      'NACE',
      'NACE_REV_2',
      '22.29',
      'QMS',
      at,
    );
    expect(result.iaf_summary.status).toBe('UNRESOLVED');
  });

  it.each([
    ['expired', { valid_to: date('2026-09-13') }],
    ['future', { valid_from: date('2026-09-15') }],
  ])('ignores a %s mapping', async (_, validity) => {
    const nace = code('nace', 'NACE', '22.29');
    const scope = iaf('iaf14', '14');
    const result = await policy(
      [nace],
      [],
      [iafMap('ni', nace, scope, 'QMS', validity)],
      [scope],
    ).resolve('NACE', 'NACE_REV_2', '22.29', 'QMS', at);
    expect(result.iaf_summary.status).toBe('UNRESOLVED');
  });

  it('rejects inactive source classification', async () => {
    const isic = code('isic', 'ISIC', '2220', 4, null, { is_active: false });
    await expect(
      policy([isic]).resolve('ISIC', 'ISIC_REV_4', '2220', 'QMS', at),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores inactive NACE target classification', async () => {
    const isic = code('isic', 'ISIC', '2220');
    const nace = code('nace', 'NACE', '22.29', 4, null, { is_active: false });
    const result = await policy(
      [isic, nace],
      [industryMap('in', isic, nace)],
    ).resolve('ISIC', 'ISIC_REV_4', '2220', 'QMS', at);
    expect(result.nace_candidates).toHaveLength(0);
  });

  it('ignores inactive IAF target', async () => {
    const nace = code('nace', 'NACE', '22.29');
    const scope = iaf('iaf14', '14', false);
    const result = await policy(
      [nace],
      [],
      [iafMap('ni', nace, scope)],
      [scope],
    ).resolve('NACE', 'NACE_REV_2', '22.29', 'QMS', at);
    expect(result.iaf_summary.status).toBe('UNRESOLVED');
  });

  it('does not reuse mapping from wrong management system', async () => {
    const nace = code('nace', 'NACE', '22.29');
    const scope = iaf('iaf14', '14');
    const result = await policy(
      [nace],
      [],
      [iafMap('ni', nace, scope, 'EMS')],
      [scope],
    ).resolve('NACE', 'NACE_REV_2', '22.29', 'QMS', at);
    expect(result.iaf_summary.status).toBe('UNRESOLVED');
  });

  it('rejects non-operational revision', async () => {
    const nace = code('nace', 'NACE', '22.29');
    await expect(
      policy([nace]).resolve('NACE', 'NACE_REV_1', '22.29', 'QMS', at),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TaxonomyRuntimePolicyService write validation and readiness', () => {
  const chain = () => ({
    isic: code('isic', 'ISIC', '2220'),
    nace: code('nace', 'NACE', '22.29'),
    scope: iaf('iaf14', '14'),
  });
  const input = {
    isic_code_id: 'isic',
    isic_nace_mapping_id: 'in',
    nace_code_id: 'nace',
    nace_iaf_mapping_id: 'ni',
    management_system: 'QMS' as const,
    scope_description: 'Plastic products',
  };

  it('accepts current resolved Application Review selection', async () => {
    const { isic, nace, scope } = chain();
    const result = await policy(
      [isic, nace],
      [industryMap('in', isic, nace)],
      [iafMap('ni', nace, scope)],
      [scope],
    ).validateIndustryScopes([input], at);
    expect(result[0].nace_iaf_mapping_id).toBe('ni');
  });

  it.each([
    ['expired since resolve', { valid_to: date('2026-09-13') }],
    ['future since resolve', { valid_from: date('2026-09-15') }],
  ])('fails closed when selected mapping is %s', async (_, validity) => {
    const { isic, nace, scope } = chain();
    await expect(
      policy(
        [isic, nace],
        [industryMap('in', isic, nace)],
        [iafMap('ni', nace, scope, 'QMS', validity)],
        [scope],
      ).validateIndustryScopes([input], at),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale mapping id', async () => {
    const { isic, nace, scope } = chain();
    await expect(
      policy(
        [isic, nace],
        [industryMap('current', isic, nace)],
        [iafMap('ni', nace, scope)],
        [scope],
      ).validateIndustryScopes([input], at),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports healthy QMS EMS OHSMS coverage as ready', async () => {
    const { isic, nace, scope } = chain();
    const mappings = ['QMS', 'EMS', 'OHSMS'].map((system) =>
      iafMap(`ni-${system}`, nace, scope, system),
    );
    const result = await policy(
      [isic, nace],
      [industryMap('in', isic, nace)],
      mappings,
      [scope],
    ).getReadiness(at);
    expect(result.ready).toBe(true);
    expect(result.coverage).toHaveLength(3);
  });

  it('returns reason code when operational ISIC revision is missing', async () => {
    const nace = code('nace', 'NACE', '97.00');
    const result = await policy(
      [nace],
      [],
      [],
      [iaf('iaf14', '14')],
    ).getReadiness(at);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TAXONOMY_ISIC_DATA_MISSING' }),
      ]),
    );
  });

  it('fails readiness when certifiable coverage is incomplete', async () => {
    const { isic, nace, scope } = chain();
    const result = await policy(
      [isic, nace],
      [industryMap('in', isic, nace)],
      [],
      [scope],
    ).getReadiness(at);
    expect(result.ready).toBe(false);
    expect(
      result.reasons.filter(
        (reason) => reason.code === 'TAXONOMY_COVERAGE_INCOMPLETE',
      ),
    ).toHaveLength(3);
  });

  it('does not count outside-table activity as unresolved coverage', async () => {
    const isic = code('isic', 'ISIC', '9700');
    const nace = code('nace', 'NACE', '97.00');
    const scope = iaf('iaf14', '14');
    const result = await policy(
      [isic, nace],
      [industryMap('in', isic, nace)],
      [],
      [scope],
    ).getReadiness(at);
    expect(result.coverage.every((coverage) => coverage.unresolved === 0)).toBe(
      true,
    );
    expect(result.ready).toBe(true);
  });
});
