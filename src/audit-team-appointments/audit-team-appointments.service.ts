import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamCompetencyService } from './audit-team-competency.service';

import {
    AuditTeamMemberDto,
    CreateAuditTeamAppointmentDto,
} from './dto/create-audit-team-appointment.dto';

import {
    UpdateAuditTeamAppointmentDto,
} from './dto/update-audit-team-appointment.dto';

interface PlanDateRange {
    id: string;
    project_id: string;
    plan_code: string | null;

    planned_start_date:
    Date | null;

    planned_end_date:
    Date | null;
}
interface ProjectScopeMemberInput {
    team_role: string;

    scopes: Array<{
        project_scope_id:
        string | null;
    }>;
}
interface MemberDateInput {
    expert_id: string;
    team_role: string;
    planned_start_date:
    string | Date;
    planned_end_date:
    string | Date;
}

@Injectable()
export class AuditTeamAppointmentsService {
    private readonly detailInclude = {
        audit_plans: {
            include: {
                certification_projects: {
                    select: {
                        id: true,
                        project_code: true,
                        standard_name: true,
                        status: true,
                    },
                },
            },
        },

        prepared_by_user: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },

        approved_by_user: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },

        members: {
            orderBy: {
                created_at:
                    'asc',
            },

            include: {
                experts:
                    true,

                scopes: {
                    orderBy: {
                        created_at:
                            'asc',
                    },

                    include: {
                        project_scope: {
                            include: {
                                isic_nace_mapping: {
                                    include: {
                                        source_code:
                                            true,

                                        target_code:
                                            true,
                                    },
                                },

                                nace_iaf_mapping: {
                                    include: {
                                        nace_code:
                                            true,

                                        iaf_scope:
                                            true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    } as const;

    constructor(
        private readonly prisma:
            PrismaService,

        private readonly competencyService:
            AuditTeamCompetencyService,
    ) { }
    private parseDate(
        value: string | Date,
        fieldName: string,
    ) {
        if (
            typeof value ===
            'string'
        ) {
            const dateOnlyMatch =
                value.match(
                    /^(\d{4})-(\d{2})-(\d{2})/,
                );

            if (dateOnlyMatch) {
                const year =
                    Number(
                        dateOnlyMatch[1],
                    );

                const month =
                    Number(
                        dateOnlyMatch[2],
                    );

                const day =
                    Number(
                        dateOnlyMatch[3],
                    );

                const date =
                    new Date(
                        Date.UTC(
                            year,
                            month - 1,
                            day,
                        ),
                    );

                if (
                    date.getUTCFullYear() !==
                    year ||
                    date.getUTCMonth() !==
                    month - 1 ||
                    date.getUTCDate() !==
                    day
                ) {
                    throw new BadRequestException(
                        `${fieldName} không hợp lệ`,
                    );
                }

                return date;
            }
        }

        const sourceDate =
            value instanceof Date
                ? value
                : new Date(value);

        if (
            Number.isNaN(
                sourceDate.getTime(),
            )
        ) {
            throw new BadRequestException(
                `${fieldName} không hợp lệ`,
            );
        }

        return new Date(
            Date.UTC(
                sourceDate.getUTCFullYear(),
                sourceDate.getUTCMonth(),
                sourceDate.getUTCDate(),
            ),
        );
    }

    private async getPlanOrThrow(
        id: string,
    ) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id,
                },

                select: {
                    id: true,
                    plan_code: true,
                    project_id: true,
                    audit_type: true,
                    planned_start_date: true,
                    planned_end_date: true,
                    status: true,
                },
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        return plan;
    }

    private async getRawAppointment(
        id: string,
    ) {
        const appointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    id,
                },

                include:
                    this.detailInclude,
            });

        if (!appointment) {
            throw new NotFoundException(
                'Không tìm thấy quyết định chỉ định đoàn đánh giá',
            );
        }

        return appointment;
    }

    private async findConflict(
        expertId: string,
        startDate: Date,
        endDate: Date,
        excludeAppointmentId?: string,
    ) {
        return this.prisma.audit_team_members.findFirst({
            where: {
                expert_id:
                    expertId,

                assignment_status: {
                    not:
                        'cancelled',
                },

                planned_start_date: {
                    lte:
                        endDate,
                },

                planned_end_date: {
                    gte:
                        startDate,
                },

                audit_team_appointments: {
                    status: {
                        in: [
                            'draft',
                            'issued',
                        ],
                    },

                    ...(excludeAppointmentId
                        ? {
                            id: {
                                not:
                                    excludeAppointmentId,
                            },
                        }
                        : {}),
                },
            },

            include: {
                experts:
                    true,

                audit_team_appointments: {
                    include: {
                        audit_plans: {
                            select: {
                                id: true,
                                plan_code: true,
                                planned_start_date: true,
                                planned_end_date: true,
                            },
                        },
                    },
                },
            },
        });
    }

    private async validateMembers(
        members: MemberDateInput[],
        plan: PlanDateRange,
        excludeAppointmentId?: string,
    ) {
        const expertIds =
            members.map(
                (member) =>
                    member.expert_id,
            );

        if (
            new Set(
                expertIds,
            ).size !==
            expertIds.length
        ) {
            throw new BadRequestException(
                'Một chuyên gia không được xuất hiện nhiều lần trong cùng đoàn đánh giá',
            );
        }

        const teamLeaderCount =
            members.filter(
                (member) =>
                    member.team_role ===
                    'TEAM_LEADER',
            ).length;

        if (
            teamLeaderCount !== 1
        ) {
            throw new BadRequestException(
                'Đoàn đánh giá phải có đúng một trưởng đoàn',
            );
        }

        const experts =
            await this.prisma.experts.findMany({
                where: {
                    id: {
                        in:
                            expertIds,
                    },
                },
            });

        if (
            experts.length !==
            expertIds.length
        ) {
            throw new NotFoundException(
                'Có chuyên gia không tồn tại',
            );
        }

        const inactiveExpert =
            experts.find(
                (expert) =>
                    expert.status
                        ?.trim()
                        .toLowerCase() !==
                    'active',
            );

        if (inactiveExpert) {
            throw new BadRequestException(
                `Chuyên gia ${inactiveExpert.full_name} không ở trạng thái hoạt động`,
            );
        }

        const planStart =
            plan.planned_start_date
                ? this.parseDate(
                    plan.planned_start_date,
                    'Ngày bắt đầu kế hoạch',
                )
                : null;

        const planEnd =
            plan.planned_end_date
                ? this.parseDate(
                    plan.planned_end_date,
                    'Ngày kết thúc kế hoạch',
                )
                : null;

        for (
            const member
            of members
        ) {
            const startDate =
                this.parseDate(
                    member.planned_start_date,
                    'Ngày bắt đầu phân công',
                );

            const endDate =
                this.parseDate(
                    member.planned_end_date,
                    'Ngày kết thúc phân công',
                );

            if (
                endDate <
                startDate
            ) {
                throw new BadRequestException(
                    'Ngày kết thúc phân công phải bằng hoặc sau ngày bắt đầu',
                );
            }

            if (
                planStart &&
                startDate <
                planStart
            ) {
                throw new BadRequestException(
                    'Ngày bắt đầu phân công không được trước ngày bắt đầu kế hoạch',
                );
            }

            if (
                planEnd &&
                endDate >
                planEnd
            ) {
                throw new BadRequestException(
                    'Ngày kết thúc phân công không được sau ngày kết thúc kế hoạch',
                );
            }

            const conflict =
                await this.findConflict(
                    member.expert_id,
                    startDate,
                    endDate,
                    excludeAppointmentId,
                );

            if (conflict) {
                throw new ConflictException(
                    `Chuyên gia ${conflict.experts.full_name} đã được phân công trong kế hoạch ${conflict.audit_team_appointments.audit_plans.plan_code ?? conflict.audit_team_appointments.audit_plans.id}`,
                );
            }
        }
    }
    private async resolveMemberScopes(
        members: AuditTeamMemberDto[],
        projectId: string,
    ): Promise<AuditTeamMemberDto[]> {
        const projectScopeIds =
            Array.from(
                new Set(
                    members.flatMap(
                        (member) =>
                            member.scopes
                                ?.map(
                                    (scope) =>
                                        scope.project_scope_id,
                                )
                                .filter(
                                    (
                                        id,
                                    ): id is string =>
                                        Boolean(
                                            id,
                                        ),
                                ) ?? [],
                    ),
                ),
            );

        if (
            projectScopeIds.length ===
            0
        ) {
            return members;
        }

        const projectScopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    id: {
                        in:
                            projectScopeIds,
                    },

                    project_id:
                        projectId,

                    status:
                        'APPROVED',
                },

                include: {
                    isic_nace_mapping: {
                        include: {
                            source_code:
                                true,

                            target_code:
                                true,
                        },
                    },

                    nace_iaf_mapping: {
                        include: {
                            nace_code:
                                true,

                            iaf_scope:
                                true,
                        },
                    },
                },
            });

        if (
            projectScopes.length !==
            projectScopeIds.length
        ) {
            throw new BadRequestException(
                'Có phạm vi chưa được phê duyệt hoặc không thuộc dự án này',
            );
        }

        const projectScopeMap =
            new Map(
                projectScopes.map(
                    (scope) => [
                        scope.id,
                        scope,
                    ],
                ),
            );

        return members.map(
            (member) => ({
                ...member,

                scopes:
                    member.scopes?.map(
                        (scope) => {
                            if (
                                !scope.project_scope_id
                            ) {
                                return scope;
                            }

                            const projectScope =
                                projectScopeMap.get(
                                    scope.project_scope_id,
                                );

                            if (
                                !projectScope
                            ) {
                                throw new BadRequestException(
                                    'Không tìm thấy phạm vi dự án đã được phê duyệt',
                                );
                            }

                            return {
                                ...scope,

                                iaf_code:
                                    projectScope
                                        .nace_iaf_mapping
                                        .iaf_scope
                                        .iaf_code,

                                nace_code:
                                    projectScope
                                        .isic_nace_mapping
                                        .target_code
                                        .code,

                                activity_description:
                                    scope.activity_description
                                        ?.trim() ||
                                    projectScope
                                        .scope_description,
                            };
                        },
                    ) ?? [],
            }),
        );
    }

    private async validateProjectScopeUsage(
        projectId: string,
        members: ProjectScopeMemberInput[],
    ) {
        const approvedScopeCount =
            await this.prisma.certification_project_scopes.count({
                where: {
                    project_id:
                        projectId,

                    status:
                        'APPROVED',
                },
            });

        if (
            approvedScopeCount ===
            0
        ) {
            throw new BadRequestException(
                'Dự án chưa có phạm vi ISIC/NACE/IAF được phê duyệt',
            );
        }

        const requiredRoles =
            new Set([
                'TEAM_LEADER',
                'AUDITOR',
                'TECHNICAL_EXPERT',
                'WITNESS_EVALUATOR',
            ]);

        for (
            const member
            of members
        ) {
            if (
                !requiredRoles.has(
                    member.team_role
                        .trim()
                        .toUpperCase(),
                )
            ) {
                continue;
            }

            if (
                member.scopes.length ===
                0
            ) {
                throw new BadRequestException(
                    `Thành viên ${member.team_role} chưa được phân công phạm vi dự án`,
                );
            }

            const missingProjectScope =
                member.scopes.some(
                    (scope) =>
                        !scope.project_scope_id,
                );

            if (
                missingProjectScope
            ) {
                throw new BadRequestException(
                    `Phạm vi của ${member.team_role} phải được chọn từ phạm vi đã duyệt của dự án`,
                );
            }
        }
    }
    private buildMemberCreateData(
        members: AuditTeamMemberDto[],
    ) {
        return members.map(
            (member) => ({
                expert_id:
                    member.expert_id,

                team_role:
                    member.team_role,

                planned_start_date:
                    this.parseDate(
                        member.planned_start_date,
                        'Ngày bắt đầu phân công',
                    ),

                planned_end_date:
                    this.parseDate(
                        member.planned_end_date,
                        'Ngày kết thúc phân công',
                    ),

                planned_mandays:
                    member.planned_mandays,

                assignment_status:
                    'assigned',

                competency_status:
                    'not_checked',

                competency_note:
                    'Chưa kiểm tra năng lực IAF/NACE',

                scopes: {
                    create:
                        member.scopes?.map(
                            (scope) => ({
                                project_scope_id:
                                    scope.project_scope_id ??
                                    null,
                                iaf_code:
                                    scope.iaf_code
                                        ?.trim() ??
                                    null,

                                nace_code:
                                    scope.nace_code
                                        ?.trim() ??
                                    null,

                                activity_description:
                                    scope.activity_description
                                        ?.trim() ??
                                    null,

                                coverage_type:
                                    scope.coverage_type ??
                                    'full',

                                planned_mandays:
                                    scope.planned_mandays,
                            }),
                        ) ?? [],
                },
            }),
        );
    }

    async create(
        dto: CreateAuditTeamAppointmentDto,
        userId: string,
    ) {
        const plan =
            await this.getPlanOrThrow(
                dto.audit_plan_id,
            );
        const resolvedMembers =
            await this.resolveMemberScopes(
                dto.members,
                plan.project_id,
            );
        const existingPlanAppointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    audit_plan_id:
                        dto.audit_plan_id,
                },
            });

        if (existingPlanAppointment) {
            throw new ConflictException(
                'Kế hoạch đánh giá đã có quyết định chỉ định đoàn',
            );
        }

        const appointmentNumber =
            dto.appointment_number
                .trim();

        const existingNumber =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    appointment_number:
                        appointmentNumber,
                },
            });

        if (existingNumber) {
            throw new ConflictException(
                'Số quyết định chỉ định đoàn đã tồn tại',
            );
        }

        await this.validateMembers(
            resolvedMembers,
            plan,
        );

        return this.prisma.audit_team_appointments.create({
            data: {
                audit_plan_id:
                    dto.audit_plan_id,

                appointment_number:
                    appointmentNumber,

                appointment_date:
                    this.parseDate(
                        dto.appointment_date,
                        'Ngày chỉ định đoàn',
                    ),

                note:
                    dto.note
                        ?.trim() ??
                    null,

                status:
                    'draft',

                prepared_by:
                    userId,

                members: {
                    create:
                        this.buildMemberCreateData(
                            resolvedMembers,
                        ),
                },
            },

            include:
                this.detailInclude,
        });
    }

    async findAll(
        planId?: string,
        projectId?: string,
        status?: string,
    ) {
        return this.prisma.audit_team_appointments.findMany({
            where: {
                ...(planId
                    ? {
                        audit_plan_id:
                            planId,
                    }
                    : {}),

                ...(projectId
                    ? {
                        audit_plans: {
                            project_id:
                                projectId,
                        },
                    }
                    : {}),

                ...(status
                    ? {
                        status:
                            status
                                .trim()
                                .toLowerCase(),
                    }
                    : {}),
            },

            orderBy: {
                created_at:
                    'desc',
            },

            include:
                this.detailInclude,
        });
    }

    async findByPlan(
        planId: string,
    ) {
        await this.getPlanOrThrow(
            planId,
        );

        const appointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    audit_plan_id:
                        planId,
                },

                include:
                    this.detailInclude,
            });

        if (!appointment) {
            throw new NotFoundException(
                'Kế hoạch chưa có quyết định chỉ định đoàn',
            );
        }

        return appointment;
    }

    async findOne(
        id: string,
    ) {
        return this.getRawAppointment(
            id,
        );
    }
    async checkCompetency(
        id: string,
    ): Promise<unknown> {
        return this.competencyService.checkAppointment(
            id,
        );
    }
    async syncProjectScopes(
        id: string,
    ) {
        const appointment =
            await this.getRawAppointment(id);

        const projectId =
            appointment.audit_plans.project_id;

        const approvedProjectScopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    project_id: projectId,
                    status: 'APPROVED',
                },

                include: {
                    isic_nace_mapping: {
                        include: {
                            source_code: true,
                            target_code: true,
                        },
                    },

                    nace_iaf_mapping: {
                        include: {
                            nace_code: true,
                            iaf_scope: true,
                        },
                    },
                },
            });

        if (
            approvedProjectScopes.length === 0
        ) {
            throw new BadRequestException(
                'Dự án chưa có phạm vi ISIC/NACE/IAF được phê duyệt',
            );
        }

        const normalizeCode = (
            value: string | null | undefined,
        ) =>
            value
                ?.trim()
                .toUpperCase() ?? '';

        const approvedScopeIds =
            new Set(
                approvedProjectScopes.map(
                    (scope) => scope.id,
                ),
            );

        const updates: Array<{
            scopeId: string;
            projectScopeId: string;
            iafCode: string;
            naceCode: string;
            activityDescription: string;
        }> = [];

        const unresolved: Array<{
            scope_id: string;
            expert_id: string;
            expert_name: string;
            iaf_code: string | null;
            nace_code: string | null;
            reason: string;
        }> = [];

        let alreadyLinkedCount = 0;

        for (
            const member
            of appointment.members
        ) {
            for (
                const scope
                of member.scopes
            ) {
                if (
                    scope.project_scope_id
                ) {
                    if (
                        approvedScopeIds.has(
                            scope.project_scope_id,
                        )
                    ) {
                        alreadyLinkedCount += 1;
                        continue;
                    }

                    unresolved.push({
                        scope_id: scope.id,
                        expert_id:
                            member.expert_id,
                        expert_name:
                            member.experts.full_name,
                        iaf_code:
                            scope.iaf_code,
                        nace_code:
                            scope.nace_code,
                        reason:
                            'project_scope_id không thuộc phạm vi đã duyệt của dự án',
                    });

                    continue;
                }

                const iafCode =
                    normalizeCode(
                        scope.iaf_code,
                    );

                const naceCode =
                    normalizeCode(
                        scope.nace_code,
                    );

                const matchedProjectScope =
                    approvedProjectScopes.find(
                        (
                            projectScope,
                        ) =>
                            normalizeCode(
                                projectScope
                                    .nace_iaf_mapping
                                    .iaf_scope
                                    .iaf_code,
                            ) ===
                            iafCode &&
                            normalizeCode(
                                projectScope
                                    .isic_nace_mapping
                                    .target_code
                                    .code,
                            ) ===
                            naceCode,
                    );

                if (
                    !matchedProjectScope
                ) {
                    unresolved.push({
                        scope_id: scope.id,
                        expert_id:
                            member.expert_id,
                        expert_name:
                            member.experts.full_name,
                        iaf_code:
                            scope.iaf_code,
                        nace_code:
                            scope.nace_code,
                        reason:
                            'Không tìm thấy phạm vi dự án phù hợp với mã IAF và NACE hiện tại',
                    });

                    continue;
                }

                updates.push({
                    scopeId:
                        scope.id,

                    projectScopeId:
                        matchedProjectScope.id,

                    iafCode:
                        matchedProjectScope
                            .nace_iaf_mapping
                            .iaf_scope
                            .iaf_code,

                    naceCode:
                        matchedProjectScope
                            .isic_nace_mapping
                            .target_code
                            .code,

                    activityDescription:
                        scope.activity_description
                            ?.trim() ||
                        matchedProjectScope
                            .scope_description,
                });
            }
        }

        if (
            updates.length > 0
        ) {
            await this.prisma.$transaction(
                async (
                    transaction,
                ) => {
                    for (
                        const update
                        of updates
                    ) {
                        await transaction.audit_team_member_scopes.update({
                            where: {
                                id:
                                    update.scopeId,
                            },

                            data: {
                                project_scope_id:
                                    update.projectScopeId,

                                iaf_code:
                                    update.iafCode,

                                nace_code:
                                    update.naceCode,

                                activity_description:
                                    update.activityDescription,
                            },
                        });
                    }
                },
            );
        }

        return {
            appointment_id:
                appointment.id,

            appointment_number:
                appointment.appointment_number,

            project_id:
                projectId,

            updated_count:
                updates.length,

            already_linked_count:
                alreadyLinkedCount,

            unresolved_count:
                unresolved.length,

            unresolved,

            appointment:
                await this.getRawAppointment(
                    id,
                ),
        };
    }

    async checkAvailability(
        expertId: string,
        startDateValue: string,
        endDateValue: string,
        excludeAppointmentId?: string,
    ) {
        const expert =
            await this.prisma.experts.findUnique({
                where: {
                    id:
                        expertId,
                },
            });

        if (!expert) {
            throw new NotFoundException(
                'Không tìm thấy chuyên gia',
            );
        }

        const startDate =
            this.parseDate(
                startDateValue,
                'Ngày bắt đầu',
            );

        const endDate =
            this.parseDate(
                endDateValue,
                'Ngày kết thúc',
            );

        if (
            endDate <
            startDate
        ) {
            throw new BadRequestException(
                'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu',
            );
        }

        const conflict =
            await this.findConflict(
                expertId,
                startDate,
                endDate,
                excludeAppointmentId,
            );

        return {
            expert: {
                id:
                    expert.id,
                full_name:
                    expert.full_name,
                status:
                    expert.status,
            },

            requested_period: {
                start_date:
                    startDate,
                end_date:
                    endDate,
            },

            available:
                !conflict,

            conflict:
                conflict
                    ? {
                        appointment_id:
                            conflict.appointment_id,

                        appointment_number:
                            conflict.audit_team_appointments.appointment_number,

                        audit_plan_id:
                            conflict.audit_team_appointments.audit_plans.id,

                        plan_code:
                            conflict.audit_team_appointments.audit_plans.plan_code,

                        start_date:
                            conflict.planned_start_date,

                        end_date:
                            conflict.planned_end_date,
                    }
                    : null,
        };
    }

    async update(
        id: string,
        dto: UpdateAuditTeamAppointmentDto,
    ) {
        const appointment =
            await this.getRawAppointment(
                id,
            );

        if (
            appointment.status !==
            'draft'
        ) {
            throw new BadRequestException(
                'Chỉ được sửa quyết định chỉ định đoàn ở trạng thái draft',
            );
        }

        if (
            dto.appointment_number &&
            dto.appointment_number.trim() !==
            appointment.appointment_number
        ) {
            const existingNumber =
                await this.prisma.audit_team_appointments.findUnique({
                    where: {
                        appointment_number:
                            dto.appointment_number.trim(),
                    },
                });

            if (existingNumber) {
                throw new ConflictException(
                    'Số quyết định chỉ định đoàn đã tồn tại',
                );
            }
        }
        let resolvedMembers:
            AuditTeamMemberDto[] |
            undefined;
        if (dto.members) {
            resolvedMembers =
                await this.resolveMemberScopes(
                    dto.members,
                    appointment
                        .audit_plans
                        .project_id,
                );

            await this.validateMembers(
                resolvedMembers,
                appointment.audit_plans,
                id,
            );
        }

        return this.prisma.$transaction(
            async (
                transaction,
            ) => {
                if (dto.members) {
                    await transaction.audit_team_member_scopes.deleteMany({
                        where: {
                            audit_team_members: {
                                appointment_id:
                                    id,
                            },
                        },
                    });

                    await transaction.audit_team_members.deleteMany({
                        where: {
                            appointment_id:
                                id,
                        },
                    });
                }

                return transaction.audit_team_appointments.update({
                    where: {
                        id,
                    },

                    data: {
                        ...(dto.appointment_number !== undefined
                            ? {
                                appointment_number:
                                    dto.appointment_number.trim(),
                            }
                            : {}),

                        ...(dto.appointment_date !== undefined
                            ? {
                                appointment_date:
                                    this.parseDate(
                                        dto.appointment_date,
                                        'Ngày chỉ định đoàn',
                                    ),
                            }
                            : {}),

                        ...(dto.note !== undefined
                            ? {
                                note:
                                    dto.note.trim(),
                            }
                            : {}),

                        ...(dto.members
                            ? {
                                members: {
                                    create:
                                        this.buildMemberCreateData(
                                            resolvedMembers!,
                                        ),
                                },
                            }
                            : {}),
                    },

                    include:
                        this.detailInclude,
                });
            },
        );
    }

    async issue(
        id: string,
        userId: string,
    ) {
        const appointment =
            await this.getRawAppointment(
                id,
            );

        if (
            appointment.status ===
            'issued'
        ) {
            return appointment;
        }

        if (
            appointment.status ===
            'cancelled'
        ) {
            throw new BadRequestException(
                'Quyết định chỉ định đoàn đã bị hủy',
            );
        }

        await this.validateMembers(
            appointment.members.map(
                (member) => ({
                    expert_id:
                        member.expert_id,

                    team_role:
                        member.team_role,

                    planned_start_date:
                        member.planned_start_date,

                    planned_end_date:
                        member.planned_end_date,
                }),
            ),

            appointment.audit_plans,

            id,
        );
        await this.validateProjectScopeUsage(
            appointment
                .audit_plans
                .project_id,

            appointment.members.map(
                (member) => ({
                    team_role:
                        member.team_role,

                    scopes:
                        member.scopes.map(
                            (scope) => ({
                                project_scope_id:
                                    scope.project_scope_id,
                            }),
                        ),
                }),
            ))
        const competencyCheck =
            await this.competencyService.checkAppointment(
                id,
            );

        if (
            !competencyCheck.is_sufficient
        ) {
            throw new BadRequestException(
                'Đoàn đánh giá chưa đáp ứng đầy đủ năng lực IAF/NACE',
            );
        }
        return this.prisma.audit_team_appointments.update({
            where: {
                id,
            },

            data: {
                status:
                    'issued',

                approved_by:
                    userId,

                approved_at:
                    new Date(),
            },

            include:
                this.detailInclude,
        });
    }

    async cancel(
        id: string,
    ) {
        const appointment =
            await this.getRawAppointment(
                id,
            );

        if (
            appointment.status ===
            'cancelled'
        ) {
            return appointment;
        }

        return this.prisma.$transaction(
            async (
                transaction,
            ) => {
                await transaction.audit_team_members.updateMany({
                    where: {
                        appointment_id:
                            id,
                    },

                    data: {
                        assignment_status:
                            'cancelled',
                    },
                });

                return transaction.audit_team_appointments.update({
                    where: {
                        id,
                    },

                    data: {
                        status:
                            'cancelled',
                    },

                    include:
                        this.detailInclude,
                });
            },
        );
    }
    async getAvailableProjectScopes(
        planId: string,
    ) {
        const plan =
            await this.getPlanOrThrow(
                planId,
            );

        const scopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    project_id:
                        plan.project_id,

                    status:
                        'APPROVED',
                },

                orderBy: {
                    created_at:
                        'asc',
                },

                include: {
                    isic_nace_mapping: {
                        include: {
                            source_code:
                                true,

                            target_code:
                                true,
                        },
                    },

                    nace_iaf_mapping: {
                        include: {
                            nace_code:
                                true,

                            iaf_scope:
                                true,
                        },
                    },
                },
            });

        return scopes.map(
            (scope) => ({
                project_scope_id:
                    scope.id,

                management_system:
                    scope.management_system,

                standard_code:
                    scope.standard_code,

                certification_scope:
                    scope.scope_description,

                isic: {
                    revision:
                        scope
                            .isic_nace_mapping
                            .source_code
                            .revision,

                    code:
                        scope
                            .isic_nace_mapping
                            .source_code
                            .code,

                    name:
                        scope
                            .isic_nace_mapping
                            .source_code
                            .title_vi ??
                        scope
                            .isic_nace_mapping
                            .source_code
                            .title_en,
                },

                nace: {
                    revision:
                        scope
                            .isic_nace_mapping
                            .target_code
                            .revision,

                    code:
                        scope
                            .isic_nace_mapping
                            .target_code
                            .code,

                    name:
                        scope
                            .isic_nace_mapping
                            .target_code
                            .title_vi ??
                        scope
                            .isic_nace_mapping
                            .target_code
                            .title_en,
                },

                iaf: {
                    code:
                        scope
                            .nace_iaf_mapping
                            .iaf_scope
                            .iaf_code,

                    name:
                        scope
                            .nace_iaf_mapping
                            .iaf_scope
                            .iaf_name,
                },
            }),
        );
    }
}