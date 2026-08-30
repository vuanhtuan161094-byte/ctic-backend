import {
    resolveCanonicalAuditPlan,
    resolveCanonicalOperationalPlans,
} from './audit-plan-canonical';

const plan = (
    id: string,
    createdAt: string,
    appointmentStatus?: string,
) => ({
    id,
    audit_event_id: 'event-gs1',
    plan_code: id.toUpperCase(),
    created_at: new Date(createdAt),
    audit_team_appointment:
        appointmentStatus
            ? {
                id: `appointment-${id}`,
                status: appointmentStatus,
            }
            : null,
});

describe('canonical operational audit plan resolver', () => {
    it('prefers the plan that owns the issued F.04', () => {
        const canonical = resolveCanonicalAuditPlan([
            plan('plan-0004', '2026-08-10T17:21:52Z'),
            plan('plan-0003', '2026-08-10T17:21:32Z', 'issued'),
            plan('plan-0005', '2026-08-10T17:22:14Z'),
        ]);

        expect(canonical?.id).toBe('plan-0003');
    });

    it('otherwise selects the oldest operational plan deterministically', () => {
        const canonical = resolveCanonicalAuditPlan([
            plan('plan-new', '2026-08-11T00:00:00Z'),
            plan('plan-old', '2026-08-10T00:00:00Z'),
        ]);

        expect(canonical?.id).toBe('plan-old');
    });

    it('keeps non-event technical plans and surfaces duplicate diagnostics', () => {
        const technicalPlan = {
            id: 'dossier-plan',
            audit_event_id: null,
            plan_code: 'DOSSIER-PRJ-1',
            created_at: new Date('2026-08-01T00:00:00Z'),
            audit_team_appointment: null,
        };
        const result = resolveCanonicalOperationalPlans([
            technicalPlan,
            plan('plan-0004', '2026-08-10T17:21:52Z'),
            plan('plan-0003', '2026-08-10T17:21:32Z', 'issued'),
            plan('plan-0005', '2026-08-10T17:22:14Z'),
        ]);

        expect(result.plans.map((item) => item.id)).toEqual([
            'dossier-plan',
            'plan-0003',
        ]);
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                audit_event_id: 'event-gs1',
                canonical_plan_id: 'plan-0003',
                duplicate_plan_ids: [
                    'plan-0004',
                    'plan-0005',
                ],
            }),
        ]);
    });
});
