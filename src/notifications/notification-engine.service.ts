import { organizationReminderDays } from '../common/organization-runtime-settings';
import {
    Injectable,
} from '@nestjs/common';
import type {
    work_items,
} from '@prisma/client';

import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    WORK_ITEM_ACTIONS,
} from '../work-items/work-item.constants';
import {
    resolveSchemeRuntimeRules,
} from '../master-data-configuration/scheme-runtime-rules';
import {
    type NotificationCategory,
    type NotificationChannel,
    type NotificationSeverity,
} from './notification.constants';
import {
    NotificationRecipientService,
} from './notification-recipient.service';
import {
    evaluateWorkItemSla,
    getWorkItemSlaPolicy,
} from './work-item-sla-policy';

interface NotificationDeliveryInput {
    sourceKey: string;
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    message: string;
    recipientIds: string[];
    entityType?: string | null;
    entityId?: string | null;
    workItemId?: string | null;
    projectId?: string | null;
    auditEventId?: string | null;
    dueDate?: Date | null;
    destinationPath?: string | null;
    context?: Record<string, unknown> | null;
    channel?: NotificationChannel;
}

const DAY_MS =
    24 * 60 * 60 * 1000;

@Injectable()
export class NotificationEngineService {
    constructor(
        private readonly prisma:
            PrismaService,
        private readonly recipients:
            NotificationRecipientService,
    ) { }

    private dateKey(
        value: Date,
    ) {
        return value
            .toISOString()
            .slice(0, 10);
    }

    private parseContext(
        value?: string | null,
    ) {
        if (!value) {
            return null;
        }

        try {
            const parsed: unknown =
                JSON.parse(value);

            return parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : null;
        } catch {
            return null;
        }
    }

    private async preferenceAllows(
        userId: string,
        category: NotificationCategory,
        severity: NotificationSeverity,
        channel: NotificationChannel,
    ) {
        if (
            channel === 'IN_APP' &&
            severity === 'CRITICAL'
        ) {
            return true;
        }

        const preference =
            await this.prisma
                .notification_preferences
                .findUnique({
                    where: {
                        user_id_category_channel: {
                            user_id:
                                userId,
                            category,
                            channel,
                        },
                    },
                    select: {
                        enabled:
                            true,
                    },
                });

        return preference?.enabled ??
            true;
    }

    async deliver(
        input: NotificationDeliveryInput,
    ) {
        const channel =
            input.channel ??
            'IN_APP';
        const recipientIds =
            Array.from(
                new Set(
                    input.recipientIds,
                ),
            );
        let delivered = 0;
        let suppressed = 0;

        for (const userId of recipientIds) {
            if (
                !await this.preferenceAllows(
                    userId,
                    input.category,
                    input.severity,
                    channel,
                )
            ) {
                suppressed++;
                continue;
            }

            const data = {
                notification_type:
                    input.category
                        .toLowerCase(),
                category:
                    input.category,
                severity:
                    input.severity,
                title:
                    input.title,
                message:
                    input.message,
                entity_type:
                    input.entityType ??
                    null,
                entity_id:
                    input.entityId ??
                    null,
                work_item_id:
                    input.workItemId ??
                    null,
                project_id:
                    input.projectId ??
                    null,
                audit_event_id:
                    input.auditEventId ??
                    null,
                due_date:
                    input.dueDate ??
                    null,
                destination_path:
                    input.destinationPath ??
                    null,
                context_json:
                    input.context
                        ? JSON.stringify(
                            input.context,
                        )
                        : null,
                delivery_status:
                    'DELIVERED',
                updated_at:
                    new Date(),
            };

            await this.prisma.notifications.upsert({
                where: {
                    user_id_source_key_channel: {
                        user_id:
                            userId,
                        source_key:
                            input.sourceKey,
                        channel,
                    },
                },
                create: {
                    user_id:
                        userId,
                    source_key:
                        input.sourceKey,
                    channel,
                    status:
                        'unread',
                    ...data,
                },
                update:
                    data,
            });
            delivered++;
        }

        return {
            delivered,
            suppressed,
        };
    }

