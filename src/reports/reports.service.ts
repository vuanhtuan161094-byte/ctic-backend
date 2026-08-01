import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

type JsonObject = Record<string, unknown>;

@Injectable()
export class ReportsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private readonly detailInclude = {
        audit_plans: {
            include: {
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
            },
        },

        preparer: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },

        technical_reviews: {
            include: {
                reviewer: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                },
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

    private cloneJson<T>(value: T): T {
        return JSON.parse(
            JSON.stringify(value),
        ) as T;
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

    private normalizeReport(report: any) {
        return {
            ...report,
            form_data: this.parseFormData(
                report.form_data,
            ),

            audit_plans: report.audit_plans
                ? {
                    ...report.audit_plans,
                    form_data:
                        this.parseFormData(
                            report.audit_plans
                                .form_data,
                        ),
                }
                : null,
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
                'Ngày kết thúc đánh giá phải sau hoặc bằng ngày bắt đầu',
            );
        }
    }

    private async generateReportCode(
        year: number,
    ): Promise<string> {
        const prefix = `RPT-${year}-`;

        const latest =
            await this.prisma.reports.findFirst({
                where: {
                    report_code: {
                        startsWith: prefix,
                    },
                },
                orderBy: {
                    report_code: 'desc',
                },
                select: {
                    report_code: true,
                },
            });

        let nextNumber = 1;

        if (latest?.report_code) {
            const currentNumber = Number(
                latest.report_code.replace(
                    prefix,
                    '',
                ),
            );

            if (!Number.isNaN(currentNumber)) {
                nextNumber =
                    currentNumber + 1;
            }
        }

        return `${prefix}${String(
            nextNumber,
        ).padStart(4, '0')}`;
    }

    private buildDefaultFormData(
        plan: any,
    ): JsonObject {
        const parsedPlanData =
            typeof plan.form_data === 'string'
                ? this.parseFormData(plan.form_data)
                : plan.form_data;

        const planFormData =
            this.isPlainObject(parsedPlanData)
                ? parsedPlanData
                : {};

        const auditProgram =
            plan.audit_event?.audit_programs;

        const project =
            plan.certification_projects;

        const application =
            project.certification_applications;

        const customer =
            application.customers;

        return {
            source_plan: {
                id: plan.id,
                plan_code: plan.plan_code,
                version_no: plan.version_no,
                audit_type: plan.audit_type,
                location: plan.location,
            },

            organization: {
                customer_code:
                    auditProgram?.customer_code ??
                    customer.customer_code,

                name:
                    auditProgram
                        ?.organization_name ??
                    customer.company_name,

                address:
                    auditProgram?.address ??
                    customer.address,

                standard_name:
                    auditProgram
                        ?.standard_name ??
                    project.standard_name ??
                    application.standard_name,

                certification_scope:
                    auditProgram
                        ?.certification_scope ??
                    application.certification_scope,

                effective_personnel:
                    auditProgram
                        ?.effective_personnel ??
                    application.employee_count,
            },

            audit_information: {
                audit_type:
                    plan.audit_type,

                audit_objectives:
                    plan.audit_objectives,

                audit_scope:
                    plan.audit_scope,

                audit_criteria:
                    plan.audit_criteria,

                location:
                    plan.location,

                planned_start_date:
                    plan.planned_start_date,

                planned_end_date:
                    plan.planned_end_date,

                changes_from_plan: [],
            },

            audit_team: Array.isArray(
                planFormData.audit_team,
            )
                ? this.cloneJson(
                    planFormData.audit_team,
                )
                : [],

            observers: Array.isArray(
                planFormData.observers,
            )
                ? this.cloneJson(
                    planFormData.observers,
                )
                : [],

            guides: Array.isArray(
                planFormData.guides,
            )
                ? this.cloneJson(
                    planFormData.guides,
                )
                : [],

            planned_schedule:
                Array.isArray(
                    planFormData.detailed_schedule,
                )
                    ? this.cloneJson(
                        planFormData.detailed_schedule,
                    )
                    : [],

            audit_execution: {
                opening_meeting: {
                    actual_time: null,
                    participants: [],
                    notes: null,
                },

                closing_meeting: {
                    actual_time: null,
                    participants: [],
                    notes: null,
                },

                summary: null,
                limitations: null,
                significant_changes: null,
            },

            clause_results: [],

            audit_evidence: [],

            positive_practices: [],

            opportunities_for_improvement: [],

            nonconformities: [],

            follow_up: {
                correction_due_date: null,
                corrective_action_due_date: null,
                evidence_required: [],
                follow_up_method: null,
            },

            attachments: [],

            notes: [],
        };
    }

    private async findRawReport(id: string) {
        const report =
            await this.prisma.reports.findUnique({
                where: {
                    id,
                },
                include: this.detailInclude,
            });

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        }

        return report;
    }

    async create(
        dto: CreateReportDto,
        preparedBy?: string,
    ) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id: dto.audit_plan_id,
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

                    audit_event: {
                        include: {
                            audit_programs: true,
                        },
                    },
                },
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        const auditStartDate =
            dto.audit_start_date ===
                undefined
                ? plan.planned_start_date
                : this.toNullableDate(
                    dto.audit_start_date,
                );

        const auditEndDate =
            dto.audit_end_date === undefined
                ? plan.planned_end_date
                : this.toNullableDate(
                    dto.audit_end_date,
                );

        this.validateDateRange(
            auditStartDate,
            auditEndDate,
        );

        const latestVersion =
            await this.prisma.reports.findFirst({
                where: {
                    audit_plan_id:
                        dto.audit_plan_id,
                },
                orderBy: {
                    version_no: 'desc',
                },
                select: {
                    version_no: true,
                },
            });

        const versionNo =
            (latestVersion?.version_no ?? 0) +
            1;

        const reportDate =
            dto.report_date !== undefined &&
                dto.report_date !== null
                ? new Date(dto.report_date)
                : new Date();

        const reportYear =
            auditStartDate
                ? new Date(
                    auditStartDate,
                ).getFullYear()
                : reportDate.getFullYear();

        const reportCode =
            await this.generateReportCode(
                reportYear,
            );

        const defaultFormData =
            this.buildDefaultFormData(plan);

        const formData = dto.form_data
            ? this.deepMerge(
                defaultFormData,
                dto.form_data,
            )
            : defaultFormData;

        const report =
            await this.prisma.reports.create({
                data: {
                    audit_plan_id:
                        dto.audit_plan_id,

                    report_code: reportCode,

                    version_no: versionNo,

                    report_date: reportDate,

                    audit_start_date:
                        auditStartDate,

                    audit_end_date:
                        auditEndDate,

                    audit_result:
                        dto.audit_result,

                    conclusion:
                        dto.conclusion,

                    status:
                        dto.status ?? 'draft',

                    form_data:
                        this.serializeFormData(
                            formData,
                        ),

                    prepared_by: preparedBy,
                },

                include: this.detailInclude,
            });

        return this.normalizeReport(report);
    }

    async findAll() {
        const reports =
            await this.prisma.reports.findMany({
                orderBy: [
                    {
                        report_date: 'desc',
                    },
                    {
                        created_at: 'desc',
                    },
                ],
                include: this.detailInclude,
            });

        return reports.map((report) =>
            this.normalizeReport(report),
        );
    }

    async findByPlan(
        auditPlanId: string,
    ) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id: auditPlanId,
                },
                select: {
                    id: true,
                },
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        const reports =
            await this.prisma.reports.findMany({
                where: {
                    audit_plan_id:
                        auditPlanId,
                },
                orderBy: {
                    version_no: 'desc',
                },
                include: this.detailInclude,
            });

        return reports.map((report) =>
            this.normalizeReport(report),
        );
    }

    async findOne(id: string) {
        const report =
            await this.findRawReport(id);

        return this.normalizeReport(report);
    }

    async update(
        id: string,
        dto: UpdateReportDto,
    ) {
        const current =
            await this.findRawReport(id);

        if (
            current.status === 'approved' ||
            current.status === 'completed'
        ) {
            throw new BadRequestException(
                'Không thể sửa báo cáo đã được phê duyệt hoặc hoàn thành',
            );
        }

        const auditStartDate =
            dto.audit_start_date ===
                undefined
                ? current.audit_start_date
                : this.toNullableDate(
                    dto.audit_start_date,
                );

        const auditEndDate =
            dto.audit_end_date === undefined
                ? current.audit_end_date
                : this.toNullableDate(
                    dto.audit_end_date,
                );

        this.validateDateRange(
            auditStartDate,
            auditEndDate,
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
            await this.prisma.reports.update({
                where: {
                    id,
                },

                data: {
                    report_date:
                        this.toNullableDate(
                            dto.report_date,
                        ),

                    audit_start_date:
                        this.toNullableDate(
                            dto.audit_start_date,
                        ),

                    audit_end_date:
                        this.toNullableDate(
                            dto.audit_end_date,
                        ),

                    audit_result:
                        dto.audit_result,

                    conclusion:
                        dto.conclusion,

                    status: dto.status,

                    form_data:
                        serializedFormData,
                },

                include: this.detailInclude,
            });

        return this.normalizeReport(updated);
    }

    async remove(id: string) {
        const report =
            await this.findRawReport(id);

        if (report.status !== 'draft') {
            throw new BadRequestException(
                'Chỉ được xóa báo cáo ở trạng thái dự thảo',
            );
        }

        if (
            report.technical_reviews.length >
            0
        ) {
            throw new BadRequestException(
                'Không thể xóa báo cáo đã được xem xét kỹ thuật',
            );
        }

        await this.prisma.reports.delete({
            where: {
                id,
            },
        });

        return {
            message:
                'Đã xóa báo cáo đánh giá',
        };
    }
}