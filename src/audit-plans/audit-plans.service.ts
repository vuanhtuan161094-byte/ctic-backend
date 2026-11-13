import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { hasPreparedAuditPlan } from './audit-cycle-workflow';
import { firstSurveillanceDeadline, isFirstSurveillanceEvent } from '../audit-programs/surveillance-deadline';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { WorkItemsService } from '../work-items/work-items.service';

import {
    resolveCanonicalAuditPlan,
    resolveCanonicalOperationalPlans,
} from './audit-plan-canonical';
import { CompleteAuditPlanDto } from './dto/complete-audit-plan.dto';
import { CreateAuditPlanDto } from './dto/create-audit-plan.dto';
import { StartAuditPlanDto } from './dto/start-audit-plan.dto';
import { UpdateAuditPlanDto } from './dto/update-audit-plan.dto';

type JsonObject = Record<string, unknown>;

@Injectable()
export class AuditPlansService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional()
        private readonly workItems?: WorkItemsService,
    ) { }

    private readonly detailInclude = {
        certification_projects: {
            include: {
                certification_applications: {
                    include: {
                        customers: true,
                    },
                },
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                    },
                },
                certification_agreements: {
                    select: {
                        id: true,
                        agreement_number: true,
                    },
                },
            },
        },

        audit_event: {
            include: {
                audit_programs: {
                    select: {
                        id: true,
                        program_code: true,
                        program_year: true,
                        version_no: true,
                        organization_name: true,
                        address: true,
                        standard_name: true,
                        certification_scope: true,
                        effective_personnel: true,
                        certification_type: true,
                    },
                },
            },
        },

        reports: {
            select: {
                id: true,
                report_date: true,
                conclusion: true,
                created_at: true,
                updated_at: true,
            },
        },
    };

    private isPlainObject(
        value: unknown,
    ): value is JsonObject {
        return (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
        );
    }

    private deepMerge(
        base: JsonObject,
        override: JsonObject,
    ): JsonObject {
        const result: JsonObject = {
            ...base,
        };

        for (const [key, value] of Object.entries(
            override,
        )) {
            const currentValue = result[key];

            if (
                this.isPlainObject(currentValue) &&
                this.isPlainObject(value)
            ) {
                result[key] = this.deepMerge(
                    currentValue,
                    value,
                );
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    private serializeFormData(
        value:
            | Record<string, unknown>
            | null
            | undefined,
    ): string | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return JSON.stringify(value);
    }

    private parseFormData(
        value: string | null | undefined,
    ): unknown {
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return {
                invalid_json: true,
                raw_value: value,
            };
        }
    }

    private normalizePlan(plan: any) {
        return {
            ...plan,
            form_data: this.parseFormData(
                plan.form_data,
            ),
        };
    }

    private toNullableDate(
        value: string | null | undefined,
    ): Date | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return new Date(value);
    }

    private validateDateRange(
        startDate:
            | string
            | Date
            | null
            | undefined,
        endDate:
            | string
            | Date
            | null
            | undefined,
    ) {
        if (!startDate || !endDate) {
            return;
        }

        if (
            new Date(startDate).getTime() >
            new Date(endDate).getTime()
        ) {
            throw new BadRequestException(
                'Ngày kết thúc kế hoạch phải sau hoặc bằng ngày bắt đầu',
            );
        }
    }

    private async generatePlanCode(
        year: number,
        client: Prisma.TransactionClient | PrismaService = this.prisma,
    ): Promise<string> {
        const prefix = `PLAN-${year}-`;

        const latest =
            await client.audit_plans.findFirst({
                where: {
                    plan_code: {
                        startsWith: prefix,
                    },
                },
                orderBy: {
                    plan_code: 'desc',
                },
                select: {
                    plan_code: true,
                },
            });

        let nextNumber = 1;

        if (latest?.plan_code) {
            const currentNumber = Number(
                latest.plan_code.replace(
                    prefix,
                    '',
                ),
            );

            if (!Number.isNaN(currentNumber)) {
                nextNumber = currentNumber + 1;
            }
        }

        return `${prefix}${String(nextNumber).padStart(
            4,
            '0',
        )}`;
    }

    private getDefaultObjective(
        auditType?: string | null,
    ): string {
        switch (auditType?.toLowerCase()) {
            case 'stage1':
                return 'Đánh giá mức độ sẵn sàng của hệ thống quản lý, xem xét tài liệu, điều kiện địa điểm và sự chuẩn bị cho đánh giá giai đoạn 2.';

            case 'stage2':
                return 'Đánh giá việc triển khai, duy trì và hiệu lực của hệ thống quản lý làm cơ sở xem xét cấp chứng nhận.';

            case 'surveillance1':
            case 'surveillance2':
                return 'Đánh giá việc duy trì, cải tiến và hiệu lực của hệ thống quản lý trong chu kỳ chứng nhận.';

            case 'recertification':
                return 'Đánh giá toàn diện việc tiếp tục đáp ứng yêu cầu chứng nhận và hiệu lực của hệ thống quản lý để xem xét chứng nhận lại.';

            default:
                return 'Đánh giá mức độ phù hợp và hiệu lực của hệ thống quản lý theo tiêu chí đánh giá.';
        }
    }

    private buildDefaultFormData(
        organizationName: string,
        eventType?: string | null,
    ): JsonObject {
        const normalizedEventType = this.normalizeAuditStageToken(eventType);
        const isStage1 = ['stage1', 'initialstage1', 'gd1', 'gđ1'].includes(normalizedEventType);

        return {
            organization: {
                name: organizationName,
            },

            audit_team: [],

            observers: [],

            guides: [],

            detailed_schedule: [],

            meetings: {
                opening_meeting: {
                    planned_time: null,
                    location: null,
                    participants: [],
                },

                closing_meeting: {
                    planned_time: null,
                    location: null,
                    participants: [],
                },
            },

            audit_methods: {
                onsite: !isStage1,
                remote: isStage1,
                document_review: true,
                interview: true,
                observation: !isStage1,
                sampling: !isStage1,
            },

            event_information: {
                event_type: eventType ?? null,
            },

            confidentiality: {
                requirements: null,
            },

            logistics: {
                transportation: null,
                accommodation: null,
                meals: null,
                protective_equipment: null,
                other_requirements: null,
            },

            risks_and_opportunities: [],

            notes: [],
        };
    }

    private async findRawPlan(id: string) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id,
                },
                include: this.detailInclude,
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        return plan;
    }

    private async ensureSurveillancePlanDeadline(
        projectId: string,
        auditType: string | null | undefined,
        plannedStartDate: Date | string | null | undefined,
        database: Pick<Prisma.TransactionClient, 'certification_decisions'> = this.prisma,
    ) {
        if (!isFirstSurveillanceEvent(auditType ?? '') || !plannedStartDate) return;
        const decision = await database.certification_decisions.findFirst({
            where: {
                project_id: projectId,
                status: 'issued',
                decision_result: 'approved',
                decision_type: { in: ['GRANT', 'RECERTIFY'] },
            },
            orderBy: [{ decision_date: 'desc' }, { created_at: 'desc' }],
            select: { decision_date: true },
        });
        if (!decision) return;
        const scheduled = new Date(plannedStartDate);
        if (Number.isNaN(scheduled.getTime()) ||
            scheduled.getTime() > firstSurveillanceDeadline(decision.decision_date).getTime()) {
            throw new BadRequestException(
                'Kế hoạch giám sát lần 1 vượt quá 12 tháng từ ngày quyết định chứng nhận; phải có phê duyệt ngoại lệ QMR theo P.09',
            );
        }
    }

    async create(dto: CreateAuditPlanDto) {
        return this.prisma.$transaction(async (transaction) => {
            const project =
                await transaction.certification_projects.findUnique({
                    where: {
                        id: dto.project_id,
                    },
                    include: {
                        certification_applications: {
                            include: {
                                customers: true,
                            },
                        },
                    },
                });

            if (!project) {
                throw new NotFoundException(
                    'Không tìm thấy dự án chứng nhận',
                );
            }

            let auditEvent: any | null = null;

            if (dto.audit_event_id) {
                // Serialize every operational PLAN create on its business event
                // before reading that event or its plans. Acquiring the update
                // lock first avoids concurrent transactions both taking shared
                // locks and then deadlocking while upgrading them.
                await transaction.$queryRaw`
                    SELECT id
                    FROM dbo.audit_program_events WITH (UPDLOCK, HOLDLOCK)
                    WHERE id = ${dto.audit_event_id}
                `;

                auditEvent =
                    await transaction.audit_program_events.findUnique({
                        where: {
                            id: dto.audit_event_id,
                        },
                        include: {
                            audit_programs: true,
                        },
                    });

                if (!auditEvent) {
                    throw new NotFoundException(
                        'Không tìm thấy cuộc đánh giá trong chương trình đánh giá',
                    );
                }

                if (
                    auditEvent.audit_programs.project_id !==
                    dto.project_id
                ) {
                    throw new BadRequestException(
                        'Cuộc đánh giá không thuộc dự án chứng nhận đã chọn',
                    );
                }

                // Re-read operational plans in the same transaction so repeated or
                // concurrent POST requests resolve to one canonical business plan.
                const existingPlans =
                    await transaction.audit_plans.findMany({
                        where: {
                            audit_event_id:
                                dto.audit_event_id,
                        },
                        include: {
                            ...this.detailInclude,
                            audit_team_appointment: {
                                select: {
                                    id: true,
                                    status: true,
                                },
                            },
                        },
                    });

                const existingPlan =
                    resolveCanonicalAuditPlan(
                        existingPlans,
                    );

                if (existingPlan) {
                    return this.normalizePlan(
                        existingPlan,
                    );
                }
            }

            const plannedStartDate =
                dto.planned_start_date ??
                auditEvent?.planned_start_date
                    ?.toISOString()
                    .slice(0, 10) ??
                null;

            const plannedEndDate =
                dto.planned_end_date ??
                auditEvent?.planned_end_date
                    ?.toISOString()
                    .slice(0, 10) ??
                null;

            this.validateDateRange(
                plannedStartDate,
                plannedEndDate,
            );

            const planYear = plannedStartDate
                ? new Date(
                    plannedStartDate,
                ).getFullYear()
                : auditEvent?.audit_programs
                    ?.program_year ??
                new Date().getFullYear();

            const latestVersion =
                await transaction.audit_plans.findFirst({
                    where: dto.audit_event_id
                        ? {
                            audit_event_id:
                                dto.audit_event_id,
                        }
                        : {
                            project_id:
                                dto.project_id,
                            audit_event_id: null,
                        },
                    orderBy: {
                        version_no: 'desc',
                    },
                    select: {
                        version_no: true,
                    },
                });

            const versionNo =
                (latestVersion?.version_no ?? 0) + 1;

            const planCode =
                await this.generatePlanCode(
                    planYear,
                    transaction,
                );

            const application =
                project.certification_applications;
            const customer = application.customers;
            const auditType =
                dto.audit_type ??
                auditEvent?.event_type ??
                null;
            await this.ensureSurveillancePlanDeadline(
                dto.project_id, auditType, plannedStartDate, transaction,
            );
            const organizationName =
                auditEvent?.audit_programs
                    ?.organization_name ??
                customer.company_name;
            const defaultFormData =
                this.buildDefaultFormData(
                    organizationName,
                    auditType,
                );
            const formData = dto.form_data
                ? this.deepMerge(
                    defaultFormData,
                    dto.form_data,
                )
                : defaultFormData;

            const plan =
                await transaction.audit_plans.create({
                    data: {
                        project_id: dto.project_id,
                        audit_event_id:
                            dto.audit_event_id,
                        plan_code: planCode,
                        version_no: versionNo,
                        audit_type: auditType,
                        planned_start_date:
                            this.toNullableDate(
                                plannedStartDate,
                            ),
                        planned_end_date:
                            this.toNullableDate(
                                plannedEndDate,
                            ),
                        location:
                            dto.location ??
                            auditEvent
                                ?.audit_programs
                                ?.address ??
                            customer.address,
                        audit_scope:
                            dto.audit_scope ??
                            auditEvent
                                ?.audit_programs
                                ?.certification_scope ??
                            application.certification_scope,
                        audit_criteria:
                            dto.audit_criteria ??
                            auditEvent
                                ?.audit_programs
                                ?.standard_name ??
                            project.standard_name ??
                            application.standard_name,
                        audit_objectives:
                            dto.audit_objectives ??
                            this.getDefaultObjective(
                                auditType,
                            ),
                        status:
                            dto.status ?? 'draft',
                        form_data:
                            this.serializeFormData(
                                formData,
                            ),
                    },
                    include: this.detailInclude,
                });

            if (
                auditType
                    ?.trim()
                    .toLowerCase() !==
                'project_team'
            ) {
                await this.workItems?.openWorkItem(
                    {
                        sourceKey:
                            `audit-team-issue:${plan.id}`,
                        workType:
                            'F04_TEAM_APPOINTMENT',
                        actionCode:
                            WORK_ITEM_ACTIONS.AUDIT_TEAM_ISSUE,
                        title:
                            `Bổ nhiệm đoàn đánh giá ${plan.plan_code ?? ''}`.trim(),
                        entityType:
                            'audit_plan',
                        entityId:
                            plan.id,
                        projectId:
                            plan.project_id,
                        auditEventId:
                            plan.audit_event_id,
                        auditPlanId:
                            plan.id,
                        cycleKey:
                            auditType,
                        assignedRole:
                            'COORDINATOR',
                        priority:
                            'HIGH',
                        dueAt:
                            plan.planned_start_date,
                        destinationPath:
                            `/projects/${plan.project_id}?workspace=audit-team&audit_plan_id=${plan.id}`,
                        context: {
                            plan_code:
                                plan.plan_code,
                            audit_type:
                                auditType,
                        },
                    },
                    transaction,
                );
            }

            return this.normalizePlan(plan);
        }, {
            isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
        });
    }

    async findAll() {
        const plans =
            await this.prisma.audit_plans.findMany({
                orderBy: [
                    {
                        planned_start_date:
                            'desc',
                    },
                    {
                        created_at: 'desc',
                    },
                ],
                include: {
                    ...this.detailInclude,
                    audit_team_appointment: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },
            });

        return resolveCanonicalOperationalPlans(plans).plans.map(({
            audit_team_appointment: _appointment,
            ...plan
        }) => this.normalizePlan(plan));
    }

    async findByProject(projectId: string) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id: projectId,
                },
                select: {
                    id: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        const plans =
            await this.prisma.audit_plans.findMany({
                where: {
                    project_id: projectId,
                },
                orderBy: [
                    {
                        planned_start_date:
                            'desc',
                    },
                    {
                        version_no: 'desc',
                    },
                ],
                include: {
                    ...this.detailInclude,
                    audit_team_appointment: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },
            });

        return resolveCanonicalOperationalPlans(plans).plans.map(({
            audit_team_appointment: _appointment,
            ...plan
        }) => this.normalizePlan(plan));
    }

    async findByEvent(eventId: string) {
        const auditEvent =
            await this.prisma.audit_program_events.findUnique({
                where: {
                    id: eventId,
                },
                select: {
                    id: true,
                },
            });

        if (!auditEvent) {
            throw new NotFoundException(
                'Không tìm thấy cuộc đánh giá trong chương trình đánh giá',
            );
        }

        const plans =
            await this.prisma.audit_plans.findMany({
                where: {
                    audit_event_id: eventId,
                },
                orderBy: {
                    version_no: 'desc',
                },
                include: {
                    ...this.detailInclude,
                    audit_team_appointment: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },
            });

        return resolveCanonicalOperationalPlans(plans).plans.map(({
            audit_team_appointment: _appointment,
            ...plan
        }) => this.normalizePlan(plan));
    }

    async findOne(id: string) {
        const plan = await this.findRawPlan(id);
        const normalized = this.normalizePlan(plan);

        return {
            ...normalized,
            stage2_lifecycle_gate:
                await this.stage2LifecycleGateForPlan(plan),
        };
    }

    async update(
        id: string,
        dto: UpdateAuditPlanDto,
    ) {
        const current =
            await this.findRawPlan(id);

        if (current.status === 'completed') {
            throw new BadRequestException(
                'Không thể sửa kế hoạch đánh giá đã hoàn thành',
            );
        }

        const plannedStartDate =
            dto.planned_start_date === undefined
                ? current.planned_start_date
                : this.toNullableDate(
                    dto.planned_start_date,
                );

        const plannedEndDate =
            dto.planned_end_date === undefined
                ? current.planned_end_date
                : this.toNullableDate(
                    dto.planned_end_date,
                );

        this.validateDateRange(
            plannedStartDate,
            plannedEndDate,
        );
        await this.ensureSurveillancePlanDeadline(
            current.project_id,
            dto.audit_type ?? current.audit_type,
            plannedStartDate,
        );

        let serializedFormData:
            | string
            | null
            | undefined;

        if (dto.form_data !== undefined) {
            if (dto.form_data === null) {
                serializedFormData = null;
            } else {
                const currentFormData =
                    this.parseFormData(
                        current.form_data,
                    );

                const mergedFormData =
                    this.deepMerge(
                        this.isPlainObject(
                            currentFormData,
                        )
                            ? currentFormData
                            : {},
                        dto.form_data,
                    );

                serializedFormData =
                    this.serializeFormData(
                        mergedFormData,
                    );
            }
        }

        const updated =
            await this.prisma.audit_plans.update({
                where: {
                    id,
                },
                data: {
                    audit_type:
                        dto.audit_type,

                    planned_start_date:
                        this.toNullableDate(
                            dto.planned_start_date,
                        ),

                    planned_end_date:
                        this.toNullableDate(
                            dto.planned_end_date,
                        ),

                    location: dto.location,

                    audit_scope:
                        dto.audit_scope,

                    audit_criteria:
                        dto.audit_criteria,

                    audit_objectives:
                        dto.audit_objectives,

                    status: dto.status,

                    form_data:
                        serializedFormData,
                },
                include: this.detailInclude,
            });

        if (
            hasPreparedAuditPlan(
                updated.form_data,
            )
        ) {
            await this.workItems?.completeMatchingWorkItems(
                {
                    actionCode:
                        WORK_ITEM_ACTIONS.AUDIT_PLAN_PREPARE,
                    entityType:
                        'audit_plan',
                    entityId:
                        id,
                },
            );

            await this.workItems?.openWorkItem({
                sourceKey:
                    `audit-execution:${id}`,
                workType:
                    'AUDIT_EXECUTION',
                actionCode:
                    WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
                title:
                    `Thực hiện đánh giá ${updated.plan_code ?? ''}`.trim(),
                entityType:
                    'audit_plan',
                entityId:
                    id,
                projectId:
                    updated.project_id,
                auditEventId:
                    updated.audit_event_id,
                auditPlanId:
                    id,
                assignedRole:
                    'LEAD_AUDITOR',
                dueAt:
                    updated.planned_start_date,
                destinationPath:
                    `/projects/${updated.project_id}?workspace=audit-execution&audit_plan_id=${id}`,
                context: {
                    plan_code:
                        updated.plan_code,
                    audit_type:
                        updated.audit_type,
                },
            });
        }

        return this.normalizePlan(updated);
    }

    private readonly countedMandayRoles = new Set([
        'team_leader',
        'lead_auditor',
        'auditor',
        'technical_expert',
    ]);

    private normalizeText(value: string | null | undefined) {
        return (value ?? '').trim().toLowerCase();
    }

    private normalizeAuditStageToken(value: unknown) {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, '');
    }

    private auditStageTokens(plan: any) {
        return [
            this.normalizeAuditStageToken(plan?.audit_type),
            this.normalizeAuditStageToken(plan?.audit_event?.event_type),
        ].filter(Boolean);
    }

    private isInitialStage1Plan(plan: any) {
        const stage1Tokens = new Set([
            'stage1',
            'initialstage1',
            'gd1',
            'gđ1',
        ]);

        return this.auditStageTokens(plan).some((token) =>
            stage1Tokens.has(token),
        );
    }

    private isInitialStage2Plan(plan: any) {
        const stage2Tokens = new Set([
            'stage2',
            'initialstage2',
            'gd2',
            'gđ2',
        ]);

        return this.auditStageTokens(plan).some((token) =>
            stage2Tokens.has(token),
        );
    }

    private stage1ReadinessFromReport(report: any) {
        const direct = this.normalizeAuditStageToken(report?.audit_result);
        if (direct) {
            return direct;
        }

        const parsed = this.parseFormData(report?.form_data);
        if (!this.isPlainObject(parsed)) {
            return '';
        }

        const stage1Report = parsed.stage1_report;
        if (!this.isPlainObject(stage1Report)) {
            return '';
        }

        return this.normalizeAuditStageToken(
            stage1Report.readiness_result,
        );
    }

    private submittedAtFromReport(report: any): string | null {
        const parsed = this.parseFormData(report?.form_data);
        if (!this.isPlainObject(parsed)) {
            return null;
        }

        const workflow = parsed.workflow;
        if (!this.isPlainObject(workflow)) {
            return null;
        }

        const submittedAt = workflow.submitted_at;
        return typeof submittedAt === 'string' && submittedAt.trim()
            ? submittedAt
            : null;
    }

    private async stage2LifecycleGateForPlan(plan: any) {
        if (!this.isInitialStage2Plan(plan)) {
            return {
                applicable: false,
                allowed: true,
                code: 'NOT_APPLICABLE',
                message: 'Không áp dụng điều kiện chuyển Giai đoạn 1 → Giai đoạn 2 cho kỳ đánh giá này.',
                stage1_plan_id: null,
                stage1_plan_status: null,
                stage1_report_id: null,
                stage1_report_status: null,
                stage1_readiness_result: null,
                stage1_report_submitted_at: null,
            };
        }

        const projectPlans = await this.prisma.audit_plans.findMany({
            where: {
                project_id: plan.project_id,
                id: {
                    not: plan.id,
                },
            },
            include: {
                audit_event: true,
                reports: {
                    orderBy: {
                        version_no: 'desc',
                    },
                    take: 1,
                    select: {
                        id: true,
                        version_no: true,
                        status: true,
                        audit_result: true,
                        form_data: true,
                        updated_at: true,
                    },
                },
            },
            orderBy: [
                {
                    created_at: 'desc',
                },
                {
                    version_no: 'desc',
                },
            ],
        });

        const currentProgramId = plan.audit_event?.program_id ?? null;
        const stage1Plan = projectPlans.find((candidate) => {
            if (!this.isInitialStage1Plan(candidate)) {
                return false;
            }

            if (!currentProgramId) {
                return true;
            }

            return candidate.audit_event?.program_id === currentProgramId;
        }) ?? null;

        const base = {
            applicable: true,
            stage1_plan_id: stage1Plan?.id ?? null,
            stage1_plan_status: stage1Plan?.status ?? null,
            stage1_report_id: stage1Plan?.reports?.[0]?.id ?? null,
            stage1_report_status: stage1Plan?.reports?.[0]?.status ?? null,
            stage1_readiness_result: stage1Plan?.reports?.[0]
                ? this.stage1ReadinessFromReport(stage1Plan.reports[0]) || null
                : null,
            stage1_report_submitted_at: stage1Plan?.reports?.[0]
                ? this.submittedAtFromReport(stage1Plan.reports[0])
                : null,
        };

        if (!stage1Plan) {
            return {
                ...base,
                allowed: false,
                code: 'STAGE1_PLAN_MISSING',
                message: 'Chưa thể bắt đầu Giai đoạn 2: chưa có kế hoạch Giai đoạn 1 trong cùng chương trình đánh giá.',
            };
        }

        if (this.normalizeText(stage1Plan.status) !== 'completed') {
            return {
                ...base,
                allowed: false,
                code: 'STAGE1_NOT_COMPLETED',
                message: 'Chưa thể bắt đầu Giai đoạn 2: cuộc đánh giá Giai đoạn 1 chưa được hoàn thành.',
            };
        }

        const stage1Report = stage1Plan.reports?.[0] ?? null;
        if (!stage1Report) {
            return {
                ...base,
                allowed: false,
                code: 'STAGE1_REPORT_MISSING',
                message: 'Chưa thể bắt đầu Giai đoạn 2: Giai đoạn 1 chưa có báo cáo đánh giá.',
            };
        }

        if (!this.submittedAtFromReport(stage1Report)) {
            return {
                ...base,
                allowed: false,
                code: 'STAGE1_REPORT_NOT_SUBMITTED',
                message: 'Chưa thể bắt đầu Giai đoạn 2: báo cáo Giai đoạn 1 chưa được nộp chính thức.',
            };
        }

        const readiness = this.stage1ReadinessFromReport(stage1Report);
        if (readiness === 'readyforstage2') {
            return {
                ...base,
                allowed: true,
                code: 'READY',
                message: 'Giai đoạn 1 đã hoàn thành và kết luận sẵn sàng cho Giai đoạn 2.',
            };
        }

        if (readiness === 'notreadyforstage2') {
            return {
                ...base,
                allowed: false,
                code: 'STAGE1_NOT_READY',
                message: 'Chưa thể bắt đầu Giai đoạn 2: kết luận Giai đoạn 1 là chưa sẵn sàng.',
            };
        }

        return {
            ...base,
            allowed: false,
            code: 'STAGE1_READINESS_MISSING',
            message: 'Chưa thể bắt đầu Giai đoạn 2: báo cáo Giai đoạn 1 chưa có kết luận về mức độ sẵn sàng cho Giai đoạn 2.',
        };
    }

    private async assertStage2LifecycleGate(plan: any) {
        const gate = await this.stage2LifecycleGateForPlan(plan);

        if (gate.applicable && !gate.allowed) {
            throw new BadRequestException(gate.message);
        }

        return gate;
    }

    private decimalValue(value: unknown): number {
        if (
            value &&
            typeof value === 'object' &&
            'toNumber' in value &&
            typeof (value as { toNumber?: unknown }).toNumber === 'function'
        ) {
            return (value as { toNumber: () => number }).toNumber();
        }

        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private isHalfManday(value: number) {
        return Math.abs(value * 2 - Math.round(value * 2)) < 0.000001;
    }

    private calendarDays(startDate: Date, endDate: Date) {
        const start = Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
        );
        const end = Date.UTC(
            endDate.getUTCFullYear(),
            endDate.getUTCMonth(),
            endDate.getUTCDate(),
        );

        return Math.floor((end - start) / 86400000) + 1;
    }

    private parseExecutionDate(value: string, fieldName: string) {
        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(`${fieldName} không hợp lệ`);
        }

        return parsed;
    }

    private isDateWithin(value: Date, start: Date, end: Date) {
        const time = value.getTime();
        return time >= start.getTime() && time <= end.getTime();
    }

    private async assertExecutionAccess(
        userId: string | undefined,
        members: Array<{ expert_id: string }>,
    ) {
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được người thực hiện nghiệp vụ đánh giá',
            );
        }

        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            include: {
                expert_profile: {
                    select: {
                        id: true,
                    },
                },
            },
        });

        if (!user) {
            throw new ForbiddenException(
                'Không tìm thấy tài khoản người thực hiện',
            );
        }

        const expertId = user.expert_profile?.id;
        const isAssigned = Boolean(
            expertId &&
            members.some((member) => member.expert_id === expertId),
        );

        if (!isAssigned) {
            throw new ForbiddenException(
                'Chỉ thành viên được phân công trong đoàn đánh giá mới được thực hiện nghiệp vụ này',
            );
        }
    }

    async start(
        id: string,
        dto: StartAuditPlanDto,
        userId?: string,
    ) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id },
            include: {
                audit_event: true,
                audit_team_appointment: {
                    include: {
                        members: true,
                    },
                },
            },
        });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        if (plan.status === 'in_progress') {
            return this.findOne(id);
        }

        if (plan.status === 'completed') {
            throw new BadRequestException(
                'Cuộc đánh giá đã hoàn thành',
            );
        }

        if (plan.status === 'cancelled') {
            throw new BadRequestException(
                'Không thể bắt đầu kế hoạch đã hủy',
            );
        }

        await this.assertStage2LifecycleGate(plan);

        const appointment = plan.audit_team_appointment;

        if (!appointment || appointment.status !== 'issued') {
            throw new BadRequestException(
                'Chỉ được bắt đầu khi quyết định chỉ định đoàn đã được ban hành',
            );
        }

        if (!appointment.members.length) {
            throw new BadRequestException(
                'Quyết định chỉ định đoàn chưa có thành viên',
            );
        }

        await this.assertExecutionAccess(
            userId,
            appointment.members,
        );

        if (
            !plan.planned_start_date ||
            !plan.planned_end_date ||
            !plan.location?.trim() ||
            !plan.audit_scope?.trim() ||
            !plan.audit_criteria?.trim() ||
            !plan.audit_objectives?.trim()
        ) {
            throw new BadRequestException(
                'Kế hoạch chưa hoàn thiện thời gian, địa điểm, phạm vi, tiêu chí hoặc mục tiêu đánh giá',
            );
        }

        const leaderCount = appointment.members.filter((member) =>
            ['team_leader', 'lead_auditor'].includes(
                this.normalizeText(member.team_role),
            ),
        ).length;

        if (leaderCount !== 1) {
            throw new BadRequestException(
                'Đoàn đánh giá phải có đúng một trưởng đoàn',
            );
        }

        const requiredMandays = this.decimalValue(
            plan.audit_event?.planned_mandays,
        );
        const allocatedMandays = appointment.members
            .filter((member) =>
                this.countedMandayRoles.has(
                    this.normalizeText(member.team_role),
                ),
            )
            .reduce(
                (sum, member) =>
                    sum + this.decimalValue(member.planned_mandays),
                0,
            );

        if (
            requiredMandays > 0 &&
            Math.abs(requiredMandays - allocatedMandays) >= 0.01
        ) {
            throw new BadRequestException(
                `Tổng man-day đã phân ${allocatedMandays.toFixed(1)} MD chưa khớp ${requiredMandays.toFixed(1)} MD của kỳ đánh giá`,
            );
        }

        const actualStartDate = dto.actual_start_date
            ? this.parseExecutionDate(
                dto.actual_start_date,
                'Ngày bắt đầu thực tế',
            )
            : plan.planned_start_date;

        if (
            !this.isDateWithin(
                actualStartDate,
                plan.planned_start_date,
                plan.planned_end_date,
            )
        ) {
            throw new BadRequestException(
                'Ngày bắt đầu thực tế phải nằm trong khoảng thời gian của kế hoạch. Hãy cập nhật kế hoạch trước nếu lịch đánh giá thay đổi.',
            );
        }

        const currentFormData = this.parseFormData(plan.form_data);
        const nextFormData = this.deepMerge(
            this.isPlainObject(currentFormData) ? currentFormData : {},
            {
                execution_control: {
                    started_at: new Date().toISOString(),
                    actual_start_date: actualStartDate.toISOString(),
                    started_by: userId ?? null,
                    start_note: dto.start_note?.trim() || null,
                },
            },
        );

        await this.prisma.$transaction(async (transaction) => {
            await transaction.audit_plans.update({
                where: { id },
                data: {
                    status: 'in_progress',
                    form_data: JSON.stringify(nextFormData),
                },
            });

            if (plan.audit_event_id) {
                await transaction.audit_program_events.update({
                    where: { id: plan.audit_event_id },
                    data: {
                        status: 'in_progress',
                        actual_start_date: actualStartDate,
                    },
                });
            }

            await transaction.audit_team_members.updateMany({
                where: {
                    appointment_id: appointment.id,
                },
                data: {
                    assignment_status: 'in_progress',
                },
            });
        });

        return this.findOne(id);
    }

    async complete(
        id: string,
        dto: CompleteAuditPlanDto,
        userId?: string,
    ) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id },
            include: {
                audit_event: true,
                audit_team_appointment: {
                    include: {
                        members: true,
                    },
                },
                reports: {
                    orderBy: {
                        version_no: 'desc',
                    },
                    include: {
                        audit_findings: true,
                    },
                },
            },
        });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        const appointment = plan.audit_team_appointment;

        if (!appointment || appointment.status !== 'issued') {
            throw new BadRequestException(
                'Không tìm thấy quyết định chỉ định đoàn đã ban hành',
            );
        }

        await this.assertExecutionAccess(
            userId,
            appointment.members,
        );

        if (plan.status === 'completed') {
            return this.findOne(id);
        }

        if (plan.status !== 'in_progress') {
            throw new BadRequestException(
                'Kế hoạch phải ở trạng thái đang thực hiện trước khi hoàn thành',
            );
        }

        const report = plan.reports[0];

        if (!report) {
            throw new BadRequestException(
                'Chưa có báo cáo đánh giá',
            );
        }

        if (
            ![
                'stage1_completed',
                'ready_for_technical_review',
                'corrective_action_required',
            ].includes(report.status)
        ) {
            throw new BadRequestException(
                'Báo cáo phải được nộp trước khi hoàn thành cuộc đánh giá',
            );
        }

        const reportFormData = this.parseFormData(report.form_data);
        const reportWorkflow = this.isPlainObject(reportFormData)
            ? reportFormData.workflow
            : null;
        const submittedAt = this.isPlainObject(reportWorkflow)
            ? reportWorkflow.submitted_at
            : null;

        if (!submittedAt) {
            throw new BadRequestException(
                'Báo cáo chưa được nộp chính thức. Hãy sử dụng chức năng Nộp báo cáo trước khi hoàn thành cuộc đánh giá',
            );
        }

        if (!report.audit_start_date || !report.audit_end_date) {
            throw new BadRequestException(
                'Báo cáo chưa có đầy đủ ngày đánh giá thực tế',
            );
        }

        const unresolvedNc = report.audit_findings.filter((finding) =>
            ['major_nc', 'minor_nc'].includes(finding.finding_type) &&
            finding.status !== 'closed',
        );

        if (
            unresolvedNc.length > 0 &&
            report.status !== 'corrective_action_required'
        ) {
            throw new BadRequestException(
                'Báo cáo có NC chưa đóng nhưng trạng thái chưa chuyển sang chờ hành động khắc phục',
            );
        }

        const actualMap = new Map(
            dto.member_actuals.map((item) => [item.member_id, item]),
        );

        if (actualMap.size !== dto.member_actuals.length) {
            throw new BadRequestException(
                'Danh sách ngày công thực tế có thành viên bị trùng',
            );
        }

        const unknownMember = dto.member_actuals.find(
            (item) =>
                !appointment.members.some(
                    (member) => member.id === item.member_id,
                ),
        );

        if (unknownMember) {
            throw new BadRequestException(
                'Có thành viên thực tế không thuộc quyết định chỉ định đoàn',
            );
        }

        const missingMember = appointment.members.find(
            (member) => !actualMap.has(member.id),
        );

        if (missingMember) {
            throw new BadRequestException(
                'Phải xác nhận ngày tham gia thực tế cho toàn bộ thành viên đoàn',
            );
        }

        const isStage1RemoteWorkload = this.isInitialStage1Plan(plan);
        let totalActualMandays = 0;
        const normalizedActuals = appointment.members.map((member) => {
            const actual = actualMap.get(member.id)!;
            const actualStartDate = this.parseExecutionDate(
                actual.actual_start_date,
                'Ngày bắt đầu thực tế của thành viên',
            );
            const actualEndDate = this.parseExecutionDate(
                actual.actual_end_date,
                'Ngày kết thúc thực tế của thành viên',
            );

            if (actualStartDate > actualEndDate) {
                throw new BadRequestException(
                    'Ngày kết thúc thực tế của thành viên phải sau hoặc bằng ngày bắt đầu',
                );
            }

            if (
                !this.isDateWithin(
                    actualStartDate,
                    report.audit_start_date!,
                    report.audit_end_date!,
                ) ||
                !this.isDateWithin(
                    actualEndDate,
                    report.audit_start_date!,
                    report.audit_end_date!,
                )
            ) {
                throw new BadRequestException(
                    'Ngày tham gia thực tế của thành viên phải nằm trong khoảng ngày đánh giá thực tế của báo cáo',
                );
            }

            const actualMandays = Number(actual.actual_mandays);

            if (!Number.isFinite(actualMandays) || actualMandays < 0) {
                throw new BadRequestException(
                    'Man-day thực tế của thành viên không hợp lệ',
                );
            }

            if (!this.isHalfManday(actualMandays)) {
                throw new BadRequestException(
                    'Man-day thực tế chỉ được nhập theo bước 0,5 MD',
                );
            }

            const role = this.normalizeText(member.team_role);
            const isCounted = this.countedMandayRoles.has(role);

            if (!isCounted && actualMandays !== 0) {
                throw new BadRequestException(
                    'Quan sát viên, chuyên gia tập sự và vai trò không tính man-day phải có man-day thực tế bằng 0',
                );
            }

            const availableDays = this.calendarDays(
                actualStartDate,
                actualEndDate,
            );

            if (!isStage1RemoteWorkload && actualMandays > availableDays) {
                throw new BadRequestException(
                    `Man-day thực tế ${actualMandays.toFixed(1)} MD vượt quá ${availableDays} ngày tham gia của thành viên`,
                );
            }

            if (isCounted) {
                totalActualMandays += actualMandays;
            }

            return {
                member,
                actualStartDate,
                actualEndDate,
                actualMandays,
            };
        });

        if (totalActualMandays <= 0) {
            throw new BadRequestException(
                'Tổng man-day thực tế phải lớn hơn 0',
            );
        }

        if (!this.isHalfManday(totalActualMandays)) {
            throw new BadRequestException(
                'Tổng man-day thực tế phải theo bước 0,5 MD',
            );
        }

        const requiredMandays = this.decimalValue(
            plan.audit_event?.planned_mandays,
        );
        const completionNote = dto.completion_note?.trim() || null;

        if (
            requiredMandays > 0 &&
            Math.abs(totalActualMandays - requiredMandays) >= 0.01 &&
            !completionNote
        ) {
            throw new BadRequestException(
                `Tổng man-day thực tế ${totalActualMandays.toFixed(1)} MD khác ${requiredMandays.toFixed(1)} MD kế hoạch; phải nhập lý do chênh lệch`,
            );
        }

        const currentFormData = this.parseFormData(plan.form_data);
        const nextFormData = this.deepMerge(
            this.isPlainObject(currentFormData) ? currentFormData : {},
            {
                execution_control: {
                    completed_at: new Date().toISOString(),
                    completed_by: userId ?? null,
                    actual_start_date:
                        report.audit_start_date.toISOString(),
                    actual_end_date:
                        report.audit_end_date.toISOString(),
                    actual_mandays: totalActualMandays,
                    actual_mandays_basis: isStage1RemoteWorkload
                        ? 'approved_remote_document_workload'
                        : 'calendar_actual',
                    completion_note: completionNote,
                    report_id: report.id,
                },
            },
        );

        await this.prisma.$transaction(async (transaction) => {
            for (const item of normalizedActuals) {
                await transaction.audit_team_members.update({
                    where: { id: item.member.id },
                    data: {
                        actual_start_date: item.actualStartDate,
                        actual_end_date: item.actualEndDate,
                        actual_mandays: item.actualMandays,
                        assignment_status: 'completed',
                    },
                });
            }

            if (plan.audit_event_id) {
                await transaction.audit_program_events.update({
                    where: { id: plan.audit_event_id },
                    data: {
                        actual_start_date: report.audit_start_date,
                        actual_end_date: report.audit_end_date,
                        actual_mandays: totalActualMandays,
                        status: 'completed',
                    },
                });
            }

            await transaction.audit_plans.update({
                where: { id },
                data: {
                    status: 'completed',
                    form_data: JSON.stringify(nextFormData),
                },
            });

            await this.workItems?.completeMatchingWorkItems(
                {
                    actionCode:
                        WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
                    entityType:
                        'audit_plan',
                    entityId:
                        id,
                },
                userId,
                transaction,
            );
        });

        return this.findOne(id);
    }

    async remove(id: string) {
        const plan = await this.findRawPlan(id);

        if (plan.status !== 'draft') {
            throw new BadRequestException(
                'Chỉ được xóa kế hoạch đánh giá ở trạng thái dự thảo',
            );
        }

        if (plan.reports.length > 0) {
            throw new BadRequestException(
                'Không thể xóa kế hoạch đã có báo cáo đánh giá',
            );
        }

        await this.prisma.audit_plans.delete({
            where: {
                id,
            },
        });

        return {
            message: 'Đã xóa kế hoạch đánh giá',
        };
    }
}
