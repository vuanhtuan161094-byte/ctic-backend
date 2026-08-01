import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateAuditPlanDto } from './dto/create-audit-plan.dto';
import { UpdateAuditPlanDto } from './dto/update-audit-plan.dto';

type JsonObject = Record<string, unknown>;

@Injectable()
export class AuditPlansService {
    constructor(
        private readonly prisma: PrismaService,
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
    ): Promise<string> {
        const prefix = `PLAN-${year}-`;

        const latest =
            await this.prisma.audit_plans.findFirst({
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
                onsite: true,
                remote: false,
                document_review: true,
                interview: true,
                observation: true,
                sampling: true,
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

    async create(dto: CreateAuditPlanDto) {
        const project =
            await this.prisma.certification_projects.findUnique({
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

        let auditEvent:
            | Awaited<
                ReturnType<
                    typeof this.prisma.audit_program_events.findUnique
                >
            >
            | any
            | null = null;

        if (dto.audit_event_id) {
            auditEvent =
                await this.prisma.audit_program_events.findUnique({
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
            await this.prisma.audit_plans.findFirst({
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
            await this.generatePlanCode(planYear);

        const application =
            project.certification_applications;

        const customer = application.customers;

        const auditType =
            dto.audit_type ??
            auditEvent?.event_type ??
            null;

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
            await this.prisma.audit_plans.create({
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

        return this.normalizePlan(plan);
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
                include: this.detailInclude,
            });

        return plans.map((plan) =>
            this.normalizePlan(plan),
        );
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
                include: this.detailInclude,
            });

        return plans.map((plan) =>
            this.normalizePlan(plan),
        );
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
                include: this.detailInclude,
            });

        return plans.map((plan) =>
            this.normalizePlan(plan),
        );
    }

    async findOne(id: string) {
        const plan = await this.findRawPlan(id);

        return this.normalizePlan(plan);
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

        return this.normalizePlan(updated);
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