    private assignmentCategory(
        actionCode: string,
    ): NotificationCategory {
        const normalized =
            actionCode
                .trim()
                .toLowerCase();

        if (
            [
                WORK_ITEM_ACTIONS.CAP_RESPOND,
                WORK_ITEM_ACTIONS.CAP_REVIEW,
            ].includes(normalized as never)
        ) {
            return 'CAP_DUE';
        }

        if (
            normalized ===
            WORK_ITEM_ACTIONS.TECHNICAL_REVIEW
        ) {
            return 'TECHNICAL_REVIEW_READY';
        }

        if (
            normalized ===
            WORK_ITEM_ACTIONS.CERTIFICATION_DECISION
        ) {
            return 'CERTIFICATION_DECISION_READY';
        }

        if (
            normalized ===
            WORK_ITEM_ACTIONS.CERTIFICATE_ISSUE
        ) {
            return 'CERTIFICATE_ISSUE_READY';
        }

        return 'WORK_ASSIGNED';
    }

    async notifyWorkAssigned(
        item: work_items,
    ) {
        if (
            ![
                'OPEN',
                'IN_PROGRESS',
            ].includes(
                item.status,
            )
        ) {
            return {
                delivered: 0,
                suppressed: 0,
            };
        }

        const recipientIds =
            await this.recipients
                .resolveForWorkItem(
                    item,
                );
        const assignmentKey =
            item.assigned_user_id ??
            item.assigned_role ??
            'UNASSIGNED';

        return this.deliver({
            sourceKey:
                `WORK_ASSIGNED:${item.id}:${assignmentKey}`,
            category:
                this.assignmentCategory(
                    item.action_code,
                ),
            severity: 'NORMAL',
            title:
                item.title,
            message:
                'Bạn có công việc mới cần xử lý trong hồ sơ chứng nhận.',
            recipientIds,
            entityType:
                item.entity_type,
            entityId:
                item.entity_id,
            workItemId:
                item.id,
            projectId:
                item.project_id,
            auditEventId:
                item.audit_event_id,
            dueDate:
                item.due_at,
            destinationPath:
                item.destination_path,
            context: {
                work_item_id:
                    item.id,
                action_code:
                    item.action_code,
            },
        });
    }

    async evaluateWorkItem(
        item: work_items,
        now = new Date(),
    ) {
        const policy =
            getWorkItemSlaPolicy(
                item.action_code,
            );
        const sla =
            evaluateWorkItemSla(
                item,
                now,
                policy,
            );

        if (
            sla.state === 'COMPLETED' ||
            !item.due_at ||
            (
                !sla.reminderKey &&
                !sla.escalationLevel
            )
        ) {
            return {
                sla,
                delivered: 0,
                suppressed: 0,
            };
        }

        const escalationRoles =
            sla.escalationLevel === 3
                ? policy.escalationRoles
                    .level3
                : sla.escalationLevel === 2
                    ? policy.escalationRoles
                        .level2
                    : [];
        const recipientIds =
            await this.recipients
                .resolveForWorkItem(
                    item,
                    escalationRoles,
                );
        const dueKey =
            this.dateKey(
                item.due_at,
            );
        const escalated =
            Boolean(
                sla.escalationLevel &&
                sla.escalationLevel >= 2,
            );
        const category:
            NotificationCategory =
            sla.escalationLevel
                ? escalated
                    ? 'WORK_ESCALATED'
                    : 'WORK_OVERDUE'
                : 'WORK_DUE_SOON';
        const sourceKey =
            sla.escalationLevel
                ? `WORK_OVERDUE:${item.id}:${dueKey}:L${sla.escalationLevel}`
                : `WORK_REMINDER:${item.id}:${dueKey}:${sla.reminderKey}`;
        const severity:
            NotificationSeverity =
            sla.escalationLevel === 3
                ? 'CRITICAL'
                : 'WARNING';
        const result =
            await this.deliver({
                sourceKey,
                category,
                severity,
                title:
                    sla.escalationLevel
                        ? `Công việc quá hạn: ${item.title}`
                        : `Công việc sắp đến hạn: ${item.title}`,
                message:
                    sla.label,
                recipientIds,
                entityType:
                    item.entity_type,
                entityId:
                    item.entity_id,
                workItemId:
                    item.id,
                projectId:
                    item.project_id,
                auditEventId:
                    item.audit_event_id,
                dueDate:
                    item.due_at,
                destinationPath:
                    item.destination_path,
                context: {
                    work_item_id:
                        item.id,
                    sla_state:
                        sla.state,
                    escalation_level:
                        sla.escalationLevel,
                    due_at:
                        item.due_at
                            .toISOString(),
                },
            });

        return {
            sla,
            ...result,
        };
    }

