import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'crypto';
import {
    existsSync,
    mkdirSync,
    unlinkSync,
} from 'fs';
import { join } from 'path';

import { DocumentFilesService } from '../document-files/document-files.service';
import { getPlatformBranding } from '../common/platform-branding';
import { getStorageConfig } from '../common/storage-config';
import { convertDocxToPdf } from '../common/document-conversion';
import {
    certificateActionForDecisionType,
    classifyAuditLifecycle,
    decisionPreservesCurrentCertificate,
    decisionRequiresCertificateVersion,
    normalizeDecisionType,
    allowedStatusDecisionTypesForCertificateStatus,
    phase14WorkspaceDecisionTypes,
} from '../certificates/certificate-lifecycle';

import { PrismaService } from '../prisma/prisma.service';
import {
    expiryDateFromValidityMonths,
    resolveSchemeRuntimeRules,
    runtimeRuleSummary,
} from '../master-data-configuration/scheme-runtime-rules';

type DocumentFormat = 'docx' | 'pdf';
type JsonObject = Record<string, unknown>;

type OoxmlTemplateEngine = {
    renderDocxTemplate(input: {
        templatePath: string;
        outputPath: string;
        data: Record<string, unknown>;
    }): string;
};

function loadOoxmlTemplateEngine(): OoxmlTemplateEngine {
    const filename = 'ooxml-template-engine.cjs';
    const candidates = [
        join(__dirname, '..', 'reports', 'runtime', filename),
        join(process.cwd(), 'dist', 'reports', 'runtime', filename),
        join(process.cwd(), 'src', 'reports', 'runtime', filename),
    ];
    const runtimePath = candidates.find((candidate) => existsSync(candidate));
    if (!runtimePath) {
        throw new Error(
            `Không tìm thấy OOXML template engine. Đã kiểm tra: ${candidates.join(', ')}`,
        );
    }
    return require(runtimePath) as OoxmlTemplateEngine;
}

const templateEngine = loadOoxmlTemplateEngine();

