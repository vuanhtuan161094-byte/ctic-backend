import { MasterDataConfigurationService } from './master-data-configuration.service';
import { TaxonomyRuntimePolicyService } from '../industry-classifications/taxonomy-runtime-policy.service';

const headers = {
  SCHEME: 'code,name,description,effective_from,effective_to',
  INDUSTRY_CLASSIFICATION: 'classification_type,revision,code,title_en,title_vi,parent_code,level,valid_from,valid_to',
  ISIC_NACE_MAPPING: 'isic_revision,isic_code,nace_revision,nace_code,mapping_type,note,valid_from,valid_to',
  NACE_IAF_MAPPING: 'nace_revision,nace_code,iaf_code,management_system,source_document,valid_from,valid_to',
};
const classification = (id: string, type: string, code: string) => ({ id, classification_type: type, revision: type === 'ISIC' ? 'ISIC_REV_4' : 'NACE_REV_2', code, title_en: code, title_vi: null, parent_code: null, level: 4, is_active: true, valid_from: null, valid_to: null });
function harness() {
  let state: Record<string, any[]> = {
    certification_schemes: [], standard_editions: [],
    industry_classifications: [classification('isic', 'ISIC', '10.10'), classification('nace', 'NACE', '10.10')],
    iaf_scopes: [{ id: 'iaf', iaf_code: '03', iaf_name: 'Food', is_active: true }],
    industry_code_mappings: [], nace_iaf_mappings: [], import_jobs: [], audit_logs: [],
  };
  const prisma: any = {};
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: [string, any]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
  const hydrate = (name: string, row: any) => name === 'industry_code_mappings' ? { ...row, source_code: state.industry_classifications.find(x => x.id === row.source_code_id), target_code: state.industry_classifications.find(x => x.id === row.target_code_id) } : name === 'nace_iaf_mappings' ? { ...row, nace_code: state.industry_classifications.find(x => x.id === row.nace_code_id), iaf_scope: state.iaf_scopes.find(x => x.id === row.iaf_scope_id) } : row;
  for (const name of Object.keys(state)) prisma[name] = {
    findMany: jest.fn(async (args: any = {}) => state[name].filter(row => matches(row, args.where)).map(row => args.include ? hydrate(name, row) : row)),
    findFirst: jest.fn(async ({ where }: any) => state[name].find(row => matches(row, where))),
    findUnique: jest.fn(async ({ where }: any) => state[name].find(row => matches(row, where))),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `${name}-${state[name].length}`, valid_from: null, valid_to: null, ...data };
      if (name === 'import_jobs') Object.assign(row, { status: 'VALIDATED', committed_rows: 0, rows: data.rows.create.map((value: any, index: number) => ({ id: `row-${index}`, committed_entity_id: null, ...value })) });
      state[name].push(row); return row;
    }),
    update: jest.fn(async ({ where, data }: any) => Object.assign(state[name].find(row => matches(row, where)), data)),
    updateMany: jest.fn(async ({ where, data }: any) => { const rows = state[name].filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; }),
  };
  prisma.import_job_rows = { update: jest.fn(async ({ where, data }: any) => Object.assign(state.import_jobs.flatMap(job => job.rows).find(row => row.id === where.id), data)) };
  prisma.$queryRaw = jest.fn(async () => []);
  // Serialize callbacks like the job UPDLOCK; restore writes on transaction failure.
  let queue = Promise.resolve();
  prisma.$transaction = jest.fn((callback: any) => {
    const run = queue.then(async () => { const before = structuredClone(state); try { return await callback(prisma); } catch (error) { state = before; throw error; } });
    queue = run.catch(() => undefined); return run;
  });
  const service = new MasterDataConfigurationService(prisma, { write: jest.fn() } as any);
  const preview = (body: string, type: keyof typeof headers = 'SCHEME', override?: string) => {
    const buffer = Buffer.from(`${override ?? headers[type]}\n${body}`, 'utf8');
    return service.validateImport(type, 'CREATE_ONLY', { originalname: 'data.csv', buffer, size: buffer.length } as any, 'admin');
  };
  return { prisma, service, preview, state: () => state, policy: new TaxonomyRuntimePolicyService(prisma) };
}

