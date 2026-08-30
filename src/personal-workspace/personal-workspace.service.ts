import {
    Injectable,
} from '@nestjs/common';

import {
    dossierKeyForAuditCycle,
} from '../audit-plans/audit-cycle-workflow';
import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    normalizeRoles,
} from '../security/security-request';
import {
    WorkItemsService,
} from '../work-items/work-items.service';

type WorkspaceActor = {
    userId: string;
    roles: string[];
};

type SafeWorkItem = {
    id: string;
    work_type: string;
    title: string;
    description: string | null;
    project_id: string | null;
    project_code: string | null;
    organization_name: string | null;
    audit_event_id: string | null;
    audit_plan_id: string | null;
    cycle_key: string | null;
    assigned_user_id: string | null;
    assigned_role: string | null;
    assignee: string | null;
    status: string;
    priority: string;
    due_at: Date | null;
    is_overdue: boolean;
    destination_path: string | null;
    context: Record<string, unknown> | null;
    can_execute: boolean;
    created_at: Date;
    updated_at: Date;
    completed_at: Date | null;
};

type AuditCalendarSource = {
    eventId: string;
    eventType: string;
    status: string;
    start: Date | null;
    end: Date | null;
    projectId: string;
    projectCode: string;
    organizationName: string;
    planId: string | null;
    teamRole: string;
};

export type PersonalCalendarItem = {
    id: string;
    type:
        | 'AUDIT'
        | 'WORK_DUE'
        | 'REVIEW_DUE'
        | 'DECISION_DUE'
        | 'CERTIFICATE_ACTION_DUE';
    title: string;
    start: Date;
    end: Date | null;
    all_day: boolean;
    project_id: string | null;
    project_code: string | null;
    organization_name: string | null;
    role_in_event: string | null;
    status: string;
    destination_path: string | null;
    context: Record<string, unknown> | null;
};

const PERSONA_ORDER = [
    'ADMIN',
    'COORDINATOR',
    'LEAD_AUDITOR',
    'AUDITOR',
    'TECHNICAL_EXPERT',
    'TECHNICAL_REVIEWER',
    'DECISION_MAKER',
    'SALES',
    'STAFF',
];

const WORK_TYPES_BY_PERSONA:
    Record<string, Set<string>> = {
    COORDINATOR:
        new Set([
            'APPLICATION_REVIEW',
            'SURVEILLANCE_CHANGE_REVIEW',
            'F04_TEAM_APPOINTMENT',
        ]),
    LEAD_AUDITOR:
        new Set([
            'AUDIT_PLAN',
            'AUDIT_EXECUTION',
            'CAP_ACTION_OR_REVIEW',
        ]),
    AUDITOR:
        new Set([
            'AUDIT_EXECUTION',
            'CAP_ACTION_OR_REVIEW',
        ]),
    TECHNICAL_EXPERT:
        new Set([
            'AUDIT_EXECUTION',
        ]),
    TECHNICAL_REVIEWER:
        new Set([
            'TECHNICAL_REVIEW',
        ]),
    DECISION_MAKER:
        new Set([
            'CERTIFICATION_DECISION',
            'CERTIFICATE_ISSUE',
        ]),
    SALES:
        new Set([
            'APPLICATION_REVIEW',
        ]),
};

function startOfToday() {
    const result =
        new Date();

    result.setHours(
        0,
        0,
        0,
        0,
    );

    return result;
}

function addDays(
    value: Date,
    days: number,
) {
    return new Date(
        value.getTime() +
        days * 24 * 60 * 60 * 1000,
    );
}

export function resolveWorkspacePersonas(
    roles: string[],
) {
    const normalized =
        new Set(
            normalizeRoles(
                roles,
            ),
        );
    const personas =
        PERSONA_ORDER.filter(
            (role) =>
                normalized.has(role),
        );

    return personas.length
        ? personas
        : ['STAFF'];
}

