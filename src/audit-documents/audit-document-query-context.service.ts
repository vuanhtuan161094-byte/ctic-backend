import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditDocumentQueryContextService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async loadPlan(planId: string) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: {
                id: planId,
            },
            include: {
                certification_projects: {
                    include: {
                        contracts: true,
                        certification_agreements: true,
                        audit_plans: {
                            where: {
                                audit_type: 'project_team',
                            },
                            orderBy: {
                                created_at: 'desc',
                            },
                            include: {
                                audit_team_appointment: {
                                    include: {
                                        prepared_by_user: true,
                                        approved_by_user: true,
                                        members: {
                                            include: {
                                                experts: true,
                                            },
                                            orderBy: {
                                                created_at: 'asc',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        certification_applications: {
                            include: {
                                sites: {
                                    orderBy: {
                                        site_no: 'asc',
                                    },
                                },
                                customers: {
                                    include: {
                                        contacts: true,
                                    },
                                },
                            },
                        },
                    },
                },
                audit_event: {
                    include: {
                        audit_programs: true,
                    },
                },
                audit_team_appointment: {
                    include: {
                        prepared_by_user: true,
                        approved_by_user: true,
                        members: {
                            include: {
                                experts: true,
                                program_mandays: true,
                            },
                            orderBy: {
                                created_at: 'asc',
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

        const platformBranding = 'organization_profiles' in this.prisma
            ? await this.prisma.organization_profiles.findUnique({ where: { profile_key: 'PRIMARY' } })
            : null;

        return Object.assign(plan, { platform_branding: platformBranding }) as any;
    }

    async loadProgram(programId: string | null | undefined) {
        if (!programId) {
            return null;
        }

        return this.prisma.audit_programs.findUnique({
            where: {
                id: programId,
            },
            include: {
                preparer: true,
                events: {
                    orderBy: {
                        sequence_no: 'asc',
                    },
                    include: {
                        audit_plans: {
                            orderBy: {
                                version_no: 'desc',
                            },
                            include: {
                                reports: {
                                    orderBy: {
                                        version_no: 'desc',
                                    },
                                    include: {
                                        audit_findings: true,
                                    },
                                },
                                audit_team_appointment: {
                                    include: {
                                        members: {
                                            include: {
                                                experts: true,
                                            },
                                            orderBy: {
                                                created_at: 'asc',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }) as Promise<any>;
    }

}
