import {
    deriveDossierNextAction,
    projectExceptionAlertsFromDossier,
} from './certification-projects.service';

describe('certification project workflow correctness', () => {
    it('derives one actionable next step from the first pending business control', () => {
        const action = deriveDossierNextAction([
            { document_key: 'surveillance_information_update', status: 'completed' },
            { document_key: 'audit_team_assignment', status: 'completed' },
            { document_key: 'audit_plan', status: 'completed' },
            { document_key: 'audit_checklist', status: 'pending' },
            { document_key: 'technical_review_report', status: 'pending' },
        ], 'event-gs1', 'plan-canonical');

        expect(action).toMatchObject({
            code: 'EXECUTE_AUDIT',
            event_id: 'event-gs1',
            plan_id: 'plan-canonical',
            item_key: 'audit_checklist',
        });
    });

    it('does not turn ordinary pending dossier rows into exception alerts', () => {
        const alerts = projectExceptionAlertsFromDossier({
            project: { customer: { company_name: 'CTIC customer' } },
            dossiers: [
                {
                    dossier_key: 'surveillance_1',
                    next_action: { code: 'EXECUTE_AUDIT' },
                },
                {
                    dossier_key: 'recertification',
                    next_action: { code: 'APPOINT_TEAM' },
                },
            ],
        }, false);

        expect(alerts).toEqual([]);
    });

    it('keeps genuine surveillance coordination exceptions and concise admin diagnostics', () => {
        const alerts = projectExceptionAlertsFromDossier({
            project: { customer: { company_name: 'CTIC customer' } },
            dossiers: [{
                dossier_key: 'surveillance_1',
                next_action: {
                    code: 'REVIEW_CHANGE',
                    event_id: 'event-gs1',
                    plan_id: 'plan-canonical',
                },
            }],
            diagnostics: [{
                canonical_plan_code: 'PLAN-2027-0003',
                duplicate_plan_codes: ['PLAN-2027-0004', 'PLAN-2027-0005'],
            }],
        }, true);

        expect(alerts).toHaveLength(2);
        expect(alerts[0]).toMatchObject({
            alert_type: 'surveillance_change_review',
            message: 'GS1 - CTIC customer cần xem xét thay đổi',
        });
        expect(alerts[1].message).toContain('PLAN-2027-0003');
        expect(alerts[1].message).toContain('PLAN-2027-0004');
        expect(alerts[1].message).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    });
});
