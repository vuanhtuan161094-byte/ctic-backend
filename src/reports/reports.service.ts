import {
    BadRequestException,
    ForbiddenException,
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

    private reportStageForPlan(plan: any): 'stage1' | 'stage2' {
        const normalize = (value: unknown) =>
            String(value ?? '')
                .trim()
                .toLowerCase()
                .replace(/[\s_-]+/g, '');

        const auditType = normalize(
            plan?.audit_type ??
            plan?.audit_event?.event_type,
        );

        return ['stage1', 'initialstage1', 'gd1', 'gđ1'].includes(auditType)
            ? 'stage1'
            : 'stage2';
    }

    private stage1AuditContentDefaults() {
        return [
            'Hồ sơ pháp lý của Tổ chức',
            'Các quy định liên quan (Giấy phép con, chứng nhận năng lực hoạt động,…)',
            'Địa chỉ trụ sở văn phòng và địa chỉ nhà máy sản xuất',
            'Phạm vi chứng nhận',
            'Hệ thống thống tin dạng văn bản',
            'Hồ sơ đánh giá nội bộ',
            'Hồ sơ xem xét của  lãnh đạo',
            'Sơ đồ tổ chức',
            'Lưu đồ sản xuất',
            'Sơ đồ nhà xưởng; Danh mục máy móc thiết bị; Hồ sơ Kiểm định máy móc thiết bị yêu cầu nghiêm ngặt',
            'Mức độ kiểm soát được thiết lập (đặc biệt là trong trường hợp khách hàng có nhiều địa điểm)',
        ].map((content, index) => ({
            no: index + 1,
            content,
            audit_note: null,
            comment: null,
        }));
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

            report_identity: {
                stage: this.reportStageForPlan(plan),
            },

            stage1_report: {
                audit_content: this.stage1AuditContentDefaults(),
                readiness_result: null,
            },

            stage2_report: {
                audit_team_recommendation: null,
                client_recommendation: null,
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

            management_system: {
                implementation_summary: null,
                effectiveness_summary: null,
                internal_audit_summary: null,
                management_review_summary: null,
            },

            recommendation: {
                result: null,
                rationale: null,
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

    private normalizeText(value: string | null | undefined) {
        return (value ?? '').trim().toLowerCase();
    }

    private getNestedText(
        object: JsonObject,
        path: string[],
    ): string {
        let current: unknown = object;

        for (const key of path) {
            if (!this.isPlainObject(current)) {
                return '';
            }
            current = current[key];
        }

        return typeof current === 'string' ? current.trim() : '';
    }

    private async assertReportAccess(
        userId: string | undefined,
        auditPlanId: string,
    ) {
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được người thực hiện báo cáo',
            );
        }

        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            include: {
                user_roles: {
                    include: {
                        roles: true,
                    },
                },
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

        const roleNames = user.user_roles.map((item) =>
            this.normalizeText(item.roles.role_name),
        );

        if (
            roleNames.some((role) =>
                ['admin', 'staff'].includes(role),
            )
        ) {
            return;
        }

        const appointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    audit_plan_id: auditPlanId,
                },
                include: {
                    members: {
                        select: {
                            expert_id: true,
                        },
                    },
                },
            });

        if (!appointment || appointment.status !== 'issued') {
            throw new ForbiddenException(
                'Kế hoạch chưa có quyết định chỉ định đoàn đã ban hành',
            );
        }

        const expertId = user.expert_profile?.id;
        const isAssigned = Boolean(
            expertId &&
            appointment.members.some(
                (member) => member.expert_id === expertId,
            ),
        );

        if (!isAssigned) {
            throw new ForbiddenException(
                'Chỉ thành viên được phân công trong đoàn đánh giá mới được tạo hoặc sửa báo cáo',
            );
        }
    }

    private validateSubmissionForm(report: any) {
        if (!report.audit_start_date || !report.audit_end_date) {
            throw new BadRequestException(
                'Phải nhập đầy đủ ngày đánh giá thực tế',
            );
        }

        const parsedFormData = this.parseFormData(report.form_data);
        const formData = this.isPlainObject(parsedFormData)
            ? parsedFormData
            : {};

        const stage = this.reportStageForPlan(report.audit_plans);

        if (stage === 'stage1') {
            if (!report.conclusion?.trim()) {
                throw new BadRequestException(
                    'Phải nhập kết luận Giai đoạn 1',
                );
            }

            const stage1Report = this.isPlainObject(formData.stage1_report)
                ? formData.stage1_report
                : {};
            const contentRows = Array.isArray(stage1Report.audit_content)
                ? stage1Report.audit_content
                : [];

            if (contentRows.length < this.stage1AuditContentDefaults().length) {
                throw new BadRequestException(
                    'Báo cáo Giai đoạn 1 chưa đủ các nội dung đánh giá theo F.09-P.09-01',
                );
            }

            const incompleteRows = contentRows
                .map((item, index) => ({
                    index,
                    item: this.isPlainObject(item) ? item : {},
                }))
                .filter(({ item }) =>
                    !String(item.audit_note ?? '').trim() ||
                    !String(item.comment ?? '').trim(),
                )
                .map(({ index }) => index + 1);

            if (incompleteRows.length) {
                throw new BadRequestException(
                    `Báo cáo Giai đoạn 1 còn thiếu ghi chép/nhận xét tại dòng: ${incompleteRows.join(', ')}`,
                );
            }

            const readiness = this.normalizeText(
                String(stage1Report.readiness_result ?? ''),
            );

            if (!['ready_for_stage2', 'not_ready_for_stage2'].includes(readiness)) {
                throw new BadRequestException(
                    'Phải xác định mức độ sẵn sàng cho đánh giá Giai đoạn 2',
                );
            }

            return {
                formData,
                stage,
                recommendation: readiness,
            };
        }

        const recommendation = this.normalizeText(
            this.getNestedText(
                formData,
                ['recommendation', 'result'],
            ),
        );
        const stage2Report = this.isPlainObject(formData.stage2_report)
            ? formData.stage2_report
            : {};
        const teamRecommendation = String(
            stage2Report.audit_team_recommendation ?? '',
        ).trim();

        if (
            ![
                'certification_recommended',
                'certification_not_recommended',
            ].includes(recommendation)
        ) {
            throw new BadRequestException(
                'Kết quả đề nghị của đoàn đánh giá không hợp lệ',
            );
        }

        if (!teamRecommendation) {
            throw new BadRequestException(
                'Phải nhập kiến nghị của đoàn đánh giá theo F.09-P.09-02',
            );
        }

        return {
            formData,
            stage,
            recommendation,
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

        await this.assertReportAccess(
            preparedBy,
            dto.audit_plan_id,
        );

        if (plan.status === 'completed') {
            const existingReport = await this.prisma.reports.findFirst({
                where: {
                    audit_plan_id: dto.audit_plan_id,
                },
                select: {
                    id: true,
                },
            });

            if (existingReport) {
                throw new BadRequestException(
                    'Cuộc đánh giá đã hoàn thành; hãy mở báo cáo hiện có thay vì tạo báo cáo mới',
                );
            }

            // Khôi phục an toàn dữ liệu cũ bị đánh dấu hoàn thành nhưng chưa có báo cáo.
            // Luồng hoàn thành hiện tại luôn yêu cầu báo cáo đã nộp, vì vậy trạng thái này
            // chỉ có thể phát sinh từ dữ liệu trước Patch 34 hoặc chỉnh sửa lịch sử.
            await this.prisma.audit_plans.update({
                where: {
                    id: plan.id,
                },
                data: {
                    status: 'in_progress',
                },
            });
            plan.status = 'in_progress';
        }

        if (plan.status !== 'in_progress') {
            throw new BadRequestException(
                'Chỉ được tạo báo cáo sau khi cuộc đánh giá đã bắt đầu',
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
                : this.reportStageForPlan(plan) === 'stage2' && auditEndDate
                    ? new Date(auditEndDate)
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

                    // Trạng thái workflow chỉ được thay đổi qua các API nghiệp vụ.
                    status: 'draft',

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
        userId?: string,
    ) {
        const current =
            await this.findRawReport(id);

        await this.assertReportAccess(
            userId,
            current.audit_plan_id,
        );

        if (
            dto.status !== undefined &&
            !['draft', 'corrective_action_required'].includes(dto.status)
        ) {
            throw new BadRequestException(
                'Không được thay đổi trực tiếp trạng thái workflow của báo cáo',
            );
        }

        const currentFormDataForWorkflow =
            this.parseFormData(current.form_data);
        const workflow = this.isPlainObject(
            currentFormDataForWorkflow,
        )
            ? currentFormDataForWorkflow.workflow
            : null;
        const submittedAt = this.isPlainObject(workflow)
            ? workflow.submitted_at
            : null;

        if (
            submittedAt ||
            current.status === 'approved' ||
            current.status === 'completed' ||
            current.status === 'technical_review_completed'
        ) {
            throw new BadRequestException(
                'Không thể sửa báo cáo đã nộp, hoàn thành hoặc được thẩm xét',
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

    async submit(
        id: string,
        userId?: string,
    ) {
        const report = await this.prisma.reports.findUnique({
            where: { id },
            include: {
                audit_plans: true,
                audit_findings: true,
                technical_reviews: {
                    select: {
                        id: true,
                    },
                },
            },
        });

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        }

        await this.assertReportAccess(
            userId,
            report.audit_plan_id,
        );

        if (report.audit_plans.status !== 'in_progress') {
            throw new BadRequestException(
                'Kế hoạch phải ở trạng thái đang thực hiện khi nộp báo cáo',
            );
        }

        if (report.technical_reviews.length > 0) {
            throw new BadRequestException(
                'Báo cáo đã được chuyển thẩm xét kỹ thuật',
            );
        }

        if (
            [
                'approved',
                'completed',
                'technical_review_completed',
            ].includes(report.status)
        ) {
            throw new BadRequestException(
                'Báo cáo đã hoàn thành và không thể nộp lại',
            );
        }

        const existingFormData = this.parseFormData(report.form_data);
        const existingWorkflow = this.isPlainObject(existingFormData)
            ? existingFormData.workflow
            : null;
        const existingSubmittedAt = this.isPlainObject(existingWorkflow)
            ? existingWorkflow.submitted_at
            : null;

        if (existingSubmittedAt) {
            return this.findOne(id);
        }

        const {
            formData,
            stage,
            recommendation,
        } = this.validateSubmissionForm(report);

        const unresolvedNc = report.audit_findings.filter(
            (finding) =>
                ['major_nc', 'minor_nc'].includes(
                    finding.finding_type,
                ) &&
                finding.status !== 'closed',
        );

        const nextStatus = stage === 'stage1'
            ? 'stage1_completed'
            : unresolvedNc.length
                ? 'corrective_action_required'
                : 'ready_for_technical_review';

        const auditResult = stage === 'stage1'
            ? recommendation
            : unresolvedNc.length
                ? 'nonconformities_found'
                : recommendation;

        const submittedAt = new Date();
        const submittedFormData = this.deepMerge(
            formData,
            {
                workflow: {
                    submitted_at: submittedAt.toISOString(),
                    submitted_by: userId ?? null,
                },
            },
        );

        const updated = await this.prisma.reports.update({
            where: { id },
            data: {
                audit_result: auditResult,
                status: nextStatus,
                report_date: report.report_date ?? submittedAt,
                form_data: JSON.stringify(submittedFormData),
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