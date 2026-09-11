import {
    acceptedCompetencyRoles,
    normalizeCompetencyValue,
    normalizeStandardCode,
} from './audit-team-competency.policy';

describe('audit team competency policy', () => {
    it('normalizes competency values without changing business meaning', () => {
        expect(normalizeCompetencyValue('  lead_auditor ')).toBe('LEAD_AUDITOR');
        expect(normalizeCompetencyValue(null)).toBe('');
    });

    it('normalizes standard codes consistently for program matching', () => {
        expect(normalizeStandardCode(' ISO 9001:2015 ')).toBe('ISO90012015');
        expect(normalizeStandardCode('iso-14001:2015')).toBe('ISO140012015');
    });

    it('keeps the frozen team-role to competency-role mapping', () => {
        expect(acceptedCompetencyRoles('TEAM_LEADER')).toEqual(['LEAD_AUDITOR', 'AUDITOR']);
        expect(acceptedCompetencyRoles('auditor')).toEqual(['AUDITOR', 'LEAD_AUDITOR']);
        expect(acceptedCompetencyRoles('TECHNICAL_EXPERT')).toEqual(['TECHNICAL_EXPERT']);
        expect(acceptedCompetencyRoles('WITNESS_EVALUATOR')).toEqual([
            'WITNESS_EVALUATOR',
            'LEAD_AUDITOR',
            'AUDITOR',
        ]);
        expect(acceptedCompetencyRoles('OBSERVER')).toEqual([]);
    });
});
