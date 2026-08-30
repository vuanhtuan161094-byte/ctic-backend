import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { resolveCanonicalOperationalPlans } from '../audit-plans/audit-plan-canonical';
import {
    auditCycleBusinessLabel,
    businessAuditTaskTitle,
    dossierKeyForAuditCycle,
    hasPreparedAuditPlan,
} from '../audit-plans/audit-cycle-workflow';
import { PrismaService } from '../prisma/prisma.service';
import { surveillanceNextAction } from '../surveillance-information/surveillance-workflow';
import { resolveSchemeRuntimeRules } from '../master-data-configuration/scheme-runtime-rules';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_SEVERITIES,
    type NotificationCategory,
} from './notification.constants';
import {
    NotificationEngineService,
} from './notification-engine.service';

interface WorkTaskItem {
    id: string;
    task_type: string;
    title: string;
    description: string;
    group: string;
    priority: 'critical' | 'high' | 'normal';
    source_status: string;
    entity_type: string;
    entity_id: string | null;
    project_id: string | null;
    project_code: string | null;
    organization_name: string | null;
    assignee: string | null;
    due_date: Date | null;
    destination:
    'project-detail' |
    'projects' |
    'schedule-resources' |
    'certificates';
    target_id: string | null;
    dossier_key?: string | null;
    audit_event_id?: string | null;
    action_code?: string | null;
    created_at: Date;
    updated_at: Date;
}


@Injectable()
export class NotificationsService {
    constructor(
        private readonly prisma:
            PrismaService,
        private readonly notificationEngine:
            NotificationEngineService,
    ) { }

    private normalizeLimit(
        limit: number,
    ) {
        if (
            !Number.isFinite(
                limit,
            )
        ) {
            return 50;
        }

        return Math.min(
            Math.max(
                Math.trunc(
                    limit,
                ),
                1,
            ),
            200,
        );
    }

    private normalizeStatus(
        status?: string,
    ) {
        const safeStatus =
            status
                ?.trim()
                .toLowerCase();

        if (
            safeStatus === 'unread' ||
            safeStatus === 'read' ||
            safeStatus === 'resolved'
        ) {
            return safeStatus;
        }

        return 'all';
    }

    async create(
        dto: CreateNotificationDto,
    ) {
        const user =
            await this.prisma.users.findUnique({
                where: {
                    id: dto.user_id,
                },
                select: {
                    id: true,
                    status: true,
                },
            });

        if (!user) {
            throw new NotFoundException(
                'Không tìm thấy tài khoản nhận thông báo',
            );
        }

        return this.prisma.notifications.create({
            data: {
                user_id:
                    dto.user_id,

                source_key:
                    `manual:${randomUUID()}`,

                notification_type:
                    dto.notification_type
                        .trim()
                        .toLowerCase(),

                category:
                    dto.category ??
                    'WORKFLOW_UPDATE',

                title:
                    dto.title.trim(),

                message:
                    dto.message.trim(),

                severity:
                    dto.severity
                        ?.trim()
                        .toUpperCase() ??
                    'INFO',

                entity_type:
                    dto.entity_type
                        ?.trim()
                        .toLowerCase() ??
                    null,

                entity_id:
                    dto.entity_id ??
                    null,

                due_date:
                    dto.due_date
                        ? new Date(
                            dto.due_date,
                        )
                        : null,

                status:
                    'unread',

                channel:
                    'IN_APP',

                delivery_status:
                    'DELIVERED',
            },
        });
    }

