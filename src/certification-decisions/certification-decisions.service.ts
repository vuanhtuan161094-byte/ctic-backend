import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateCertificationDecisionDto } from './dto/create-certification-decision.dto';

@Injectable()
export class CertificationDecisionsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private isPlainObject(
        value: unknown,
    ): value is Record<string, unknown> {
        return (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        );
    }

    private parseFormData(
        value: unknown,
    ): Record<string, unknown> | null {
        if (!value) {
            return null;
        }

        if (this.isPlainObject(value)) {
            return value;
        }

        if (typeof value === 'string') {
            try {
                const parsed: unknown =
                    JSON.parse(value);

                return this.isPlainObject(parsed)
                    ? parsed
                    : null;
            } catch {
                return null;
            }
        }

        return null;
    }

    private normalizeDecision(
        decision: any,
    ) {
        return {
            ...decision,

            form_data:
                this.parseFormData(
                    decision.form_data,
                ),
        };
    }

    private getDetailInclude() {
        return {
            technical_reviews: {
                select: {
                    id: true,
                    report_id: true,
                    reviewer_id: true,
                    status: true,
                    completed_at: true,

                    reports: {
                        select: {
                            id: true,
                            report_code: true,
                            audit_plan_id: true,
                            status: true,
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
                },
            },
        };
    }

    async findAll() {
        const decisions =
            await this.prisma.certification_decisions.findMany(
                {
                    include:
                        this.getDetailInclude(),

                    orderBy: {
                        created_at: 'desc',
                    },
                },
            );

        return decisions.map(
            (decision) =>
                this.normalizeDecision(
                    decision,
                ),
        );
    }

    async findOne(id: string) {
        const decision =
            await this.prisma.certification_decisions.findUnique(
                {
                    where: {
                        id,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!decision) {
            throw new NotFoundException(
                'Không tìm thấy quyết định chứng nhận',
            );
        }

        return this.normalizeDecision(
            decision,
        );
    }

    async findByTechnicalReview(
        technicalReviewId: string,
    ) {
        const decision =
            await this.prisma.certification_decisions.findUnique(
                {
                    where: {
                        technical_review_id:
                            technicalReviewId,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!decision) {
            throw new NotFoundException(
                'Hồ sơ thẩm xét chưa có quyết định chứng nhận',
            );
        }

        return this.normalizeDecision(
            decision,
        );
    }

    async create(
        dto: CreateCertificationDecisionDto,
        createdBy?: string,
    ) {
        const allowedResults = [
            'approved',
            'rejected',
            'deferred',
        ];

        if (
            !allowedResults.includes(
                dto.decision_result,
            )
        ) {
            throw new BadRequestException(
                'Kết quả quyết định không hợp lệ',
            );
        }

        const existingDecision =
            await this.prisma.certification_decisions.findFirst(
                {
                    where: {
                        OR: [
                            {
                                technical_review_id:
                                    dto.technical_review_id,
                            },
                            {
                                decision_number:
                                    dto.decision_number.trim(),
                            },
                        ],
                    },
                },
            );

        if (existingDecision) {
            throw new ConflictException(
                'Hồ sơ thẩm xét hoặc số quyết định đã được sử dụng',
            );
        }

        const review =
            await this.prisma.technical_reviews.findUnique(
                {
                    where: {
                        id:
                            dto.technical_review_id,
                    },

                    include: {
                        reports: {
                            include: {
                                audit_plans: {
                                    include: {
                                        certification_projects:
                                        {
                                            include: {
                                                certification_applications:
                                                {
                                                    include:
                                                    {
                                                        customers:
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
            );

        if (!review) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ thẩm xét kỹ thuật',
            );
        }

        if (review.status !== 'completed') {
            throw new BadRequestException(
                'Hồ sơ chưa hoàn thành thẩm xét kỹ thuật',
            );
        }

        const reviewFormData =
            this.parseFormData(
                review.form_data,
            );

        const technicalReviewReport =
            reviewFormData?.[
            'technical_review_report'
            ];

        if (
            !this.isPlainObject(
                technicalReviewReport,
            )
        ) {
            throw new BadRequestException(
                'Chưa lập báo cáo thẩm xét kỹ thuật',
            );
        }

        const recommendation =
            technicalReviewReport[
            'recommendation'
            ];

        if (
            dto.decision_result ===
            'approved' &&
            recommendation !==
            'certification_recommended'
        ) {
            throw new BadRequestException(
                'Báo cáo thẩm xét chưa kiến nghị cấp chứng nhận',
            );
        }

        const project =
            review.reports.audit_plans
                .certification_projects;

        const application =
            project.certification_applications;
        // Hồ sơ chứng nhận lần đầu phải hoàn thành cả Stage 1 và Stage 2
        const normalizeAuditType = (
            value?: string | null,
        ) =>
            (value ?? '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');

        const certificationType =
            normalizeAuditType(
                application.certification_type,
            );

        const currentAuditType =
            normalizeAuditType(
                review.reports.audit_plans.audit_type,
            );

        const isStage1 = (
            auditType?: string | null,
        ) => {
            const normalized =
                normalizeAuditType(auditType);

            return [
                'stage1',
                'initialstage1',
            ].includes(normalized);
        };

        const isStage2 = (
            auditType?: string | null,
        ) => {
            const normalized =
                normalizeAuditType(auditType);

            return [
                'stage2',
                'initialstage2',
            ].includes(normalized);
        };

        const isInitialCertification =
            [
                'initial',
                'initialcertification',
            ].includes(certificationType) ||
            isStage1(currentAuditType) ||
            isStage2(currentAuditType);

        if (
            dto.decision_result === 'approved' &&
            isInitialCertification
        ) {
            const projectPlans =
                await this.prisma.audit_plans.findMany({
                    where: {
                        project_id: project.id,
                    },

                    include: {
                        reports: {
                            include: {
                                technical_reviews: {
                                    select: {
                                        id: true,
                                        status: true,
                                    },
                                },
                            },
                        },
                    },
                });

            const stage1Plans =
                projectPlans.filter((plan) =>
                    isStage1(plan.audit_type),
                );

            const stage2Plans =
                projectPlans.filter((plan) =>
                    isStage2(plan.audit_type),
                );

            if (stage1Plans.length === 0) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: chưa có kế hoạch đánh giá Stage 1',
                );
            }

            if (stage2Plans.length === 0) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: chưa có kế hoạch đánh giá Stage 2',
                );
            }

            // Stage 1 chỉ kết luận mức độ sẵn sàng cho Stage 2 và không đi qua
            // thẩm xét kỹ thuật F.11. Chấp nhận báo cáo Stage 1 đã nộp theo workflow mới;
            // vẫn nhận hồ sơ cũ từng có technical review để tương thích dữ liệu lịch sử.
            const stage1Completed =
                stage1Plans.some((plan) =>
                    plan.reports.some((report) =>
                        report.status === 'stage1_completed' ||
                        report.technical_reviews.some(
                            (technicalReview) =>
                                technicalReview.status === 'completed',
                        ),
                    ),
                );

            if (!stage1Completed) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: Stage 1 chưa có báo cáo đã nộp và hoàn thành',
                );
            }

            const currentPlanIsStage2 =
                stage2Plans.some(
                    (plan) =>
                        plan.id ===
                        review.reports.audit_plan_id,
                );

            if (!currentPlanIsStage2) {
                throw new BadRequestException(
                    'Quyết định chứng nhận lần đầu phải được lập từ hồ sơ thẩm xét Stage 2',
                );
            }

            const stage2Completed =
                stage2Plans.some((plan) =>
                    plan.reports.some((report) =>
                        report.technical_reviews.some(
                            (technicalReview) =>
                                technicalReview.status ===
                                'completed',
                        ),
                    ),
                );

            if (!stage2Completed) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: Stage 2 chưa có báo cáo thẩm xét hoàn thành',
                );
            }
        }

        const customer =
            application.customers;

        const organizationName =
            dto.organization_name?.trim() ||
            customer.company_name?.trim();

        const organizationAddress =
            dto.organization_address?.trim() ||
            customer.address?.trim() ||
            null;

        const standardName =
            dto.standard_name?.trim() ||
            project.standard_name?.trim() ||
            application.standard_name?.trim();

        const certificationScope =
            dto.certification_scope?.trim() ||
            application.certification_scope?.trim();

        if (!organizationName) {
            throw new BadRequestException(
                'Thiếu tên tổ chức được chứng nhận',
            );
        }

        if (!standardName) {
            throw new BadRequestException(
                'Thiếu tiêu chuẩn chứng nhận',
            );
        }

        if (!certificationScope) {
            throw new BadRequestException(
                'Thiếu phạm vi chứng nhận',
            );
        }

        const decisionDate =
            new Date(dto.decision_date);

        if (
            Number.isNaN(
                decisionDate.getTime(),
            )
        ) {
            throw new BadRequestException(
                'Ngày quyết định không hợp lệ',
            );
        }

        const effectiveDate =
            dto.effective_date
                ? new Date(
                    dto.effective_date,
                )
                : null;

        const expiryDate =
            dto.expiry_date
                ? new Date(
                    dto.expiry_date,
                )
                : null;

        if (
            effectiveDate &&
            Number.isNaN(
                effectiveDate.getTime(),
            )
        ) {
            throw new BadRequestException(
                'Ngày hiệu lực không hợp lệ',
            );
        }

        if (
            expiryDate &&
            Number.isNaN(
                expiryDate.getTime(),
            )
        ) {
            throw new BadRequestException(
                'Ngày hết hiệu lực không hợp lệ',
            );
        }

        if (
            dto.decision_result ===
            'approved' &&
            (!effectiveDate ||
                !expiryDate)
        ) {
            throw new BadRequestException(
                'Quyết định cấp chứng nhận phải có ngày hiệu lực và ngày hết hiệu lực',
            );
        }

        if (
            effectiveDate &&
            expiryDate &&
            expiryDate <= effectiveDate
        ) {
            throw new BadRequestException(
                'Ngày hết hiệu lực phải sau ngày hiệu lực',
            );
        }

        const signatoryName =
            dto.signatory_name.trim();

        const signatoryTitle =
            dto.signatory_title.trim();

        if (
            !signatoryName ||
            !signatoryTitle
        ) {
            throw new BadRequestException(
                'Thiếu thông tin người ký quyết định',
            );
        }

        const formData = {
            template_code:
                'F.13-P.09',

            template_version:
                '1.1',

            custom_content:
                dto.custom_content ??
                {},
        };

        const projectStatusMap:
            Record<string, string> = {
            approved:
                'certification_approved',

            rejected:
                'certification_rejected',

            deferred:
                'decision_deferred',
        };

        return this.prisma.$transaction(
            async (transaction) => {
                const decision =
                    await transaction.certification_decisions.create(
                        {
                            data: {
                                technical_review_id:
                                    dto.technical_review_id,

                                decision_number:
                                    dto.decision_number.trim(),

                                decision_date:
                                    decisionDate,

                                decision_result:
                                    dto.decision_result,

                                organization_name:
                                    organizationName,

                                organization_address:
                                    organizationAddress,

                                management_system:
                                    dto.management_system?.trim() ||
                                    null,

                                standard_name:
                                    standardName,

                                certification_scope:
                                    certificationScope,

                                effective_date:
                                    effectiveDate,

                                expiry_date:
                                    expiryDate,

                                surveillance_interval_months:
                                    dto.surveillance_interval_months ??
                                    12,

                                signatory_name:
                                    signatoryName,

                                signatory_title:
                                    signatoryTitle,

                                status:
                                    'issued',

                                note:
                                    dto.note?.trim() ||
                                    null,

                                form_data:
                                    JSON.stringify(
                                        formData,
                                    ),

                                created_by:
                                    createdBy ??
                                    null,
                            },

                            include:
                                this.getDetailInclude(),
                        },
                    );

                await transaction.certification_projects.update(
                    {
                        where: {
                            id: project.id,
                        },

                        data: {
                            status:
                                projectStatusMap[
                                dto.decision_result
                                ],
                        },
                    },
                );

                return this.normalizeDecision(
                    decision,
                );
            },
        );
    }
}