import { addCalendarMonthsClamped, projectSuspensionReview } from './suspension-review';

describe('P09 suspension 3+3 month review projection', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    it('clamps end of month and leap year, without approximate 90-day arithmetic', () => {
        expect(addCalendarMonthsClamped(start, 3).toISOString().slice(0, 10))
            .toBe('2026-04-30');
        expect(addCalendarMonthsClamped(start, 6).toISOString().slice(0, 10))
            .toBe('2026-07-31');
        expect(addCalendarMonthsClamped(new Date('2024-02-29T00:00:00Z'), 12)
            .toISOString().slice(0, 10)).toBe('2025-02-28');
    });
    it('shows initial period then review due, then max-window alert', () => {
        const run = (now: string) => projectSuspensionReview({
            status: 'suspended', effectiveDate: start, now: new Date(now),
        });
        expect(run('2026-04-29').state).toBe('initial_period');
        expect(run('2026-04-30').state).toBe('review_due');
        expect(run('2026-07-31').state).toBe('review_due');
        expect(run('2026-08-01').state).toBe('maximum_window_exceeded');
        expect(run('2026-08-01').requires_independent_review).toBe(true);
    });
    it('never invents approval, extension or certification status transition', () => {
        expect(projectSuspensionReview({
            status: 'active', effectiveDate: start, now: new Date('2027-01-01'),
        }).state).toBe('not_suspended');
        expect(projectSuspensionReview({
            status: 'suspended', effectiveDate: null, now: new Date('2027-01-01'),
        }).state).toBe('missing_status_history');
        expect(projectSuspensionReview({
            status: 'suspended', effectiveDate: start, now: new Date('2027-01-01'),
        })).not.toHaveProperty('extension_approved');
    });
});
