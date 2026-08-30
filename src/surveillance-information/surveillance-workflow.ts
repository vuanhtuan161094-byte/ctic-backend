export type SurveillanceWorkflowSnapshot = {
    status?: string | null;
    change_impact?: string | null;
    changes?: Array<{
        category?: string | null;
        affects_manday?: boolean | null;
    }> | null;
} | null;

export type SurveillanceNextAction = {
    code: 'UPDATE_INFORMATION' | 'REVIEW_CHANGE' | 'APPOINT_TEAM';
    label: string;
    event_id: string;
    plan_id: string | null;
};

const normalize = (value?: string | null) => (value ?? '').trim().toUpperCase();

export function hasSignificantSurveillanceChange(snapshot: SurveillanceWorkflowSnapshot) {
    if (!snapshot) return false;
    const impact = normalize(snapshot.change_impact);
    if (impact && !['NONE', 'ADMINISTRATIVE'].includes(impact)) return true;
    return (snapshot.changes ?? []).some(
        (change) => normalize(change.category) === 'CERTIFICATION_RELEVANT'
            || change.affects_manday === true,
    );
}

export function surveillanceNextAction(input: {
    snapshot: SurveillanceWorkflowSnapshot;
    eventId: string;
    planId?: string | null;
    appointmentExists?: boolean;
}): SurveillanceNextAction | null {
    const status = normalize(input.snapshot?.status);
    if (!input.snapshot || status === 'DRAFT') {
        return {
            code: 'UPDATE_INFORMATION',
            label: 'Cập nhật thông tin',
            event_id: input.eventId,
            plan_id: input.planId ?? null,
        };
    }

    if (status === 'CONFIRMED' && hasSignificantSurveillanceChange(input.snapshot)) {
        return {
            code: 'REVIEW_CHANGE',
            label: 'Xem xét thay đổi',
            event_id: input.eventId,
            plan_id: input.planId ?? null,
        };
    }

    if (['CONFIRMED', 'REVIEWED'].includes(status) && !input.appointmentExists) {
        return {
            code: 'APPOINT_TEAM',
            label: 'Chỉ định đoàn đánh giá',
            event_id: input.eventId,
            plan_id: input.planId ?? null,
        };
    }

    return null;
}
