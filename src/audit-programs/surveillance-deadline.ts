/**
 * P.09: the first surveillance audit is due within twelve calendar months
 * from the issued certification decision. Day-of-month is clamped on leap years.
 * An authorized exception is a separate workflow and is NOT a client bypass.
 */
export function isFirstSurveillanceEvent(value: string) {
    return ['surveillance1', 'surveillance_1', 'surveillance_year_1']
        .includes(value.trim().toLowerCase());
}

export function firstSurveillanceDeadline(decisionDate: Date): Date {
    const source = new Date(decisionDate);
    if (Number.isNaN(source.getTime())) {
        throw new Error('Invalid certification decision date');
    }
    const result = new Date(Date.UTC(
        source.getUTCFullYear(),
        source.getUTCMonth() + 12,
        1,
    ));
    const monthEnd = new Date(Date.UTC(
        result.getUTCFullYear(),
        result.getUTCMonth() + 1,
        0,
    )).getUTCDate();
    result.setUTCDate(Math.min(source.getUTCDate(), monthEnd));
    return result;
}
