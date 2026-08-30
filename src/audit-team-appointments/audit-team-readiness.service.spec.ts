import {
    buildCollectiveCoverage,
    competencyCoversScope,
} from './audit-team-readiness.service';

const scope = (overrides: Record<string, string> = {}) => ({
    id: overrides.id ?? 'scope-1',
    management_system: overrides.management_system ?? 'QMS',
    standard_code: overrides.standard_code ?? 'ISO 9001:2015',
    iaf_code: overrides.iaf_code ?? '17',
    nace_code: overrides.nace_code ?? '25.11',
    scope_description: overrides.scope_description ?? 'Manufacture of structures',
});

const member = (overrides: Record<string, unknown> = {}) => ({
    member_id: (overrides.member_id as string) ?? 'member-1',
    expert_id: (overrides.expert_id as string) ?? 'expert-1',
    expert_name: (overrides.expert_name as string) ?? 'Expert One',
    team_role: (overrides.team_role as string) ?? 'AUDITOR',
    blocked: (overrides.blocked as boolean) ?? false,
});

const competency = (overrides: Record<string, unknown> = {}) => ({
    id: (overrides.id as string) ?? 'competency-1',
    expert_id: (overrides.expert_id as string) ?? 'expert-1',
    management_system: (overrides.management_system as string) ?? 'QMS',
    standard_code: (overrides.standard_code as string) ?? 'ISO 9001:2015',
    competency_role: (overrides.competency_role as string) ?? 'AUDITOR',
    scope_level: (overrides.scope_level as string) ?? 'IAF',
    iaf_code: (overrides.iaf_code as string) ?? '17',
    nace_code: (overrides.nace_code as string | null) ?? null,
});

describe('Phase 4D collective audit-team coverage', () => {
    it.each([
        ['IAF competence covers a NACE below the same IAF', competency(), scope(), 'AUDITOR', true],
        ['NACE competence covers its exact NACE', competency({ scope_level: 'NACE', nace_code: '25.11' }), scope(), 'AUDITOR', true],
        ['NACE competence does not cover another NACE', competency({ scope_level: 'NACE', nace_code: '25.12' }), scope(), 'AUDITOR', false],
        ['another IAF does not cover', competency({ iaf_code: '18' }), scope(), 'AUDITOR', false],
        ['another program does not cover', competency({ standard_code: 'ISO 14001:2015' }), scope(), 'AUDITOR', false],
        ['another management system does not cover', competency({ management_system: 'EMS' }), scope(), 'AUDITOR', false],
        ['auditor role accepts lead-auditor competence', competency({ competency_role: 'LEAD_AUDITOR' }), scope(), 'AUDITOR', true],
        ['team-leader scope accepts auditor competence', competency(), scope(), 'TEAM_LEADER', true],
        ['technical expert accepts technical competence', competency({ competency_role: 'TECHNICAL_EXPERT' }), scope(), 'TECHNICAL_EXPERT', true],
        ['technical expert does not use auditor competence', competency(), scope(), 'TECHNICAL_EXPERT', false],
        ['observer cannot contribute competence', competency(), scope(), 'OBSERVER', false],
        ['matching is case and whitespace neutral', competency({ iaf_code: ' 17 ', standard_code: ' iso 9001:2015 ' }), scope(), 'auditor', true],
    ])('%s', (_label, inputCompetency, inputScope, role, expected) => {
        expect(competencyCoversScope(inputCompetency, inputScope, role)).toBe(expected);
    });

    it('marks an uncovered requirement MISSING', () => {
        expect(buildCollectiveCoverage([scope()], [], [competency()])[0].status).toBe('MISSING');
    });

    it('marks a program-only match PARTIAL', () => {
        const result = buildCollectiveCoverage(
            [scope()],
            [member()],
            [competency({ iaf_code: '18' })],
        );
        expect(result[0].status).toBe('PARTIAL');
    });

    it('marks an exact collective requirement COVERED', () => {
        expect(buildCollectiveCoverage([scope()], [member()], [competency()])[0].status).toBe('COVERED');
    });

    it('excludes a member blocked by a Phase 4C gate from coverage', () => {
        const result = buildCollectiveCoverage([scope()], [member({ blocked: true })], [competency()]);
        expect(result[0].covered_by).toHaveLength(0);
        expect(result[0].status).toBe('MISSING');
    });

    it('combines different experts across different required scopes', () => {
        const result = buildCollectiveCoverage(
            [scope({ id: 'scope-17', iaf_code: '17' }), scope({ id: 'scope-18', iaf_code: '18' })],
            [member(), member({ member_id: 'member-2', expert_id: 'expert-2', expert_name: 'Expert Two' })],
            [competency(), competency({ id: 'competency-2', expert_id: 'expert-2', iaf_code: '18' })],
        );
        expect(result.map((row) => row.status)).toEqual(['COVERED', 'COVERED']);
        expect(result.map((row) => row.covered_by[0].expert_id)).toEqual(['expert-1', 'expert-2']);
    });

    it('lists every qualified contributor deterministically', () => {
        const result = buildCollectiveCoverage(
            [scope()],
            [member(), member({ member_id: 'member-2', expert_id: 'expert-2' })],
            [competency(), competency({ id: 'competency-2', expert_id: 'expert-2' })],
        );
        expect(result[0].covered_by.map((item) => item.member_id)).toEqual(['member-1', 'member-2']);
    });

    it('preserves required-scope ordering in the matrix', () => {
        const result = buildCollectiveCoverage(
            [scope({ id: 'first' }), scope({ id: 'second' })],
            [member()],
            [competency()],
        );
        expect(result.map((row) => row.project_scope_id)).toEqual(['first', 'second']);
    });
});
