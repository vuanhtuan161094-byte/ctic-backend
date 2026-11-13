/**
 * P.09 3+3-month suspension monitoring. Pure projection; does not mutate
 * certificate authority or grant extension merely because time has passed.
 */
export function addCalendarMonthsClamped(input: Date, months: number) {
    const date = new Date(input);
    if (Number.isNaN(date.getTime()) || !Number.isInteger(months)) {
        throw new Error('Invalid suspension date or period');
    }
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    month.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return month;
}

export type SuspensionReviewState =
    | 'not_suspended'
    | 'missing_status_history'
    | 'initial_period'
    | 'review_due'
    | 'maximum_window_exceeded';

export function projectSuspensionReview(input: {
    status?: string | null; effectiveDate?: Date | null; now: Date;
}) {
    if (input.status?.trim().toLowerCase() !== 'suspended') {
        return { state: 'not_suspended' as SuspensionReviewState, started_at: null,
            initial_review_due_at: null, maximum_extension_due_at: null,
            requires_independent_review: false };
    }
    if (!input.effectiveDate) {
        return { state: 'missing_status_history' as SuspensionReviewState, started_at: null,
            initial_review_due_at: null, maximum_extension_due_at: null,
            requires_independent_review: true };
    }
    const review = addCalendarMonthsClamped(input.effectiveDate, 3);
    const maximum = addCalendarMonthsClamped(input.effectiveDate, 6);
    const state: SuspensionReviewState = input.now.getTime() > maximum.getTime()
        ? 'maximum_window_exceeded'
        : input.now.getTime() >= review.getTime() ? 'review_due' : 'initial_period';
    return {
        state, started_at: input.effectiveDate,
        initial_review_due_at: review, maximum_extension_due_at: maximum,
        requires_independent_review: state !== 'initial_period',
    };
}