    private certificateReminderKey(
        daysUntilExpiry: number,
        thresholds: number[],
    ) {
        const ordered =
            [...new Set(
                thresholds
                    .map((value) => Math.max(0, Math.trunc(value)))
                    .filter((value) => value > 0),
            )]
                .sort((left, right) => left - right);

        for (const threshold of ordered) {
            if (daysUntilExpiry <= threshold) {
                return `${threshold}D`;
            }
        }

        return `${ordered[ordered.length - 1] ?? 0}D`;
    }

    async evaluateCertificateExpiry(
        now = new Date(),
    ) {
        const prismaForConfig =
            this.prisma as PrismaService & {
                organization_profiles?: {
                    findUnique?: (...args: any[]) => Promise<any>;
                };
                scheme_configuration_versions?: {
                    aggregate?: (...args: any[]) => Promise<any>;
                };
            };
        const [
            organizationProfile,
            activeConfigurationLead,
        ] = await Promise.all([
            prismaForConfig.organization_profiles?.findUnique
                ? prismaForConfig.organization_profiles.findUnique({
                    where: {
                        profile_key:
                            'PRIMARY',
                    },
                    select: {
                        certificate_reminder_days:
                            true,
                    },
                })
                : Promise.resolve(null),
            prismaForConfig.scheme_configuration_versions?.aggregate
                ? prismaForConfig.scheme_configuration_versions.aggregate({
                    where: {
                        status:
                            'ACTIVE',
                        effective_from: {
                            lte:
                                now,
                        },
                        OR: [
                            {
                                effective_to:
                                    null,
                            },
                            {
                                effective_to: {
                                    gte:
                                        now,
                                },
                            },
                        ],
                    },
                    _max: {
                        reminder_lead_days:
                            true,
                        renewal_window_days:
                            true,
                    },
                })
                : Promise.resolve({
                    _max: {
                        reminder_lead_days:
                            null,
                        renewal_window_days:
                            null,
                    },
                }),
        ]);
        const organizationLeadDays =
            organizationReminderDays(organizationProfile?.certificate_reminder_days);
        const queryLeadDays =
            Math.max(
                organizationLeadDays,
                activeConfigurationLead
                    ?._max
                    ?.reminder_lead_days ??
                0,
                activeConfigurationLead
                    ?._max
                    ?.renewal_window_days ??
                0,
                90,
            );
        const certificates =
            await this.prisma.certificates.findMany({
                where: {
                    status: {
                        in: [
                            'active',
                            'suspended',
                        ],
                    },
                    expire_date: {
                        gte:
                            now,
                        lte:
                            new Date(
                                now.getTime() +
                                queryLeadDays * DAY_MS,
                            ),
                    },
                    superseded_by: {
                        none: {},
                    },
                },
                include: {
                    certificate_series: {
                        select: {
                            project_id:
                                true,
                            certification_project: {
                                select: {
                                    scheme_config_snapshot:
                                        true,
                                },
                            },
                        },
                    },
                },
            });
        let delivered = 0;
        let eligibleCandidates = 0;

        for (const certificate of certificates) {
            if (!certificate.expire_date) {
                continue;
            }

            const daysUntilExpiry =
                Math.max(
                    0,
                    Math.ceil(
                        (
                            certificate
                                .expire_date
                                .getTime() -
                            now.getTime()
                        ) /
                        DAY_MS,
                    ),
                );
            const runtimeRules =
                resolveSchemeRuntimeRules(
                    certificate
                        .certificate_series
                        .certification_project
                        ?.scheme_config_snapshot,
                );
            const reminderDays =
                runtimeRules.source ===
                    'PROJECT_SNAPSHOT'
                    ? runtimeRules.reminder_lead_days
                    : organizationLeadDays;
            const renewalWindowDays =
                runtimeRules.source ===
                    'PROJECT_SNAPSHOT'
                    ? runtimeRules.renewal_window_days
                    : 0;
            const leadDays =
                Math.max(
                    reminderDays,
                    renewalWindowDays,
                );

            if (
                leadDays <= 0 ||
                daysUntilExpiry > leadDays
            ) {
                continue;
            }

            eligibleCandidates += 1;

            const threshold =
                this.certificateReminderKey(
                    daysUntilExpiry,
                    [
                        7,
                        30,
                        60,
                        90,
                        reminderDays,
                        renewalWindowDays,
                        leadDays,
                    ].filter(
                        (value) =>
                            value > 0 &&
                            value <= leadDays,
                    ),
                );
            const projectId =
                certificate
                    .certificate_series
                    .project_id;
            const recipientIds =
                await this.recipients
                    .resolveRolesForProject(
                        projectId,
                        [
                            'COORDINATOR',
                            'DECISION_MAKER',
                        ],
                    );
            const result =
                await this.deliver({
                    sourceKey:
                        `CERT_EXPIRY:${certificate.id}:${this.dateKey(certificate.expire_date)}:${threshold}`,
                    category:
                        'CERTIFICATE_EXPIRING',
                    severity:
                        daysUntilExpiry <= 7
                            ? 'WARNING'
                            : 'NORMAL',
                    title:
                        `Chứng chỉ ${certificate.cert_number} sắp hết hiệu lực`,
                    message:
                        daysUntilExpiry === 0
                            ? 'Chứng chỉ hết hiệu lực hôm nay.'
                            : `Chứng chỉ còn ${daysUntilExpiry} ngày hiệu lực.`,
                    recipientIds,
                    entityType:
                        'certificate',
                    entityId:
                        certificate.id,
                    projectId,
                    dueDate:
                        certificate.expire_date,
                    destinationPath:
                        `/certificates/${certificate.id}?project_id=${projectId}`,
                    context: {
                        certificate_id:
                            certificate.id,
                        certificate_number:
                            certificate.cert_number,
                        public_status:
                            certificate.status,
                        reminder_lead_days:
                            reminderDays,
                        renewal_window_days:
                            renewalWindowDays,
                        reminder_rule_source:
                            runtimeRules.source,
                    },
                });

            delivered +=
                result.delivered;
        }

        return {
            candidates:
                eligibleCandidates,
            scanned:
                certificates.length,
            organization_fallback_lead_days:
                organizationLeadDays,
            delivered,
        };
    }

