import { currentProjectCycleState } from './dashboard.service';

describe('dashboard current certification cycle', () => {
    it('shows the active GS1 stage instead of the historical initial project status', () => {
        const state = currentProjectCycleState('certificate_issued', [{
            id: 'event-gs1',
            event_type: 'surveillance1',
            status: 'in_progress',
            sequence_no: 3,
            planned_start_date: new Date('2027-10-26T00:00:00.000Z'),
            surveillance_information_snapshots: [{ status: 'confirmed' }],
            audit_plans: [{
                id: 'plan-canonical',
                audit_event_id: 'event-gs1',
                plan_code: 'PLAN-2027-0003',
                created_at: new Date('2026-08-14T00:00:00.000Z'),
                audit_team_appointment: { id: 'f04', status: 'issued' },
                reports: [],
            }],
        }]);

        expect(state).toMatchObject({
            dossier_key: 'surveillance_1',
            cycle_label: 'GS1',
            stage_label: 'Kế hoạch & đánh giá',
            event_id: 'event-gs1',
        });
    });
});