export function dedupeCalendarItems(
    items: PersonalCalendarItem[],
) {
    const deduped =
        new Map<string, PersonalCalendarItem>();

    for (const item of items) {
        const existing =
            deduped.get(
                item.id,
            );

        if (!existing) {
            deduped.set(
                item.id,
                item,
            );
            continue;
        }

        const roles =
            new Set(
                [
                    existing.role_in_event,
                    item.role_in_event,
                ]
                    .flatMap((value) =>
                        value?.split(',') ??
                        [],
                    )
                    .map((value) =>
                        value.trim(),
                    )
                    .filter(Boolean),
            );

        existing.role_in_event =
            Array.from(roles)
                .sort()
                .join(', ') ||
            null;
    }

    return Array.from(
        deduped.values(),
    ).sort((left, right) =>
        left.start.getTime() -
        right.start.getTime(),
    );
}

@Injectable()
export class PersonalWorkspaceService {
    constructor(
        private readonly prisma:
            PrismaService,
        private readonly workItems:
            WorkItemsService,
    ) { }

    private calendarType(
        workType: string,
    ): PersonalCalendarItem['type'] {
        if (workType === 'TECHNICAL_REVIEW') {
            return 'REVIEW_DUE';
        }

        if (workType === 'CERTIFICATION_DECISION') {
            return 'DECISION_DUE';
        }

        if (workType === 'CERTIFICATE_ISSUE') {
            return 'CERTIFICATE_ACTION_DUE';
        }

        return 'WORK_DUE';
    }

    private priorityWorkItems(
        items: SafeWorkItem[],
    ) {
        const priorityWeight:
            Record<string, number> = {
            URGENT:
                0,
            HIGH:
                1,
            NORMAL:
                2,
            LOW:
                3,
        };

        return [...items]
            .sort((left, right) =>
                Number(right.is_overdue) -
                Number(left.is_overdue) ||
                (priorityWeight[left.priority] ?? 4) -
                (priorityWeight[right.priority] ?? 4) ||
                (left.due_at?.getTime() ??
                    Number.MAX_SAFE_INTEGER) -
                (right.due_at?.getTime() ??
                    Number.MAX_SAFE_INTEGER) ||
                left.created_at.getTime() -
                right.created_at.getTime(),
            )
            .slice(
                0,
                8,
            );
    }

    private workCalendarItems(
        items: SafeWorkItem[],
    ): PersonalCalendarItem[] {
        return items
            .filter(
                (item) =>
                    Boolean(item.due_at),
            )
            .map((item) => ({
                id:
                    `work:${item.id}`,
                type:
                    this.calendarType(
                        item.work_type,
                    ),
                title:
                    item.title,
                start:
                    item.due_at!,
                end:
                    null,
                all_day:
                    true,
                project_id:
                    item.project_id,
                project_code:
                    item.project_code,
                organization_name:
                    item.organization_name,
                role_in_event:
                    item.assigned_role,
                status:
                    item.status,
                destination_path:
                    item.destination_path,
                context:
                    item.context,
            }));
    }

    private auditCalendarItems(
        sources: AuditCalendarSource[],
    ): PersonalCalendarItem[] {
        return sources
            .filter(
                (item) =>
                    Boolean(item.start),
            )
            .map((item) => {
                const dossierKey =
                    dossierKeyForAuditCycle(
                        item.eventType,
                    );

                return {
                    id:
                        `audit:${item.eventId}`,
                    type:
                        'AUDIT' as const,
                    title:
                        `Đánh giá ${item.eventType.replaceAll('_', ' ')} · ${item.organizationName}`,
                    start:
                        item.start!,
                    end:
                        item.end,
                    all_day:
                        true,
                    project_id:
                        item.projectId,
                    project_code:
                        item.projectCode,
                    organization_name:
                        item.organizationName,
                    role_in_event:
                        item.teamRole,
                    status:
                        item.status,
                    destination_path:
                        `/projects/${item.projectId}?workspace=audit-execution&audit_event_id=${item.eventId}${item.planId
                            ? `&audit_plan_id=${item.planId}`
                            : ''}`,
                    context: {
                        dossier_key:
                            dossierKey,
                        audit_event_id:
                            item.eventId,
                        audit_plan_id:
                            item.planId,
                    },
                };
            });
    }