    async evaluateCertificateStatusChanges(
        now = new Date(),
    ) {
        const histories =
            await this.prisma
                .certificate_status_histories
                .findMany({
                    where: {
                        created_at: {
                            gte:
                                new Date(
                                    now.getTime() -
                                    24 * 60 * 60 * 1000,
                                ),
                        },
                        to_status: {
                            in: [
                                'active',
                                'suspended',
                                'withdrawn',
                            ],
                        },
                    },
                    include: {
                        certificates: {
                            include: {
                                certificate_series: {
                                    select: {
                                        project_id:
                                            true,
                                    },
                                },
                            },
                        },
                    },
                });
        const labels:
            Record<string, string> = {
            active:
                'Đang hiệu lực',
            suspended:
                'Tạm đình chỉ',
            withdrawn:
                'Đã thu hồi',
        };
        let delivered = 0;

        for (const history of histories) {
            const certificate =
                history.certificates;
            const projectId =
                certificate
                    .certificate_series
                    .project_id;
            const recipientIds =
                await this.recipients
                    .resolveRolesForProject(
                        projectId,
                        [
                            'COORDINATOR',
                            'DECISION_MAKER',
                        ],
                    );
            const result =
                await this.deliver({
                    sourceKey:
                        `CERT_STATUS:${history.id}`,
                    category:
                        'CERTIFICATE_STATUS_CHANGED',
                    severity:
                        history.to_status ===
                            'withdrawn'
                            ? 'CRITICAL'
                            : 'INFO',
                    title:
                        `Trạng thái chứng chỉ ${certificate.cert_number} đã thay đổi`,
                    message:
                        `Trạng thái công khai mới: ${labels[history.to_status] ?? history.to_status}. Hiệu lực từ ${this.dateKey(history.effective_date)}.`,
                    recipientIds,
                    entityType:
                        'certificate',
                    entityId:
                        certificate.id,
                    projectId,
                    destinationPath:
                        `/certificates/${certificate.id}?project_id=${projectId}`,
                    context: {
                        certificate_id:
                            certificate.id,
                        certificate_number:
                            certificate.cert_number,
                        public_status:
                            history.to_status,
                        effective_date:
                            history.effective_date
                                .toISOString(),
                    },
                });

            delivered +=
                result.delivered;
        }

        return {
            candidates:
                histories.length,
            delivered,
        };
    }

