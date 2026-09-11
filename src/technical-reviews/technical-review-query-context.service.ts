import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TechnicalReviewQueryContextService {
    constructor(private readonly prisma: PrismaService) {}

    async getReviewOrThrow(
        id: string,
    ) {
        const review =
            await this.prisma.technical_reviews.findUnique(
                {
                    where: {
                        id,
                    },

                    include: {
                        reports: {
                            select: {
                                id: true,
                                report_code: true,
                                audit_plan_id: true,
                                status: true,
                                audit_plans: {
                                    select: {
                                        project_id: true,
                                        audit_event_id: true,
                                    },
                                },
                            },
                        },

                        reviewer: {
                            select: {
                                id: true,
                                username: true,
                                full_name: true,
                                email: true,
                            },
                        },
                        assignments: {
                            orderBy: { assigned_at: 'desc' },
                            include: {
                                reviewer: { select: { id: true, username: true, full_name: true, email: true } },
                                actor: { select: { id: true, username: true, full_name: true } },
                            },
                        },
                    },
                },
            );

        if (!review) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ thẩm xét',
            );
        }

        return review;
    }


    async loadPlanReviewContext(
        planId: string,
    ) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id: planId,
                },
                include: {
                    certification_projects: {
                        include: {
                            certification_applications: {
                                include: {
                                    customers: true,
                                },
                            },
                        },
                    },
                    audit_team_appointment: {
                        include: {
                            members: {
                                include: {
                                    experts: {
                                        select: {
                                            id: true,
                                            user_id: true,
                                            full_name: true,
                                            employee_code: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    reports: {
                        orderBy: [
                            {
                                version_no: 'desc',
                            },
                            {
                                created_at: 'desc',
                            },
                        ],
                        include: {
                            audit_findings: {
                                select: {
                                    id: true,
                                    finding_code: true,
                                    finding_type: true,
                                    status: true,
                                },
                            },
                            technical_reviews: {
                                orderBy: {
                                    created_at: 'desc',
                                },
                                include: {
                                    reviewer: {
                                        select: {
                                            id: true,
                                            username: true,
                                            full_name: true,
                                            email: true,
                                        },
                                    },
                                    assignments: {
                                        orderBy: { assigned_at: 'desc' },
                                        include: {
                                            reviewer: { select: { id: true, username: true, full_name: true, email: true } },
                                            actor: { select: { id: true, username: true, full_name: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        const report =
            plan.reports[0] ??
            null;

        return {
            plan,
            report,
        };
    }
}