@Injectable()
export class CertificationResultsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly documentFilesService: DocumentFilesService,
    ) { }

    private readonly uploadDirectory =
        getStorageConfig()
            .documentsDirectory;

    private normalize(value: unknown) {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, '');
    }

    private auditLifecycleType(value: unknown): 'initial' | 'surveillance' | 'recertification' | 'special' {
        const normalized = this.normalize(value);

        if (normalized.includes('surveillance') || normalized.includes('giam')) {
            return 'surveillance';
        }

        if (normalized.includes('recertification') || normalized.includes('taichungnhan')) {
            return 'recertification';
        }

        if (normalized.includes('special') || normalized.includes('supplementary') || normalized.includes('followup')) {
            return 'special';
        }

        return 'initial';
    }

    private isCertificateActive(status: unknown) {
        return ['active', 'issued', 'valid'].includes(this.normalize(status));
    }

    private isPlainObject(value: unknown): value is JsonObject {
        return Boolean(value && typeof value === 'object' && !Array.isArray(value));
    }

    private parseJson(value: unknown): JsonObject {
        if (this.isPlainObject(value)) return value;
        if (typeof value !== 'string' || !value.trim()) return {};
        try {
            const parsed = JSON.parse(value) as unknown;
            return this.isPlainObject(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    private formatDate(value: Date | string | null | undefined): string {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh',
        }).format(date);
    }

    private formatMonthLong(value: Date | string | null | undefined): string {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        const month = date.getUTCMonth() + 1;
        const year = date.getUTCFullYear();
        return `tháng ${month} năm ${year}`;
    }

    private safeFileSegment(value: unknown): string {
        return String(value ?? 'NA')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'NA';
    }

    private brandingSnapshot(source?: { platform_branding?: Parameters<typeof getPlatformBranding>[0] }) {
        const branding = getPlatformBranding(source?.platform_branding);

        return {
            certification_body_name:
                branding.certificationBodyName,
            certification_body_website:
                branding.certificationBodyWebsite,
            certification_body_email:
                branding.certificationBodyEmail,
            certification_body_phone:
                branding.certificationBodyPhone,
            certification_body_address:
                branding.certificationBodyAddress,
        };
    }

    private templatePath(filename: string) {
        const candidates = [
            join(__dirname, '..', 'reports', 'templates', filename),
            join(process.cwd(), 'dist', 'reports', 'templates', filename),
            join(process.cwd(), 'src', 'reports', 'templates', filename),
        ];
        const found = candidates.find((candidate) => existsSync(candidate));
        if (!found) {
            throw new NotFoundException(`Không tìm thấy mẫu Word ${filename}`);
        }
        return found;
    }

    private async loadContext(planId: string) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id: planId },
            include: {
                certification_projects: {
                    include: {
                        contracts: true,
                        certification_agreements: true,
                        certification_applications: {
                            include: {
                                customers: true,
                            },
                        },
                        audit_programs: {
                            include: {
                                events: {
                                    orderBy: { sequence_no: 'asc' },
                                },
                            },
                            orderBy: { program_year: 'asc' },
                        },
                    },
                },
                reports: {
                    orderBy: [
                        { version_no: 'desc' },
                        { created_at: 'desc' },
                    ],
                    include: {
                        technical_reviews: {
                            orderBy: { created_at: 'desc' },
                            include: {
                                reviewer: true,
                                certification_decision: true,
                                audit_result_notification: true,
                            },
                        },
                    },
                },
            },
        });

        if (!plan) {
            throw new NotFoundException('Không tìm thấy kế hoạch đánh giá');
        }

        const report = plan.reports[0] ?? null;
        const review = report?.technical_reviews?.[0] ?? null;
        const decision = review?.certification_decision ?? null;
        const notification = review?.audit_result_notification ?? null;

        return { plan, report, review, decision, notification } as any;
    }

    private nextAuditDate(context: any) {
        const currentEnd = context.report?.audit_end_date ?? context.plan.planned_end_date;
        const currentTime = currentEnd ? new Date(currentEnd).getTime() : 0;
        const events = (context.plan.certification_projects?.audit_programs ?? [])
            .flatMap((program: any) => program.events ?? [])
            .filter((event: any) => event.planned_start_date)
            .sort((a: any, b: any) =>
                new Date(a.planned_start_date).getTime() - new Date(b.planned_start_date).getTime(),
            );
        return events.find((event: any) =>
            new Date(event.planned_start_date).getTime() > currentTime,
        )?.planned_start_date ?? null;
    }

    private managementSystemText(standardName: string) {
        const normalized = standardName.toLowerCase();
        const systems: string[] = [];
        if (normalized.includes('9001')) systems.push('Chất lượng – QMS');
        if (normalized.includes('14001')) systems.push('Môi trường – EMS');
        if (normalized.includes('45001')) systems.push('An toàn và sức khỏe nghề nghiệp – OHSMS');
        return systems.length ? systems.join('; ') : 'Hệ thống quản lý';
    }

    private defaultDecisionNumber(projectCode: string) {
        const year = new Date().getFullYear();
        return `QD-${projectCode}-${year}`;
    }

    private defaultNotificationNumber(projectCode: string) {
        const year = new Date().getFullYear();
        return `TB-${projectCode}-${year}`;
    }

    private suggestedValidityDate(date: Date, years: number, minusDays = 0) {
        const result = new Date(date);
        result.setUTCFullYear(result.getUTCFullYear() + years);
        if (minusDays) result.setUTCDate(result.getUTCDate() - minusDays);
        return result.toISOString().slice(0, 10);
    }

    async getWorkspace(planId: string) {
        const context = await this.loadContext(planId);
        const project = context.plan.certification_projects;
        const runtimeRules =
            resolveSchemeRuntimeRules(
                project.scheme_config_snapshot,
            );
        const application = project.certification_applications;
        const customer = application.customers;
        const formData = context.review ? this.parseJson(context.review.form_data) : {};
        const reviewReport = this.isPlainObject(formData.technical_review_report)
            ? formData.technical_review_report as JsonObject
            : {};
        const f11 = this.isPlainObject(formData.f11) ? formData.f11 as JsonObject : {};
        const recommendation = String(
            reviewReport.recommendation ?? f11.recommendation ?? '',
        );

        const lifecycleType = this.auditLifecycleType(context.plan.audit_type);
        const isSurveillance = lifecycleType === 'surveillance';

        const certificateSeries = await this.prisma.certificate_series.findMany({
            where: { project_id: project.id },
            orderBy: { created_at: 'asc' },
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
        const projectCertificates = certificateSeries
            .flatMap((series) => series.certificates)
            .sort((left, right) =>
                new Date(right.created_at).getTime() -
                new Date(left.created_at).getTime(),
            );
        const activeCertificate = projectCertificates.find((certificate) =>
            this.isCertificateActive(certificate.status),
        ) ?? null;
        const currentCertificate = projectCertificates.find((certificate) =>
            [
                'active',
                'suspended',
            ].includes(
                String(
                    certificate.status ??
                    '',
                ).toLowerCase(),
            ),
        ) ?? projectCertificates[0] ?? null;

        const certificateIds = projectCertificates.map((item) => item.id);
        const certificateDocuments = certificateIds.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'certificate',
                    entity_id: { in: certificateIds },
                    document_type: 'certificate_pdf',
                },
                orderBy: [
                    { entity_id: 'asc' },
                    { is_current: 'desc' },
                    { version_no: 'desc' },
                ],
            })
            : [];
        const documentsByCertificate = new Map<string, typeof certificateDocuments>();
        for (const document of certificateDocuments) {
            if (!document.entity_id) continue;
            const documents = documentsByCertificate.get(document.entity_id) ?? [];
            documents.push(document);
            documentsByCertificate.set(document.entity_id, documents);
        }

        const auditLifecycle = classifyAuditLifecycle(context.plan.audit_type);
        const allowedDecisionTypes =
            phase14WorkspaceDecisionTypes(
                auditLifecycle,
                currentCertificate?.status,
            );
        const allowedStatusActions =
            allowedStatusDecisionTypesForCertificateStatus(
                currentCertificate?.status,
            ).filter((decisionType) =>
                allowedDecisionTypes.includes(
                    decisionType,
                ),
            );
        const decisionType = context.decision
            ? normalizeDecisionType(context.decision.decision_type ?? '')
            : null;
        const decisionFormData = context.decision
            ? this.parseJson(context.decision.form_data)
            : {};
        const changeReason = String(
            decisionFormData.lifecycle_change_reason ?? '',
        ).trim() || null;

        const eligibilityErrors: string[] = [];
        const auditType = this.normalize(context.plan.audit_type);
        if (['stage1', 'initialstage1'].includes(auditType)) {
            eligibilityErrors.push(
                'Kết quả chứng nhận chỉ được lập từ hồ sơ đánh giá Giai đoạn 2 hoặc kỳ đánh giá tương ứng.',
            );
        }
        if (!context.report) {
            eligibilityErrors.push('Kế hoạch chưa có báo cáo đánh giá.');
        }
        if (!context.review) {
            eligibilityErrors.push('Chưa có hồ sơ thẩm xét kỹ thuật.');
        } else if (context.review.status !== 'completed') {
            eligibilityErrors.push('Hồ sơ thẩm xét kỹ thuật chưa hoàn thành.');
        }
        if (isSurveillance && !currentCertificate) {
            eligibilityErrors.push(
                'Chưa có chứng chỉ hiện hành để lập quyết định lifecycle trong kỳ giám sát.',
            );
        }
        if (
            auditLifecycle === 'RECERTIFICATION' &&
            !currentCertificate
        ) {
            eligibilityErrors.push(
                'Chưa có dòng chứng nhận hiện hữu để thực hiện tái chứng nhận.',
            );
        } else if (
            auditLifecycle === 'RECERTIFICATION' &&
            String(currentCertificate?.status ?? '').toLowerCase() !== 'active'
        ) {
            eligibilityErrors.push(
                'Chỉ chứng chỉ hiện hành đang hiệu lực mới đủ điều kiện tái chứng nhận.',
            );
        }

        const now = new Date();
        const effectiveDate = context.decision?.effective_date
            ? new Date(context.decision.effective_date)
            : isSurveillance && currentCertificate?.issue_date
                ? new Date(currentCertificate.issue_date)
                : now;
        const nextAuditDueDate = this.nextAuditDate(context);

        const decisionHistory = context.decision
            ? await this.documentFilesService.findByEntity(
                'certification_decision',
                context.decision.id,
                'certification_decision_f13',
            )
            : [];
        const notificationHistory = context.notification
            ? await this.documentFilesService.findByEntity(
                'audit_result_notification',
                context.notification.id,
                'audit_result_notification_f12',
            )
            : [];

        const requiresDecisionByDefault = true;
        const canIssueDecision =
            eligibilityErrors.length === 0 &&
            allowedDecisionTypes.length > 0 &&
            !context.decision;
        const canIssueNotification =
            eligibilityErrors.length === 0
            && !context.notification
            && Boolean(context.decision);

        return {
            plan: {
                id: context.plan.id,
                plan_code: context.plan.plan_code,
                audit_type: context.plan.audit_type,
                planned_start_date: context.plan.planned_start_date,
                planned_end_date: context.plan.planned_end_date,
                project_id: project.id,
                project_code: project.project_code,
            },
            lifecycle_type: lifecycleType,
            is_surveillance: isSurveillance,
            requires_decision_by_default: requiresDecisionByDefault,
            surveillance_no_change_allowed: isSurveillance,
            allowed_decision_types: allowedDecisionTypes,
            current_status:
                currentCertificate?.status ??
                null,
            allowed_status_actions:
                allowedStatusActions,
            certificate_series: certificateSeries.map((series) => ({
                id: series.id,
                series_code: series.series_code,
                status: series.status,
                current_certificate:
                    series.certificates[0] ??
                    null,
                allowed_status_actions:
                    allowedStatusDecisionTypesForCertificateStatus(
                        series.certificates[0]?.status,
                    ).filter((decisionType) =>
                        allowedDecisionTypes.includes(
                            decisionType,
                        ),
                    ),
                versions: series.certificates.map((certificate) => ({
                    ...certificate,
                    official_pdf_available:
                        (documentsByCertificate.get(certificate.id) ?? []).length > 0,
                })),
            })),
            active_certificate: activeCertificate ? {
                id: activeCertificate.id,
                cert_number: activeCertificate.cert_number,
                certificate_series_id: activeCertificate.certificate_series_id,
                version_no: activeCertificate.version_no,
                issue_date: activeCertificate.issue_date,
                expire_date: activeCertificate.expire_date,
                status: activeCertificate.status,
                organization_name: activeCertificate.organization_name,
                organization_address: activeCertificate.organization_address,
                management_system: activeCertificate.management_system,
                standard_name: activeCertificate.standard_name,
                certification_scope: activeCertificate.certification_scope,
                verification_code: activeCertificate.verification_code,
                official_pdf_available:
                    (documentsByCertificate.get(activeCertificate.id) ?? []).length > 0,
            } : null,
            current_certificate: currentCertificate ? {
                id: currentCertificate.id,
                cert_number: currentCertificate.cert_number,
                certificate_series_id: currentCertificate.certificate_series_id,
                version_no: currentCertificate.version_no,
                issue_date: currentCertificate.issue_date,
                expire_date: currentCertificate.expire_date,
                status: currentCertificate.status,
                organization_name: currentCertificate.organization_name,
                organization_address: currentCertificate.organization_address,
                management_system: currentCertificate.management_system,
                standard_name: currentCertificate.standard_name,
                certification_scope: currentCertificate.certification_scope,
                verification_code: currentCertificate.verification_code,
                official_pdf_available:
                    (documentsByCertificate.get(currentCertificate.id) ?? []).length > 0,
            } : null,
            report: context.report ? {
                id: context.report.id,
                report_code: context.report.report_code,
                status: context.report.status,
                audit_start_date: context.report.audit_start_date,
                audit_end_date: context.report.audit_end_date,
            } : null,
            technical_review: context.review ? {
                id: context.review.id,
                status: context.review.status,
                completed_at: context.review.completed_at,
                reviewer_name:
                    context.review.reviewer?.full_name ??
                    context.review.reviewer?.username ??
                    null,
                recommendation,
                recommendation_comment:
                    reviewReport.conclusion ?? f11.recommendation_comment ?? null,
                conditions:
                    reviewReport.conditions ?? f11.conditions ?? null,
            } : null,
            decision: context.decision ? {
                ...context.decision,
                decision_type: decisionType,
                change_reason: changeReason,
                lifecycle: decisionType ? {
                    certificate_action: certificateActionForDecisionType(decisionType),
                    requires_certificate_version:
                        decisionRequiresCertificateVersion(decisionType),
                    preserves_current_certificate:
                        decisionPreservesCurrentCertificate(decisionType),
                } : null,
            } : null,
            notification: context.notification,
            decision_history: decisionHistory,
            notification_history: notificationHistory,
            can_issue_decision: canIssueDecision,
            can_issue_notification: canIssueNotification,
            eligibility_errors: eligibilityErrors,
            runtime_rules:
                runtimeRuleSummary(
                    runtimeRules,
                ),
            defaults: {
                organization_name:
                    customer.company_name ?? application.company_name_en ?? '',
                organization_name_en:
                    application.company_name_en ?? '',
                organization_address:
                    customer.address ?? application.headquarters_address ?? '',
                standard_name:
                    project.standard_name ?? application.standard_name ?? '',
                management_system:
                    this.managementSystemText(
                        project.standard_name ?? application.standard_name ?? '',
                    ),
                certification_scope:
                    auditLifecycle === 'RECERTIFICATION'
                        ? application.certification_scope ??
                            currentCertificate?.certification_scope ??
                            ''
                        : currentCertificate?.certification_scope ??
                            application.certification_scope ??
                            '',
                contract_number:
                    project.contracts?.contract_number ?? '',
                contract_date:
                    project.contracts?.sign_date ?? null,
                agreement_number:
                    project.certification_agreements?.agreement_number ?? '',
                agreement_date:
                    project.certification_agreements?.sign_date ?? null,
                decision_number:
                    this.defaultDecisionNumber(project.project_code),
                decision_date: now.toISOString().slice(0, 10),
                effective_date: effectiveDate.toISOString().slice(0, 10),
                expiry_date:
                    isSurveillance && currentCertificate?.expire_date
                        ? new Date(currentCertificate.expire_date).toISOString().slice(0, 10)
                        : expiryDateFromValidityMonths(
                            effectiveDate,
                            runtimeRules.validity_duration_months,
                        ).toISOString().slice(0, 10),
                surveillance_interval_months:
                    runtimeRules.surveillance_frequency_months,
                audit_type: lifecycleType,
                notification_result:
                    context.decision &&
                    context.decision.decision_result !== 'approved'
                        ? 'certification_not_granted'
                        : decisionType === 'SUSPEND'
                            ? 'certification_suspended'
                            : decisionType === 'WITHDRAW'
                                ? 'certification_withdrawn'
                                : decisionType === 'MAINTAIN' ||
                                    decisionType === 'RESTORE'
                                    ? 'certification_maintained'
                                    : decisionType
                            ? 'certification_granted'
                                : isSurveillance
                                    ? 'certification_maintained'
                                    : 'certification_granted',
                has_certification_changes:
                    Boolean(decisionType && [
                        'AMEND',
                        'EXTEND_SCOPE',
                        'REDUCE_SCOPE',
                    ].includes(decisionType)),
                notification_number:
                    this.defaultNotificationNumber(project.project_code),
                notification_date: now.toISOString().slice(0, 10),
                audit_start_date:
                    context.report?.audit_start_date ?? context.plan.planned_start_date,
                audit_end_date:
                    context.report?.audit_end_date ?? context.plan.planned_end_date,
                next_audit_due_date: nextAuditDueDate,
                recipient_name:
                    application.contact_name ?? application.representative_name ?? customer.company_name ?? '',
                recipient_email:
                    application.contact_email ?? application.representative_email ?? customer.email ?? '',
                signatory_name:
                    process.env.CERTIFICATION_SIGNATORY_NAME ?? '',
                signatory_title:
                    process.env.CERTIFICATION_SIGNATORY_TITLE ?? 'Tổng Giám đốc',
            },
        };
    }

    private async assertGenerateAccess(userId: string | undefined) {
        if (!userId) {
            throw new ForbiddenException('Không xác định được người xuất tài liệu');
        }
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            include: {
                user_roles: {
                    include: { roles: true },
                },
            },
        });
        if (!user) throw new ForbiddenException('Không tìm thấy tài khoản');
        const roles = user.user_roles.map((item) => this.normalize(item.roles.role_name));
        if (!roles.some((role) => ['admin', 'decisionmaker', 'coordinator', 'staff'].includes(role))) {
            throw new ForbiddenException('Tài khoản không có quyền xuất hồ sơ kết quả chứng nhận');
        }
    }

    private decisionSnapshot(decision: any) {
        const review = decision.technical_reviews;
        const report = review.reports;
        const plan = report.audit_plans;
        const project = plan.certification_projects;
        const application = project.certification_applications;
        const customer = application.customers;
        const branding = this.brandingSnapshot(decision);
        const bodyName = branding.certification_body_name;
        const organizationDisplayName = application.company_name_en
            ? `${decision.organization_name}/ ${application.company_name_en}`
            : decision.organization_name;
        const systemText = decision.management_system || this.managementSystemText(decision.standard_name);
        const contract = project.contracts;
        const agreement = project.certification_agreements;
        const basisNumber = agreement?.agreement_number || contract?.contract_number || '—';
        const basisDate = agreement?.sign_date || contract?.sign_date;
        return {
            ...branding,
            decision_number: decision.decision_number,
            decision_date: this.formatDate(decision.decision_date),
            decision_title: `Chứng nhận ${systemText}/ Certification of ${systemText}`,
            legal_basis_paragraph:
                `Căn cứ Giấy chứng nhận Đăng ký doanh nghiệp của ${bodyName}/ Based on the Certificate of Business Registration of ${bodyName};`,
            agreement_basis_paragraph:
                `Căn cứ Thỏa thuận/Hợp đồng đánh giá chứng nhận số ${basisNumber} ngày ${this.formatDate(basisDate)} về việc chứng nhận ${systemText}/ Based on certification agreement/contract No. ${basisNumber} dated ${this.formatDate(basisDate)};`,
            review_basis_paragraph:
                `Căn cứ Hồ sơ đánh giá và báo cáo thẩm xét chứng nhận ngày ${this.formatDate(review.completed_at)}/ Based on the audit records and certification review report dated ${this.formatDate(review.completed_at)}.`,
            proposal_paragraph:
                'Xét đề nghị của Trưởng Phòng Chứng nhận/ As the proposal of the Head of Certification Department,',
            organization_display_name: organizationDisplayName,
            organization_address: decision.organization_address || customer.address || '—',
            management_system_paragraph:
                `Có ${systemText}/ Having ${systemText}.`,
            standard_paragraph:
                `Được đánh giá phù hợp với các yêu cầu của tiêu chuẩn ${decision.standard_name}/ Audited in accordance with the requirements of ${decision.standard_name}.`,
            certification_scope: decision.certification_scope,
            article2_paragraph:
                `Điều 2/ Article 2. Tổ chức được chứng nhận ở Điều 1 được phép sử dụng dấu chứng nhận và phải tuân thủ đầy đủ các yêu cầu chứng nhận hiện hành của ${bodyName} trong thời gian chứng chỉ có hiệu lực/ The organization certified in Article 1 may use the certification mark and shall comply with the current certification requirements of ${bodyName} during the certification validity period.`,
            surveillance_paragraph:
                `Tổ chức được chứng nhận ở Điều 1 chịu sự đánh giá giám sát định kỳ không quá ${decision.surveillance_interval_months ?? 12} tháng/lần/ The organization certified in Article 1 is subject to periodic surveillance audits not exceeding every ${decision.surveillance_interval_months ?? 12} months.`,
            validity_paragraph:
                `Quyết định này có hiệu lực từ ngày ${this.formatDate(decision.effective_date)} đến ngày ${this.formatDate(decision.expiry_date)}/ This Decision takes effect from ${this.formatDate(decision.effective_date)} to ${this.formatDate(decision.expiry_date)}.`,
            article3_paragraph:
                'Điều 3/ Article 3. Trưởng phòng Chứng nhận, các phòng có liên quan và tổ chức được chứng nhận tại Điều 1 chịu trách nhiệm thi hành Quyết định này/ Head of Certification Department, relevant departments and the organization certified in Article 1 shall be responsible for implementation of this Decision.',
            signatory_title_vi: decision.signatory_title || 'TỔNG GIÁM ĐỐC',
            signatory_title_en: 'General Director',
            signatory_name: decision.signatory_name,
        };
    }

    private notificationSnapshot(notification: any) {
        const review = notification.technical_reviews;
        const report = review.reports;
        const plan = report.audit_plans;
        const project = plan.certification_projects;
        const application = project.certification_applications;
        const branding = this.brandingSnapshot(notification);
        const bodyName = branding.certification_body_name;
        const organizationDisplayName = application.company_name_en
            ? `${notification.organization_name}/ ${application.company_name_en}`
            : notification.organization_name;
        const systemText = notification.management_system || this.managementSystemText(notification.standard_name);
        const resultApproved = [
            'certification_granted',
            'certification_maintained',
        ].includes(notification.notification_result);
        const resultParagraph = resultApproved
            ? `+ ${systemText} của Công ty được đánh giá phù hợp với yêu cầu của tiêu chuẩn ${notification.standard_name} với phạm vi: ${notification.certification_scope}/ The Company's ${systemText} is assessed in accordance with ${notification.standard_name} for the certification scope: ${notification.certification_scope}.`
            : `+ Kết quả đánh giá chưa đủ cơ sở để cấp/duy trì chứng nhận theo tiêu chuẩn ${notification.standard_name}/ The audit result does not provide sufficient basis to grant/maintain certification to ${notification.standard_name}.`;
        return {
            ...branding,
            notification_number: notification.notification_number,
            notification_date: this.formatDate(notification.notification_date),
            organization_display_name: organizationDisplayName,
            greeting_paragraph:
                `${bodyName} xin gửi tới Quý khách hàng lời chào trân trọng/ ${bodyName} would like to send our valued customer respectful greetings!`,
            audit_paragraph:
                `Theo đăng ký chứng nhận của Quý khách hàng, chúng tôi đã tiến hành đánh giá ${systemText} của Công ty trong thời gian ${this.formatDate(report.audit_start_date)} - ${this.formatDate(report.audit_end_date)}/ According to your certification registration, we conducted the audit from ${this.formatDate(report.audit_start_date)} to ${this.formatDate(report.audit_end_date)}.`,
            basis_paragraph:
                'Căn cứ kết quả đánh giá chứng nhận, chúng tôi trân trọng thông báo/ Based on the results of the certification audit, we are pleased to announce:',
            result_paragraph: resultParagraph,
            certificate_use_paragraph: resultApproved
                ? `+ Trong thời gian hiệu lực chứng nhận, đề nghị Công ty tuân thủ quy định sử dụng giấy chứng nhận và dấu chứng nhận do ${bodyName} cấp/ During the certification validity period, the Company shall comply with the regulations on using certificates and certification marks issued by ${bodyName}.`
                : '+ Các hành động tiếp theo thực hiện theo nội dung thông báo và yêu cầu của tổ chức chứng nhận/ Follow-up actions shall comply with this notification and certification body requirements.',
            next_audit_paragraph: notification.next_audit_due_date
                ? `+ Thời gian đánh giá tiếp theo dự kiến vào ${this.formatMonthLong(notification.next_audit_due_date)}/ The next audit is expected in ${this.formatMonthLong(notification.next_audit_due_date)}.`
                : '+ Thời gian đánh giá tiếp theo sẽ được thông báo theo chương trình chứng nhận/ The next audit will be notified according to the certification programme.',
            closing_paragraph: 'Trân trọng thông báo/ Respectfully announced.',
            signatory_title_vi: notification.signatory_title || 'Tổng giám đốc/',
            signatory_title_en: 'General Director',
            signatory_name: notification.signatory_name,
        };
    }

    private async loadDecision(id: string) {
        const decision = await this.prisma.certification_decisions.findUnique({
            where: { id },
            include: {
                technical_reviews: {
                    include: {
                        reports: {
                            include: {
                                audit_plans: {
                                    include: {
                                        certification_projects: {
                                            include: {
                                                contracts: true,
                                                certification_agreements: true,
                                                certification_applications: {
                                                    include: { customers: true },
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
        });
        if (!decision) throw new NotFoundException('Không tìm thấy quyết định chứng nhận');
        const platformBranding = 'organization_profiles' in this.prisma
            ? await this.prisma.organization_profiles.findUnique({ where: { profile_key: 'PRIMARY' } })
            : null;
        return Object.assign(decision, { platform_branding: platformBranding }) as any;
    }

    private async loadNotification(id: string) {
        const notification = await this.prisma.audit_result_notifications.findUnique({
            where: { id },
            include: {
                technical_reviews: {
                    include: {
                        reports: {
                            include: {
                                audit_plans: {
                                    include: {
                                        certification_projects: {
                                            include: {
                                                certification_applications: true,
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
        if (!notification) throw new NotFoundException('Không tìm thấy thông báo kết quả đánh giá');
        const platformBranding = 'organization_profiles' in this.prisma
            ? await this.prisma.organization_profiles.findUnique({ where: { profile_key: 'PRIMARY' } })
            : null;
        return Object.assign(notification, { platform_branding: platformBranding }) as any;
    }

    private async convertToPdf(
        docxPath: string,
        pdfPath: string,
    ) {
        await convertDocxToPdf(
            docxPath,
            pdfPath,
            600_000,
        );
    }

    private async generateDocument(input: {
        entityType: string;
        entityId: string;
        documentType: string;
        formCode: string;
        templateFile: string;
        sourceCode: string;
        snapshot: Record<string, unknown>;
        format: string;
        userId?: string;
    }) {
        await this.assertGenerateAccess(input.userId);
        const format = String(input.format ?? '').toLowerCase() as DocumentFormat;
        if (!['docx', 'pdf'].includes(format)) {
            throw new BadRequestException('Định dạng chỉ chấp nhận docx hoặc pdf');
        }
        mkdirSync(this.uploadDirectory, { recursive: true });
        const baseName = randomUUID();
        const docxStoredName = `${baseName}.docx`;
        const pdfStoredName = `${baseName}.pdf`;
        const docxPath = join(this.uploadDirectory, docxStoredName);
        const pdfPath = join(this.uploadDirectory, pdfStoredName);
        templateEngine.renderDocxTemplate({
            templatePath: this.templatePath(input.templateFile),
            outputPath: docxPath,
            data: input.snapshot,
        });
        const originalBase = `${input.formCode}_${this.safeFileSegment(input.sourceCode)}`;
        try {
            let registered;
            if (format === 'docx') {
                registered = await this.documentFilesService.registerGenerated({
                    entity_type: input.entityType,
                    entity_id: input.entityId,
                    document_type: input.documentType,
                    file_kind: 'generated_docx',
                    original_name: `${originalBase}.docx`,
                    stored_name: docxStoredName,
                    absolute_path: docxPath,
                    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    note: `${input.formCode} sinh tự động từ dữ liệu hệ thống tại thời điểm xuất.`,
                    uploaded_by: input.userId ?? null,
                });
            } else {
                await this.convertToPdf(docxPath, pdfPath);
                if (existsSync(docxPath)) unlinkSync(docxPath);
                registered = await this.documentFilesService.registerGenerated({
                    entity_type: input.entityType,
                    entity_id: input.entityId,
                    document_type: input.documentType,
                    file_kind: 'generated_pdf',
                    original_name: `${originalBase}.pdf`,
                    stored_name: pdfStoredName,
                    absolute_path: pdfPath,
                    mime_type: 'application/pdf',
                    note: `${input.formCode} PDF sinh từ cùng snapshot Word của dữ liệu hệ thống.`,
                    uploaded_by: input.userId ?? null,
                });
            }
            if (input.userId) {
                await this.prisma.audit_logs.create({
                    data: {
                        user_id: input.userId,
                        action: `GENERATE_${input.documentType.toUpperCase()}_${format.toUpperCase()}`,
                        entity_type: input.entityType,
                        entity_id: input.entityId,
                    },
                });
            }
            return { format, form_code: input.formCode, document: registered };
        } catch (error) {
            if (existsSync(docxPath)) unlinkSync(docxPath);
            if (existsSync(pdfPath)) unlinkSync(pdfPath);
            throw error;
        }
    }

    async generateDecision(id: string, format: string, userId?: string) {
        const decision = await this.loadDecision(id);
        return this.generateDocument({
            entityType: 'certification_decision',
            entityId: decision.id,
            documentType: 'certification_decision_f13',
            formCode: 'F.13-P.09',
            templateFile: 'F.13-P.09.certification-decision.template.docx',
            sourceCode: decision.decision_number,
            snapshot: this.decisionSnapshot(decision),
            format,
            userId,
        });
    }

    async generateNotification(id: string, format: string, userId?: string) {
        const notification = await this.loadNotification(id);
        return this.generateDocument({
            entityType: 'audit_result_notification',
            entityId: notification.id,
            documentType: 'audit_result_notification_f12',
            formCode: 'F.12-P.09',
            templateFile: 'F.12-P.09.audit-result-notification.template.docx',
            sourceCode: notification.notification_number,
            snapshot: this.notificationSnapshot(notification),
            format,
            userId,
        });
    }
}
