import {
    auditCycleBusinessLabel,
    businessAuditTaskTitle,
    dossierKeyForAuditCycle,
    hasPreparedAuditPlan,
} from './audit-cycle-workflow';

describe('audit-cycle business workflow projection', () => {
    it('maps technical event identities to exact business cycles', () => {
        expect(dossierKeyForAuditCycle('surveillance1')).toBe('surveillance_1');
        expect(dossierKeyForAuditCycle('surveillance_2')).toBe('surveillance_2');
        expect(dossierKeyForAuditCycle('recertification')).toBe('recertification');
        expect(auditCycleBusinessLabel('surveillance1')).toBe('GS1');
    });

    it('builds customer-facing work titles without DOSSIER or schedule-resource language', () => {
        const title = businessAuditTaskTitle(
            'surveillance1',
            'Công ty Minh Anh',
            'APPOINT_TEAM',
        );

        expect(title).toContain('GS1');
        expect(title).toContain('Công ty Minh Anh');
        expect(title).toContain('Cần chỉ định đoàn');
        expect(title).not.toMatch(/DOSSIER|Lịch & nguồn lực/i);
    });

    it('recognizes structured F.05 schedule data as an audit plan prepared for work', () => {
        expect(hasPreparedAuditPlan(JSON.stringify({
            document_generation: { schedule_rows: [{ working_date: '2027-10-26' }] },
        }))).toBe(true);
        expect(hasPreparedAuditPlan('{}')).toBe(false);
    });
});
