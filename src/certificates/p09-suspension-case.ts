import { addCalendarMonthsClamped } from './suspension-review';

export const SUSPENSION_EXTENSION_ENTITY = 'P09_SUSPENSION_EXTENSION';
export const SUSPENSION_REVIEW_ENTITY = 'P09_SUSPENSION_REVIEW';
export const SUSPENSION_REVIEW_SCHEMA = 'P09_SUSPENSION_3_PLUS_3_V1';

export type SuspensionAction =
    | 'EXTEND_3_MONTHS'
    | 'RECOMMEND_RESTORE'
    | 'RECOMMEND_WITHDRAW'
    | 'RECOMMEND_REDUCE_SCOPE';

export interface SuspensionReviewEvidence {
    schema: typeof SUSPENSION_REVIEW_SCHEMA;
    action: SuspensionAction;
    certificate_id: string;
    series_id: string;
    project_id: string;
    suspension_history_id: string;
    suspended_at: string;
    technical_review_id: string;
    requested_by: string;
    requested_at: string;
    reason: string;
    corrective_evidence: string;
    reviewer_comment?: string;
    reviewed_at?: string;
}

export function suspensionType(action: SuspensionAction) {
    return action === 'EXTEND_3_MONTHS'
        ? SUSPENSION_EXTENSION_ENTITY : SUSPENSION_REVIEW_ENTITY;
}

export function parseSuspensionEvidence(raw: string | null | undefined): SuspensionReviewEvidence | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw) as Partial<SuspensionReviewEvidence>;
        if (obj.schema !== SUSPENSION_REVIEW_SCHEMA ||
            !['EXTEND_3_MONTHS', 'RECOMMEND_RESTORE', 'RECOMMEND_WITHDRAW',
                'RECOMMEND_REDUCE_SCOPE'].includes(obj.action ?? '') ||
            !obj.certificate_id || !obj.series_id || !obj.project_id ||
            !obj.suspension_history_id || !obj.suspended_at ||
            !obj.technical_review_id || !obj.requested_by ||
            !obj.requested_at || !obj.reason || !obj.corrective_evidence) return null;
        return obj as SuspensionReviewEvidence;
    } catch {
        return null;
    }
}

export function suspensionDeadlineStatus(start: Date, today: Date) {
    const firstReview = addCalendarMonthsClamped(start, 3);
    const maximum = addCalendarMonthsClamped(start, 6);
    return {
        initial_review_due_at: firstReview,
        maximum_due_at: maximum,
        after_initial: today.getTime() >= firstReview.getTime(),
        after_maximum: today.getTime() > maximum.getTime(),
    };
}

export function hasValidSuspensionApproval(input: {
    row: { status?: string | null; approver_id: string; approved_at: Date | null; comment: string | null } | null;
    action: SuspensionAction;
    certificateId: string;
    seriesId: string;
    projectId: string;
    historyId: string;
    f11Id?: string | null;
}): boolean {
    const row = input.row;
    const proof = parseSuspensionEvidence(row?.comment);
    return Boolean(row?.status === 'approved' && row.approved_at && proof &&
        proof.action === input.action &&
        proof.certificate_id === input.certificateId &&
        proof.series_id === input.seriesId &&
        proof.project_id === input.projectId &&
        proof.suspension_history_id === input.historyId &&
        (!input.f11Id || proof.technical_review_id === input.f11Id) &&
        proof.requested_by.toLowerCase() !== row.approver_id.toLowerCase() &&
        proof.reviewed_at && proof.reviewer_comment?.trim());
}