    async getUnreadSummary(
        userId: string,
    ) {
        const [
            total,
            critical,
            warning,
            info,
        ] = await Promise.all([
            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'CRITICAL',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'WARNING',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: {
                        in: [
                            'INFO',
                            'NORMAL',
                        ],
                    },
                },
            }),
        ]);

        return {
            total,
            critical,
            warning,
            info,
        };
    }

    async findForUser(
        userId: string,
        query: {
            status?: string;
            category?: string;
            severity?: string;
            limit?: number;
        } = {},
    ) {
        const safeStatus =
            this.normalizeStatus(
                query.status,
            );

        const safeLimit =
            this.normalizeLimit(
                query.limit ??
                50,
            );
        const category =
            query.category
                ?.trim()
                .toUpperCase();
        const severity =
            query.severity
                ?.trim()
                .toUpperCase();

        if (
            category &&
            !NOTIFICATION_CATEGORIES.includes(
                category as NotificationCategory,
            )
        ) {
            throw new BadRequestException(
                'Nhóm thông báo không hợp lệ',
            );
        }

        if (
            severity &&
            !NOTIFICATION_SEVERITIES.includes(
                severity as never,
            )
        ) {
            throw new BadRequestException(
                'Mức độ thông báo không hợp lệ',
            );
        }

        const items =
            await this.prisma.notifications.findMany({
                where: {
                    user_id: userId,

                    ...(safeStatus !== 'all'
                        ? {
                            status:
                                safeStatus,
                        }
                        : {}),
                    ...(category
                        ? {
                            category,
                        }
                        : {}),
                    ...(severity
                        ? {
                            severity,
                        }
                        : {}),
                    channel:
                        'IN_APP',
                },

                include: {
                    work_item: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },

                orderBy: [
                    {
                        status: 'asc',
                    },
                    {
                        created_at:
                            'desc',
                    },
                ],

                take: safeLimit,
            });

        const summary =
            await this.getUnreadSummary(
                userId,
            );

        return {
            summary,
            filter: {
                status:
                    safeStatus,
                category:
                    category ??
                    null,
                severity:
                    severity ??
                    null,
                limit:
                    safeLimit,
            },
            items:
                items.map((item) => ({
                    id:
                        item.id,
                    category:
                        item.category,
                    severity:
                        item.severity,
                    title:
                        item.title,
                    message:
                        item.message,
                    created_at:
                        item.created_at,
                    read_at:
                        item.read_at,
                    status:
                        item.status,
                    destination_path:
                        item.destination_path,
                    context:
                        this.parseNotificationContext(
                            item.context_json,
                        ),
                    entity_type:
                        item.entity_type,
                    entity_id:
                        item.entity_id,
                    project_id:
                        item.project_id,
                    audit_event_id:
                        item.audit_event_id,
                    work_item:
                        item.work_item
                            ? {
                                id:
                                    item.work_item.id,
                                status:
                                    item.work_item.status,
                                completed:
                                    item.work_item.status ===
                                    'DONE',
                            }
                            : null,
                    due_date:
                        item.due_date,
                    channel:
                        item.channel,
                })),
        };
    }

    private parseNotificationContext(
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
                ? parsed
                : null;
        } catch {
            return null;
        }
    }

    async markRead(
        id: string,
        userId: string,
    ) {
        const notification =
            await this.prisma.notifications.findFirst({
                where: {
                    id,
                    user_id: userId,
                },
            });

        if (!notification) {
            throw new NotFoundException(
                'Không tìm thấy thông báo',
            );
        }

        if (
            notification.status ===
            'resolved'
        ) {
            return notification;
        }

        return this.prisma.notifications.update({
            where: {
                id,
            },
            data: {
                status:
                    'read',
                read_at:
                    new Date(),
            },
        });
    }

    async markAllRead(
        userId: string,
    ) {
        const result =
            await this.prisma.notifications.updateMany({
                where: {
                    user_id:
                        userId,
                    status:
                        'unread',
                },
                data: {
                    status:
                        'read',
                    read_at:
                        new Date(),
                },
            });

        return {
            message:
                'Đã đánh dấu tất cả thông báo là đã đọc',
            updated_count:
                result.count,
        };
    }

    async generateReminders(
        _warningDays = 90,
    ) {
        return this.notificationEngine
            .evaluateNotifications(
                new Date(),
            );
    }

    async getPreferences(
        userId: string,
    ) {
        const stored =
            await this.prisma
                .notification_preferences
                .findMany({
                    where: {
                        user_id:
                            userId,
                    },
                });
        const index =
            new Map(
                stored.map((item) => [
                    `${item.category}:${item.channel}`,
                    item,
                ]),
            );

        return NOTIFICATION_CATEGORIES.map(
            (category) => ({
                category,
                in_app_enabled:
                    index.get(
                        `${category}:IN_APP`,
                    )?.enabled ??
                    true,
                email_enabled:
                    index.get(
                        `${category}:EMAIL`,
                    )?.enabled ??
                    false,
                email_delivery_available:
                    false,
            }),
        );
    }

    async setInAppPreference(
        userId: string,
        category: string,
        enabled: boolean,
    ) {
        const normalized =
            category
                .trim()
                .toUpperCase() as NotificationCategory;

        if (
            !NOTIFICATION_CATEGORIES.includes(
                normalized,
            )
        ) {
            throw new BadRequestException(
                'Nhóm thông báo không hợp lệ',
            );
        }

        return this.prisma
            .notification_preferences
            .upsert({
                where: {
                    user_id_category_channel: {
                        user_id:
                            userId,
                        category:
                            normalized,
                        channel:
                            'IN_APP',
                    },
                },
                create: {
                    user_id:
                        userId,
                    category:
                        normalized,
                    channel:
                        'IN_APP',
                    enabled,
                },
                update: {
                    enabled,
                },
            });
    }


    private normalizeRoles(
        roles: string[],
    ) {
        return new Set(
            roles.map(
                (role) =>
                    role
                        .trim()
                        .toUpperCase(),
            ),
        );
    }

    private getTaskPriority(
        dueDate: Date | null,
        preferred: WorkTaskItem['priority'] = 'normal',
    ): WorkTaskItem['priority'] {
        if (
            dueDate &&
            dueDate.getTime() <
            new Date().setHours(0, 0, 0, 0)
        ) {
            return 'critical';
        }

        if (
            dueDate &&
            dueDate.getTime() <=
            Date.now() +
            7 * 24 * 60 * 60 * 1000
        ) {
            return preferred === 'critical'
                ? 'critical'
                : 'high';
        }

        return preferred;
    }

    async findTasksForUser(
        userId: string,
        roles: string[] = [],
        limit = 200,
    ) {
        const safeLimit =
            this.normalizeLimit(limit);

        const roleSet =
            this.normalizeRoles(roles);

        const isAdmin =
            roleSet.has('ADMIN');

        const isCoordinator =
            roleSet.has('COORDINATOR') ||
            roleSet.has('STAFF');

        const isSales =
            roleSet.has('SALES');

        const isAuditor =
            roleSet.has('AUDITOR') ||
            roleSet.has('LEAD_AUDITOR');

        const isTechnicalReviewer =
            roleSet.has('TECHNICAL_REVIEWER');

        const isDecisionMaker =
            roleSet.has('DECISION_MAKER');

        const canViewOperationalTasks =
            isAdmin ||
            isCoordinator;

        const currentUser =
            await this.prisma.users.findUnique({
                where: {
                    id: userId,
                },
                select: {
                    id: true,
                    email: true,
                    full_name: true,
                    username: true,
                },
            });

        if (!currentUser) {
            throw new NotFoundException(
                'Không tìm thấy tài khoản',
            );
        }

        const tasks: WorkTaskItem[] = [];
        const taskKeys = new Set<string>();

        const addTask = (
            task: WorkTaskItem,
        ) => {
            if (taskKeys.has(task.id)) {
                return;
            }

            taskKeys.add(task.id);
            tasks.push(task);
        };

        const getProjectInfo = (
            project: any,
        ) => ({
            projectId:
                project?.id ??
                null,
            projectCode:
                project?.project_code ??
                null,
            organizationName:
                project
                    ?.certification_applications
                    ?.customers
                    ?.company_name ??
                null,
        });

        const projectInclude = {
            certification_applications: {
                select: {
                    customers: {
                        select: {
                            company_name:
                                true,
                        },
                    },
                },
            },
        } as const;

        if (
            isSales &&
            !canViewOperationalTasks
        ) {
            const projects =
                await this.prisma.certification_projects.findMany({
                    where: {
                        status: {
                            in: [
                                'draft',
                                'project_created',
                                'pending',
                                'under_review',
                                'in_progress',
                                'corrective_action_required',
                                'revision_required',
                                'pending_technical_review',
                                'technical_review_completed',
                            ],
                        },
                    },
                    include:
                        projectInclude,
                    orderBy: {
                        updated_at:
                            'desc',
                    },
                    take: 100,
                });

            for (const project of projects) {
                const status =
                    (
                        project.status ??
                        'draft'
                    )
                        .trim()
                        .toLowerCase();

                const info =
                    getProjectInfo(project);

                const needsUrgentAction =
                    [
                        'corrective_action_required',
                        'revision_required',
                        'pending_technical_review',
                    ].includes(status);

                addTask({
                    id:
                        `project:${project.id}`,
                    task_type:
                        'certification_project',
                    title:
                        needsUrgentAction
                            ? `Xử lý hồ sơ ${project.project_code}`
                            : `Tiếp tục hồ sơ ${project.project_code}`,
                    description:
                        `${info.organizationName ?? 'Khách hàng'} · ${project.standard_name ?? 'Chưa xác định tiêu chuẩn'}`,
                    group:
                        'Hồ sơ chứng nhận',
                    priority:
                        needsUrgentAction
                            ? 'high'
                            : 'normal',
                    source_status:
                        status,
                    entity_type:
                        'certification_project',
                    entity_id:
                        project.id,
                    project_id:
                        project.id,
                    project_code:
                        project.project_code,
                    organization_name:
                        info.organizationName,
                    assignee:
                        null,
                    due_date:
                        null,
                    destination:
                        'project-detail',
                    target_id:
                        project.id,
                    created_at:
                        project.created_at,
                    updated_at:
                        project.updated_at,
                });
            }
        }

        if (canViewOperationalTasks) {
            const auditEvents = await this.prisma.audit_program_events.findMany({
                where: {
                    status: {
                        notIn: ['completed', 'cancelled'],
                    },
                },
                include: {
                    audit_programs: {
                        include: {
                            certification_projects: {
                                include: projectInclude,
                            },
                        },
                    },
                    audit_plans: {
                        include: {
                            audit_team_appointment: {
                                select: {
                                    id: true,
                                    status: true,
                                },
                            },
                            reports: {
                                select: {
                                    id: true,
                                },
                            },
                        },
                    },
                    surveillance_information_snapshots: {
                        orderBy: [
                            { version_no: 'desc' },
                            { created_at: 'desc' },
                        ],
                        take: 1,
                    },
                },
                orderBy: [
                    { planned_start_date: 'asc' },
                    { sequence_no: 'asc' },
                ],
                take: 100,
            });

            const currentEventByProject = new Map<string, (typeof auditEvents)[number]>();
            for (const event of auditEvents) {
                const project = event.audit_programs.certification_projects;
                if (!project) continue;
                const existing = currentEventByProject.get(project.id);
                const statusPriority = (value?: string | null) =>
                    ['in_progress', 'active'].includes((value ?? '').trim().toLowerCase()) ? 0 : 1;
                if (!existing || statusPriority(event.status) < statusPriority(existing.status)) {
                    currentEventByProject.set(project.id, event);
                }
            }

            for (const event of currentEventByProject.values()) {
                const project = event.audit_programs.certification_projects;
                const plan = resolveCanonicalOperationalPlans(event.audit_plans).plans[0] ?? null;
                const appointmentIssued = ['issued', 'confirmed'].includes(
                    (plan?.audit_team_appointment?.status ?? '').trim().toLowerCase(),
                );
                const dossierKey = dossierKeyForAuditCycle(event.event_type);
                const isSurveillance = dossierKey === 'surveillance_1' || dossierKey === 'surveillance_2';
                const snapshot = event.surveillance_information_snapshots[0] ?? null;
                let actionCode: string | null = null;

                if (isSurveillance) {
                    const action = surveillanceNextAction({
                        snapshot: snapshot
                            ? {
                                status: snapshot.status,
                                change_impact: snapshot.change_impact,
                                changes: (() => {
                                    try {
                                        return JSON.parse(snapshot.changes_json) as Array<{
                                            category?: string | null;
                                            affects_manday?: boolean | null;
                                        }>;
                                    } catch {
                                        return [];
                                    }
                                })(),
                            }
                            : null,
                        eventId: event.id,
                        planId: plan?.id ?? null,
                        appointmentExists: appointmentIssued,
                    });
                    actionCode = action?.code ?? null;
                }

                if (!actionCode && !appointmentIssued) actionCode = 'APPOINT_TEAM';
                if (!actionCode && (!plan || !hasPreparedAuditPlan(plan.form_data))) actionCode = 'PLAN_AUDIT';
                if (!actionCode && plan && plan.reports.length === 0) actionCode = 'EXECUTE_AUDIT';
                if (!actionCode) continue;

                const coordinatorAction = ['UPDATE_INFORMATION', 'REVIEW_CHANGE', 'APPOINT_TEAM'].includes(actionCode);
                if (coordinatorAction && !isAdmin && !isCoordinator) continue;
                if (!coordinatorAction && !isAdmin) continue;

                const info = getProjectInfo(project);
                addTask({
                    id: `audit-event:${event.id}:${actionCode}`,
                    task_type: 'certification_cycle_action',
                    title: businessAuditTaskTitle(
                        event.event_type,
                        info.organizationName,
                        actionCode,
                    ),
                    description: `${info.projectCode ?? 'Hồ sơ chứng nhận'} · ${event.audit_programs.standard_name}`,
                    group: 'Hồ sơ chứng nhận',
                    priority: this.getTaskPriority(
                        plan?.planned_start_date ?? event.planned_start_date,
                        actionCode === 'REVIEW_CHANGE' ? 'high' : 'normal',
                    ),
                    source_status: actionCode.toLowerCase(),
                    entity_type: 'audit_program_event',
                    entity_id: event.id,
                    project_id: info.projectId,
                    project_code: info.projectCode,
                    organization_name: info.organizationName,
                    assignee: null,
                    due_date: plan?.planned_start_date ?? event.planned_start_date,
                    destination: 'project-detail',
                    target_id: info.projectId,
                    dossier_key: dossierKey,
                    audit_event_id: event.id,
                    action_code: actionCode,
                    created_at: event.created_at,
                    updated_at: event.updated_at,
                });
            }
        }

        if (
            canViewOperationalTasks ||
            isTechnicalReviewer
        ) {
            const technicalReviews =
                await this.prisma.technical_reviews.findMany({
                    where: {
                        status: {
                            notIn: [
                                'completed',
                                'accepted',
                            ],
                        },
                        ...(
                            isTechnicalReviewer &&
                            !canViewOperationalTasks
                                ? {
                                    reviewer_id:
                                        userId,
                                }
                                : {}
                        ),
                    },
                    include: {
                        reviewer: {
                            select: {
                                full_name: true,
                                username: true,
                            },
                        },
                        reports: {
                            select: {
                                report_code: true,
                                audit_plans: {
                                    select: {
                                        certification_projects: {
                                            include:
                                                projectInclude,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        updated_at:
                            'asc',
                    },
                    take: 100,
                });

            for (const review of technicalReviews) {
                const project =
                    review.reports
                        ?.audit_plans
                        ?.certification_projects;

                const info =
                    getProjectInfo(project);

                addTask({
                    id:
                        `technical-review:${review.id}`,
                    task_type:
                        'technical_review',
                    title:
                        `Thẩm xét kỹ thuật ${review.reports?.report_code ?? info.projectCode ?? ''}`.trim(),
                    description:
                        info.organizationName ??
                        'Hồ sơ chờ thẩm xét kỹ thuật',
                    group:
                        'Thẩm xét kỹ thuật',
                    priority:
                        review.status === 'revision_required'
                            ? 'high'
                            : 'normal',
                    source_status:
                        review.status,
                    entity_type:
                        'technical_review',
                    entity_id:
                        review.id,
                    project_id:
                        info.projectId,
                    project_code:
                        info.projectCode,
                    organization_name:
                        info.organizationName,
                    assignee:
                        review.reviewer?.full_name ??
                        review.reviewer?.username ??
                        null,
                    due_date:
                        null,
                    destination:
                        info.projectId
                            ? 'project-detail'
                            : 'projects',
                    target_id:
                        info.projectId,
                    created_at:
                        review.created_at,
                    updated_at:
                        review.updated_at,
                });
            }
        }

        if (
            canViewOperationalTasks ||
            isDecisionMaker
        ) {
            const completedReviews =
                await this.prisma.technical_reviews.findMany({
                    where: {
                        status:
                            'completed',
                    },
                    include: {
                        certification_decision:
                            true,
                        reports: {
                            select: {
                                report_code: true,
                                audit_plans: {
                                    select: {
                                        certification_projects: {
                                            include:
                                                projectInclude,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        completed_at:
                            'asc',
                    },
                    take: 100,
                });

            for (const review of completedReviews) {
                if (
                    review.certification_decision
                ) {
                    continue;
                }

                const project =
                    review.reports
                        ?.audit_plans
                        ?.certification_projects;

                const info =
                    getProjectInfo(project);

                const projectStatus =
                    (project?.status ?? '')
                        .trim()
                        .toLowerCase();

                if (
                    [
                        'certificate_issued',
                        'completed',
                        'closed',
                        'cancelled',
                    ].includes(projectStatus)
                ) {
                    continue;
                }

                addTask({
                    id:
                        `decision:${info.projectId ?? review.id}`,
                    task_type:
                        'certification_decision',
                    title:
                        `Ra quyết định chứng nhận ${info.projectCode ?? ''}`.trim(),
                    description:
                        info.organizationName ??
                        'Hồ sơ đã hoàn thành thẩm xét kỹ thuật',
                    group:
                        'Quyết định chứng nhận',
                    priority:
                        'high',
                    source_status:
                        'pending_decision',
                    entity_type:
                        'technical_review',
                    entity_id:
                        review.id,
                    project_id:
                        info.projectId,
                    project_code:
                        info.projectCode,
                    organization_name:
                        info.organizationName,
                    assignee:
                        null,
                    due_date:
                        null,
                    destination:
                        info.projectId
                            ? 'project-detail'
                            : 'projects',
                    target_id:
                        info.projectId,
                    created_at:
                        review.created_at,
                    updated_at:
                        review.updated_at,
                });
            }
        }

        if (
            canViewOperationalTasks ||
            isAuditor
        ) {
            const findings =
                await this.prisma.audit_findings.findMany({
                    where: {
                        status: {
                            not:
                                'closed',
                        },
                        ...(
                            isAuditor &&
                            !canViewOperationalTasks
                                ? {
                                    reports: {
                                        prepared_by:
                                            userId,
                                    },
                                }
                                : {}
                        ),
                    },
                    include: {
                        reports: {
                            select: {
                                report_code: true,
                                audit_plans: {
                                    select: {
                                        certification_projects: {
                                            include:
                                                projectInclude,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [
                        {
                            due_date:
                                'asc',
                        },
                        {
                            updated_at:
                                'desc',
                        },
                    ],
                    take: 100,
                });

            for (const finding of findings) {
                const project =
                    finding.reports
                        ?.audit_plans
                        ?.certification_projects;

                const info =
                    getProjectInfo(project);

                const preferredPriority =
                    finding.finding_type === 'major_nc'
                        ? 'critical'
                        : 'high';

                addTask({
                    id:
                        `finding:${finding.id}`,
                    task_type:
                        'audit_finding',
                    title:
                        `Theo dõi ${finding.finding_code}`,
                    description:
                        `${info.organizationName ?? 'Khách hàng'} · ${finding.description}`,
                    group:
                        'NC / Hành động khắc phục',
                    priority:
                        this.getTaskPriority(
                            finding.due_date,
                            preferredPriority,
                        ),
                    source_status:
                        finding.status,
                    entity_type:
                        'audit_finding',
                    entity_id:
                        finding.id,
                    project_id:
                        info.projectId,
                    project_code:
                        info.projectCode,
                    organization_name:
                        info.organizationName,
                    assignee:
                        null,
                    due_date:
                        finding.due_date,
                    destination:
                        info.projectId
                            ? 'project-detail'
                            : 'projects',
                    target_id:
                        info.projectId,
                    created_at:
                        finding.created_at,
                    updated_at:
                        finding.updated_at,
                });
            }
        }

        if (
            currentUser.email &&
            isAuditor
        ) {
            const expert =
                await this.prisma.experts.findUnique({
                    where: {
                        email:
                            currentUser.email,
                    },
                    select: {
                        id: true,
                        full_name: true,
                    },
                });

            if (expert) {
                const assignments =
                    await this.prisma.audit_team_members.findMany({
                        where: {
                            expert_id:
                                expert.id,
                            assignment_status: {
                                notIn: [
                                    'completed',
                                    'cancelled',
                                    'declined',
                                ],
                            },
                            audit_team_appointments: {
                                audit_plans: {
                                    audit_type: {
                                        not: 'project_team',
                                    },
                                },
                            },
                        },
                        include: {
                            audit_team_appointments: {
                                include: {
                                    audit_plans: {
                                        include: {
                                            audit_event: {
                                                select: {
                                                    id: true,
                                                    event_type: true,
                                                },
                                            },
                                            reports: {
                                                select: {
                                                    id: true,
                                                },
                                            },
                                            certification_projects: {
                                                include:
                                                    projectInclude,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        orderBy: {
                            planned_start_date:
                                'asc',
                        },
                        take: 100,
                    });

                for (const assignment of assignments) {
                    const plan =
                        assignment
                            .audit_team_appointments
                            .audit_plans;

                    const project =
                        plan.certification_projects;

                    const info =
                        getProjectInfo(project);

                    const assignmentRole = (assignment.team_role ?? '').trim().toUpperCase();
                    const isTeamLeaderAssignment = ['TEAM_LEADER', 'LEAD_AUDITOR'].includes(assignmentRole);
                    const eventType = plan.audit_event?.event_type ?? plan.audit_type;
                    const actionCode = isTeamLeaderAssignment
                        ? hasPreparedAuditPlan(plan.form_data)
                            ? plan.reports.length > 0
                                ? 'COMPLETE_REPORT'
                                : 'EXECUTE_AUDIT'
                            : 'PLAN_AUDIT'
                        : 'EXECUTE_AUDIT';

                    addTask({
                        id:
                            `assignment:${assignment.id}`,
                        task_type:
                            isTeamLeaderAssignment ? 'lead_auditor_assignment' : 'audit_assignment',
                        title:
                            isTeamLeaderAssignment
                                ? businessAuditTaskTitle(eventType, info.organizationName, actionCode)
                                : `${auditCycleBusinessLabel(eventType)} · ${info.organizationName ?? 'Khách hàng'} — Tham gia đánh giá`,
                        description:
                            `${info.projectCode ?? 'Hồ sơ chứng nhận'} · Vai trò ${assignment.team_role}`,
                        group:
                            'Công việc được phân công',
                        priority:
                            this.getTaskPriority(
                                assignment.planned_start_date,
                                'normal',
                            ),
                        source_status:
                            assignment.assignment_status,
                        entity_type:
                            'audit_plan',
                        entity_id:
                            plan.id,
                        project_id:
                            info.projectId,
                        project_code:
                            info.projectCode,
                        organization_name:
                            info.organizationName,
                        assignee:
                            expert.full_name,
                        due_date:
                            assignment.planned_start_date,
                        destination:
                            'project-detail',
                        target_id:
                            info.projectId,
                        dossier_key:
                            dossierKeyForAuditCycle(eventType),
                        audit_event_id:
                            plan.audit_event?.id ?? null,
                        action_code:
                            actionCode,
                        created_at:
                            assignment.created_at,
                        updated_at:
                            assignment.updated_at,
                    });
                }
            }
        }

        if (
            canViewOperationalTasks ||
            isDecisionMaker
        ) {
            const unsentNotifications =
                await this.prisma.audit_result_notifications.findMany({
                    where: {
                        sent_at:
                            null,
                        status: {
                            not:
                                'completed',
                        },
                    },
                    include: {
                        technical_reviews: {
                            select: {
                                reports: {
                                    select: {
                                        audit_plans: {
                                            select: {
                                                certification_projects: {
                                                    include:
                                                        projectInclude,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        notification_date:
                            'asc',
                    },
                    take: 100,
                });

            for (const notification of unsentNotifications) {
                const project =
                    notification
                        .technical_reviews
                        ?.reports
                        ?.audit_plans
                        ?.certification_projects;

                const info =
                    getProjectInfo(project);

                addTask({
                    id:
                        `audit-result-notification:${notification.id}`,
                    task_type:
                        'audit_result_notification',
                    title:
                        `Gửi thông báo kết quả ${notification.notification_number}`,
                    description:
                        info.organizationName ??
                        notification.organization_name,
                    group:
                        'Thông báo kết quả',
                    priority:
                        this.getTaskPriority(
                            notification.notification_date,
                            'high',
                        ),
                    source_status:
                        notification.status,
                    entity_type:
                        'audit_result_notification',
                    entity_id:
                        notification.id,
                    project_id:
                        info.projectId,
                    project_code:
                        info.projectCode,
                    organization_name:
                        info.organizationName ??
                        notification.organization_name,
                    assignee:
                        null,
                    due_date:
                        notification.notification_date,
                    destination:
                        info.projectId
                            ? 'project-detail'
                            : 'projects',
                    target_id:
                        info.projectId,
                    created_at:
                        notification.created_at,
                    updated_at:
                        notification.updated_at,
                });
            }
        }

        if (canViewOperationalTasks) {
            const reminderNow =
                new Date();
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
                                    reminderNow,
                            },
                            OR: [
                                {
                                    effective_to:
                                        null,
                                },
                                {
                                    effective_to: {
                                        gte:
                                            reminderNow,
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
                Math.max(
                    0,
                    organizationProfile
                        ?.certificate_reminder_days ??
                    90,
                );
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
            const expiringCertificates =
                await this.prisma.certificates.findMany({
                    where: {
                        status:
                            'active',
                        expire_date: {
                            not:
                                null,
                            gte:
                                reminderNow,
                            lte:
                                new Date(
                                    reminderNow.getTime() +
                                    queryLeadDays * 24 * 60 * 60 * 1000,
                                ),
                        },
                    },
                    include: {
                        technical_reviews: {
                            select: {
                                reports: {
                                    select: {
                                        audit_plans: {
                                            select: {
                                                certification_projects: {
                                                    include:
                                                        projectInclude,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        expire_date:
                            'asc',
                    },
                    take: 100,
                });

            for (const certificate of expiringCertificates) {
                const project =
                    certificate
                        .technical_reviews
                        ?.reports
                        ?.audit_plans
                        ?.certification_projects;

                const runtimeRules =
                    resolveSchemeRuntimeRules(
                        project?.scheme_config_snapshot,
                    );
                const reminderDays =
                    runtimeRules.source === 'PROJECT_SNAPSHOT'
                        ? runtimeRules.reminder_lead_days
                        : organizationLeadDays;
                const renewalWindowDays =
                    runtimeRules.source === 'PROJECT_SNAPSHOT'
                        ? runtimeRules.renewal_window_days
                        : 0;
                const leadDays =
                    Math.max(
                        reminderDays,
                        renewalWindowDays,
                    );
                const daysUntilExpiry =
                    certificate.expire_date
                        ? Math.max(
                            0,
                            Math.ceil(
                                (
                                    certificate.expire_date.getTime() -
                                    reminderNow.getTime()
                                ) /
                                (24 * 60 * 60 * 1000),
                            ),
                        )
                        : Number.POSITIVE_INFINITY;

                if (
                    leadDays <= 0 ||
                    daysUntilExpiry > leadDays
                ) {
                    continue;
                }

                const info =
                    getProjectInfo(project);

                addTask({
                    id:
                        `certificate:${certificate.id}`,
                    task_type:
                        'certificate_expiring',
                    title:
                        `Theo dõi chứng chỉ ${certificate.cert_number}`,
                    description:
                        info.organizationName ??
                        'Chứng chỉ sắp hết hạn',
                    group:
                        'Chứng chỉ',
                    priority:
                        this.getTaskPriority(
                            certificate.expire_date,
                            'high',
                        ),
                    source_status:
                        certificate.status ??
                        'active',
                    entity_type:
                        'certificate',
                    entity_id:
                        certificate.id,
                    project_id:
                        info.projectId,
                    project_code:
                        info.projectCode,
                    organization_name:
                        info.organizationName,
                    assignee:
                        null,
                    due_date:
                        certificate.expire_date,
                    destination:
                        'certificates',
                    target_id:
                        certificate.id,
                    created_at:
                        certificate.created_at,
                    updated_at:
                        certificate.updated_at,
                });
            }
        }

        const workflowApprovals =
            await this.prisma.workflow_approvals.findMany({
                where: {
                    approver_id:
                        userId,
                    status:
                        'pending',
                },
                orderBy: {
                    step_no:
                        'asc',
                },
                take: 100,
            });

        for (const approval of workflowApprovals) {
            addTask({
                id:
                    `workflow-approval:${approval.id}`,
                task_type:
                    'workflow_approval',
                title:
                    `Phê duyệt ${approval.entity_type.replaceAll('_', ' ')}`,
                description:
                    `Bước phê duyệt số ${approval.step_no}`,
                group:
                    'Phê duyệt',
                priority:
                    'high',
                source_status:
                    approval.status ??
                    'pending',
                entity_type:
                    approval.entity_type,
                entity_id:
                    approval.entity_id,
                project_id:
                    null,
                project_code:
                    null,
                organization_name:
                    null,
                assignee:
                    currentUser.full_name ??
                    currentUser.username,
                due_date:
                    null,
                destination:
                    'projects',
                target_id:
                    null,
                created_at:
                    approval.approved_at ??
                    new Date(),
                updated_at:
                    approval.approved_at ??
                    new Date(),
            });
        }

        const todayStart =
            new Date();

        todayStart.setHours(
            0,
            0,
            0,
            0,
        );

        const dueSoonEnd =
            new Date(
                todayStart.getTime(),
            );

        dueSoonEnd.setDate(
            dueSoonEnd.getDate() +
            7,
        );

        dueSoonEnd.setHours(
            23,
            59,
            59,
            999,
        );

        const priorityWeight:
            Record<WorkTaskItem['priority'], number> = {
                critical: 0,
                high: 1,
                normal: 2,
            };

        tasks.sort(
            (left, right) => {
                const priorityDifference =
                    priorityWeight[left.priority] -
                    priorityWeight[right.priority];

                if (priorityDifference !== 0) {
                    return priorityDifference;
                }

                const leftDue =
                    left.due_date?.getTime() ??
                    Number.MAX_SAFE_INTEGER;

                const rightDue =
                    right.due_date?.getTime() ??
                    Number.MAX_SAFE_INTEGER;

                if (leftDue !== rightDue) {
                    return leftDue - rightDue;
                }

                return (
                    right.updated_at.getTime() -
                    left.updated_at.getTime()
                );
            },
        );

        const summary = {
            total:
                tasks.length,
            overdue:
                tasks.filter(
                    (task) =>
                        task.due_date !== null &&
                        task.due_date <
                        todayStart,
                ).length,
            due_soon:
                tasks.filter(
                    (task) =>
                        task.due_date !== null &&
                        task.due_date >=
                        todayStart &&
                        task.due_date <=
                        dueSoonEnd,
                ).length,
            high_priority:
                tasks.filter(
                    (task) =>
                        task.priority === 'critical' ||
                        task.priority === 'high',
                ).length,
        };

        return {
            generated_at:
                new Date(),
            summary,
            filter: {
                limit:
                    safeLimit,
            },
            items:
                tasks.slice(
                    0,
                    safeLimit,
                ),
        };
    }

}
