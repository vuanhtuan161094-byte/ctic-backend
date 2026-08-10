import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';

import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

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
    created_at: Date;
    updated_at: Date;
}

@Injectable()
export class NotificationsService {
    private readonly logger =
        new Logger(
            NotificationsService.name,
        );

    constructor(
        private readonly prisma:
            PrismaService,
        private readonly dashboardService:
            DashboardService,
    ) { }

    private normalizeWarningDays(
        warningDays: number,
    ) {
        if (
            !Number.isFinite(
                warningDays,
            )
        ) {
            return 90;
        }

        return Math.min(
            Math.max(
                Math.trunc(
                    warningDays,
                ),
                1,
            ),
            365,
        );
    }

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

                title:
                    dto.title.trim(),

                message:
                    dto.message.trim(),

                severity:
                    dto.severity
                        ?.trim()
                        .toLowerCase() ??
                    'info',

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
                    severity: 'critical',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'warning',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'info',
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
        status?: string,
        limit = 50,
    ) {
        const safeStatus =
            this.normalizeStatus(
                status,
            );

        const safeLimit =
            this.normalizeLimit(
                limit,
            );

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
                limit:
                    safeLimit,
            },
            items,
        };
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

    private async getInternalRecipients() {
        const users =
            await this.prisma.users.findMany({
                where: {
                    status:
                        'active',
                },

                include: {
                    user_roles: {
                        include: {
                            roles:
                                true,
                        },
                    },
                },
            });

        const internalRoles =
            new Set([
                'ADMIN',
                'STAFF',
                'COORDINATOR',
                'LEAD_AUDITOR',
                'AUDITOR',
                'TECHNICAL_REVIEWER',
                'DECISION_MAKER',
            ]);

        return users.filter(
            (user) =>
                user.user_roles.some(
                    (userRole) =>
                        internalRoles.has(
                            userRole.roles.role_name
                                .trim()
                                .toUpperCase(),
                        ),
                ),
        );
    }

    async generateReminders(
        warningDays = 90,
    ) {
        const safeWarningDays =
            this.normalizeWarningDays(
                warningDays,
            );

        const [
            dashboardResult,
            recipients,
        ] = await Promise.all([
            this.dashboardService.getAlerts(
                safeWarningDays,
            ),

            this.getInternalRecipients(),
        ]);

        const alerts =
            dashboardResult.alerts;

        let created = 0;
        let updated = 0;
        let reopened = 0;
        let resolved = 0;

        for (
            const recipient
            of recipients
        ) {
            const prefix =
                `dashboard:${recipient.id}:`;

            const activeSourceKeys:
                string[] = [];

            for (
                const alert
                of alerts
            ) {
                const sourceKey =
                    `${prefix}${alert.id}`;

                activeSourceKeys.push(
                    sourceKey,
                );

                const existing =
                    await this.prisma.notifications.findUnique({
                        where: {
                            source_key:
                                sourceKey,
                        },
                    });

                const commonData = {
                    notification_type:
                        alert.alert_type,

                    title:
                        alert.title,

                    message:
                        alert.message,

                    severity:
                        alert.severity,

                    entity_type:
                        alert.entity_type,

                    entity_id:
                        alert.entity_id,

                    due_date:
                        alert.due_date,
                };

                if (!existing) {
                    await this.prisma.notifications.create({
                        data: {
                            user_id:
                                recipient.id,

                            source_key:
                                sourceKey,

                            ...commonData,

                            status:
                                'unread',
                        },
                    });

                    created++;
                    continue;
                }

                if (
                    existing.status ===
                    'resolved'
                ) {
                    await this.prisma.notifications.update({
                        where: {
                            id:
                                existing.id,
                        },
                        data: {
                            ...commonData,

                            status:
                                'unread',

                            read_at:
                                null,
                        },
                    });

                    reopened++;
                    continue;
                }

                await this.prisma.notifications.update({
                    where: {
                        id:
                            existing.id,
                    },
                    data:
                        commonData,
                });

                updated++;
            }

            const obsoleteWhere = {
                user_id:
                    recipient.id,

                source_key: {
                    startsWith:
                        prefix,

                    ...(activeSourceKeys.length > 0
                        ? {
                            notIn:
                                activeSourceKeys,
                        }
                        : {}),
                },

                status: {
                    not:
                        'resolved',
                },
            };

            const resolvedResult =
                await this.prisma.notifications.updateMany({
                    where:
                        obsoleteWhere,

                    data: {
                        status:
                            'resolved',

                        read_at:
                            new Date(),
                    },
                });

            resolved +=
                resolvedResult.count;
        }

        return {
            generated_at:
                new Date(),

            warning_days:
                safeWarningDays,

            recipients:
                recipients.length,

            active_alerts:
                alerts.length,

            created,
            updated,
            reopened,
            resolved,
        };
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
            canViewOperationalTasks ||
            isSales
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

        if (canViewOperationalTasks) {
            const auditPlans =
                await this.prisma.audit_plans.findMany({
                    where: {
                        status: {
                            notIn: [
                                'completed',
                                'cancelled',
                            ],
                        },
                        planned_start_date: {
                            not:
                                null,
                            lte:
                                new Date(
                                    Date.now() +
                                    30 * 24 * 60 * 60 * 1000,
                                ),
                        },
                    },
                    include: {
                        certification_projects: {
                            include:
                                projectInclude,
                        },
                    },
                    orderBy: {
                        planned_start_date:
                            'asc',
                    },
                    take: 100,
                });

            for (const plan of auditPlans) {
                const project =
                    plan.certification_projects;

                const info =
                    getProjectInfo(project);

                addTask({
                    id:
                        `audit-plan:${plan.id}`,
                    task_type:
                        'audit_plan',
                    title:
                        `Chuẩn bị đánh giá ${plan.plan_code ?? info.projectCode ?? ''}`.trim(),
                    description:
                        `${info.organizationName ?? 'Khách hàng'} · ${plan.audit_type ?? 'Cuộc đánh giá'}`,
                    group:
                        'Lịch & nguồn lực',
                    priority:
                        this.getTaskPriority(
                            plan.planned_start_date,
                            'normal',
                        ),
                    source_status:
                        plan.status ??
                        'draft',
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
                        null,
                    due_date:
                        plan.planned_start_date,
                    destination:
                        'schedule-resources',
                    target_id:
                        plan.id,
                    created_at:
                        plan.created_at,
                    updated_at:
                        plan.updated_at,
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
                        },
                        include: {
                            audit_team_appointments: {
                                include: {
                                    audit_plans: {
                                        include: {
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

                    addTask({
                        id:
                            `assignment:${assignment.id}`,
                        task_type:
                            'audit_assignment',
                        title:
                            `Lịch đánh giá được phân công ${info.projectCode ?? ''}`.trim(),
                        description:
                            `${info.organizationName ?? 'Khách hàng'} · ${assignment.team_role}`,
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
                            'schedule-resources',
                        target_id:
                            plan.id,
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
            const expiringCertificates =
                await this.prisma.certificates.findMany({
                    where: {
                        status:
                            'active',
                        expire_date: {
                            not:
                                null,
                            lte:
                                new Date(
                                    Date.now() +
                                    90 * 24 * 60 * 60 * 1000,
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

    @Cron(
        '0 0 7 * * *',
        {
            timeZone:
                'Asia/Ho_Chi_Minh',
        },
    )
    async generateDailyReminders() {
        try {
            const result =
                await this.generateReminders(
                    90,
                );

            this.logger.log(
                `Đã tạo nhắc hạn: ${JSON.stringify(
                    result,
                )}`,
            );
        } catch (error) {
            this.logger.error(
                'Không thể tạo thông báo nhắc hạn tự động',
                error instanceof Error
                    ? error.stack
                    : String(error),
            );
        }
    }
}