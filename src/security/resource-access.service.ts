import {
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

import type {
    Prisma,
} from '@prisma/client';

import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    normalizeRoles,
} from './security-request';

export interface ResourceActor {
    userId?: string | null;
    roles?: string[];
}

export interface ResourceEntityRef {
    entity_type: string;
    entity_id: string;
}

type CustomerResourceDatabaseClient =
    Pick<
        Prisma.TransactionClient,
        | 'customer_user_access'
        | 'audit_plans'
        | 'audit_findings'
        | 'corrective_actions'
    >;

const ORGANIZATION_WIDE_ROLES =
    new Set([
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'DECISION_MAKER',
        'APPROVER',
        'CERTIFICATION_MANAGER',
    ]);

@Injectable()
export class ResourceAccessService {
    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private normalizeEntityType(
        value: string,
    ) {
        return value
            .trim()
            .toLowerCase()
            .replace(/-/g, '_');
    }

    private entityKey(
        entityType: string,
        entityId: string,
    ) {
        return `${this.normalizeEntityType(
            entityType,
        )}:${entityId}`;
    }

    hasOrganizationWideAccess(
        roles?: string[],
    ) {
        return normalizeRoles(
            roles,
        ).some((role) =>
            ORGANIZATION_WIDE_ROLES.has(
                role,
            ),
        );
    }

    private activeCustomerAccessWhere(
        userId: string,
        customerId?: string,
    ): Prisma.customer_user_accessWhereInput {
        return {
            user_id:
                userId,

            ...(customerId
                ? {
                    customer_id:
                        customerId,
                }
                : {}),

            status:
                'active',

            customer: {
                is: {
                    status:
                        'active',
                },
            },
        };
    }

    private customerAccessDenied(): never {
        throw new ForbiddenException(
            'Bạn không có quyền truy cập dữ liệu của khách hàng này',
        );
    }

    async getAccessibleCustomerIds(
        actor: ResourceActor,
        database:
            CustomerResourceDatabaseClient =
            this.prisma,
    ): Promise<Set<string>> {
        const userId =
            actor.userId?.trim();

        const isCustomer =
            normalizeRoles(
                actor.roles,
            ).includes(
                'CUSTOMER',
            );

        if (
            !userId ||
            !isCustomer
        ) {
            return new Set();
        }

        const mappings =
            await database.customer_user_access.findMany({
                where:
                    this.activeCustomerAccessWhere(
                        userId,
                    ),

                select: {
                    customer_id:
                        true,
                },
            });

        return new Set(
            mappings.map(
                (mapping) =>
                    mapping.customer_id,
            ),
        );
    }

    async assertCustomerAccess(
        customerId: string,
        actor: ResourceActor,
        database:
            CustomerResourceDatabaseClient =
            this.prisma,
    ) {
        const userId =
            actor.userId?.trim();

        const isCustomer =
            normalizeRoles(
                actor.roles,
            ).includes(
                'CUSTOMER',
            );

        if (
            !userId ||
            !isCustomer
        ) {
            this.customerAccessDenied();
        }

        const mapping =
            await database.customer_user_access.findFirst({
                where:
                    this.activeCustomerAccessWhere(
                        userId,
                        customerId,
                    ),

                select: {
                    id:
                        true,
                },
            });

        if (!mapping) {
            this.customerAccessDenied();
        }

        return customerId;
    }

