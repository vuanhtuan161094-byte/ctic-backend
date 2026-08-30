import {
    evaluateWorkItemSla,
    getWorkItemSlaPolicy,
} from './work-item-sla-policy';

describe('work item SLA policy', () => {
    const now =
        new Date('2026-08-21T08:00:00.000Z');
    const evaluate = (
        days: number | null,
        status = 'OPEN',
    ) => evaluateWorkItemSla(
        {
            status,
            due_at:
                days === null
                    ? null
                    : new Date(
                        now.getTime() +
                        days * 24 * 60 * 60 * 1000,
                    ),
        },
        now,
    );

    it.each([
        [7, '7D'],
        [3, '3D'],
        [1, '1D'],
    ])('selects the current T-%s reminder only', (days, key) => {
        expect(
            evaluate(days).reminderKey,
        ).toBe(key);
    });

    it('does not backfill earlier reminder thresholds', () => {
        expect(evaluate(2).reminderKey)
            .toBe('3D');
    });

    it.each([
        [-1, 'OVERDUE_L1', 1],
        [-3, 'OVERDUE_L2', 2],
        [-7, 'OVERDUE_L3', 3],
        [-30, 'OVERDUE_L3', 3],
    ])('derives overdue state at %s days', (days, state, level) => {
        const result =
            evaluate(days);

        expect(result.state)
            .toBe(state);
        expect(result.escalationLevel)
            .toBe(level);
    });

    it('stops SLA for DONE work', () => {
        expect(evaluate(-10, 'DONE').state)
            .toBe('COMPLETED');
    });

    it('stops SLA for CANCELLED work', () => {
        expect(evaluate(-10, 'CANCELLED').state)
            .toBe('COMPLETED');
    });

    it('does not invent a deadline', () => {
        const result =
            evaluate(null);

        expect(result.state)
            .toBe('ON_TRACK');
        expect(result.reminderKey)
            .toBeNull();
    });

    it('returns a business-facing due label', () => {
        expect(evaluate(-4).label)
            .toBe('Quá hạn 4 ngày');
    });

    it('uses an explicit audit escalation map', () => {
        expect(
            getWorkItemSlaPolicy(
                'audit_plan.prepare',
            ).escalationRoles.level3,
        ).toEqual([
            'COORDINATOR',
            'ADMIN',
        ]);
    });

    it('does not escalate unknown work to admins', () => {
        expect(
            getWorkItemSlaPolicy(
                'unknown.action',
            ).escalationRoles.level3,
        ).toEqual([]);
    });
});