describe('CFG-1C CSV and row policy', () => {
  it.each([
    ['BOM', 'QMS,Quality,,,', '\uFEFF' + headers.SCHEME, 'Quality'],
    ['quoted comma', 'QMS,"Quality, assurance",,,', headers.SCHEME, 'Quality, assurance'],
    ['quoted newline', 'QMS,"Quality\nassurance",,,', headers.SCHEME, 'Quality\nassurance'],
    ['escaped quote', 'QMS,"Quality ""assurance""",,,', headers.SCHEME, 'Quality "assurance"'],
  ])('accepts %s', async (_, body, header, name) => {
    const h = harness(); const job = await h.preview(body, 'SCHEME', header);
    expect(job.valid_rows).toBe(1); expect(JSON.parse(job.rows[0].normalized_data!).name).toBe(name);
    expect(h.prisma.certification_schemes.create).not.toHaveBeenCalled();
  });
  it.each(['QMS,"unclosed,,,', 'QMS,"closed"junk,,,'])('rejects malformed quote %s', async body => { await expect(harness().preview(body)).rejects.toThrow(); });
  it.each(['QMS,Quality,,', 'QMS,Quality,,,,extra', 'QMS,=CMD,,,', 'QMS,Quality,,2026-02-30,', 'QMS,Quality,,2026-12-01,2026-01-01'])('records row error %s', async body => { expect((await harness().preview(body)).invalid_rows).toBe(1); });
  it.each([headers.SCHEME.replace(',effective_to', ''), headers.SCHEME + ',extra'])('rejects header mismatch', async header => { await expect(harness().preview('QMS,Quality,,,', 'SCHEME', header)).rejects.toThrow(); });
  it('limits bytes and row count', async () => {
    const h = harness(); await expect(h.preview('x'.repeat(2 * 1024 * 1024))).rejects.toThrow('2 MB');
    await expect(h.preview(Array(5001).fill('QMS,Quality,,,').join('\n'))).rejects.toThrow('5.000');
  });
  it('rejects invalid UTF8', async () => { const h = harness(); await expect(h.service.validateImport('SCHEME', undefined, { originalname: 'bad.csv', size: 2, buffer: Buffer.from([0xc3, 0x28]) } as any, 'admin')).rejects.toThrow('UTF-8'); });
  it('detects file and database duplicates', async () => {
    const h = harness(); expect((await h.preview('QMS,Quality,,,\nQMS,Quality,,,')).duplicate_rows).toBe(1);
    h.state().certification_schemes.push({ id: 'existing', code: 'QMS' }); expect((await h.preview('QMS,Quality,,,')).duplicate_rows).toBe(1);
  });
  it('rejects missing parent', async () => { expect((await harness().preview('NACE,NACE_REV_2,10.20,Name,,missing,4,,', 'INDUSTRY_CLASSIFICATION')).invalid_rows).toBe(1); });
  it.each([
    ['ISIC_REV_4,missing,NACE_REV_2,10.10,EXACT,,,', 'ISIC_NACE_MAPPING'],
    ['ISIC_REV_3,10.10,NACE_REV_2,10.10,EXACT,,,', 'ISIC_NACE_MAPPING'],
    ['ISIC_REV_4,10.10,NACE_REV_2,10.10,MANY_TO_ONE,,,', 'ISIC_NACE_MAPPING'],
    ['NACE_REV_2,10.10,03,INVALID,,,', 'NACE_IAF_MAPPING'],
  ])('rejects unsupported mapping/reference %s', async (body, type) => { expect((await harness().preview(body, type as keyof typeof headers)).invalid_rows).toBe(1); });
});

