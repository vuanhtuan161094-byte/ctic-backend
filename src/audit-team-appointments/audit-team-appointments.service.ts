import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { WorkItemsService } from '../work-items/work-items.service';
import { AuditTeamCompetencyService } from './audit-team-competency.service';
import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';
import { AuditTeamScheduleConflictService } from './audit-team-schedule-conflict.service';
import { AuditMandayAllocationService } from './audit-manday-allocation.service';
import { ExpertResourceGovernanceService } from '../experts/expert-resource-governance.service';
import { AuditTeamReadinessService } from './audit-team-readiness.service';
import {
    countsTowardAuditTeamMandays,
    formatAuditDateOnly,
    inclusiveAuditCalendarDays,
    isInitialStage2AuditPlan,
    isStage1AuditPlan,
    numericAuditValue,
    parseAuditDate,
    validateAuditMandayAllocation,
} from './audit-team-scheduling.policy';
import type {
    AuditMemberDateInput as MemberDateInput,
    AuditPlanDateRange as PlanDateRange,
} from './audit-team-scheduling.policy';
import {
    normalizeCompetencyValue,
    normalizeStandardCode,
} from './audit-team-competency.policy';

import {
    AuditTeamMemberDto,
    CreateAuditTeamAppointmentDto,
} from './dto/create-audit-team-appointment.dto';

import {
    UpdateAuditTeamAppointmentDto,
} from './dto/update-audit-team-appointment.dto';

interface ProjectScopeMemberInput {
    team_role: string;

    scopes: Array<{
        project_scope_id:
        string | null;
    }>;
}
@Injectable()
export class AuditTeamAppointmentsService {
    private readonly resourceGovernance: ExpertResourceGovernanceService;
    private readonly programCompetencyService: AuditTeamProgramCompetencyService;
    private readonly scheduleConflictService: AuditTeamScheduleConflictService;
    private readonly teamReadiness: AuditTeamReadinessService;

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

