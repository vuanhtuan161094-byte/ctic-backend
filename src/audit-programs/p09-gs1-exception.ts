import type { Prisma } from '@prisma/client';

export const GS1_EXCEPTION_ENTITY_TYPE = 'P09_GS1_EXCEPTION';
export const GS1_EXCEPTION_SCHEMA = 'CMP_P09_GS1_QMR_1';

export interface Gs1ExceptionEvidence {
    schema: typeof GS1_EXCEPTION_SCHEMA;
    project_id: string;
    program_id: string;
    decision_id: string;
    decision_date: string;
    approved_date: string;
    reason: string;
    requested_by: string;
    requested_at: string;
    reviewer_comment?: string;
    reviewed_at?: string;
}

export function configuredQmrIds(raw = process.env.P09_QMR_APPROVER_IDS ?? ''): Set<string> {
    return new Set(raw.split(',').map((id) => id.trim().toLowerCase())
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)));
}

export function dateKey(value: Date | string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toISOString().slice(0, 10);
}

export function readGs1ExceptionEvidence(text: string | null | undefined): Gs1ExceptionEvidence | null {
    if (!text) return null;
    try {
        const item = JSON.parse(text) as Partial<Gs1ExceptionEvidence>;
        if (item.schema !== GS1_EXCEPTION_SCHEMA || typeof item.project_id !== 'string' ||
            typeof item.program_id !== 'string' || typeof item.decision_id !== 'string' ||
            typeof item.decision_date !== 'string' || typeof item.approved_date !== 'string' ||
            typeof item.requested_by !== 'string' || typeof item.reason !== 'string' ||
            typeof item.requested_at !== 'string') return null;
        return item as Gs1ExceptionEvidence;
    } catch {
        return null;
    }
}

type ApprovalDatabase = Pick<Prisma.TransactionClient, 'workflow_approvals'>;

/**
 * Only the latest request for the exact event counts. A new pending/rejected
 * request supersedes an older approval. A signed-off date cannot be reused
 * for a different schedule or certification cycle.
 */
export async function hasCurrentGs1QmrApproval(input: {
    database: ApprovalDatabase;
    eventId: string | null | undefined;
    programId: string;
    projectId: string;
    decisionId: string;
    decisionDate: Date;
    proposedDate: Date | string;
    qmrIds?: Set<string>;
}): Promise<boolean> {
    const qmrIds = input.qmrIds ?? configuredQmrIds();
    if (!input.eventId || qmrIds.size === 0) return false;
    const latest = await input.database.workflow_approvals.findFirst({
        where: { entity_type: GS1_EXCEPTION_ENTITY_TYPE, entity_id: input.eventId },
        orderBy: [{ step_no: 'desc' }],
        select: { status: true, approved_at: true, approver_id: true, comment: true },
    });
    if (latest?.status !== 'approved' || !latest.approved_at ||
        !qmrIds.has(latest.approver_id.toLowerCase())) return false;
    const evidence = readGs1ExceptionEvidence(latest.comment);
    if (!evidence) return false;
    return evidence.project_id === input.projectId &&
        evidence.program_id === input.programId &&
        evidence.decision_id === input.decisionId &&
        evidence.decision_date === dateKey(input.decisionDate) &&
        evidence.approved_date === dateKey(input.proposedDate) &&
        evidence.requested_by.toLowerCase() !== latest.approver_id.toLowerCase() &&
        Boolean(evidence.reviewer_comment?.trim()) &&
        Boolean(evidence.reviewed_at);
}
