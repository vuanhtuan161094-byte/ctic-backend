import {
    WORK_ITEM_ACTIONS,
} from '../work-items/work-item.constants';

export type WorkItemSlaState =
    | 'ON_TRACK'
    | 'DUE_SOON'
    | 'OVERDUE_L1'
    | 'OVERDUE_L2'
    | 'OVERDUE_L3'
    | 'COMPLETED';

export interface WorkItemSlaEvaluation {
    state: WorkItemSlaState;
    reminderKey: '7D' | '3D' | '1D' | null;
    escalationLevel: 1 | 2 | 3 | null;
    daysUntilDue: number | null;
    daysOverdue: number;
    label: string;
}

export interface WorkItemSlaPolicy {
    reminders: readonly number[];
    overdueLevels: Readonly<{
        level2Days: number;
        level3Days: number;
    }>;
    escalationRoles: Readonly<{
        level2: readonly string[];
        level3: readonly string[];
    }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_WORK_ITEM_SLA_POLICY:
    WorkItemSlaPolicy = {
        reminders: [
            7,
            3,
            1,
        ],
        overdueLevels: {
            level2Days: 3,
            level3Days: 7,
        },
        escalationRoles: {
            level2: [],
            level3: [],
        },
    };

const ESCALATION_POLICY =
    new Map<string, WorkItemSlaPolicy['escalationRoles']>([
        [
            WORK_ITEM_ACTIONS.APPLICATION_REVIEW,
            {
                level2: ['COORDINATOR'],
                level3: ['COORDINATOR'],
            },
        ],
        [
            WORK_ITEM_ACTIONS.AUDIT_TEAM_ISSUE,
            {
                level2: ['COORDINATOR'],
                level3: [
                    'COORDINATOR',
                    'ADMIN',
                ],
            },
        ],
        [
            WORK_ITEM_ACTIONS.AUDIT_PLAN_PREPARE,
            {
                level2: ['COORDINATOR'],
                level3: [
                    'COORDINATOR',
                    'ADMIN',
                ],
            },
        ],
        [
            WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            {
                level2: ['COORDINATOR'],
                level3: [
                    'COORDINATOR',
                    'ADMIN',
                ],
            },
        ],
        [
            WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
            {
                level2: ['TECHNICAL_REVIEWER'],
                level3: ['COORDINATOR'],
            },
        ],
        [
            WORK_ITEM_ACTIONS.CERTIFICATION_DECISION,
            {
                level2: ['DECISION_MAKER'],
                level3: ['COORDINATOR'],
            },
        ],
        [
            WORK_ITEM_ACTIONS.CERTIFICATE_ISSUE,
            {
                level2: ['DECISION_MAKER'],
                level3: ['COORDINATOR'],
            },
        ],
        [
            WORK_ITEM_ACTIONS.CAP_REVIEW,
            {
                level2: ['LEAD_AUDITOR'],
                level3: ['COORDINATOR'],
            },
        ],
        [
            WORK_ITEM_ACTIONS.CAP_RESPOND,
            {
                level2: [],
                level3: ['COORDINATOR'],
            },
        ],
    ]);

export function getWorkItemSlaPolicy(
    actionCode?: string | null,
): WorkItemSlaPolicy {
    return {
        ...DEFAULT_WORK_ITEM_SLA_POLICY,
        escalationRoles:
            ESCALATION_POLICY.get(
                actionCode
                    ?.trim()
                    .toLowerCase() ??
                '',
            ) ??
            DEFAULT_WORK_ITEM_SLA_POLICY
                .escalationRoles,
    };
}

export function evaluateWorkItemSla(
    item: {
        status: string;
        due_at?: Date | null;
    },
    now = new Date(),
    policy =
        DEFAULT_WORK_ITEM_SLA_POLICY,
): WorkItemSlaEvaluation {
    const status =
        item.status
            .trim()
            .toUpperCase();

    if (
        status === 'DONE' ||
        status === 'CANCELLED'
    ) {
        return {
            state: 'COMPLETED',
            reminderKey: null,
            escalationLevel: null,
            daysUntilDue: null,
            daysOverdue: 0,
            label:
                status === 'DONE'
                    ? 'Công việc đã hoàn thành'
                    : 'Công việc đã hủy',
        };
    }

    if (!item.due_at) {
        return {
            state: 'ON_TRACK',
            reminderKey: null,
            escalationLevel: null,
            daysUntilDue: null,
            daysOverdue: 0,
            label: 'Chưa thiết lập hạn',
        };
    }

    const difference =
        item.due_at.getTime() -
        now.getTime();

    if (difference < 0) {
        const daysOverdue =
            Math.max(
                1,
                Math.floor(
                    Math.abs(difference) /
                    DAY_MS,
                ),
            );
        const escalationLevel:
            1 | 2 | 3 =
            daysOverdue >=
                policy.overdueLevels
                    .level3Days
                ? 3
                : daysOverdue >=
                    policy.overdueLevels
                        .level2Days
                    ? 2
                    : 1;

        return {
            state:
                `OVERDUE_L${escalationLevel}` as WorkItemSlaState,
            reminderKey: null,
            escalationLevel,
            daysUntilDue:
                -daysOverdue,
            daysOverdue,
            label:
                `Quá hạn ${daysOverdue} ngày`,
        };
    }

    const daysUntilDue =
        Math.ceil(
            difference /
            DAY_MS,
        );
    const reminderKey =
        daysUntilDue <= 1
            ? '1D'
            : daysUntilDue <= 3
                ? '3D'
                : daysUntilDue <= 7
                    ? '7D'
                    : null;

    return {
        state:
            reminderKey
                ? 'DUE_SOON'
                : 'ON_TRACK',
        reminderKey,
        escalationLevel: null,
        daysUntilDue,
        daysOverdue: 0,
        label:
            daysUntilDue === 0
                ? 'Hôm nay'
                : `Còn ${daysUntilDue} ngày`,
    };
}
