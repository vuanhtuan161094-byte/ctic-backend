import {
    BadRequestException,
    ConflictException,
    GoneException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { UpdateCertificateStatusDto } from './dto/update-certificate-status.dto';

import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';

import { getDeploymentConfig } from '../common/deployment-config';
import { DocumentFilesService } from '../document-files/document-files.service';
import { WorkItemsService } from '../work-items/work-items.service';
import { expiryDateFromValidityMonths } from '../master-data-configuration/scheme-runtime-rules';

import { CreateCertificateDto } from './dto/create-certificate.dto';
import {
    allowedStatusDecisionTypesForCertificateStatus,
    assertCertificateStatusTransition,
    canReplaceCertificateStatus,
    certificateActionForDecisionType,
    classifyAuditLifecycle,
    decisionRequiresChangeReason,
    decisionRequiresCertificateVersion,
    normalizeCertificateStatus,
    normalizeDecisionType,
} from './certificate-lifecycle';

@Injectable()
export class CertificatesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly documentFilesService: DocumentFilesService,
        @Optional()
        private readonly workItems?: WorkItemsService,
    ) { }
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
                parts.map(
                    (part) => [
                        part.type,
                        part.value,
                    ],
                ),
            );

        return new Date(
            `${values.year}-${values.month}-${values.day}` +
            'T00:00:00.000Z',
        );
    }

    async expireDueCertificates() {
        const effectiveDate =
            this.getTodayInVietnam();

        return this.prisma.$transaction(
            async (transaction) => {
                const dueCertificates =
                    await transaction.certificates.findMany({
                        where: {
                            status: {
                                in: [
                                    'active',
                                    'suspended',
                                ],
                            },

                            expire_date: {
                                lt:
                                    effectiveDate,
                            },
                        },

                        select: {
                            id: true,
                            cert_number: true,
                            status: true,
                            expire_date: true,
                        },
                    });

                if (
                    dueCertificates.length === 0
                ) {
                    return {
                        processed_date:
                            effectiveDate,

                        expired_count:
                            0,

                        certificates:
                            [],
                    };
                }

                await transaction
                    .certificate_status_histories
                    .createMany({
                        data:
                            dueCertificates.map(
                                (certificate) => ({
                                    certificate_id:
                                        certificate.id,

                                    from_status:
                                        certificate.status ??
                                        'active',

                                    to_status:
                                        'expired',

                                    reason:
                                        'Tự động hết hạn theo ngày hết hiệu lực của giấy chứng nhận.',

                                    effective_date:
                                        effectiveDate,

                                    changed_by:
                                        null,
                                }),
                            ),
                    });

                await transaction.certificates.updateMany({
                    where: {
                        id: {
                            in:
                                dueCertificates.map(
                                    (certificate) =>
                                        certificate.id,
                                ),
                        },

                        status: {
                            in: [
                                'active',
                                'suspended',
                            ],
                        },
                    },

                    data: {
                        status:
                            'expired',

                        updated_at:
                            new Date(),
                    },
                });

                return {
                    processed_date:
                        effectiveDate,

                    expired_count:
                        dueCertificates.length,

                    certificates:
                        dueCertificates.map(
                            (certificate) => ({
                                id:
                                    certificate.id,

                                cert_number:
                                    certificate.cert_number,

                                previous_status:
                                    certificate.status,

                                status:
                                    'expired',

                                expire_date:
                                    certificate.expire_date,
                            }),
                        ),
                };
            },
        );
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

                    certification_decision: {
                        select: {
                            id: true,
                            project_id: true,
                            certificate_series_id: true,
                            decision_number: true,
                            decision_date: true,
                            decision_type: true,
                            decision_result: true,
                            organization_name: true,
                            organization_address: true,
                            management_system: true,
                            standard_name: true,
                            certification_scope: true,
                            effective_date: true,
                            expiry_date: true,
                            status: true,
                        },
                    },

                    audit_result_notification: {
                        select: {
                            id: true,
                            notification_number: true,
                            notification_date: true,
                            audit_type: true,
                            notification_result: true,
                            has_certification_changes: true,
                            status: true,
                            sent_at: true,
                        },
                    },

                    reports: {
                        select: {
                            id: true,
                            report_code: true,
                            audit_plan_id: true,
                            status: true,
                        },
                    },
                },
            },

            certification_decision: {
                select: {
                    id: true,
                    decision_number: true,
                    decision_type: true,
                    decision_result: true,
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

            supersedes_certificate: {
                select: {
                    id: true,
                    cert_number: true,
                    version_no: true,
                    verification_code: true,
                },
            },
        };
    }

    private parseDate(
        value: string | undefined,
        fieldName: string,
    ): Date | null {
        if (!value) {
            return null;
        }

        const parsedDate = new Date(value);

        if (
            Number.isNaN(
                parsedDate.getTime(),
            )
        ) {
            throw new BadRequestException(
                `${fieldName} không hợp lệ`,
            );
        }

        return parsedDate;
    }

    private parseSiteSnapshot(
        value: string | null,
    ): unknown[] {
        if (!value) return [];

        try {
            const parsed: unknown =
                JSON.parse(value);

            return Array.isArray(parsed)
                ? parsed
                : [];
        } catch {
            return [];
        }
    }

    private decisionChangeReason(
        formData: unknown,
    ): string | null {
        if (!formData) return null;

        try {
            const parsed = typeof formData === 'string'
                ? JSON.parse(formData) as unknown
                : formData;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return null;
            }

            const value = (parsed as Record<string, unknown>)
                .lifecycle_change_reason;
            return typeof value === 'string' && value.trim()
                ? value.trim()
                : null;
        } catch {
            return null;
        }
    }

    private decisionSiteSnapshot(
        formData: unknown,
    ): string | null {
        if (!formData) return null;

        try {
            const parsed = typeof formData === 'string'
                ? JSON.parse(formData) as unknown
                : formData;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return null;
            }

            const value = (parsed as Record<string, unknown>)
                .approved_site_snapshot_json;
            if (typeof value !== 'string') return null;

            const sites: unknown = JSON.parse(value);
            return Array.isArray(sites)
                ? value
                : null;
        } catch {
            return null;
        }
    }

    private getPublicBaseUrl() {
        return getDeploymentConfig()
            .publicBaseUrl;
    }

    private isExpired(
        expireDate: Date | null,
    ) {
        if (!expireDate) {
            return false;
        }

        return expireDate.getTime() <
            new Date().getTime();
    }

    private ensureCertificateUsable(
        certificate: {
            status: string | null;
            expire_date: Date | null;
        },
    ) {
        if (
            certificate.status !==
            'active'
        ) {
            throw new GoneException(
                'Giấy chứng nhận không còn hiệu lực',
            );
        }

        if (
            this.isExpired(
                certificate.expire_date,
            )
        ) {
            throw new GoneException(
                'Giấy chứng nhận đã hết hạn',
            );
        }
    }

    private buildCertificateNumberProposal(
        projectCode: string,
        issueDate?: Date | null,
    ) {
        const normalized = projectCode.trim();
        const year = (issueDate ?? this.getTodayInVietnam()).getUTCFullYear();
        const sequence = normalized.match(/(\d{3,})$/)?.[1];
        const candidate = sequence
            ? `CERT-${year}-${sequence}`
            : `CERT-${year}-${normalized}`;

        return candidate.slice(0, 50);
    }

    async getPlanIssuanceWorkspace(planId: string) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id: planId },
            select: {
                id: true,
                plan_code: true,
                audit_type: true,
                project_id: true,
                planned_start_date: true,
                planned_end_date: true,
                certification_projects: {
                    select: {
                        id: true,
                        project_code: true,
                        standard_name: true,
                        certification_applications: {
                            select: {
                                sites: {
                                    orderBy: {
                                        site_no:
                                            'asc',
                                    },
                                    select: {
                                        site_no: true,
                                        site_name: true,
                                        address: true,
                                        activities: true,
                                        employee_count: true,
                                        is_headquarters: true,
                                    },
                                },
                            },
                        },
                    },
                },
                reports: {
                    orderBy: { version_no: 'desc' },
                    select: {
                        id: true,
                        report_code: true,
                        version_no: true,
                        status: true,
                        technical_reviews: {
                            orderBy: { created_at: 'desc' },
                            select: {
                                id: true,
                                status: true,
                                completed_at: true,
                                certification_decision: true,
                                audit_result_notification: true,
                                certificates: true,
                            },
                        },
                    },
                },
            },
        });

        if (!plan) {
            throw new NotFoundException('Không tìm thấy kế hoạch đánh giá');
        }

        const report = plan.reports.find((item) => item.technical_reviews.length > 0)
            ?? plan.reports[0]
            ?? null;
        const technicalReview = report?.technical_reviews.find((item) => item.status === 'completed')
            ?? report?.technical_reviews[0]
            ?? null;
        const decision = technicalReview?.certification_decision ?? null;
        const notification = technicalReview?.audit_result_notification ?? null;
        const decisionType = decision
            ? normalizeDecisionType(decision.decision_type)
            : null;
        const lifecycleAction = decisionType
            ? certificateActionForDecisionType(decisionType)
            : null;
        const issuedCertificate =
            technicalReview?.certificates ??
            null;
        const certificateSeriesId =
            decision?.certificate_series_id ??
            issuedCertificate?.certificate_series_id ??
            null;
        const certificateSeries =
            await this.prisma.certificate_series.findFirst({
                where: certificateSeriesId
                    ? {
                        id:
                            certificateSeriesId,
                    }
                    : {
                        project_id:
                            plan.project_id,
                        status:
                            'active',
                    },
                orderBy: certificateSeriesId
                    ? undefined
                    : {
                        created_at:
                            'desc',
                    },
                include: {
                    certificates: {
                        orderBy: { version_no: 'desc' },
                        include: {
                            certification_decision: {
                                select: {
                                    id: true,
                                    decision_number: true,
                                    decision_date: true,
                                    decision_type: true,
                                    decision_result: true,
                                },
                            },
                        },
                    },
                },
            });
        const seriesVersions = certificateSeries?.certificates ?? [];
        const currentCertificate =
            seriesVersions.find((item) =>
                [
                    'active',
                    'suspended',
                ].includes(
                    item.status ??
                    '',
                ),
            ) ??
            seriesVersions[0] ??
            issuedCertificate ??
            null;
        const workspaceCertificate = issuedCertificate ?? currentCertificate;

        const eligibilityErrors: string[] = [];
        if (!report) {
            eligibilityErrors.push('Chưa có báo cáo đánh giá Giai đoạn 2.');
        }
        if (!technicalReview) {
            eligibilityErrors.push('Chưa có hồ sơ thẩm xét kỹ thuật.');
        } else if (technicalReview.status !== 'completed') {
            eligibilityErrors.push('Thẩm xét kỹ thuật chưa hoàn thành.');
        }
        if (!decision) {
            eligibilityErrors.push('Chưa ban hành Quyết định chứng nhận F.13.');
        } else if (decision.status !== 'issued' || decision.decision_result !== 'approved') {
            eligibilityErrors.push('Quyết định chứng nhận chưa phê duyệt cấp chứng nhận.');
        }
        if (!notification) {
            eligibilityErrors.push('Chưa lập Thông báo kết quả F.12.');
        } else if (notification.status !== 'sent') {
            eligibilityErrors.push('Thông báo kết quả chưa được ghi nhận đã gửi khách hàng.');
        } else if (!['certification_granted', 'certification_maintained'].includes(notification.notification_result)) {
            eligibilityErrors.push('Kết quả thông báo không cho phép cấp giấy chứng nhận.');
        }
        if (
            lifecycleAction === 'CREATE_NEXT_VERSION' &&
            !canReplaceCertificateStatus(
                currentCertificate?.status,
            )
        ) {
            eligibilityErrors.push(
                'Certificate hiện hành không ở trạng thái cho phép phát hành phiên bản thay thế.',
            );
        }

        const versionIds = seriesVersions.map((item) => item.id);
        const seriesDocuments = versionIds.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'certificate',
                    entity_id: { in: versionIds },
                },
                orderBy: [
                    { entity_id: 'asc' },
                    { is_current: 'desc' },
                    { version_no: 'desc' },
                    { created_at: 'desc' },
                ],
            })
            : [];
        const documentsByCertificate = new Map<string, typeof seriesDocuments>();
        for (const document of seriesDocuments) {
            if (!document.entity_id) continue;
            const documents = documentsByCertificate.get(document.entity_id) ?? [];
            documents.push(document);
            documentsByCertificate.set(document.entity_id, documents);
        }

        const documents = workspaceCertificate
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'certificate',
                    entity_id: workspaceCertificate.id,
                },
                orderBy: [
                    { is_current: 'desc' },
                    { version_no: 'desc' },
                    { created_at: 'desc' },
                ],
            })
            : [];

        const history = workspaceCertificate
            ? await this.prisma.certificate_status_histories.findMany({
                where: { certificate_id: workspaceCertificate.id },
                orderBy: { created_at: 'desc' },
                include: {
                    certification_decision: {
                        select: {
                            id: true,
                            decision_number: true,
                            decision_type: true,
                            decision_result: true,
                        },
                    },
                    changed_by_user: {
                        select: {
                            id: true,
                            username: true,
                            full_name: true,
                        },
                    },
                },
            })
            : [];

        const issueDate = decision?.effective_date ?? decision?.decision_date ?? this.getTodayInVietnam();
        const expiryDate = decision?.expiry_date ?? null;
        const proposedCertificateNumber =
            this.buildCertificateNumberProposal(
                plan.certification_projects.project_code,
                issueDate,
            );
        const proposedSiteSnapshot = decision
            ? this.decisionSiteSnapshot(
                decision.form_data,
            )
            : null;
        const fallbackSiteSnapshot = JSON.stringify(
            plan.certification_projects
                .certification_applications
                .sites,
        );
        const allowedStatusActions =
            classifyAuditLifecycle(
                plan.audit_type,
            ) === 'SURVEILLANCE' &&
                !decision
                ? allowedStatusDecisionTypesForCertificateStatus(
                    currentCertificate?.status,
                )
                : [];

        return {
            plan: {
                id: plan.id,
                plan_code: plan.plan_code,
                audit_type: plan.audit_type,
                project_id: plan.project_id,
                project_code: plan.certification_projects.project_code,
                standard_name: plan.certification_projects.standard_name,
                planned_start_date: plan.planned_start_date,
                planned_end_date: plan.planned_end_date,
            },
            report: report ? {
                id: report.id,
                report_code: report.report_code,
                version_no: report.version_no,
                status: report.status,
            } : null,
            technical_review: technicalReview ? {
                id: technicalReview.id,
                status: technicalReview.status,
                completed_at: technicalReview.completed_at,
            } : null,
            decision: decision ? {
                ...decision,
                change_reason:
                    this.decisionChangeReason(
                        decision.form_data,
                    ),
            } : null,
            notification,
            certificate: issuedCertificate,
            current_certificate: currentCertificate,
            current_status:
                currentCertificate?.status ??
                null,
            allowed_status_actions:
                allowedStatusActions,
            current_series: certificateSeries ? {
                id: certificateSeries.id,
                series_code: certificateSeries.series_code,
                status: certificateSeries.status,
            } : null,
            version_timeline: seriesVersions.map((version) => ({
                ...version,
                documents:
                    documentsByCertificate.get(version.id) ?? [],
                official_pdf_available:
                    (documentsByCertificate.get(version.id) ?? [])
                        .some((item) =>
                            item.document_type === 'certificate_pdf',
                        ),
                is_current:
                    currentCertificate?.id === version.id,
            })),
            documents,
            history,
            status_history:
                history,
            can_issue_status_decision:
                Boolean(technicalReview) &&
                technicalReview.status === 'completed' &&
                !decision &&
                allowedStatusActions.length > 0,
            lifecycle: decisionType
                ? {
                    decision_type:
                        decisionType,
                    certificate_action:
                        lifecycleAction,
                    requires_certificate_version:
                        decisionRequiresCertificateVersion(
                            decisionType,
                        ),
                    preserves_current_certificate:
                        lifecycleAction ===
                        'PRESERVE_CURRENT_VERSION',
                    status_action:
                        lifecycleAction ===
                        'TRANSITION_STATUS',
                }
                : null,
            requires_certificate_issuance:
                Boolean(decisionType) &&
                decision?.decision_result === 'approved' &&
                decisionRequiresCertificateVersion(
                    decisionType!,
                ),
            maintains_current_certificate:
                Boolean(decisionType) &&
                decision?.decision_result === 'approved' &&
                lifecycleAction === 'PRESERVE_CURRENT_VERSION',
            can_issue_certificate: Boolean(technicalReview)
                && !issuedCertificate
                && Boolean(decisionType)
                && decisionRequiresCertificateVersion(
                    decisionType!,
                )
                && eligibilityErrors.length === 0,
            eligibility_errors: eligibilityErrors,
            issuance_preview: {
                previous_version: currentCertificate ? {
                    id: currentCertificate.id,
                    version_no: currentCertificate.version_no,
                    cert_number: currentCertificate.cert_number,
                    expire_date: currentCertificate.expire_date,
                    status: currentCertificate.status,
                } : null,
                proposed_version: decision ? {
                    version_no:
                        currentCertificate
                            ? currentCertificate.version_no + 1
                            : 1,
                    cert_number:
                        proposedCertificateNumber,
                    organization_name:
                        decision.organization_name,
                    organization_address:
                        decision.organization_address,
                    management_system:
                        decision.management_system,
                    standard_name:
                        decision.standard_name,
                    certification_scope:
                        decision.certification_scope,
                    site_snapshot_json:
                        proposedSiteSnapshot ??
                        fallbackSiteSnapshot,
                    issue_date:
                        issueDate,
                    expire_date:
                        expiryDate,
                } : null,
            },
            defaults: {
                cert_number:
                    proposedCertificateNumber,
                issue_date: issueDate,
                expire_date: expiryDate,
                change_reason: decision
                    ? this.decisionChangeReason(
                        decision.form_data,
                    )
                    : null,
            },
        };
    }

    async findAll() {
        return this.prisma.certificates.findMany(
            {
                include:
                    this.getDetailInclude(),

                orderBy: {
                    created_at: 'desc',
                },
            },
        );
    }

    async findOne(id: string) {
        const certificate =
            await this.prisma.certificates.findUnique(
                {
                    where: {
                        id,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!certificate) {
            throw new NotFoundException(
                'Không tìm thấy giấy chứng nhận',
            );
        }

        return certificate;
    }

    async findByTechnicalReview(
        technicalReviewId: string,
    ) {
        const certificate =
            await this.prisma.certificates.findUnique(
                {
                    where: {
                        technical_review_id:
                            technicalReviewId,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!certificate) {
            throw new NotFoundException(
                'Hồ sơ thẩm xét chưa được cấp giấy chứng nhận',
            );
        }

        return certificate;
    }

    async create(
        dto: CreateCertificateDto,
        changedBy?: string,
    ) {
        const existingCertificate =
            await this.prisma.certificates.findFirst(
                {
                    where: {
                        technical_review_id:
                            dto.technical_review_id,
                    },
                },
            );

        if (existingCertificate) {
            throw new ConflictException(
                'Hồ sơ thẩm xét đã được dùng để tạo một phiên bản chứng chỉ',
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
                        certification_decision:
                            true,

                        audit_result_notification:
                            true,

                        reports: {
                            include: {
                                audit_plans: {
                                    include: {
                                        certification_projects:
                                        {
                                            include: {
                                                certification_applications:
                                                {
                                                    include: {
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

        const decision =
            review.certification_decision;

        if (!decision) {
            throw new BadRequestException(
                'Chưa có quyết định chứng nhận',
            );
        }

        if (
            decision.status !== 'issued' ||
            decision.decision_result !==
            'approved'
        ) {
            throw new BadRequestException(
                'Quyết định chưa phê duyệt cấp chứng nhận',
            );
        }

        const decisionType =
            normalizeDecisionType(
                decision.decision_type,
            );

        if (!decisionType) {
            throw new BadRequestException(
                'Quyết định chưa có loại lifecycle hợp lệ',
            );
        }

        const lifecycleAction =
            certificateActionForDecisionType(
                decisionType,
            );
        const changeReason =
            dto.change_reason?.trim() ||
            this.decisionChangeReason(
                decision.form_data,
            );

        if (
            lifecycleAction ===
            'PRESERVE_CURRENT_VERSION'
        ) {
            throw new BadRequestException(
                'Quyết định MAINTAIN giữ nguyên certificate hiện hành và không tạo phiên bản mới',
            );
        }

        if (
            !decisionRequiresCertificateVersion(
                decisionType,
            )
        ) {
            throw new BadRequestException(
                `Quyết định ${decisionType} không tạo phiên bản certificate`,
            );
        }

        if (
            decisionRequiresChangeReason(decisionType) &&
            !changeReason
        ) {
            throw new BadRequestException(
                'Phải có lý do thay đổi trước khi phát hành phiên bản chứng chỉ mới',
            );
        }

        const notification =
            review.audit_result_notification;

        if (!notification) {
            throw new BadRequestException(
                'Chưa lập thông báo kết quả đánh giá',
            );
        }

        if (
            notification.status !== 'sent'
        ) {
            throw new BadRequestException(
                'Thông báo kết quả chưa được gửi cho khách hàng',
            );
        }

        const allowedResults = [
            'certification_granted',
            'certification_maintained',
        ];

        if (
            !allowedResults.includes(
                notification.notification_result,
            )
        ) {
            throw new BadRequestException(
                'Kết quả thông báo không cho phép cấp chứng chỉ',
            );
        }

        const issueDate =
            this.parseDate(
                dto.issue_date,
                'Ngày cấp chứng chỉ',
            ) ||
            decision.effective_date;

        const expireDate =
            this.parseDate(
                dto.expire_date,
                'Ngày hết hạn chứng chỉ',
            ) ||
            decision.expiry_date;

        if (!issueDate) {
            throw new BadRequestException(
                'Thiếu ngày cấp chứng chỉ',
            );
        }

        if (!expireDate) {
            throw new BadRequestException(
                'Thiếu ngày hết hạn chứng chỉ',
            );
        }

        if (
            expireDate <= issueDate
        ) {
            throw new BadRequestException(
                'Ngày hết hạn phải sau ngày cấp chứng chỉ',
            );
        }

        // Issuance must not extend the lifespan beyond the approved decision
        // or override the maximum three-year validity required by P.09.
        if (expireDate.getTime() >
            expiryDateFromValidityMonths(issueDate, 36).getTime()) {
            throw new BadRequestException(
                'Thời hạn chứng chỉ không được vượt quá 03 năm',
            );
        }
        if (decision.expiry_date &&
            expireDate.getTime() !== decision.expiry_date.getTime()) {
            throw new BadRequestException(
                'Ngày hết hạn chứng chỉ phải đúng ngày đã phê duyệt trong quyết định F.13',
            );
        }

        const project =
            review.reports.audit_plans
                .certification_projects;

        const siteSnapshot =
            this.decisionSiteSnapshot(
                decision.form_data,
            ) ??
            JSON.stringify(
                project
                    .certification_applications
                    .sites.map((site) => ({
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
            );

        return this.prisma.$transaction(
            async (transaction) => {
                let certificateSeriesId =
                    decision.certificate_series_id;

                if (
                    lifecycleAction ===
                    'CREATE_FIRST_VERSION'
                ) {
                    if (certificateSeriesId) {
                        throw new BadRequestException(
                            'GRANT đã gắn Certificate Series; không thể tạo thêm series lần đầu',
                        );
                    }

                    const seriesCode =
                        `SER-${project.project_code.slice(0, 32)}-` +
                        randomUUID()
                            .replaceAll('-', '')
                            .slice(0, 12);

                    const series =
                        await transaction.certificate_series.create({
                            data: {
                                project_id:
                                    project.id,
                                series_code:
                                    seriesCode,
                                status:
                                    'active',
                            },
                        });

                    certificateSeriesId =
                        series.id;

                    await transaction
                        .certification_decisions
                        .update({
                            where: {
                                id:
                                    decision.id,
                            },
                            data: {
                                certificate_series_id:
                                    certificateSeriesId,
                            },
                        });
                }

                if (!certificateSeriesId) {
                    throw new BadRequestException(
                        `Quyết định ${decisionType} chưa xác định Certificate Series`,
                    );
                }

                await transaction.$queryRaw`
                    SELECT id
                    FROM dbo.certificate_series WITH (UPDLOCK, HOLDLOCK)
                    WHERE id = ${certificateSeriesId}
                `;

                const previousCertificate =
                    await transaction.certificates.findFirst({
                        where: {
                            certificate_series_id:
                                certificateSeriesId,
                        },
                        orderBy: {
                            version_no:
                                'desc',
                        },
                    });

                if (
                    lifecycleAction ===
                    'CREATE_FIRST_VERSION' &&
                    previousCertificate
                ) {
                    throw new ConflictException(
                        'Certificate Series mới đã có version; dừng để tránh cấp trùng',
                    );
                }

                if (
                    lifecycleAction ===
                    'CREATE_NEXT_VERSION' &&
                    !previousCertificate
                ) {
                    throw new BadRequestException(
                        `${decisionType} yêu cầu certificate version hiện hữu`,
                    );
                }

                if (previousCertificate) {
                    const previousStatus =
                        normalizeCertificateStatus(
                            previousCertificate.status,
                        );

                    if (!previousStatus) {
                        throw new BadRequestException(
                            'Certificate version hiện hành có trạng thái không hợp lệ',
                        );
                    }

                    try {
                        assertCertificateStatusTransition(
                            previousStatus,
                            'replaced',
                        );
                    } catch {
                        throw new BadRequestException(
                            `Không thể thay thế certificate ở trạng thái ${previousStatus}`,
                        );
                    }
                }

                const versionNo =
                    previousCertificate
                        ? previousCertificate.version_no +
                        1
                        : 1;

                const certificate =
                    await transaction.certificates.create({
                        data: {
                            technical_review_id:
                                dto.technical_review_id,

                            certification_decision_id:
                                decision.id,

                            certificate_series_id:
                                certificateSeriesId,

                            supersedes_certificate_id:
                                previousCertificate?.id ??
                                null,

                            version_no:
                                versionNo,

                            cert_number:
                                dto.cert_number.trim(),

                            issue_date:
                                issueDate,

                            expire_date:
                                expireDate,

                            status:
                                'active',

                            change_reason:
                                changeReason ||
                                (decisionType === 'GRANT'
                                    ? 'Cấp chứng nhận lần đầu.'
                                    : `Tạo phiên bản theo quyết định ${decisionType}.`),

                            organization_name:
                                decision.organization_name,

                            organization_address:
                                decision.organization_address,

                            management_system:
                                decision.management_system,

                            standard_name:
                                decision.standard_name,

                            certification_scope:
                                decision.certification_scope,

                            site_snapshot_json:
                                siteSnapshot,
                        },

                        include:
                            this.getDetailInclude(),
                    });

                if (previousCertificate) {
                    await transaction.certificates.update({
                        where: {
                            id:
                                previousCertificate.id,
                        },

                        data: {
                            status:
                                'replaced',

                            updated_at:
                                new Date(),
                        },
                    });

                    await transaction
                        .certificate_status_histories
                        .createMany({
                            data: [{
                                certificate_id:
                                    previousCertificate.id,
                                from_status:
                                    previousCertificate.status ??
                                    'active',
                                to_status:
                                    'replaced',
                                reason:
                                    `Được thay thế bởi version ${versionNo} của cùng Certificate Series.`,
                                effective_date:
                                    issueDate,
                                changed_by:
                                    changedBy ??
                                    null,
                            }],
                        });
                }

                await transaction.certification_projects.update({
                    where: {
                        id:
                            project.id,
                    },

                    data: {
                        status:
                            'certificate_issued',
                    },
                });

                await this.workItems?.completeWorkItem(
                    {
                        sourceKey:
                            `certificate-issue:${decision.id}`,
                    },
                    changedBy,
                    transaction,
                );

                return {
                    ...certificate,

                    replaced_certificates:
                        previousCertificate
                            ? [
                                {
                                    id:
                                        previousCertificate.id,
                                    cert_number:
                                        previousCertificate.cert_number,
                                    version_no:
                                        previousCertificate.version_no,
                                },
                            ]
                            : [],
                };
            },
            {
                isolationLevel:
                    Prisma
                        .TransactionIsolationLevel
                        .Serializable,
            },
        );
    }
    async updateStatus(
        id: string,
        dto: UpdateCertificateStatusDto,
        changedBy?: string,
    ) {
        const certificate =
            await this.prisma.certificates.findUnique({
                where: {
                    id,
                },
            });

        if (!certificate) {
            throw new NotFoundException(
                'Không tìm thấy giấy chứng nhận',
            );
        }

        const currentStatus =
            normalizeCertificateStatus(
                certificate.status ??
                'active',
            );

        const targetStatus =
            normalizeCertificateStatus(
                dto.status,
            );

        if (!currentStatus || !targetStatus) {
            throw new BadRequestException(
                'Trạng thái giấy chứng nhận không hợp lệ',
            );
        }

        if (targetStatus !== 'expired') {
            throw new BadRequestException(
                'Đình chỉ, khôi phục và thu hồi chỉ được thực hiện bằng quyết định lifecycle đã phê duyệt trong hồ sơ chứng nhận',
            );
        }

        if (currentStatus === targetStatus) {
            throw new BadRequestException(
                `Giấy chứng nhận đang ở trạng thái ${targetStatus}`,
            );
        }

        try {
            assertCertificateStatusTransition(
                currentStatus,
                targetStatus,
            );
        } catch {
            throw new BadRequestException(
                `Không được chuyển trạng thái từ ${currentStatus} sang ${targetStatus}`,
            );
        }

        const effectiveDate =
            this.parseDate(
                dto.effective_date,
                'Ngày hiệu lực thay đổi trạng thái',
            ) ?? new Date();

        return this.prisma.$transaction(
            async (transaction) => {
                await transaction
                    .certificate_status_histories
                    .create({
                        data: {
                            certificate_id:
                                certificate.id,

                            from_status:
                                currentStatus,

                            to_status:
                                targetStatus,

                            reason:
                                dto.reason.trim(),

                            effective_date:
                                effectiveDate,

                            changed_by:
                                changedBy ?? null,
                        },
                    });
                return transaction.certificates.update({
                    where: {
                        id,
                    },

                    data: {
                        status:
                            targetStatus,

                        updated_at:
                            new Date(),
                    },

                    include: {
                        ...this.getDetailInclude(),

                        status_histories: {
                            orderBy: {
                                created_at:
                                    'desc',
                            },

                            include: {
                                changed_by_user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        full_name: true,
                                    },
                                },
                            },
                        },
                    },
                });
            },
        );
    }

    async getStatusHistory(
        id: string,
    ) {
        const certificate =
            await this.prisma.certificates.findUnique({
                where: {
                    id,
                },

                select: {
                    id: true,
                    cert_number: true,
                    status: true,
                },
            });

        if (!certificate) {
            throw new NotFoundException(
                'Không tìm thấy giấy chứng nhận',
            );
        }

        const history =
            await this.prisma
                .certificate_status_histories
                .findMany({
                    where: {
                        certificate_id:
                            id,
                    },

                    orderBy: {
                        created_at:
                            'desc',
                    },

                    include: {
                        certification_decision: {
                            select: {
                                id: true,
                                decision_number: true,
                                decision_type: true,
                                decision_result: true,
                            },
                        },
                        changed_by_user: {
                            select: {
                                id: true,
                                username: true,
                                full_name: true,
                            },
                        },
                    },
                });

        return {
            certificate,
            history,
        };
    }
    async findPublicCertificate(
        verificationCode: string,
    ) {
        const certificate =
            await this.prisma.certificates.findUnique(
                {
                    where: {
                        verification_code:
                            verificationCode,
                    },

                    include: {
                        certificate_series: {
                            select: {
                                certificates: {
                                    select: {
                                        id:
                                            true,
                                        version_no:
                                            true,
                                        status:
                                            true,
                                    },
                                    orderBy: {
                                        version_no:
                                            'desc',
                                    },
                                },
                            },
                        },
                    },
                },
            );

        if (!certificate) {
            throw new NotFoundException(
                'Không tìm thấy giấy chứng nhận',
            );
        }

        const expired =
            this.isExpired(
                certificate.expire_date,
            );

        const currentVersion =
            certificate
                .certificate_series
                .certificates[0];

        const statusLabels:
            Record<string, string> = {
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

        return {
            cert_number:
                certificate.cert_number,

            issue_date:
                certificate.issue_date,

            expire_date:
                certificate.expire_date,

            status:
                certificate.status,

            status_label:
                statusLabels[
                certificate.status ??
                ''
                ] ??
                'Không xác định',

            is_valid:
                certificate.status ===
                'active' &&
                !expired,

            version_no:
                certificate.version_no,

            is_current_version:
                currentVersion?.id ===
                certificate.id,

            organization_name:
                certificate.organization_name,

            organization_address:
                certificate.organization_address,

            management_system:
                certificate.management_system,

            standard_name:
                certificate.standard_name,

            certification_scope:
                certificate.certification_scope,

            sites:
                this.parseSiteSnapshot(
                    certificate.site_snapshot_json,
                ),
        };
    }

    async getPublicPdf(
        verificationCode: string,
    ) {
        const certificate =
            await this.prisma.certificates.findUnique(
                {
                    where: {
                        verification_code:
                            verificationCode,
                    },
                },
            );

        if (!certificate) {
            throw new NotFoundException(
                'Không tìm thấy giấy chứng nhận',
            );
        }

        this.ensureCertificateUsable(
            certificate,
        );

        const documentFile =
            await this.prisma.documentFile.findFirst(
                {
                    where: {
                        entity_type:
                            'certificate',

                        entity_id:
                            certificate.id,

                        document_type:
                            'certificate_pdf',

                        mime_type:
                            'application/pdf',

                        is_current:
                            true,
                    },

                    orderBy: {
                        version_no:
                            'desc',
                    },
                },
            );

        if (!documentFile) {
            throw new NotFoundException(
                'Chưa tải lên file PDF của giấy chứng nhận',
            );
        }

        const download =
            await this.documentFilesService.getDownload(
                documentFile.id,
            );

        return {
            certificate,
            documentFile: download.documentFile,
            absolutePath: download.absolutePath,
        };
    }

    async generateQrCode(
        verificationCode: string,
    ) {
        const certificate =
            await this.prisma.certificates.findUnique(
                {
                    where: {
                        verification_code:
                            verificationCode,
                    },
                },
            );

        if (!certificate) {
            throw new NotFoundException(
                'Không tìm thấy giấy chứng nhận',
            );
        }

        const targetUrl =
            `${this.getPublicBaseUrl()}` +
            `/public/certificates/` +
            `${certificate.verification_code}`;

        const qrCode =
            await QRCode.toBuffer(
                targetUrl,
                {
                    type:
                        'png',

                    width:
                        1000,

                    margin:
                        2,

                    errorCorrectionLevel:
                        'H',

                    color: {
                        dark:
                            '#000000',

                        light:
                            '#FFFFFF',
                    },
                },
            );

        return {
            qrCode,
            targetUrl,
            certNumber:
                certificate.cert_number,
        };
    }
}
