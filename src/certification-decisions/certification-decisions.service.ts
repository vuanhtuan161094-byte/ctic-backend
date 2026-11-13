import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
    assertCertificateStatusTransition,
    canReplaceCertificateStatus,
    certificateActionForDecisionType,
    classifyAuditLifecycle,
    decisionPreservesCurrentCertificate,
    decisionRequiresCertificateVersion,
    decisionChangesCertifiedScope,
    decisionRequiresChangeReason,
    inferLegacyDecisionType,
    isDecisionTypeAllowedForLifecycle,
    isStatusDecisionType,
    normalizeCertificateStatus,
    normalizeDecisionType,
    statusTargetForDecisionType,
    type CertificateDecisionType,
} from '../certificates/certificate-lifecycle';

import { CreateCertificationDecisionDto } from './dto/create-certification-decision.dto';
import {
    WORK_ITEM_ACTIONS,
} from '../work-items/work-item.constants';
import {
    WorkItemsService,
} from '../work-items/work-items.service';
import {
    expiryDateFromValidityMonths,
    resolveSchemeRuntimeRules,
    runtimeRuleSummary,
} from '../master-data-configuration/scheme-runtime-rules';

@Injectable()
export class CertificationDecisionsService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional()
        private readonly workItems?: WorkItemsService,
    ) { }

    private isTransactionNotBegunError(
        error: unknown,
    ) {
        const queue: unknown[] = [error];
        const seen =
            new Set<unknown>();

        while (queue.length > 0) {
            const current =
                queue.shift();

            if (
                current === null ||
                current === undefined ||
                seen.has(current)
            ) {
                continue;
            }

            seen.add(current);

            if (typeof current === 'string') {
                if (
                    current
                        .toLowerCase()
                        .includes(
                            'transaction has not begun',
                        )
                ) {
                    return true;
                }

                continue;
            }

            if (typeof current !== 'object') {
                continue;
            }

            const candidate =
                current as Record<string, unknown>;
            const code =
                String(
                    candidate.code ??
                    '',
                ).toUpperCase();
            const message =
                String(
                    candidate.message ??
                    '',
                ).toLowerCase();

            if (
                code === 'ENOTBEGUN' ||
                message.includes(
                    'transaction has not begun',
                )
            ) {
                return true;
            }

            for (const key of [
                'cause',
                'originalError',
                'driverAdapterError',
                'meta',
            ]) {
                if (candidate[key]) {
                    queue.push(
                        candidate[key],
                    );
                }
            }
        }

        return false;
    }

    private async runSerializableTransaction<T>(
        operation: (
            transaction:
                Prisma.TransactionClient,
        ) => Promise<T>,
    ): Promise<T> {
        const maxAttempts = 2;
        let lastError: unknown;

        for (
            let attempt = 1;
            attempt <= maxAttempts;
            attempt += 1
        ) {
            try {
                return await this.prisma.$transaction(
                    operation,
                    {
                        isolationLevel:
                            Prisma
                                .TransactionIsolationLevel
                                .Serializable,
                    },
                );
            } catch (error) {
                lastError = error;

                if (
                    !this.isTransactionNotBegunError(
                        error,
                    ) ||
                    attempt >= maxAttempts
                ) {
                    throw error;
                }

                console.warn(
                    '[CertificationDecision] SQL transaction did not begin; retrying the whole transaction once.',
                );

                await new Promise<void>(
                    (resolve) =>
                        setTimeout(
                            resolve,
                            75,
                        ),
                );
            }
        }

        throw lastError;
    }

    private getTodayInVietnam(): Date {
        const parts =
            new Intl.DateTimeFormat(
                'en-US',
                {
                    timeZone:
                        'Asia/Ho_Chi_Minh',
                    year:
                        'numeric',
                    month:
                        '2-digit',
                    day:
                        '2-digit',
                },
            ).formatToParts(
                new Date(),
            );
        const values =
            Object.fromEntries(
                parts.map((part) => [
                    part.type,
                    part.value,
                ]),
            );

        return new Date(
            `${values.year}-${values.month}-${values.day}` +
            'T00:00:00.000Z',
        );
    }

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
        const decisionType =
            normalizeDecisionType(
                decision.decision_type ??
                '',
            );

        const formData = this.parseFormData(
            decision.form_data,
        );

        return {
            ...decision,

            form_data:
                formData,

            change_reason:
                String(
                    formData?.lifecycle_change_reason ??
                    '',
                ).trim() || null,

            lifecycle: decisionType
                ? {
                    action:
                        certificateActionForDecisionType(
                            decisionType,
                        ),
                    requires_certificate_version:
                        decisionRequiresCertificateVersion(
                            decisionType,
                        ),
                    preserves_current_certificate:
                        decisionPreservesCurrentCertificate(
                            decisionType,
                        ),
                    status_target:
                        statusTargetForDecisionType(
                            decisionType,
                        ),
                }
                : null,
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

            certificate_series: {
                select: {
                    id: true,
                    project_id: true,
                    series_code: true,
                    status: true,
                },
            },

            certificates: {
                select: {
                    id: true,
                    certificate_series_id: true,
                    version_no: true,
                    cert_number: true,
                    status: true,
                    verification_code: true,
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

    // Shared by the existing mutation and the bounded read capability. No rule changes.
    async assertDecisionMakerIndependent(
        review: { reviewer_id: string | null; reports: { audit_plan_id: string } },
        createdBy?: string,
    ) {
        if (!createdBy) return;
        if (review.reviewer_id === createdBy) {
            throw new BadRequestException(
                'Người đã thực hiện thẩm xét kỹ thuật không được ra quyết định cho cùng hồ sơ',
            );
        }
        const auditParticipation = await (this.prisma as PrismaService).audit_team_members?.findFirst({
            where: {
                audit_team_appointments: { audit_plan_id: review.reports.audit_plan_id },
                experts: { user_id: createdBy },
                assignment_status: { not: 'cancelled' },
            },
            select: { id: true, team_role: true },
        }) ?? null;
        if (auditParticipation) {
            throw new BadRequestException(
                'Thành viên đoàn đánh giá không được ra quyết định chứng nhận cho cùng chu kỳ',
            );
        }
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
                                        audit_event: {
                                            select: {
                                                event_type:
                                                    true,
                                            },
                                        },

                                        certification_projects:
                                        {
                                            include: {
                                                certification_applications:
                                                {
                                                    include:
                                                    {
                                                        customers:
                                                            true,
                                                        sites: {
                                                            orderBy: {
                                                                site_no:
                                                                    'asc',
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

        await this.assertDecisionMakerIndependent(review, createdBy);

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

        const project =
            review.reports.audit_plans
                .certification_projects;

        const runtimeRules =
            resolveSchemeRuntimeRules(
                project.scheme_config_snapshot,
            );

        const auditLifecycle =
            classifyAuditLifecycle(
                review.reports.audit_plans.audit_type,
                review.reports.audit_plans.audit_event
                    ?.event_type,
            );

        const decisionType:
        CertificateDecisionType =
            dto.decision_type
                ? normalizeDecisionType(
                    dto.decision_type,
                ) ?? (() => {
                    throw new BadRequestException(
                        'Loại quyết định lifecycle không hợp lệ',
                    );
                })()
                : inferLegacyDecisionType({
                    auditType:
                        review.reports.audit_plans
                            .audit_type,
                    eventType:
                        review.reports.audit_plans
                            .audit_event?.event_type,
                    decisionResult:
                        dto.decision_result,
                });

        if (
            !isDecisionTypeAllowedForLifecycle(
                decisionType,
                auditLifecycle,
            )
        ) {
            throw new BadRequestException(
                `Quyết định ${decisionType} không phù hợp với lifecycle ${auditLifecycle}`,
            );
        }

        if (
            decisionType === 'REFUSE' &&
            dto.decision_result !== 'rejected'
        ) {
            throw new BadRequestException(
                'Quyết định REFUSE phải có kết quả Không chấp thuận',
            );
        }

        const lifecycleAction =
            certificateActionForDecisionType(
                decisionType,
            );

        if (
            dto.decision_result ===
            'approved' &&
            !isStatusDecisionType(
                decisionType,
            ) &&
            recommendation !==
            'certification_recommended'
        ) {
            throw new BadRequestException(
                'Báo cáo thẩm xét chưa kiến nghị cấp chứng nhận',
            );
        }

        let certificateSeriesId =
            dto.certificate_series_id ??
            null;

        if (certificateSeriesId) {
            const requestedSeries =
                await this.prisma.certificate_series.findFirst({
                    where: {
                        id:
                            certificateSeriesId,
                        project_id:
                            project.id,
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

            if (!requestedSeries) {
                throw new BadRequestException(
                    'Certificate Series không thuộc hồ sơ chứng nhận hiện tại',
                );
            }

            if (requestedSeries.status !== 'active') {
                throw new BadRequestException(
                    'Certificate Series không còn hoạt động',
                );
            }
        } else if (
            lifecycleAction !==
            'CREATE_FIRST_VERSION' &&
            lifecycleAction !==
            'NO_CERTIFICATE'
        ) {
            const candidateSeries =
                await this.prisma.certificate_series.findMany({
                    where: {
                        project_id:
                            project.id,
                        status:
                            'active',
                    },
                    orderBy: {
                        created_at:
                            'asc',
                    },
                    select: {
                        id: true,
                    },
                });

            if (candidateSeries.length === 1) {
                certificateSeriesId =
                    candidateSeries[0].id;
            } else if (candidateSeries.length === 0) {
                throw new BadRequestException(
                    `Quyết định ${decisionType} yêu cầu Certificate Series hiện hữu`,
                );
            } else {
                throw new BadRequestException(
                    'Hồ sơ có nhiều Certificate Series; phải chỉ định certificate_series_id',
                );
            }
        }

        if (
            lifecycleAction ===
            'CREATE_FIRST_VERSION' &&
            certificateSeriesId
        ) {
            throw new BadRequestException(
                'GRANT phải tạo Certificate Series mới, không được gắn vào series hiện hữu',
            );
        }

        if (
            dto.decision_result === 'approved' &&
            decisionType === 'RECERTIFY'
        ) {
            const currentCertificate =
                await this.prisma.certificates.findFirst({
                    where: {
                        certificate_series_id:
                            certificateSeriesId!,
                    },
                    orderBy: {
                        version_no:
                            'desc',
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

            if (!currentCertificate) {
                throw new BadRequestException(
                    'RECERTIFY yêu cầu một certificate version hiện hữu trong cùng dòng chứng nhận',
                );
            }

            if (
                !canReplaceCertificateStatus(
                    currentCertificate.status,
                )
            ) {
                throw new BadRequestException(
                    `Không thể tái chứng nhận certificate ở trạng thái ${currentCertificate.status ?? 'không xác định'}`,
                );
            }
        }

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
            decisionType === 'GRANT' &&
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

            if (
                runtimeRules.stage1_applicable &&
                stage1Plans.length === 0
            ) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: quy tắc chương trình yêu cầu Giai đoạn 1 nhưng chưa có kế hoạch Giai đoạn 1',
                );
            }

            if (stage2Plans.length === 0) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: chưa có kế hoạch đánh giá Giai đoạn 2',
                );
            }

            // Giai đoạn 1 chỉ bắt buộc khi snapshot quy tắc của dự án yêu cầu.
            // Hồ sơ lịch sử không có snapshot vẫn dùng baseline tương thích: bắt buộc Giai đoạn 1.
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

            if (
                runtimeRules.stage1_applicable &&
                !stage1Completed
            ) {
                throw new BadRequestException(
                    'Không thể phê duyệt chứng nhận lần đầu: Giai đoạn 1 chưa có báo cáo đã nộp và hoàn thành',
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

        const changeReason =
            dto.change_reason?.trim() ||
            null;
        if (
            dto.decision_result === 'approved' &&
            decisionRequiresChangeReason(
                decisionType,
            ) &&
            !changeReason
        ) {
            throw new BadRequestException(
                'Phải nhập lý do thay đổi khi chấp thuận sửa đổi, mở rộng hoặc thu hẹp phạm vi chứng nhận',
            );
        }

        if (
            isStatusDecisionType(
                decisionType,
            ) &&
            !changeReason
        ) {
            const reasonLabel = {
                SUSPEND:
                    'lý do đình chỉ',
                RESTORE:
                    'căn cứ khôi phục',
                WITHDRAW:
                    'lý do thu hồi',
            }[decisionType];

            throw new BadRequestException(
                `Phải nhập ${reasonLabel} chứng chỉ`,
            );
        }

        if (
            dto.decision_result === 'approved' &&
            decisionChangesCertifiedScope(
                decisionType,
            )
        ) {
            const currentCertificate =
                await this.prisma.certificates.findFirst({
                    where: {
                        certificate_series_id:
                            certificateSeriesId!,
                        status: {
                            in: [
                                'active',
                                'suspended',
                            ],
                        },
                    },
                    orderBy: {
                        version_no: 'desc',
                    },
                    select: {
                        certification_scope:
                            true,
                    },
                });

            if (!currentCertificate) {
                throw new BadRequestException(
                    `${decisionType} yêu cầu certificate hiện hành để đối chiếu phạm vi`,
                );
            }

            if (
                currentCertificate.certification_scope
                    .trim() ===
                certificationScope.trim()
            ) {
                throw new BadRequestException(
                    'Phạm vi chứng nhận đề xuất phải khác phạm vi hiện hành',
                );
            }
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

        let expiryDate =
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
            isStatusDecisionType(
                decisionType,
            ) &&
            !effectiveDate
        ) {
            throw new BadRequestException(
                'Quyết định thay đổi trạng thái chứng chỉ phải có ngày hiệu lực',
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
            dto.decision_result === 'approved' &&
            decisionRequiresCertificateVersion(
                decisionType,
            ) &&
            effectiveDate &&
            !expiryDate
        ) {
            expiryDate =
                expiryDateFromValidityMonths(
                    effectiveDate,
                    Math.min(36, runtimeRules.validity_duration_months),
                );
        }

        if (
            dto.decision_result ===
            'approved' &&
            decisionRequiresCertificateVersion(
                decisionType,
            ) &&
            (!effectiveDate ||
                !expiryDate)
        ) {
            throw new BadRequestException(
                'Quyết định cấp chứng nhận phải có ngày hiệu lực; ngày hết hiệu lực sẽ được tự đề xuất từ quy tắc chương trình nếu không nhập thủ công',
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

        // P.09 maximum validity is 36 months. An explicit requested expiry
        // cannot override a shorter approved scheme configuration either.
        if (
            dto.decision_result === 'approved' &&
            decisionRequiresCertificateVersion(decisionType) &&
            effectiveDate &&
            expiryDate &&
            expiryDate.getTime() > expiryDateFromValidityMonths(
                effectiveDate,
                Math.min(36, runtimeRules.validity_duration_months),
            ).getTime()
        ) {
            throw new BadRequestException(
                'Thời hạn chứng nhận không được vượt quá 03 năm hoặc thời hạn ngắn hơn theo chương trình áp dụng',
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

            lifecycle_change_reason:
                changeReason,

            runtime_rule_snapshot:
                runtimeRuleSummary(
                    runtimeRules,
                ),

            runtime_rule_sources: {
                surveillance_interval:
                    dto.surveillance_interval_months === undefined
                        ? runtimeRules.source
                        : 'EXPLICIT',
                expiry_date:
                    dto.expiry_date
                        ? 'EXPLICIT'
                        : runtimeRules.source,
            },

            approved_site_snapshot_json:
                JSON.stringify(
                    application.sites.map((site) => ({
                        site_no:
                            site.site_no,
                        site_name:
                            site.site_name,
                        address:
                            site.address,
                        activities:
                            site.activities,
                        employee_count:
                            site.employee_count,
                        is_headquarters:
                            site.is_headquarters,
                    })),
                ),
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

        return this.runSerializableTransaction(
            async (transaction) => {
                const decision =
                    await transaction.certification_decisions.create(
                        {
                            data: {
                                technical_review_id:
                                    dto.technical_review_id,

                                project_id:
                                    project.id,

                                certificate_series_id:
                                    certificateSeriesId,

                                decision_number:
                                    dto.decision_number.trim(),

                                decision_date:
                                    decisionDate,

                                decision_type:
                                    decisionType,

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
                                    runtimeRules.surveillance_frequency_months,

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

                if (
                    dto.decision_result ===
                    'approved' &&
                    lifecycleAction ===
                    'PRESERVE_CURRENT_VERSION'
                ) {
                    const currentCertificate =
                        await transaction.certificates.findFirst({
                            where: {
                                certificate_series_id:
                                    certificateSeriesId!,
                                status:
                                    'active',
                            },
                            orderBy: {
                                version_no:
                                    'desc',
                            },
                            select: {
                                id: true,
                            },
                        });

                    if (!currentCertificate) {
                        throw new BadRequestException(
                            'MAINTAIN yêu cầu một certificate ACTIVE hiện hành trong series',
                        );
                    }
                }

                if (
                    lifecycleAction ===
                    'TRANSITION_STATUS'
                ) {
                    const currentCertificate =
                        await transaction.certificates.findFirst({
                            where: {
                                certificate_series_id:
                                    certificateSeriesId!,
                            },
                            orderBy: {
                                version_no:
                                    'desc',
                            },
                        });

                    if (!currentCertificate) {
                        throw new BadRequestException(
                            `${decisionType} yêu cầu certificate hiện hành trong series`,
                        );
                    }

                    const currentStatus =
                        normalizeCertificateStatus(
                            currentCertificate.status,
                        );
                    const targetStatus =
                        statusTargetForDecisionType(
                            decisionType,
                        );

                    if (!currentStatus || !targetStatus) {
                        throw new BadRequestException(
                            'Không xác định được chuyển trạng thái certificate',
                        );
                    }

                    try {
                        assertCertificateStatusTransition(
                            currentStatus,
                            targetStatus,
                        );
                    } catch {
                        const statusLabels = {
                            active:
                                'Đang hiệu lực',
                            suspended:
                                'Đình chỉ',
                            withdrawn:
                                'Đã thu hồi',
                            expired:
                                'Hết hiệu lực',
                            replaced:
                                'Đã được thay thế',
                        };
                        throw new BadRequestException(
                            `Không được thực hiện ${decisionType} khi chứng chỉ đang ở trạng thái ${statusLabels[currentStatus]}`,
                        );
                    }

                    if (targetStatus === 'active') {
                        if (!currentCertificate.expire_date) {
                            throw new BadRequestException(
                                'Không thể khôi phục khi chứng chỉ chưa có ngày hết hiệu lực để kiểm tra',
                            );
                        }

                        if (
                            currentCertificate.expire_date.getTime() <
                            this.getTodayInVietnam().getTime() ||
                            effectiveDate!.getTime() >
                            currentCertificate.expire_date.getTime()
                        ) {
                            throw new BadRequestException(
                                'Không thể khôi phục chứng chỉ đã hết hạn hoặc có ngày khôi phục sau ngày hết hiệu lực',
                            );
                        }
                    }

                    if (
                        dto.decision_result ===
                        'approved'
                    ) {
                        const guardedUpdate =
                            await transaction.certificates.updateMany({
                                where: {
                                    id:
                                        currentCertificate.id,
                                    status:
                                        currentStatus,
                                },
                                data: {
                                    status:
                                        targetStatus,
                                    updated_at:
                                        new Date(),
                                },
                            });

                        if (guardedUpdate.count !== 1) {
                            throw new ConflictException(
                                'Trạng thái chứng chỉ đã thay đổi bởi một thao tác khác; vui lòng tải lại hồ sơ',
                            );
                        }

                        await transaction
                            .certificate_status_histories
                            .create({
                                data: {
                                    certificate_id:
                                        currentCertificate.id,
                                    certification_decision_id:
                                        decision.id,
                                    from_status:
                                        currentStatus,
                                    to_status:
                                        targetStatus,
                                    reason:
                                        changeReason!,
                                    effective_date:
                                        effectiveDate!,
                                    changed_by:
                                        createdBy ??
                                        null,
                                },
                            });
                    }
                }

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

                await this.workItems?.completeWorkItem(
                    {
                        sourceKey:
                            `certification-decision:${dto.technical_review_id}`,
                    },
                    createdBy,
                    transaction,
                );

                if (
                    dto.decision_result === 'approved' &&
                    decisionRequiresCertificateVersion(
                        decisionType,
                    )
                ) {
                    await this.workItems?.openWorkItem(
                        {
                            sourceKey:
                                `certificate-issue:${decision.id}`,
                            workType:
                                'CERTIFICATE_ISSUE',
                            actionCode:
                                WORK_ITEM_ACTIONS.CERTIFICATE_ISSUE,
                            title:
                                `Phát hành chứng chỉ theo ${decision.decision_number}`,
                            entityType:
                                'certification_decision',
                            entityId:
                                decision.id,
                            projectId:
                                project.id,
                            auditEventId:
                                review.reports.audit_plans.audit_event_id,
                            auditPlanId:
                                review.reports.audit_plan_id,
                            assignedRole:
                                'DECISION_MAKER',
                            priority:
                                'HIGH',
                            destinationPath:
                                `/projects/${project.id}?workspace=certificate-issue&decision_id=${decision.id}&audit_plan_id=${review.reports.audit_plan_id}`,
                            context: {
                                technical_review_id:
                                    dto.technical_review_id,
                                decision_number:
                                    decision.decision_number,
                                decision_type:
                                    decisionType,
                            },
                        },
                        transaction,
                    );
                }

                return this.normalizeDecision(
                    decision,
                );
            },
        );
    }
}