    private async assignedAudits(
        actor: WorkspaceActor,
        personas: string[],
    ) {
        const today =
            startOfToday();
        const lowerBound =
            addDays(
                today,
                -30,
            );
        const upperBound =
            addDays(
                today,
                180,
            );
        const canHaveAuditAssignment =
            personas.some((persona) =>
                [
                    'LEAD_AUDITOR',
                    'AUDITOR',
                    'TECHNICAL_EXPERT',
                ].includes(persona),
            );
        const isCoordinator =
            personas.includes(
                'COORDINATOR',
            );
        const isAdmin =
            personas.includes(
                'ADMIN',
            );

        const [
            memberships,
            coordinatedAppointments,
            adminEvents,
        ] = await Promise.all([
            canHaveAuditAssignment
                ? this.prisma.audit_team_members.findMany({
                    where: {
                        experts: {
                            is: {
                                user_id:
                                    actor.userId,
                            },
                        },
                        assignment_status: {
                            not:
                                'cancelled',
                        },
                        planned_start_date: {
                            gte:
                                lowerBound,
                            lte:
                                upperBound,
                        },
                    },
                    select: {
                        team_role:
                            true,
                        audit_team_appointments: {
                            select: {
                                audit_plans: {
                                    select: {
                                        id:
                                            true,
                                        project_id:
                                            true,
                                        planned_start_date:
                                            true,
                                        planned_end_date:
                                            true,
                                        status:
                                            true,
                                        audit_event: {
                                            select: {
                                                id:
                                                    true,
                                                event_type:
                                                    true,
                                                status:
                                                    true,
                                                planned_start_date:
                                                    true,
                                                planned_end_date:
                                                    true,
                                            },
                                        },
                                        certification_projects: {
                                            select: {
                                                project_code:
                                                    true,
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
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                })
                : Promise.resolve([]),
            isCoordinator
                ? this.prisma.audit_team_appointments.findMany({
                    where: {
                        prepared_by:
                            actor.userId,
                        status: {
                            not:
                                'cancelled',
                        },
                        audit_plans: {
                            planned_start_date: {
                                gte:
                                    lowerBound,
                                lte:
                                    upperBound,
                            },
                        },
                    },
                    select: {
                        audit_plans: {
                            select: {
                                id:
                                    true,
                                project_id:
                                    true,
                                planned_start_date:
                                    true,
                                planned_end_date:
                                    true,
                                status:
                                    true,
                                audit_event: {
                                    select: {
                                        id:
                                            true,
                                        event_type:
                                            true,
                                        status:
                                            true,
                                        planned_start_date:
                                            true,
                                        planned_end_date:
                                            true,
                                    },
                                },
                                certification_projects: {
                                    select: {
                                        project_code:
                                            true,
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
                                    },
                                },
                            },
                        },
                    },
                })
                : Promise.resolve([]),
            isAdmin
                ? this.prisma.audit_program_events.findMany({
                    where: {
                        planned_start_date: {
                            gte:
                                today,
                            lte:
                                upperBound,
                        },
                        status: {
                            notIn: [
                                'completed',
                                'cancelled',
                            ],
                        },
                    },
                    select: {
                        id:
                            true,
                        event_type:
                            true,
                        status:
                            true,
                        planned_start_date:
                            true,
                        planned_end_date:
                            true,
                        audit_programs: {
                            select: {
                                project_id:
                                    true,
                                organization_name:
                                    true,
                                certification_projects: {
                                    select: {
                                        project_code:
                                            true,
                                    },
                                },
                            },
                        },
                        audit_plans: {
                            select: {
                                id:
                                    true,
                            },
                            orderBy: {
                                created_at:
                                    'desc',
                            },
                            take:
                                1,
                        },
                    },
                    orderBy: {
                        planned_start_date:
                            'asc',
                    },
                    take:
                        100,
                })
                : Promise.resolve([]),
        ]);

        const sources:
            AuditCalendarSource[] = [];
        const pushPlan = (
            plan: {
                id: string;
                project_id: string;
                planned_start_date: Date | null;
                planned_end_date: Date | null;
                status: string | null;
                audit_event: {
                    id: string;
                    event_type: string;
                    status: string;
                    planned_start_date: Date | null;
                    planned_end_date: Date | null;
                } | null;
                certification_projects: {
                    project_code: string;
                    certification_applications: {
                        customers: {
                            company_name: string;
                        };
                    };
                };
            },
            teamRole: string,
        ) => {
            if (!plan.audit_event) {
                return;
            }

            sources.push({
                eventId:
                    plan.audit_event.id,
                eventType:
                    plan.audit_event.event_type,
                status:
                    plan.audit_event.status ??
                    plan.status ??
                    'planned',
                start:
                    plan.audit_event.planned_start_date ??
                    plan.planned_start_date,
                end:
                    plan.audit_event.planned_end_date ??
                    plan.planned_end_date,
                projectId:
                    plan.project_id,
                projectCode:
                    plan.certification_projects.project_code,
                organizationName:
                    plan.certification_projects
                        .certification_applications
                        .customers
                        .company_name,
                planId:
                    plan.id,
                teamRole,
            });
        };

        for (const membership of memberships) {
            pushPlan(
                membership
                    .audit_team_appointments
                    .audit_plans,
                membership.team_role,
            );
        }

        for (const appointment of coordinatedAppointments) {
            pushPlan(
                appointment.audit_plans,
                'COORDINATOR',
            );
        }

        for (const event of adminEvents) {
            sources.push({
                eventId:
                    event.id,
                eventType:
                    event.event_type,
                status:
                    event.status,
                start:
                    event.planned_start_date,
                end:
                    event.planned_end_date,
                projectId:
                    event.audit_programs.project_id,
                projectCode:
                    event.audit_programs
                        .certification_projects
                        .project_code,
                organizationName:
                    event.audit_programs.organization_name,
                planId:
                    event.audit_plans[0]?.id ??
                    null,
                teamRole:
                    'ADMIN_OVERVIEW',
            });
        }

        return sources;
    }

    private roleKpis(
        personas: string[],
        work: SafeWorkItem[],
        audits: AuditCalendarSource[],
        completed: SafeWorkItem[],
        expiringCertificates: number,
    ) {
        const today =
            startOfToday();
        const dueSoon =
            addDays(
                today,
                7,
            );
        const countType = (
            type: string,
            items = work,
        ) =>
            items.filter(
                (item) =>
                    item.work_type ===
                    type,
            ).length;
        const auditCount =
            new Set(
                audits
                    .filter((audit) =>
                        audit.start &&
                        audit.start >= today,
                    )
                    .map((audit) =>
                        audit.eventId,
                    ),
            ).size;
        const overdueType = (
            type: string,
        ) =>
            work.filter(
                (item) =>
                    item.work_type === type &&
                    item.is_overdue,
            ).length;
        const dueSoonType = (
            type: string,
        ) =>
            work.filter(
                (item) =>
                    item.work_type === type &&
                    item.due_at &&
                    item.due_at >= today &&
                    item.due_at <= dueSoon,
            ).length;
        const kpis =
            new Map<string, {
                key: string;
                label: string;
                value: number;
                tone: string;
                destination_path: string;
                persona: string;
            }>();
        let activePersona =
            personas[0] ??
            'STAFF';
        const add = (
            key: string,
            label: string,
            value: number,
            tone: string,
            destinationPath: string,
        ) => {
            if (!kpis.has(key)) {
                kpis.set(key, {
                    key,
                    label,
                    value,
                    tone,
                    destination_path:
                        destinationPath,
                    persona:
                        activePersona,
                });
            }
        };

        for (const persona of personas) {
            activePersona =
                persona;

            if (persona === 'ADMIN') {
                add('open_work', 'Công việc đang mở', work.length, 'blue', '/my-work');
                add('overdue_work', 'Công việc quá hạn', work.filter((item) => item.is_overdue).length, 'red', '/my-work?due=overdue');
                add('upcoming_audits', 'Đánh giá sắp tới', auditCount, 'green', '/my-calendar');
                add('technical_review_queue', 'Hàng đợi thẩm xét', countType('TECHNICAL_REVIEW'), 'cyan', '/my-work?work_type=TECHNICAL_REVIEW');
                add('decision_queue', 'Hàng đợi quyết định', countType('CERTIFICATION_DECISION'), 'purple', '/my-work?work_type=CERTIFICATION_DECISION');
                add('certificates_expiring', 'Chứng chỉ sắp hết hạn', expiringCertificates, 'orange', '/certificates?filter=expiring');
                continue;
            }

            if (persona === 'COORDINATOR') {
                add('my_upcoming_audits', 'Đánh giá tôi điều phối', auditCount, 'green', '/my-calendar');
                add('f04_pending', 'Chỉ định đoàn cần xử lý', countType('F04_TEAM_APPOINTMENT'), 'blue', '/my-work?work_type=F04_TEAM_APPOINTMENT');
                add('coordination_pending', 'Điều phối đang mở', work.filter((item) => WORK_TYPES_BY_PERSONA.COORDINATOR.has(item.work_type)).length, 'cyan', '/my-work');
                add('coordination_overdue', 'Điều phối quá hạn', work.filter((item) => item.is_overdue && WORK_TYPES_BY_PERSONA.COORDINATOR.has(item.work_type)).length, 'red', '/my-work?due=overdue');
                continue;
            }

            if (persona === 'LEAD_AUDITOR') {
                add('assigned_audits', 'Đánh giá được phân công', auditCount, 'green', '/my-calendar');
                add('audit_plans_pending', 'Kế hoạch cần chuẩn bị', countType('AUDIT_PLAN'), 'blue', '/my-work?work_type=AUDIT_PLAN');
                add('audit_execution', 'Công việc đánh giá', countType('AUDIT_EXECUTION'), 'cyan', '/my-work?work_type=AUDIT_EXECUTION');
                add('cap_actions', 'NC/CAP cần xử lý', countType('CAP_ACTION_OR_REVIEW'), 'orange', '/my-work?work_type=CAP_ACTION_OR_REVIEW');
                add('audit_overdue', 'Công việc đánh giá quá hạn', work.filter((item) => item.is_overdue && WORK_TYPES_BY_PERSONA.LEAD_AUDITOR.has(item.work_type)).length, 'red', '/my-work?due=overdue');
                continue;
            }

            if (
                persona === 'AUDITOR' ||
                persona === 'TECHNICAL_EXPERT'
            ) {
                add('assigned_audits', 'Đánh giá được phân công', auditCount, 'green', '/my-calendar');
                add('audit_execution', 'Công việc đánh giá', countType('AUDIT_EXECUTION'), 'blue', '/my-work?work_type=AUDIT_EXECUTION');
                add('due_work', 'Công việc đến hạn 7 ngày', work.filter((item) => item.due_at && item.due_at >= today && item.due_at <= dueSoon).length, 'orange', '/my-work?due=due_soon');
                add('overdue_work', 'Công việc quá hạn', work.filter((item) => item.is_overdue).length, 'red', '/my-work?due=overdue');
                continue;
            }

            if (persona === 'TECHNICAL_REVIEWER') {
                add('open_reviews', 'Thẩm xét đang mở', countType('TECHNICAL_REVIEW'), 'blue', '/my-work?work_type=TECHNICAL_REVIEW');
                add('overdue_reviews', 'Thẩm xét quá hạn', overdueType('TECHNICAL_REVIEW'), 'red', '/my-work?work_type=TECHNICAL_REVIEW&due=overdue');
                add('reviews_due_soon', 'Thẩm xét đến hạn 7 ngày', dueSoonType('TECHNICAL_REVIEW'), 'orange', '/my-work?work_type=TECHNICAL_REVIEW&due=due_soon');
                add('reviews_completed_recently', 'Thẩm xét vừa hoàn thành', countType('TECHNICAL_REVIEW', completed), 'green', '/my-work?status=DONE&work_type=TECHNICAL_REVIEW');
                continue;
            }

            if (persona === 'DECISION_MAKER') {
                add('pending_decisions', 'Quyết định chờ xử lý', countType('CERTIFICATION_DECISION'), 'purple', '/my-work?work_type=CERTIFICATION_DECISION');
                add('overdue_decisions', 'Quyết định quá hạn', overdueType('CERTIFICATION_DECISION'), 'red', '/my-work?work_type=CERTIFICATION_DECISION&due=overdue');
                add('certificates_awaiting_issue', 'Chứng chỉ chờ phát hành', countType('CERTIFICATE_ISSUE'), 'blue', '/my-work?work_type=CERTIFICATE_ISSUE');
                add('certificate_lifecycle', 'Hành động vòng đời chứng chỉ', countType('CERTIFICATE_ISSUE') + expiringCertificates, 'orange', '/certificates');
                continue;
            }

            if (persona === 'SALES') {
                add('commercial_work', 'Công việc thương mại', work.filter((item) => WORK_TYPES_BY_PERSONA.SALES.has(item.work_type)).length, 'blue', '/my-work');
                add('commercial_overdue', 'Công việc quá hạn', work.filter((item) => item.is_overdue && WORK_TYPES_BY_PERSONA.SALES.has(item.work_type)).length, 'red', '/my-work?due=overdue');
            }
        }

        if (kpis.size === 0) {
            activePersona =
                personas[0] ??
                'STAFF';
            add('open_work', 'Công việc đang mở', work.length, 'blue', '/my-work');
            add('overdue_work', 'Công việc quá hạn', work.filter((item) => item.is_overdue).length, 'red', '/my-work?due=overdue');
        }

        return Array.from(
            kpis.values(),
        );
    }

    async getWorkspace(
        actor: WorkspaceActor,
    ) {
        const roles =
            normalizeRoles(
                actor.roles,
            );
        const personas =
            resolveWorkspacePersonas(
                roles,
            );
        const needsCertificateProjection =
            personas.some((persona) =>
                [
                    'ADMIN',
                    'DECISION_MAKER',
                ].includes(persona),
            );
        const certificateWarningDate =
            addDays(
                startOfToday(),
                90,
            );

        const [
            user,
            activeWorkResponse,
            completedWorkResponse,
            auditSources,
            expiringCertificates,
        ] = await Promise.all([
            this.prisma.users.findUnique({
                where: {
                    id:
                        actor.userId,
                },
                select: {
                    id:
                        true,
                    username:
                        true,
                    full_name:
                        true,
                    email:
                        true,
                },
            }),
            this.workItems.getMyWork(
                {
                    userId:
                        actor.userId,
                    roles,
                },
                {
                    limit:
                        '200',
                },
            ),
            this.workItems.getMyWork(
                {
                    userId:
                        actor.userId,
                    roles,
                },
                {
                    status:
                        'DONE',
                    limit:
                        '8',
                },
            ),
            this.assignedAudits(
                actor,
                personas,
            ),
            needsCertificateProjection
                ? this.prisma.certificates.count({
                    where: {
                        status: {
                            in: [
                                'active',
                                'suspended',
                            ],
                        },
                        expire_date: {
                            gte:
                                startOfToday(),
                            lte:
                                certificateWarningDate,
                        },
                    },
                })
                : Promise.resolve(0),
        ]);
        const activeWork =
            activeWorkResponse.items as SafeWorkItem[];
        const completedWork =
            completedWorkResponse.items as SafeWorkItem[];
        const calendarItems =
            dedupeCalendarItems([
                ...this.auditCalendarItems(
                    auditSources,
                ),
                ...this.workCalendarItems(
                    activeWork,
                ),
            ]);
        const today =
            startOfToday();
        const dueSoon =
            addDays(
                today,
                7,
            );

        return {
            generated_at:
                new Date(),
            user_context: {
                current_user:
                    user ?? {
                        id:
                            actor.userId,
                        username:
                            null,
                        full_name:
                            null,
                        email:
                            null,
                    },
                active_roles:
                    roles,
                primary_persona:
                    personas[0],
                personas,
                allowed_sections: [
                    'WORK_SUMMARY',
                    'PRIORITY_WORK',
                    'MY_CALENDAR',
                    'ROLE_KPIS',
                    'EXCEPTIONS',
                    'RECENT_RECORDS',
                ],
            },
            work_summary: {
                open:
                    activeWork.filter((item) => item.status === 'OPEN').length,
                in_progress:
                    activeWork.filter((item) => item.status === 'IN_PROGRESS').length,
                overdue:
                    activeWork.filter((item) => item.is_overdue).length,
                due_soon:
                    activeWork.filter((item) =>
                        item.due_at &&
                        item.due_at >= today &&
                        item.due_at <= dueSoon,
                    ).length,
                high_priority:
                    activeWork.filter((item) =>
                        [
                            'HIGH',
                            'URGENT',
                        ].includes(item.priority),
                    ).length,
            },
            priority_work_items:
                this.priorityWorkItems(
                    activeWork,
                ),
            calendar_items:
                calendarItems,
            role_kpis:
                this.roleKpis(
                    personas,
                    activeWork,
                    auditSources,
                    completedWork,
                    expiringCertificates,
                ),
            exceptions:
                activeWork
                    .filter((item) =>
                        item.is_overdue,
                    )
                    .slice(0, 8)
                    .map((item) => ({
                        id:
                            `overdue:${item.id}`,
                        type:
                            'OVERDUE_WORK',
                        severity:
                            item.priority === 'URGENT'
                                ? 'critical'
                                : 'warning',
                        title:
                            item.title,
                        message:
                            item.organization_name ||
                            item.project_code ||
                            'Công việc đã quá hạn',
                        due_at:
                            item.due_at,
                        destination_path:
                            item.destination_path,
                        context:
                            item.context,
                    })),
            recent_records:
                completedWork.map((item) => ({
                    id:
                        `work:${item.id}`,
                    record_type:
                        item.work_type,
                    title:
                        item.title,
                    project_code:
                        item.project_code,
                    organization_name:
                        item.organization_name,
                    status:
                        item.status,
                    occurred_at:
                        item.completed_at ??
                        item.updated_at,
                    destination_path:
                        item.destination_path,
                    context:
                        item.context,
                })),
            meta: {
                due_soon_days:
                    7,
                certificate_warning_days:
                    needsCertificateProjection
                        ? 90
                        : null,
                data_sources: [
                    'work_items',
                    'audit_team_members',
                    'audit_program_events',
                    ...(needsCertificateProjection
                        ? [
                            'certificates',
                        ]
                        : []),
                ],
                sales_assignment_limitation:
                    personas.includes('SALES')
                        ? 'Chưa có quan hệ sales-owner riêng; projection chỉ dùng work item và resource scope hiện có.'
                        : null,
            },
        };
    }
}
