export const WORK_ITEM_STATUSES = [
    'OPEN',
    'IN_PROGRESS',
    'DONE',
    'CANCELLED',
] as const;

export type WorkItemStatus =
    typeof WORK_ITEM_STATUSES[number];

export const WORK_ITEM_PRIORITIES = [
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT',
] as const;

export type WorkItemPriority =
    typeof WORK_ITEM_PRIORITIES[number];

export const WORK_ITEM_TYPES = [
    'CUSTOMER_APPLICATION_INTAKE',
    'CUSTOMER_ORGANIZATION_CHANGE_REVIEW',
    'CUSTOMER_USER_ACCESS_REVIEW',
    'CUSTOMER_DOCUMENT_RESPONSE_REVIEW',
    'APPLICATION_REVIEW',
    'SURVEILLANCE_CHANGE_REVIEW',
    'F04_TEAM_APPOINTMENT',
    'AUDIT_PLAN',
    'AUDIT_EXECUTION',
    'CAP_ACTION_OR_REVIEW',
    'REVIEWER_ASSIGNMENT',
    'TECHNICAL_REVIEW',
    'CERTIFICATION_DECISION',
    'CERTIFICATE_ISSUE',
    'CHANGE_IMPACT_REVIEW',
    'CHANGE_CERTIFICATE_ACTION',
    'SPECIAL_AUDIT_PLAN',
    'SPECIAL_AUDIT_FOLLOW_UP',
    'COMPLAINT_ACKNOWLEDGE',
    'COMPLAINT_INVESTIGATE',
    'COMPLAINT_RESPONSE',
    'APPEAL_REVIEW',
    'APPEAL_DECISION',
] as const;

export type WorkItemType =
    typeof WORK_ITEM_TYPES[number];

export const WORK_ITEM_ACTIONS = {
    APPLICATION_INTAKE:
        'application.intake',
    CUSTOMER_ORGANIZATION_CHANGE_REVIEW:
        'customer.organization_change.review',
    CUSTOMER_USER_ACCESS_REVIEW:
        'customer.user_access.review',
    CUSTOMER_DOCUMENT_RESPONSE_REVIEW:
        'customer.document_response.review',
    APPLICATION_REVIEW:
        'application.review',
    SURVEILLANCE_CHANGE_REVIEW:
        'surveillance.change_review',
    AUDIT_TEAM_ISSUE:
        'audit_team.issue',
    AUDIT_PLAN_PREPARE:
        'audit_plan.prepare',
    AUDIT_EXECUTE:
        'audit.execute',
    CAP_REVIEW:
        'cap.review',
    CAP_RESPOND:
        'cap.respond',
    TECHNICAL_REVIEW_ASSIGN:
        'technical_review.assign',
    TECHNICAL_REVIEW:
        'technical_review.perform',
    CERTIFICATION_DECISION:
        'certification_decision.issue',
    CERTIFICATE_ISSUE:
        'certificate.issue',
    CHANGE_IMPACT_REVIEW:
        'change.impact_review',
    CHANGE_CERTIFICATE_ACTION:
        'change.certificate_action',
    SPECIAL_AUDIT_PLAN:
        'special_audit.plan',
    SPECIAL_AUDIT_FOLLOW_UP:
        'special_audit.follow_up',
    COMPLAINT_ACKNOWLEDGE:
        'complaint.acknowledge',
    COMPLAINT_INVESTIGATE:
        'complaint.investigate',
    COMPLAINT_RESPONSE:
        'complaint.response',
    APPEAL_REVIEW:
        'appeal.review',
    APPEAL_DECISION:
        'appeal.decision',
} as const;

export const ACTION_ELIGIBLE_ROLES =
    new Map<string, ReadonlySet<string>>([
        [WORK_ITEM_ACTIONS.APPLICATION_INTAKE, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.CUSTOMER_ORGANIZATION_CHANGE_REVIEW, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.CUSTOMER_USER_ACCESS_REVIEW, new Set(['ADMIN'])],
        [WORK_ITEM_ACTIONS.CUSTOMER_DOCUMENT_RESPONSE_REVIEW, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.APPLICATION_REVIEW, new Set(['AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER'])],
        [WORK_ITEM_ACTIONS.SURVEILLANCE_CHANGE_REVIEW, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.AUDIT_TEAM_ISSUE, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.AUDIT_PLAN_PREPARE, new Set(['LEAD_AUDITOR'])],
        [WORK_ITEM_ACTIONS.AUDIT_EXECUTE, new Set(['LEAD_AUDITOR', 'AUDITOR', 'TECHNICAL_EXPERT'])],
        [WORK_ITEM_ACTIONS.CAP_REVIEW, new Set(['LEAD_AUDITOR', 'AUDITOR'])],
        [WORK_ITEM_ACTIONS.CAP_RESPOND, new Set(['CUSTOMER'])],
        [WORK_ITEM_ACTIONS.TECHNICAL_REVIEW_ASSIGN, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.TECHNICAL_REVIEW, new Set(['TECHNICAL_REVIEWER'])],
        [WORK_ITEM_ACTIONS.CERTIFICATION_DECISION, new Set(['DECISION_MAKER'])],
        [WORK_ITEM_ACTIONS.CERTIFICATE_ISSUE, new Set(['DECISION_MAKER'])],
        [WORK_ITEM_ACTIONS.CHANGE_IMPACT_REVIEW, new Set(['COORDINATOR', 'TECHNICAL_REVIEWER'])],
        [WORK_ITEM_ACTIONS.CHANGE_CERTIFICATE_ACTION, new Set(['DECISION_MAKER'])],
        [WORK_ITEM_ACTIONS.SPECIAL_AUDIT_PLAN, new Set(['COORDINATOR', 'LEAD_AUDITOR'])],
        [WORK_ITEM_ACTIONS.SPECIAL_AUDIT_FOLLOW_UP, new Set(['COORDINATOR', 'DECISION_MAKER'])],
        [WORK_ITEM_ACTIONS.COMPLAINT_ACKNOWLEDGE, new Set(['COORDINATOR'])],
        [WORK_ITEM_ACTIONS.COMPLAINT_INVESTIGATE, new Set(['COORDINATOR', 'AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER'])],
        [WORK_ITEM_ACTIONS.COMPLAINT_RESPONSE, new Set(['COORDINATOR', 'DECISION_MAKER'])],
        [WORK_ITEM_ACTIONS.APPEAL_REVIEW, new Set(['TECHNICAL_REVIEWER'])],
        [WORK_ITEM_ACTIONS.APPEAL_DECISION, new Set(['DECISION_MAKER'])],
    ]);

export const CERTIFICATE_VERSION_DECISIONS =
    new Set([
        'GRANT',
        'AMEND',
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
        'RECERTIFY',
    ]);

export const NO_CERTIFICATE_ISSUE_DECISIONS =
    new Set([
        'MAINTAIN',
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
        'REFUSE',
    ]);