                audit_event: {
                    select: {
                        id: true,
                        event_type: true,
                        planned_mandays: true,
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

        program_manday_allocations: true,

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

        private readonly mandayAllocationService:
            AuditMandayAllocationService,

        @Optional()
        private readonly workItems?:
            WorkItemsService,

        @Optional()
        programCompetencyService?:
            AuditTeamProgramCompetencyService,

        @Optional()
        scheduleConflictService?:
            AuditTeamScheduleConflictService,
    ) {
        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);
        this.teamReadiness = new AuditTeamReadinessService(prisma);
        this.programCompetencyService =
            programCompetencyService ??
            new AuditTeamProgramCompetencyService(prisma);
        this.scheduleConflictService =
            scheduleConflictService ??
            new AuditTeamScheduleConflictService(prisma);
    }
    private parseDate(
        value: string | Date,
        fieldName: string,
    ) {
        return parseAuditDate(value, fieldName);
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
                    audit_event: {
                        select: {
                            event_type: true,
                            planned_mandays: true,
                        },
                    },
                },
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        return plan;
    }


    private readonly projectTeamAuditType =
        'project_team';


    private isStage1Plan(
        plan: { audit_type?: string | null; audit_event?: { event_type?: string | null } | null },
    ): boolean {
        return isStage1AuditPlan(plan);
    }

    private isInitialStage2Plan(
        plan: { audit_type?: string | null; audit_event?: { event_type?: string | null } | null },
    ): boolean {
        return isInitialStage2AuditPlan(plan);
    }

    private countsTowardMandays(
        teamRole?: string | null,
    ): boolean {
        return countsTowardAuditTeamMandays(teamRole);
    }

    private async getProjectOrThrow(
        projectId: string,
    ) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id:
                        projectId,
                },

                include: {
                    certification_applications: {
                        include: {
                            customers:
                                true,
                        },
                    },
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ chứng nhận',
            );
        }

        return project;
    }

    private async findProjectContextPlan(
        projectId: string,
    ) {
        return this.prisma.audit_plans.findFirst({
            where: {
                project_id:
                    projectId,

                audit_type:
                    this.projectTeamAuditType,
            },

            orderBy: {
                created_at:
                    'asc',
            },

            include: {
                certification_projects: {
                    include: {
                        certification_applications: {
                            include: {
                                customers:
                                    true,
                            },
                        },
                    },
                },
            },
        });
    }

    async ensureProjectContext(
        projectId: string,
    ) {
        const existing =
            await this.findProjectContextPlan(
                projectId,
            );

        if (existing) {
            return existing;
        }

        const project =
            await this.getProjectOrThrow(
                projectId,
            );

        const application =
            project.certification_applications;

        const customer =
            application.customers;

        const requestedStart =
            application.stage1_requested_date ??
            application.requested_audit_date ??
            project.created_at;

        const requestedEnd =
            application.stage2_requested_date ??
            requestedStart;

        const startDate =
            this.parseDate(
                requestedStart,
                'Ngày bắt đầu dự kiến',
            );

        let endDate =
            this.parseDate(
                requestedEnd,
                'Ngày kết thúc dự kiến',
            );

        if (
            endDate <
            startDate
        ) {
            endDate =
                startDate;
        }

        const technicalPlanCode =
            `DOSSIER-${project.project_code}`.slice(
                0,
                50,
            );

        const existingCode =
            await this.prisma.audit_plans.findUnique({
                where: {
                    plan_code:
                        technicalPlanCode,
                },
            });

        if (existingCode) {
            if (
                existingCode.project_id ===
                projectId &&
                existingCode.audit_type ===
                this.projectTeamAuditType
            ) {
                return existingCode;
            }

            throw new ConflictException(
                'Mã điều phối hồ sơ đã được sử dụng bởi một bản ghi khác',
            );
        }

        return this.prisma.audit_plans.create({
            data: {
                project_id:
                    projectId,

                plan_code:
                    technicalPlanCode,

                audit_type:
                    this.projectTeamAuditType,

                planned_start_date:
                    startDate,

                planned_end_date:
                    endDate,

                location:
                    application.headquarters_address ??
                    customer.address,

                audit_scope:
                    application.certification_scope,

                audit_criteria:
                    project.standard_name ??
                    application.standard_name,

                audit_objectives:
                    'Chỉ định đoàn đánh giá cho hồ sơ chứng nhận trước khi lập chương trình đánh giá.',

                status:
                    'draft',

                form_data:
                    JSON.stringify({
                        source:
                            'project_team_assignment_context',

                        project_code:
                            project.project_code,

                        hidden_from_audit_plan_workflow:
                            true,
                    }),
            },

            include: {
                certification_projects: {
                    include: {
                        certification_applications: {
                            include: {
                                customers:
                                    true,
                            },
                        },
                    },
                },
            },
        });
    }

    async findByProject(
        projectId: string,
    ) {
        await this.getProjectOrThrow(
            projectId,
        );

        const appointment =
            await this.prisma.audit_team_appointments.findFirst({
                where: {
                    audit_plans: {
                        project_id:
                            projectId,

                        audit_type:
                            this.projectTeamAuditType,
                    },

                    status: {
                        not:
                            'cancelled',
                    },
                },

                orderBy: {
                    created_at:
                        'desc',
                },

                include:
                    this.detailInclude,
            });

        if (!appointment) {
            throw new NotFoundException(
                'Hồ sơ chưa có quyết định chỉ định đoàn đánh giá',
            );
        }

        return appointment;
    }

    private async getAvailableProjectScopesByProjectId(
        projectId: string,
    ) {
        await this.getProjectOrThrow(
            projectId,
        );

        const scopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    project_id:
                        projectId,

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

    async getAvailableProjectScopesByProject(
        projectId: string,
    ) {
        return this.getAvailableProjectScopesByProjectId(
            projectId,
        );
    }

    async getProjectExpertSuitability(
        projectId: string,
    ) {
        await this.getProjectOrThrow(projectId);

        const [scopeSuitability, programs] = await Promise.all([
            this.competencyService.getProjectExpertSuitability(projectId),
            this.programCompetencyService.getApprovedProjectPrograms(projectId),
        ]);
        const expertIds = scopeSuitability.experts.map((expert) => expert.expert_id);
        const today = new Date();
        const competencies = await this.prisma.expert_competencies.findMany({
            where: {
                expert_id: { in: expertIds },
                approval_status: 'APPROVED',
                effective_date: { lte: today },
                OR: [
                    { expiry_date: null },
                    { expiry_date: { gte: today } },
                ],
            },
        });

        return {
            ...scopeSuitability,
            required_programs: programs.map((program) => ({
                key: program.key,
                standard_code: program.standard_code,
                management_system: program.management_system,
                project_scope_ids: program.project_scope_ids,
            })),
            experts: scopeSuitability.experts.map((expert) => {
                const expertCompetencies = competencies.filter(
                    (competency) => competency.expert_id === expert.expert_id,
                );
                const programCapabilities = programs.flatMap((program) => {
                    const matchingCompetencies = expertCompetencies.filter((competency) =>
                        normalizeCompetencyValue(competency.management_system) ===
                            normalizeCompetencyValue(program.management_system) &&
                        normalizeStandardCode(competency.standard_code) ===
                            normalizeStandardCode(program.standard_code),
                    );
                    if (!matchingCompetencies.length) return [];
                    const competencyRoles = Array.from(new Set(
                        matchingCompetencies.map((competency) =>
                            normalizeCompetencyValue(competency.competency_role),
                        ),
                    ));
                    return [{
                        key: program.key,
                        standard_code: program.standard_code,
                        management_system: program.management_system,
                        project_scope_ids: program.project_scope_ids,
                        competency_roles: competencyRoles,
                        can_lead: competencyRoles.includes('LEAD_AUDITOR'),
                    }];
                });
                return {
                    ...expert,
                    program_capabilities: programCapabilities,
                    covered_program_codes: programCapabilities.map(
                        (program) => program.standard_code,
                    ),
                };
            }),
        };
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

    private formatDateOnly(
        value: Date,
    ) {
        return formatAuditDateOnly(value);
    }

    private inclusiveCalendarDays(
        startDate: Date,
        endDate: Date,
    ) {
        return inclusiveAuditCalendarDays(startDate, endDate);
    }

    private numericValue(
        value: unknown,
    ): number | null {
        return numericAuditValue(value);
    }

    private validateMandayAllocation(
        members: MemberDateInput[],
        plan: PlanDateRange & { audit_type?: string | null },
        strictTotal = false,
    ) {
        return validateAuditMandayAllocation(
            members,
            plan,
            strictTotal,
        );
    }

    private async findConflict(
        expertId: string,
        startDate: Date,
        endDate: Date,
        excludeAppointmentId?: string,
    ) {
        return this.scheduleConflictService.findConflict(
            expertId,
            startDate,
            endDate,
            excludeAppointmentId,
        );
    }

    private async findStage1WarningConflicts(
        expertId: string,
        startDate: Date,
        endDate: Date,
        excludeAppointmentId?: string,
    ) {
        return this.scheduleConflictService.findStage1WarningConflicts(
            expertId,
            startDate,
            endDate,
            excludeAppointmentId,
        );
    }

    private async validateMembers(
        members: MemberDateInput[],
        plan: PlanDateRange & { audit_type?: string | null },
        excludeAppointmentId?: string,
        strictMandays = false,
        actorId?: string,
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
                include: {
                    user_account: {
                        select: {
                            id: true,
                            status: true,
                        },
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

        const expertNameMap =
            new Map(
                experts.map(
                    (expert) => [
                        expert.id,
                        expert.full_name,
                    ],
                ),
            );

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

        const ineligibleProfile = experts.find((expert) =>
            expert.profile_status !== 'APPROVED' ||
            !expert.user_id ||
            expert.user_account?.status?.trim().toLowerCase() !== 'active',
        );
        if (ineligibleProfile) {
            throw new BadRequestException(
                `Chuyên gia ${ineligibleProfile.full_name} chưa có hồ sơ được phê duyệt và tài khoản hoạt động`,
            );
        }

        const isProjectContext =
            plan.audit_type
                ?.trim()
                .toLowerCase() ===
            this.projectTeamAuditType;

        const customerId = await this.resourceGovernance.getProjectCustomerId(
            plan.project_id,
        );

        // Chỉ định đoàn cấp hồ sơ chỉ xác định thành phần đoàn cho cả chu kỳ.
        // Không khóa availability tại đây vì ngày tham gia được phân bổ tại PLAN,
        // nhưng independence theo khách hàng vẫn là hard gate.
        if (isProjectContext) {
            const effectiveDate = plan.planned_start_date ?? new Date();
            const governanceByExpert = await this.resourceGovernance.evaluateMany(
                expertIds,
                effectiveDate,
                effectiveDate,
                { customerId, includeAssignments: false },
            );
            for (const member of members) {
                const governance = governanceByExpert.get(member.expert_id);
                const block = governance?.reasons.find(
                    (reason) => reason.code === 'INDEPENDENCE_CONFLICT',
                );
                if (block) {
                    await this.resourceGovernance.recordAssignmentBlock(
                        member.expert_id,
                        plan.id,
                        actorId,
                        block,
                    );
                    throw new ConflictException(
                        `${expertNameMap.get(member.expert_id) ?? 'Chuyên gia'}: ${block.message}`,
                    );
                }
            }
            return;
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
                : planStart;

        for (const member of members) {
            if (
                !member.planned_start_date ||
                !member.planned_end_date
            ) {
                throw new BadRequestException(
                    'Phải chọn thời gian tham gia của chuyên gia cho kế hoạch đánh giá',
                );
            }

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
                    `Phân công của ${expertNameMap.get(member.expert_id) ?? 'chuyên gia'} bắt đầu ${this.formatDateOnly(startDate)}, sớm hơn ngày bắt đầu kế hoạch ${plan.plan_code ?? plan.id} là ${this.formatDateOnly(planStart)}. Hãy chọn ngày trong khoảng ${this.formatDateOnly(planStart)}–${this.formatDateOnly(planEnd ?? planStart)}.`,
                );
            }

            if (
                planEnd &&
                endDate >
                planEnd
            ) {
                throw new BadRequestException(
                    `Phân công của ${expertNameMap.get(member.expert_id) ?? 'chuyên gia'} kết thúc ${this.formatDateOnly(endDate)}, sau ngày kết thúc kế hoạch ${plan.plan_code ?? plan.id} là ${this.formatDateOnly(planEnd)}. Hãy chọn ngày trong khoảng ${this.formatDateOnly(planStart ?? planEnd)}–${this.formatDateOnly(planEnd)}.`,
                );
            }

            if (!this.isStage1Plan(plan)) {
                const conflict =
                    await this.findConflict(
                        member.expert_id,
                        startDate,
                        endDate,
                        excludeAppointmentId,
                    );

                if (conflict) {
                    await this.resourceGovernance.recordAssignmentBlock(
                        member.expert_id,
                        plan.id,
                        actorId,
                        {
                            code: 'DATE_CONFLICT',
                            message: 'Chuyên gia đã có phân công đánh giá giao với khoảng thời gian yêu cầu.',
                            severity: 'BLOCK',
                        },
                    );
                    throw new ConflictException(
                        `Chuyên gia ${conflict.experts.full_name} đã có lịch tại ${conflict.audit_team_appointments.audit_plans.plan_code ?? conflict.audit_team_appointments.audit_plans.id} trong khoảng ${this.formatDateOnly(this.parseDate(conflict.planned_start_date, 'Ngày bắt đầu lịch trùng'))}–${this.formatDateOnly(this.parseDate(conflict.planned_end_date, 'Ngày kết thúc lịch trùng'))}`,
                    );
                }
            }


            const governance = await this.resourceGovernance.evaluate(
                member.expert_id,
                startDate,
                endDate,
                { customerId, includeAssignments: false },
            );
            const block = governance.reasons.find(
                (reason) =>
                    reason.severity === 'BLOCK' &&
                    [
                        'UNAVAILABLE',
                        'LEAVE',
                        'OTHER_COMMITMENT',
                        'INDEPENDENCE_CONFLICT',
                    ].includes(
                        reason.code,
                    ),
            );
            if (block) {
                await this.resourceGovernance.recordAssignmentBlock(
                    member.expert_id,
                    plan.id,
                    actorId,
                    block,
                );
                throw new ConflictException(
                    `${expertNameMap.get(member.expert_id) ?? 'Chuyên gia'}: ${block.message}`,
                );
            }
        }

        this.validateMandayAllocation(
            members,
            plan,
            strictMandays,
        );
    }
    private async validateDraftCompetencyCoverage(
        projectId: string,
        members: AuditTeamMemberDto[],
    ): Promise<void> {
        const suitability =
            await this.competencyService.getProjectExpertSuitability(
                projectId,
            );

        const expertMap = new Map(
            suitability.experts.map(
                (expert) => [expert.expert_id, expert],
            ),
        );

        const coveredScopeIds = new Set<string>();
        const leader = members.find(
            (member) =>
                member.team_role?.trim().toUpperCase() ===
                'TEAM_LEADER',
        );

        if (!leader) {
            throw new BadRequestException(
                'Đoàn đánh giá phải có đúng một trưởng đoàn',
            );
        }

        const leaderSuitability = expertMap.get(
            leader.expert_id,
        );

        if (!leaderSuitability?.can_lead) {
            throw new BadRequestException(
                'Trưởng đoàn phải có năng lực LEAD_AUDITOR phù hợp với ít nhất một tiêu chuẩn/phạm vi của hồ sơ',
            );
        }

        for (const member of members) {
            const expertSuitability = expertMap.get(
                member.expert_id,
            );
            const assignedScopeIds =
                member.scopes
                    ?.map((scope) => scope.project_scope_id)
                    .filter((scopeId): scopeId is string => Boolean(scopeId)) ?? [];

            if (!assignedScopeIds.length) {
                continue;
            }

            if (!expertSuitability?.is_relevant) {
                throw new BadRequestException(
                    'Có thành viên được giao phạm vi nhưng không có năng lực phù hợp với hồ sơ',
                );
            }

            const unsupportedScopeIds = assignedScopeIds.filter(
                (scopeId) =>
                    !expertSuitability.covered_scope_ids.includes(
                        scopeId,
                    ),
            );

            if (unsupportedScopeIds.length) {
                throw new BadRequestException(
                    `Phạm vi giao cho chuyên gia ${expertSuitability.full_name} không khớp năng lực đã được phê duyệt`,
                );
            }

            assignedScopeIds.forEach(
                (scopeId) => coveredScopeIds.add(scopeId),
            );
        }

        if (
            suitability.required_scope_count > 0 &&
            coveredScopeIds.size < suitability.required_scope_count
        ) {
            throw new BadRequestException(
                `Tổng thể đoàn mới bao phủ ${coveredScopeIds.size}/${suitability.required_scope_count} phạm vi đã duyệt`,
            );
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
        const approvedScopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    project_id:
                        projectId,

                    status:
                        'APPROVED',
                },

                include: {
                    isic_nace_mapping: {
                        include: {
                            target_code:
                                true,
                        },
                    },

                    nace_iaf_mapping: {
                        include: {
                            iaf_scope:
                                true,
                        },
                    },
                },
            });

        if (
            approvedScopes.length ===
            0
        ) {
            throw new BadRequestException(
                'Dự án chưa có phạm vi ISIC/NACE/IAF được phê duyệt',
            );
        }

        const approvedScopeIds =
            new Set(
                approvedScopes.map(
                    (scope) =>
                        scope.id,
                ),
            );

        const selectedScopeIds =
            new Set(
                members.flatMap(
                    (member) =>
                        member.scopes
                            .map(
                                (scope) =>
                                    scope.project_scope_id,
                            )
                            .filter(
                                (
                                    scopeId,
                                ): scopeId is string =>
                                    Boolean(
                                        scopeId,
                                    ),
                            ),
                ),
            );

        const invalidScopeId =
            [...selectedScopeIds].find(
                (scopeId) =>
                    !approvedScopeIds.has(
                        scopeId,
                    ),
            );

        if (invalidScopeId) {
            throw new BadRequestException(
                'Có phạm vi phân công không thuộc danh sách phạm vi đã duyệt của hồ sơ',
            );
        }

        const missingScopes =
            approvedScopes.filter(
                (scope) =>
                    !selectedScopeIds.has(
                        scope.id,
                    ),
            );

        if (missingScopes.length) {
            const missingLabels =
                missingScopes.map(
                    (scope) =>
                        `${scope.standard_code} · IAF ${scope.nace_iaf_mapping.iaf_scope.iaf_code} · NACE ${scope.isic_nace_mapping.target_code.code}`,
                );

            throw new BadRequestException(
                `Tổng thể đoàn chưa bao phủ đầy đủ phạm vi đã duyệt: ${missingLabels.join('; ')}`,
            );
        }
    }
    private buildMemberCreateData(
        members: AuditTeamMemberDto[],
        fallbackDate: Date,
        isProjectContext: boolean,
    ) {
        return members.map(
            (member) => {
                const plannedStartDate =
                    member.planned_start_date
                        ? this.parseDate(
                            member.planned_start_date,
                            'Ngày bắt đầu phân công',
                        )
                        : fallbackDate;

                const plannedEndDate =
                    member.planned_end_date
                        ? this.parseDate(
                            member.planned_end_date,
                            'Ngày kết thúc phân công',
                        )
                        : plannedStartDate;

                const plannedMandays =
                    isProjectContext
                        ? null
                        : this.countsTowardMandays(member.team_role)
                            ? this.numericValue(member.planned_mandays)
                                ?? this.inclusiveCalendarDays(plannedStartDate, plannedEndDate)
                            : 0;

                return {
                    expert_id:
                        member.expert_id,

                    team_role:
                        member.team_role,

                    // Cột ngày trong DB vẫn bắt buộc. Với chỉ định cấp hồ sơ,
                    // lưu ngày ban hành làm mốc kỹ thuật; UI không hiển thị và
                    // không dùng giá trị này để kiểm tra trùng lịch.
                    planned_start_date:
                        plannedStartDate,

                    planned_end_date:
                        plannedEndDate,

                    planned_mandays:
                        plannedMandays,

                    assignment_status:
                        'assigned',

                    competency_status:
                        'not_checked',

                    competency_note:
                        'Chưa kiểm tra năng lực tổng thể đoàn',

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

                                    planned_mandays: null,
                                }),
                            ) ?? [],
                    },
                };
            },
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
        const appointmentDate =
            this.parseDate(
                dto.appointment_date,
                'Ngày chỉ định đoàn',
            );

        const isProjectContext =
            plan.audit_type
                ?.trim()
                .toLowerCase() ===
            this.projectTeamAuditType;

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
            undefined,
            false,
            userId,
        );
        if (isProjectContext) {
            await this.validateProjectScopeUsage(
                plan.project_id,
                resolvedMembers.map((member) => ({
                    team_role: member.team_role,
                    scopes: (member.scopes ?? []).map((scope) => ({
                        project_scope_id: scope.project_scope_id ?? null,
                    })),
                })),
            );
            await this.validateDraftCompetencyCoverage(
                plan.project_id,
                resolvedMembers,
            );
        } else {
            await this.programCompetencyService.evaluatePlanProgramAllocation(
                plan.project_id,
                plan.planned_start_date ?? appointmentDate,
                resolvedMembers.map((member) => ({
                    expert_id: member.expert_id,
                    team_role: member.team_role,
                    scopes: (member.scopes ?? []).map((scope) => ({
                        project_scope_id: scope.project_scope_id ?? null,
                    })),
                })),
                false,
                this.isStage1Plan(plan) || this.isInitialStage2Plan(plan),
            );
        }

        const created = await this.prisma.audit_team_appointments.create({
            data: {
                audit_plan_id:
                    dto.audit_plan_id,

                appointment_number:
                    appointmentNumber,

                appointment_date:
                    appointmentDate,

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
                            appointmentDate,
                            isProjectContext,
                        ),
                },
            },

            include:
                this.detailInclude,
        });
        return {
            ...created,
            team_readiness: await this.teamReadiness.evaluate(created.id),
        };
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

    async getReadiness(id: string) {
        await this.getRawAppointment(id);
        return this.teamReadiness.evaluate(id);
    }
    async checkCompetency(
        id: string,
    ): Promise<unknown> {
        const appointment = await this.getRawAppointment(id);
        const isProjectContext =
            appointment.audit_plans.audit_type
                ?.trim()
                .toLowerCase() ===
            this.projectTeamAuditType;

        if (isProjectContext) {
            return this.competencyService.checkAppointment(id);
        }

        return this.programCompetencyService.evaluatePlanProgramAllocation(
            appointment.audit_plans.project_id,
            appointment.audit_plans.planned_start_date ?? appointment.appointment_date,
            appointment.members.map((member) => ({
                member_id: member.id,
                expert_id: member.expert_id,
                team_role: member.team_role,
                scopes: member.scopes.map((scope) => ({
                    project_scope_id: scope.project_scope_id,
                })),
            })),
            true,
            this.isInitialStage2Plan(appointment.audit_plans),
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
        const stage1Warnings =
            await this.findStage1WarningConflicts(
                expertId,
                startDate,
                endDate,
                excludeAppointmentId,
            );
        const governance = await this.resourceGovernance.evaluate(
            expertId,
            startDate,
            endDate,
            { includeAssignments: false },
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
                !conflict && governance.eligible,

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
            warnings: stage1Warnings.map((warning) => ({
                type: 'stage1_remote_workload',
                appointment_id: warning.appointment_id,
                appointment_number: warning.audit_team_appointments.appointment_number,
                audit_plan_id: warning.audit_team_appointments.audit_plans.id,
                plan_code: warning.audit_team_appointments.audit_plans.plan_code,
                start_date: warning.planned_start_date,
                end_date: warning.planned_end_date,
                message: 'Chuyên gia đang có workload Giai đoạn 1 từ xa trong khoảng này. Nên ưu tiên lịch onsite khác nếu có thể.',
            })),
            resource_reasons: governance.reasons,
            availability_periods: governance.availability_periods,
        };
    }

    async getBusyDates(
        expertId: string,
        startDateValue: string,
        endDateValue: string,
        excludeAppointmentId?: string,
    ) {
        const expert = await this.prisma.experts.findUnique({
            where: { id: expertId },
            select: {
                id: true,
                full_name: true,
            },
        });

        if (!expert) {
            throw new NotFoundException(
                'Không tìm thấy chuyên gia',
            );
        }

        const startDate = this.parseDate(
            startDateValue,
            'Ngày bắt đầu',
        );
        const endDate = this.parseDate(
            endDateValue,
            'Ngày kết thúc',
        );

        if (endDate < startDate) {
            throw new BadRequestException(
                'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu',
            );
        }

        const assignments = await this.prisma.audit_team_members.findMany({
            where: {
                expert_id: expertId,
                assignment_status: { not: 'cancelled' },
                planned_start_date: { lte: endDate },
                planned_end_date: { gte: startDate },
                audit_team_appointments: {
                    status: { in: ['draft', 'issued'] },
                    ...(excludeAppointmentId
                        ? { id: { not: excludeAppointmentId } }
                        : {}),
                },
            },
            orderBy: {
                planned_start_date: 'asc',
            },
            include: {
                audit_team_appointments: {
                    include: {
                        audit_plans: {
                            include: {
                                audit_event: {
                                    select: {
                                        event_type: true,
                                    },
                                },
                                certification_projects: {
                                    include: {
                                        certification_applications: {
                                            include: {
                                                customers: true,
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

        const hardAssignments = assignments.filter((assignment) => {
            const plan = assignment.audit_team_appointments.audit_plans;
            if (normalizeCompetencyValue(plan.audit_type) === normalizeCompetencyValue(this.projectTeamAuditType)) {
                return false;
            }
            return !this.isStage1Plan(plan);
        });
        const warningAssignments = assignments.filter((assignment) =>
            this.isStage1Plan(assignment.audit_team_appointments.audit_plans),
        );
        const governance = await this.resourceGovernance.evaluate(
            expertId,
            startDate,
            endDate,
            { includeAssignments: false },
        );

        const collectDates = (items: typeof assignments) => {
            const dates = new Set<string>();
            for (const assignment of items) {
                const rangeStart = assignment.planned_start_date < startDate
                    ? startDate
                    : assignment.planned_start_date;
                const rangeEnd = assignment.planned_end_date > endDate
                    ? endDate
                    : assignment.planned_end_date;
                const cursor = new Date(rangeStart);
                while (cursor <= rangeEnd) {
                    dates.add(cursor.toISOString().slice(0, 10));
                    cursor.setUTCDate(cursor.getUTCDate() + 1);
                }
            }
            return [...dates].sort();
        };

        const serialize = (assignment: (typeof assignments)[number]) => {
            const plan = assignment.audit_team_appointments.audit_plans;
            const project = plan.certification_projects;
            const customer = project.certification_applications.customers;
            return {
                appointment_id: assignment.appointment_id,
                appointment_number: assignment.audit_team_appointments.appointment_number,
                appointment_status: assignment.audit_team_appointments.status,
                plan_id: plan.id,
                plan_code: plan.plan_code,
                audit_type: plan.audit_type,
                plan_status: plan.status,
                project_id: project.id,
                project_code: project.project_code,
                customer_name: customer.company_name,
                start_date: assignment.planned_start_date,
                end_date: assignment.planned_end_date,
            };
        };

        const collectPeriodDates = (types: string[]) => {
            const dates = new Set<string>();
            for (const period of governance.availability_periods) {
                if (!types.includes(period.availability_type)) continue;
                const rangeStart = period.start_datetime < startDate
                    ? startDate
                    : period.start_datetime;
                const rangeEnd = period.end_datetime > endDate
                    ? endDate
                    : period.end_datetime;
                const cursor = new Date(rangeStart);
                while (cursor <= rangeEnd) {
                    dates.add(cursor.toISOString().slice(0, 10));
                    cursor.setUTCDate(cursor.getUTCDate() + 1);
                }
            }
            return [...dates].sort();
        };
        const hardDates = new Set([
            ...collectDates(hardAssignments),
            ...collectPeriodDates(['UNAVAILABLE', 'LEAVE', 'OTHER_COMMITMENT']),
        ]);
        const warningDates = new Set([
            ...collectDates(warningAssignments),
        ]);

        return {
            expert,
            requested_period: {
                start_date: startDate,
                end_date: endDate,
            },
            // Hard conflict: onsite/normal audit assignment. UI blocks these dates for onsite planning.
            busy_dates: [...hardDates].sort(),
            assignments: hardAssignments.map(serialize),
            // Soft conflict: GĐ1 remote workload. UI warns but never blocks an onsite assignment.
            warning_dates: [...warningDates].sort(),
            warning_assignments: warningAssignments.map(serialize),
            availability_periods: governance.availability_periods,
            resource_reasons: governance.reasons,
        };
    }

    async update(
        id: string,
        dto: UpdateAuditTeamAppointmentDto,
        userId?: string,
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
        const nextAppointmentDate =
            dto.appointment_date !== undefined
                ? this.parseDate(
                    dto.appointment_date,
                    'Ngày chỉ định đoàn',
                )
                : appointment.appointment_date;

        const isProjectContext =
            appointment.audit_plans.audit_type
                ?.trim()
                .toLowerCase() ===
            this.projectTeamAuditType;

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
                false,
                userId,
            );
            if (isProjectContext) {
                await this.validateProjectScopeUsage(
                    appointment.audit_plans.project_id,
                    resolvedMembers.map((member) => ({
                        team_role: member.team_role,
                        scopes: (member.scopes ?? []).map((scope) => ({
                            project_scope_id: scope.project_scope_id ?? null,
                        })),
                    })),
                );
                await this.validateDraftCompetencyCoverage(
                    appointment.audit_plans.project_id,
                    resolvedMembers,
                );
            } else {
                await this.programCompetencyService.evaluatePlanProgramAllocation(
                    appointment.audit_plans.project_id,
                    appointment.audit_plans.planned_start_date ?? nextAppointmentDate,
                    resolvedMembers.map((member) => ({
                        expert_id: member.expert_id,
                        team_role: member.team_role,
                        scopes: (member.scopes ?? []).map((scope) => ({
                            project_scope_id: scope.project_scope_id ?? null,
                        })),
                    })),
                    false,
                    this.isStage1Plan(appointment.audit_plans) || this.isInitialStage2Plan(appointment.audit_plans),
                );
            }
        }

        const updated = await this.prisma.$transaction(
            async (
                transaction,
            ) => {
                if (dto.members) {
                    await this.mandayAllocationService.clearCurrentAllocation(id, transaction);

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

                const updated = await transaction.audit_team_appointments.update({
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
                                    nextAppointmentDate,
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
                                            nextAppointmentDate,
                                            isProjectContext,
                                        ),
                                },
                            }
                            : {}),
                    },

                    include:
                        this.detailInclude,
                });

                if (dto.members) {
                    await transaction.audit_logs.create({
                        data: {
                            user_id: userId ?? null,
                            action: 'AUDIT_TEAM_MEMBERS_CHANGED',
                            entity_type: 'audit_team_appointment',
                            entity_id: id,
                            outcome: 'success',
                        },
                    });
                }
                return updated;
            },
        );
        return {
            ...updated,
            team_readiness: await this.teamReadiness.evaluate(id),
        };
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

                    planned_mandays:
                        member.planned_mandays === null
                            ? null
                            : member.planned_mandays.toNumber(),
                }),
            ),

            appointment.audit_plans,

            id,
            true,
            userId,
        );
        const isProjectContext =
            appointment.audit_plans.audit_type
                ?.trim()
                .toLowerCase() ===
            this.projectTeamAuditType;

        if (isProjectContext) {
            await this.validateProjectScopeUsage(
                appointment.audit_plans.project_id,
                appointment.members.map((member) => ({
                    team_role: member.team_role,
                    scopes: member.scopes.map((scope) => ({
                        project_scope_id: scope.project_scope_id,
                    })),
                })),
            );
        }

        if (!isProjectContext && !this.isStage1Plan(appointment.audit_plans)) {
            await this.mandayAllocationService.ensureAllocationForIssue(id, userId);
        }
        await this.mandayAllocationService.validateForIssue(id);

        try {
            await this.teamReadiness.assertReadyForIssue(id);
        } catch (error) {
            await this.recordReadinessAudit(id, userId, 'AUDIT_TEAM_READINESS_BLOCKED', 'blocked');
            throw error;
        }

        const issued = await this.prisma.$transaction(async (transaction) => {
            const result = await transaction.audit_team_appointments.update({
                where: { id },
                data: {
                    status: 'issued',
                    approved_by: userId,
                    approved_at: new Date(),
                },
                include: this.detailInclude,
            });
            await transaction.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'AUDIT_TEAM_ISSUED',
                    entity_type: 'audit_team_appointment',
                    entity_id: id,
                    outcome: 'success',
                },
            });
            return result;
        });

        await this.workItems?.completeMatchingWorkItems(
            {
                actionCode:
                    WORK_ITEM_ACTIONS.AUDIT_TEAM_ISSUE,
                entityType:
                    'audit_plan',
                entityId:
                    appointment.audit_plan_id,
            },
            userId,
        );

        const lead =
            appointment.members.find((member) =>
                [
                    'TEAM_LEADER',
                    'LEAD_AUDITOR',
                ].includes(
                    member.team_role
                        .trim()
                        .toUpperCase(),
                ),
            );

        await this.workItems?.openWorkItem({
            sourceKey:
                `audit-plan:${appointment.audit_plan_id}`,
            workType:
                'AUDIT_PLAN',
            actionCode:
                WORK_ITEM_ACTIONS.AUDIT_PLAN_PREPARE,
            title:
                `Chuẩn bị kế hoạch đánh giá ${appointment.audit_plans.plan_code ?? ''}`.trim(),
            entityType:
                'audit_plan',
            entityId:
                appointment.audit_plan_id,
            projectId:
                appointment.audit_plans.project_id,
            auditEventId:
                appointment.audit_plans.audit_event_id,
            auditPlanId:
                appointment.audit_plan_id,
            assignedUserId:
                lead?.experts.user_id ??
                null,
            assignedRole:
                lead?.experts.user_id
                    ? null
                    : 'LEAD_AUDITOR',
            dueAt:
                appointment.audit_plans.planned_start_date,
            destinationPath:
                `/projects/${appointment.audit_plans.project_id}?workspace=audit-plan&audit_plan_id=${appointment.audit_plan_id}`,
            context: {
                appointment_id:
                    appointment.id,
                plan_code:
                    appointment.audit_plans.plan_code,
            },
        });

        return issued;
    }

    private async recordReadinessAudit(
        id: string,
        userId: string | undefined,
        action: string,
        outcome: string,
    ) {
        try {
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId ?? null,
                    action,
                    entity_type: 'audit_team_appointment',
                    entity_id: id,
                    outcome,
                    status_code: outcome === 'blocked' ? 400 : null,
                },
            });
        } catch {
            // A failed audit write must never turn a blocked assignment into an issued one.
        }
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

        return this.getAvailableProjectScopesByProjectId(
            plan.project_id,
        );
    }

}
