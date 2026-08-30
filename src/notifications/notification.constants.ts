export const NOTIFICATION_CATEGORIES = [
    'WORK_ASSIGNED',
    'WORK_DUE_SOON',
    'WORK_OVERDUE',
    'WORK_ESCALATED',
    'WORKFLOW_UPDATE',
    'CAP_DUE',
    'TECHNICAL_REVIEW_READY',
    'CERTIFICATION_DECISION_READY',
    'CERTIFICATE_ISSUE_READY',
    'CERTIFICATE_EXPIRING',
    'CERTIFICATE_STATUS_CHANGED',
] as const;

export type NotificationCategory =
    typeof NOTIFICATION_CATEGORIES[number];

export const NOTIFICATION_SEVERITIES = [
    'INFO',
    'NORMAL',
    'WARNING',
    'CRITICAL',
] as const;

export type NotificationSeverity =
    typeof NOTIFICATION_SEVERITIES[number];

export const NOTIFICATION_CHANNELS = [
    'IN_APP',
    'EMAIL',
] as const;

export type NotificationChannel =
    typeof NOTIFICATION_CHANNELS[number];

export const CRITICAL_IN_APP_CATEGORIES =
    new Set<NotificationCategory>([
        'WORK_ESCALATED',
        'CERTIFICATE_STATUS_CHANGED',
    ]);