describe('CFG-1C transactional import lifecycle', () => {
  const mapping = 'ISIC_REV_4,10.10,NACE_REV_2,10.10,EXACT,,,';
  it.each(['delete', 'change', 'inactive', 'duplicate'])('fails closed on %s before commit', async kind => {
    const h = harness(); const job = await h.preview(mapping, 'ISIC_NACE_MAPPING');
    if (kind === 'delete') h.state().industry_classifications.shift();
    if (kind === 'change') h.state().industry_classifications[0].title_en = 'Changed';
    if (kind === 'inactive') h.state().industry_classifications[0].is_active = false;
    if (kind === 'duplicate') h.state().industry_code_mappings.push({ id: 'other', source_code_id: 'isic', target_code_id: 'nace' });
    await expect(h.service.commitImport(job.id, 'admin')).rejects.toThrow();
    expect(h.prisma.industry_code_mappings.create).not.toHaveBeenCalled();
  });
  it('serializes concurrent commits, keeps drafts invisible, publishes once and audits both transitions', async () => {
    const h = harness(); const job = await h.preview(mapping, 'ISIC_NACE_MAPPING');
    const results = await Promise.allSettled([h.service.commitImport(job.id, 'admin'), h.service.commitImport(job.id, 'admin')]);
    expect(results.map(x => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(h.prisma.$queryRaw).toHaveBeenCalled();
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(h.state().industry_code_mappings[0].mapping_status).toBe('DRAFT');
    expect((await (h.policy as any).loadSnapshot()).industryMappings).toHaveLength(0);
    expect((await h.service.getImportJob(job.id)).can_publish).toBe(true);
    expect((await h.service.publishImport(job.id, 'admin')).publication_state).toBe('OPERATIONAL');
    expect((await (h.policy as any).loadSnapshot()).industryMappings).toHaveLength(1);
    await expect(h.service.publishImport(job.id, 'admin')).rejects.toThrow();
    expect(h.state().audit_logs.map(x => x.action)).toEqual(['IMPORT_COMMITTED', 'IMPORT_PUBLISHED']);
    expect(h.state().industry_code_mappings[0].approved_by).toBe('admin');
    expect(Number.isFinite(h.state().industry_code_mappings[0].approved_at.getTime())).toBe(true);
  });
  it.each(['missing', 'invalid', 'reference drift', 'audit failure'])('keeps whole batch draft when %s', async kind => {
    const h = harness(); h.state().industry_classifications.push(classification('nace2', 'NACE', '10.20'));
    const job = await h.preview(mapping + '\n' + mapping.replace('NACE_REV_2,10.10', 'NACE_REV_2,10.20'), 'ISIC_NACE_MAPPING');
    await h.service.commitImport(job.id, 'admin');
    if (kind === 'missing') h.state().industry_code_mappings.pop();
    if (kind === 'invalid') h.state().industry_code_mappings[1].mapping_type = 'MANY_TO_ONE';
    if (kind === 'reference drift') h.state().industry_classifications[0].title_en = 'Changed';
    if (kind === 'audit failure') h.prisma.audit_logs.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(h.service.publishImport(job.id, 'admin')).rejects.toThrow();
    expect(h.state().industry_code_mappings.every(x => x.mapping_status === 'DRAFT')).toBe(true);
    expect((await (h.policy as any).loadSnapshot()).industryMappings).toHaveLength(0);
  });
  it('publishes NACE IAF through the same transaction policy', async () => {
    const h = harness(); const job = await h.preview('NACE_REV_2,10.10,03,QMS,,,', 'NACE_IAF_MAPPING');
    await h.service.commitImport(job.id, 'admin'); await h.service.publishImport(job.id, 'admin');
    expect(h.state().nace_iaf_mappings[0].mapping_status).toBe('APPROVED');
  });
});