    async resolveCustomerIdForEntity(
        ref: ResourceEntityRef,
        database:
            CustomerResourceDatabaseClient =
            this.prisma,
    ): Promise<string | null> {
        const entityType =
            this.normalizeEntityType(
                ref.entity_type,
            );

        if (
            [
                'audit_plan',
                'audit_plans',
            ].includes(
                entityType,
            )
        ) {
            const plan =
                await database.audit_plans.findUnique({
                    where: {
                        id:
                            ref.entity_id,
                    },

                    select: {
                        certification_projects: {
                            select: {
                                certification_applications: {
                                    select: {
                                        customer_id:
                                            true,
                                    },
                                },
                            },
                        },
                    },
                });

            return plan
                ?.certification_projects
                .certification_applications
                .customer_id ??
                null;
        }

        if (
            [
                'audit_finding',
                'audit_findings',
            ].includes(
                entityType,
            )
        ) {
            const finding =
                await database.audit_findings.findUnique({
                    where: {
                        id:
                            ref.entity_id,
                    },

                    select: {
                        reports: {
                            select: {
                                audit_plans: {
                                    select: {
                                        certification_projects: {
                                            select: {
                                                certification_applications: {
                                                    select: {
                                                        customer_id:
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
                });

            return finding
                ?.reports
                .audit_plans
                .certification_projects
                .certification_applications
                .customer_id ??
                null;
        }

        if (
            [
                'corrective_action',
                'corrective_actions',
            ].includes(
                entityType,
            )
        ) {
            const action =
                await database.corrective_actions.findUnique({
                    where: {
                        id:
                            ref.entity_id,
                    },

                    select: {
                        audit_findings: {
                            select: {
                                reports: {
                                    select: {
                                        audit_plans: {
                                            select: {
                                                certification_projects: {
                                                    select: {
                                                        certification_applications: {
                                                            select: {
                                                                customer_id:
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
                });

            return action
                ?.audit_findings
                .reports
                .audit_plans
                .certification_projects
                .certification_applications
                .customer_id ??
                null;
        }

        return null;
    }

    async assertCustomerEntityAccess(
        ref: ResourceEntityRef,
        actor: ResourceActor,
        database:
            CustomerResourceDatabaseClient =
            this.prisma,
    ) {
        const customerId =
            await this.resolveCustomerIdForEntity(
                ref,
                database,
            );

        if (!customerId) {
            this.customerAccessDenied();
        }

        await this.assertCustomerAccess(
            customerId,
            actor,
            database,
        );

        return customerId;
    }

    async getAccessibleProjectIds(
        actor: ResourceActor,
    ): Promise<Set<string> | null> {
        if (
            this.hasOrganizationWideAccess(
                actor.roles,
            )
        ) {
            return null;
        }

        const userId =
            actor.userId?.trim();

        if (!userId) {
            return new Set();
        }

        const roles =
            new Set(
                normalizeRoles(
                    actor.roles,
                ),
            );

        const projectIds =
            new Set<string>();

        if (
            roles.has('LEAD_AUDITOR') ||
            roles.has('AUDITOR')
        ) {
            const expert =
                await this.prisma.experts.findUnique({
                    where: {
                        user_id: userId,
                    },
                    select: {
                        id: true,
                    },
                });

            if (expert) {
                const memberships =
                    await this.prisma.audit_team_members.findMany({
                        where: {
                            expert_id:
                                expert.id,
                            assignment_status: {
                                not: 'cancelled',
                            },
                        },
                        select: {
                            audit_team_appointments: {
                                select: {
                                    audit_plans: {
                                        select: {
                                            project_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    });

                for (const membership of memberships) {
                    projectIds.add(
                        membership
                            .audit_team_appointments
                            .audit_plans
                            .project_id,
                    );
                }
            }
        }

        if (
            roles.has(
                'TECHNICAL_REVIEWER',
            )
        ) {
            const [
                reviews,
                readyReports,
            ] = await Promise.all([
                this.prisma.technical_reviews.findMany({
                    where: {
                        reviewer_id:
                            userId,
                    },
                    select: {
                        reports: {
                            select: {
                                audit_plans: {
                                    select: {
                                        project_id:
                                            true,
                                    },
                                },
                            },
                        },
                    },
                }),
                this.prisma.reports.findMany({
                    where: {
                        status:
                            'ready_for_technical_review',
                        technical_reviews: {
                            none: {},
                        },
                    },
                    select: {
                        audit_plans: {
                            select: {
                                project_id:
                                    true,
                            },
                        },
                    },
                }),
            ]);

            for (const review of reviews) {
                projectIds.add(
                    review.reports.audit_plans.project_id,
                );
            }

            // Hồ sơ chưa được giao chính thức nhưng đã sẵn sàng thẩm xét
            // phải hiển thị cho nhóm TECHNICAL_REVIEWER để họ có thể mở
            // workspace và thực hiện ensureForPlan(). Sau khi một reviewer
            // nhận hồ sơ, technical_reviews sẽ được tạo và hồ sơ không còn
            // nằm trong pool chưa giao này. Kiểm tra độc lập của reviewer
            // vẫn được TechnicalReviewsService thực hiện khi nhận hồ sơ.
            for (const report of readyReports) {
                projectIds.add(
                    report.audit_plans.project_id,
                );
            }
        }

        return projectIds;
    }

    async assertProjectAccess(
        projectId: string,
        actor: ResourceActor,
    ) {
        const accessible =
            await this.getAccessibleProjectIds(
                actor,
            );

        if (
            accessible === null ||
            accessible.has(projectId)
        ) {
            return;
        }

        throw new ForbiddenException(
            'Bạn không được phân công vào hồ sơ chứng nhận này',
        );
    }

    async filterProjectIds(
        projectIds: string[],
        actor: ResourceActor,
    ) {
        const accessible =
            await this.getAccessibleProjectIds(
                actor,
            );

        if (accessible === null) {
            return projectIds;
        }

        return projectIds.filter(
            (projectId) =>
                accessible.has(
                    projectId,
                ),
        );
    }

    private async resolveProjectMap(
        refs: ResourceEntityRef[],
    ) {
        const result =
            new Map<
                string,
                Set<string>
            >();

        const grouped =
            new Map<string, Set<string>>();

        for (const ref of refs) {
            const type =
                this.normalizeEntityType(
                    ref.entity_type,
                );

            if (!grouped.has(type)) {
                grouped.set(
                    type,
                    new Set(),
                );
            }

            grouped
                .get(type)!
                .add(ref.entity_id);
        }

        const ids =
            (...types: string[]) =>
                Array.from(
                    new Set(
                        types.flatMap(
                            (type) =>
                                Array.from(
                                    grouped.get(type) ??
                                    [],
                                ),
                        ),
                    ),
                );

        const set = (
            types: string[],
            entityId: string,
            projectId: string,
        ) => {
            for (const type of types) {
                const key =
                    this.entityKey(
                        type,
                        entityId,
                    );

                const projectIdsForEntity =
                    result.get(key) ??
                    new Set<string>();

                projectIdsForEntity.add(
                    projectId,
                );

                result.set(
                    key,
                    projectIdsForEntity,
                );
            }
        };

        const projectIds =
            ids(
                'certification_project',
                'certification_projects',
                'project',
            );
        const applicationIds =
            ids(
                'certification_application',
                'certification_applications',
                'application',
            );
        const applicationReviewIds =
            ids(
                'application_review',
                'application_reviews',
            );
        const contractIds =
            ids(
                'contract',
                'contracts',
            );
        const agreementIds =
            ids(
                'certification_agreement',
                'certification_agreements',
                'agreement',
            );
        const auditProgramIds =
            ids(
                'audit_program',
                'audit_programs',
            );
        const auditProgramEventIds =
            ids(
                'audit_program_event',
                'audit_program_events',
            );
        const auditPlanIds =
            ids(
                'audit_plan',
                'audit_plans',
            );
        const appointmentIds =
            ids(
                'audit_team_appointment',
                'audit_team_appointments',
            );
        const memberIds =
            ids(
                'audit_team_member',
                'audit_team_members',
            );
        const reportIds =
            ids(
                'report',
                'reports',
            );
        const findingIds =
            ids(
                'audit_finding',
                'audit_findings',
            );
        const actionIds =
            ids(
                'corrective_action',
                'corrective_actions',
            );
        const reviewIds =
            ids(
                'technical_review',
                'technical_reviews',
            );
        const decisionIds =
            ids(
                'certification_decision',
                'certification_decisions',
            );
        const notificationIds =
            ids(
                'audit_result_notification',
                'audit_result_notifications',
            );
        const certificateIds =
            ids(
                'certificate',
                'certificates',
            );

        const [
            projects,
            applicationProjects,
            applicationReviewProjects,
            contractProjects,
            agreementProjects,
            programs,
            programEvents,
            plans,
            appointments,
            members,
            reports,
            findings,
            actions,
            reviews,
            decisions,
            notifications,
            certificates,
        ] = await Promise.all([
            this.prisma.certification_projects.findMany({
                where: {
                    id: {
                        in: projectIds,
                    },
                },
                select: {
                    id: true,
                },
            }),
            this.prisma.certification_projects.findMany({
                where: {
                    application_id: {
                        in: applicationIds,
                    },
                },
                select: {
                    id: true,
                    application_id:
                        true,
                },
            }),
            this.prisma.application_reviews.findMany({
                where: {
                    id: {
                        in: applicationReviewIds,
                    },
                },
                select: {
                    id: true,
                    certification_applications: {
                        select: {
                            certification_projects: {
                                select: {
                                    id: true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.certification_projects.findMany({
                where: {
                    contract_id: {
                        in: contractIds,
                    },
                },
                select: {
                    id: true,
                    contract_id: true,
                },
            }),
            this.prisma.certification_projects.findMany({
                where: {
                    agreement_id: {
                        in: agreementIds,
                    },
                },
                select: {
                    id: true,
                    agreement_id: true,
                },
            }),
            this.prisma.audit_programs.findMany({
                where: {
                    id: {
                        in: auditProgramIds,
                    },
                },
                select: {
                    id: true,
                    project_id: true,
                },
            }),
            this.prisma.audit_program_events.findMany({
                where: {
                    id: {
                        in: auditProgramEventIds,
                    },
                },
                select: {
                    id: true,
                    audit_programs: {
                        select: {
                            project_id: true,
                        },
                    },
                },
            }),
            this.prisma.audit_plans.findMany({
                where: {
                    id: {
                        in: auditPlanIds,
                    },
                },
                select: {
                    id: true,
                    project_id: true,
                },
            }),
            this.prisma.audit_team_appointments.findMany({
                where: {
                    id: {
                        in: appointmentIds,
                    },
                },
                select: {
                    id: true,
                    audit_plans: {
                        select: {
                            project_id: true,
                        },
                    },
                },
            }),
            this.prisma.audit_team_members.findMany({
                where: {
                    id: {
                        in: memberIds,
                    },
                },
                select: {
                    id: true,
                    audit_team_appointments: {
                        select: {
                            audit_plans: {
                                select: {
                                    project_id:
                                        true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.reports.findMany({
                where: {
                    id: {
                        in: reportIds,
                    },
                },
                select: {
                    id: true,
                    audit_plans: {
                        select: {
                            project_id: true,
                        },
                    },
                },
            }),
            this.prisma.audit_findings.findMany({
                where: {
                    id: {
                        in: findingIds,
                    },
                },
                select: {
                    id: true,
                    reports: {
                        select: {
                            audit_plans: {
                                select: {
                                    project_id:
                                        true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.corrective_actions.findMany({
                where: {
                    id: {
                        in: actionIds,
                    },
                },
                select: {
                    id: true,
                    audit_findings: {
                        select: {
                            reports: {
                                select: {
                                    audit_plans: {
                                        select: {
                                            project_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.technical_reviews.findMany({
                where: {
                    id: {
                        in: reviewIds,
                    },
                },
                select: {
                    id: true,
                    reports: {
                        select: {
                            audit_plans: {
                                select: {
                                    project_id:
                                        true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.certification_decisions.findMany({
                where: {
                    id: {
                        in: decisionIds,
                    },
                },
                select: {
                    id: true,
                    technical_reviews: {
                        select: {
                            reports: {
                                select: {
                                    audit_plans: {
                                        select: {
                                            project_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.audit_result_notifications.findMany({
                where: {
                    id: {
                        in: notificationIds,
                    },
                },
                select: {
                    id: true,
                    technical_reviews: {
                        select: {
                            reports: {
                                select: {
                                    audit_plans: {
                                        select: {
                                            project_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.certificates.findMany({
                where: {
                    id: {
                        in: certificateIds,
                    },
                },
                select: {
                    id: true,
                    technical_reviews: {
                        select: {
                            reports: {
                                select: {
                                    audit_plans: {
                                        select: {
                                            project_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        for (const project of projects) {
            set(
                [
                    'certification_project',
                    'certification_projects',
                    'project',
                ],
                project.id,
                project.id,
            );
        }

        for (const project of applicationProjects) {
            set(
                [
                    'certification_application',
                    'certification_applications',
                    'application',
                ],
                project.application_id,
                project.id,
            );
        }

        for (const review of applicationReviewProjects) {
            const linkedProjects =
                review
                    .certification_applications
                    .certification_projects;

            for (const project of linkedProjects) {
                set(
                    [
                        'application_review',
                        'application_reviews',
                    ],
                    review.id,
                    project.id,
                );
            }
        }

        for (const project of contractProjects) {
            if (project.contract_id) {
                set(
                    [
                        'contract',
                        'contracts',
                    ],
                    project.contract_id,
                    project.id,
                );
            }
        }

        for (const project of agreementProjects) {
            if (project.agreement_id) {
                set(
                    [
                        'certification_agreement',
                        'certification_agreements',
                        'agreement',
                    ],
                    project.agreement_id,
                    project.id,
                );
            }
        }

        for (const program of programs) {
            set(
                [
                    'audit_program',
                    'audit_programs',
                ],
                program.id,
                program.project_id,
            );
        }

        for (const event of programEvents) {
            set(
                [
                    'audit_program_event',
                    'audit_program_events',
                ],
                event.id,
                event.audit_programs.project_id,
            );
        }

        for (const plan of plans) {
            set(
                [
                    'audit_plan',
                    'audit_plans',
                ],
                plan.id,
                plan.project_id,
            );
        }

        for (const appointment of appointments) {
            set(
                [
                    'audit_team_appointment',
                    'audit_team_appointments',
                ],
                appointment.id,
                appointment.audit_plans.project_id,
            );
        }

        for (const member of members) {
            set(
                [
                    'audit_team_member',
                    'audit_team_members',
                ],
                member.id,
                member
                    .audit_team_appointments
                    .audit_plans
                    .project_id,
            );
        }

        for (const report of reports) {
            set(
                ['report', 'reports'],
                report.id,
                report.audit_plans.project_id,
            );
        }

        for (const finding of findings) {
            set(
                [
                    'audit_finding',
                    'audit_findings',
                ],
                finding.id,
                finding.reports.audit_plans.project_id,
            );
        }

        for (const action of actions) {
            set(
                [
                    'corrective_action',
                    'corrective_actions',
                ],
                action.id,
                action
                    .audit_findings
                    .reports
                    .audit_plans
                    .project_id,
            );
        }

        for (const review of reviews) {
            set(
                [
                    'technical_review',
                    'technical_reviews',
                ],
                review.id,
                review.reports.audit_plans.project_id,
            );
        }

        for (const decision of decisions) {
            set(
                [
                    'certification_decision',
                    'certification_decisions',
                ],
                decision.id,
                decision
                    .technical_reviews
                    .reports
                    .audit_plans
                    .project_id,
            );
        }

        for (const notification of notifications) {
            set(
                [
                    'audit_result_notification',
                    'audit_result_notifications',
                ],
                notification.id,
                notification
                    .technical_reviews
                    .reports
                    .audit_plans
                    .project_id,
            );
        }

        for (const certificate of certificates) {
            set(
                [
                    'certificate',
                    'certificates',
                ],
                certificate.id,
                certificate
                    .technical_reviews
                    .reports
                    .audit_plans
                    .project_id,
            );
        }

        return result;
    }

    async assertEntityAccess(
        ref: ResourceEntityRef,
        actor: ResourceActor,
    ) {
        return this.assertDocumentEntityAccess(
            ref,
            actor,
        );
    }

    async filterEntities<
        T extends ResourceEntityRef,
    >(
        entities: T[],
        actor: ResourceActor,
    ) {
        return this.filterDocumentEntities(
            entities,
            actor,
        );
    }

    async assertDocumentEntityAccess(
        ref: ResourceEntityRef,
        actor: ResourceActor,
    ) {
        const accessible =
            await this.getAccessibleProjectIds(
                actor,
            );

        if (accessible === null) {
            return;
        }

        const projectMap =
            await this.resolveProjectMap([
                ref,
            ]);

        const projectIds =
            projectMap.get(
                this.entityKey(
                    ref.entity_type,
                    ref.entity_id,
                ),
            );

        const canAccess =
            projectIds
                ? Array.from(projectIds).some(
                    (projectId) =>
                        accessible.has(
                            projectId,
                        ),
                )
                : false;

        if (!canAccess) {
            throw new ForbiddenException(
                'Bạn không có quyền truy cập tài liệu của hồ sơ này',
            );
        }
    }

    async filterDocumentEntities<
        T extends ResourceEntityRef,
    >(
        documents: T[],
        actor: ResourceActor,
    ) {
        const accessible =
            await this.getAccessibleProjectIds(
                actor,
            );

        if (accessible === null) {
            return documents;
        }

        if (
            documents.length ===
            0
        ) {
            return documents;
        }

        const projectMap =
            await this.resolveProjectMap(
                documents,
            );

        return documents.filter(
            (document) => {
                const projectIds =
                    projectMap.get(
                        this.entityKey(
                            document.entity_type,
                            document.entity_id,
                        ),
                    );

                return Boolean(
                    projectIds &&
                    Array.from(
                        projectIds,
                    ).some(
                        (projectId) =>
                            accessible.has(
                                projectId,
                            ),
                    ),
                );
            },
        );
    }
}