    async evaluateNotifications(
        now = new Date(),
    ) {
        const assignmentResult =
            await this.evaluateAssignments(
                now,
            );
        const workItems =
            await this.prisma.work_items.findMany({
                where: {
                    status: {
                        in: [
                            'OPEN',
                            'IN_PROGRESS',
                        ],
                    },
                    OR: [
                        {
                            available_at:
                                null,
                        },
                        {
                            available_at: {
                                lte:
                                    now,
                            },
                        },
                    ],
                    due_at: {
                        not: null,
                    },
                },
            });
        let slaDeliveries = 0;

        for (const item of workItems) {
            const sla =
                await this.evaluateWorkItem(
                    item,
                    now,
                );
            slaDeliveries +=
                sla.delivered;
        }

        const [
            certificates,
            statusChanges,
        ] = await Promise.all([
            this.evaluateCertificateExpiry(
                now,
            ),
            this.evaluateCertificateStatusChanges(
                now,
            ),
        ]);

        return {
            evaluated_at:
                now,
            active_work_items:
                assignmentResult
                    .active_work_items,
            assignment_deliveries:
                assignmentResult
                    .assignment_deliveries,
            sla_deliveries:
                slaDeliveries,
            certificate_expiry_deliveries:
                certificates.delivered,
            certificate_status_deliveries:
                statusChanges.delivered,
        };
    }

    async evaluateAssignments(
        now = new Date(),
    ) {
        const workItems =
            await this.prisma.work_items.findMany({
                where: {
                    status: {
                        in: [
                            'OPEN',
                            'IN_PROGRESS',
                        ],
                    },
                    OR: [
                        {
                            available_at:
                                null,
                        },
                        {
                            available_at: {
                                lte:
                                    now,
                            },
                        },
                    ],
                },
            });
        let assignmentDeliveries = 0;

        for (const item of workItems) {
            const result =
                await this.notifyWorkAssigned(
                    item,
                );
            assignmentDeliveries +=
                result.delivered;
        }

        return {
            evaluated_at:
                now,
            active_work_items:
                workItems.length,
            assignment_deliveries:
                assignmentDeliveries,
        };
    }
}
