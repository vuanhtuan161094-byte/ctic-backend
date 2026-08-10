import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationProjectDto } from './dto/create-certification-project.dto';
import { CreateCompleteCertificationProjectDto } from './dto/create-complete-certification-project.dto';

type ReviewIndustryScope = {
    isic_nace_mapping_id: string;
    nace_iaf_mapping_id: string;
    management_system: string;
    scope_description: string;
};

@Injectable()
export class CertificationProjectsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }


    private normalize(
        value?: string | null,
    ): string {
        return value
            ?.trim()
            .toUpperCase() ?? '';
    }

    private standardFromManagementSystem(
        managementSystem: string,
    ): string {
        const normalized = this.normalize(
            managementSystem,
        );

        if (normalized === 'QMS') {
            return 'ISO 9001:2015';
        }

        if (normalized === 'EMS') {
            return 'ISO 14001:2015';
        }

        if (
            normalized === 'OHSMS' ||
            normalized === 'OH&SMS'
        ) {
            return 'ISO 45001:2018';
        }

        return normalized;
    }

    private parseReviewIndustryScopes(
        rawValue?: string | null,
    ): ReviewIndustryScope[] {
        if (!rawValue?.trim()) {
            return [];
        }

        try {
            const parsed = JSON.parse(
                rawValue,
            ) as unknown;

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.filter(
                (
                    item,
                ): item is ReviewIndustryScope => {
                    if (
                        !item ||
                        typeof item !== 'object'
                    ) {
                        return false;
                    }

                    const value = item as Record<string, unknown>;

                    return (
                        typeof value.isic_nace_mapping_id === 'string' &&
                        typeof value.nace_iaf_mapping_id === 'string' &&
                        typeof value.management_system === 'string' &&
                        typeof value.scope_description === 'string'
                    );
                },
            );
        } catch {
            throw new BadRequestException(
                'Dữ liệu phạm vi ngành trong bản xem xét bị lỗi định dạng. Hãy mở lại bước xem xét đơn và lưu lại mã ISIC/NACE/IAF.',
            );
        }
    }

    private async createApprovedProjectScopesFromReview(
        transaction: Prisma.TransactionClient,
        projectId: string,
        applicationId: string,
    ) {
        const review =
            await transaction.application_reviews.findFirst({
                where: {
                    application_id:
                        applicationId,
                    industry_scopes_json: {
                        not: null,
                    },
                },
                orderBy: [
                    {
                        approved_at:
                            'desc',
                    },
                    {
                        checked_at:
                            'desc',
                    },
                    {
                        created_at:
                            'desc',
                    },
                ],
                select: {
                    id: true,
                    reviewer_id: true,
                    prepared_by_id: true,
                    checker_id: true,
                    approver_id: true,
                    industry_scopes_json: true,
                },
            });

        if (!review) {
            throw new BadRequestException(
                'Đơn đã được chấp nhận nhưng chưa có phạm vi ISIC/NACE/IAF được xem xét. Không thể tạo hồ sơ chứng nhận chưa đủ điều kiện.',
            );
        }

        const scopes =
            this.parseReviewIndustryScopes(
                review.industry_scopes_json,
            );

        if (!scopes.length) {
            throw new BadRequestException(
                'Bản xem xét đơn không có phạm vi ngành hợp lệ. Hãy bổ sung và hoàn tất xem xét trước khi tạo hồ sơ.',
            );
        }

        const selectedBy =
            review.prepared_by_id ??
            review.reviewer_id ??
            review.checker_id ??
            review.approver_id;
        const approvedBy =
            review.approver_id ??
            review.checker_id ??
            review.reviewer_id ??
            review.prepared_by_id;

        if (
            !selectedBy ||
            !approvedBy
        ) {
            throw new BadRequestException(
                'Bản xem xét chưa ghi nhận đầy đủ người lập/người kiểm tra để chuyển phạm vi sang hồ sơ.',
            );
        }

        const now =
            new Date();

        for (
            const scope of scopes
        ) {
            const [
                isicNaceMapping,
                naceIafMapping,
            ] = await Promise.all([
                transaction.industry_code_mappings.findUnique({
                    where: {
                        id: scope.isic_nace_mapping_id,
                    },
                }),
                transaction.nace_iaf_mappings.findUnique({
                    where: {
                        id: scope.nace_iaf_mapping_id,
                    },
                }),
            ]);

            if (
                !isicNaceMapping ||
                this.normalize(
                    isicNaceMapping.mapping_status,
                ) !== 'APPROVED'
            ) {
                throw new BadRequestException(
                    'Có ánh xạ ISIC-NACE trong bản xem xét chưa được phê duyệt hoặc đã bị xóa.',
                );
            }

            if (
                !naceIafMapping ||
                this.normalize(
                    naceIafMapping.mapping_status,
                ) !== 'APPROVED'
            ) {
                throw new BadRequestException(
                    'Có ánh xạ NACE-IAF trong bản xem xét chưa được phê duyệt hoặc đã bị xóa.',
                );
            }

            await transaction.certification_project_scopes.create({
                data: {
                    project_id:
                        projectId,
                    isic_nace_mapping_id:
                        scope.isic_nace_mapping_id,
                    nace_iaf_mapping_id:
                        scope.nace_iaf_mapping_id,
                    management_system:
                        this.normalize(
                            scope.management_system,
                        ),
                    standard_code:
                        this.standardFromManagementSystem(
                            scope.management_system,
                        ),
                    scope_description:
                        scope.scope_description.trim(),
                    status:
                        'APPROVED',
                    notes:
                        `Chuyển tự động từ bản xem xét đơn ${review.id}`,
                    selected_by:
                        selectedBy,
                    selected_at:
                        now,
                    approved_by:
                        approvedBy,
                    approved_at:
                        now,
                },
            });
        }
    }

    // Lấy danh sách dự án chứng nhận
    async findAll(
        allowedProjectIds?: string[],
    ) {
        return this.prisma.certification_projects.findMany({
            where: allowedProjectIds
                ? {
                    id: {
                        in: allowedProjectIds,
                    },
                }
                : undefined,
            include: {
                certification_applications: {
                    select: {
                        id: true,
                        application_code: true,
                        standard_name: true,
                        certification_scope: true,
                        status: true,
                        customers: {
                            select: {
                                id: true,
                                customer_code: true,
                                company_name: true,
                            },
                        },
                    },
                },
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                        sign_date: true,
                    },
                },
                certification_agreements: {
                    select: {
                        id: true,
                        agreement_number: true,
                        sign_date: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    // Lấy chi tiết dự án
    async findOne(id: string) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id,
                },
                include: {
                    certification_applications: {
                        include: {
                            customers: {
                                select: {
                                    id: true,
                                    customer_code: true,
                                    company_name: true,
                                    tax_code: true,
                                    address: true,
                                    phone: true,
                                    email: true,
                                },
                            },
                            sites: {
                                orderBy: { site_no: 'asc' },
                            },
                            application_reviews: {
                                include: {
                                    users: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    prepared_by: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    checker: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    approver: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    workflow_actions: {
                                        include: {
                                            actor: {
                                                select: { id: true, username: true, full_name: true },
                                            },
                                        },
                                        orderBy: { created_at: 'desc' },
                                    },
                                },
                                orderBy: { created_at: 'desc' },
                            },
                        },
                    },
                    contracts: true,
                    certification_agreements: true,
                    audit_plans: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        return project;
    }
    // Tổng hợp hồ sơ dự án theo từng kỳ đánh giá trong chu kỳ chứng nhận
    async getDossier(id: string) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: { id },
                include: {
                    certification_applications: {
                        include: {
                            customers: true,
                            sites: {
                                orderBy: { site_no: 'asc' },
                            },
                            application_reviews: {
                                include: {
                                    users: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    prepared_by: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    checker: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    approver: {
                                        select: { id: true, username: true, full_name: true },
                                    },
                                    workflow_actions: {
                                        include: {
                                            actor: {
                                                select: { id: true, username: true, full_name: true },
                                            },
                                        },
                                        orderBy: { created_at: 'desc' },
                                    },
                                },
                                orderBy: { created_at: 'desc' },
                            },
                        },
                    },
                    contracts: true,
                    certification_agreements: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        const programs = await this.prisma.audit_programs.findMany({
            where: { project_id: id },
            orderBy: { program_year: 'asc' },
        });

        const plans = await this.prisma.audit_plans.findMany({
            where: { project_id: id },
            orderBy: { created_at: 'asc' },
        });

        const planIds = plans.map((plan) => plan.id);
        const teamAppointments = planIds.length > 0
            ? await this.prisma.audit_team_appointments.findMany({
                where: { audit_plan_id: { in: planIds } },
                include: { members: { select: { id: true } } },
                orderBy: { created_at: 'desc' },
            })
            : [];

        const teamAppointmentIds = teamAppointments.map((item) => item.id);
        const teamMemberIds = teamAppointments.flatMap((item) => item.members.map((member) => member.id));
        const reports = planIds.length > 0
            ? await this.prisma.reports.findMany({
                where: { audit_plan_id: { in: planIds } },
                orderBy: { created_at: 'asc' },
            })
            : [];

        const reportIds = reports.map((report) => report.id);
        const reviews = reportIds.length > 0
            ? await this.prisma.technical_reviews.findMany({
                where: { report_id: { in: reportIds } },
                orderBy: { created_at: 'asc' },
            })
            : [];

        const reviewIds = reviews.map((review) => review.id);
        const decisions = reviewIds.length > 0
            ? await this.prisma.certification_decisions.findMany({
                where: { technical_review_id: { in: reviewIds } },
                orderBy: { decision_date: 'desc' },
            })
            : [];

        const notifications = reviewIds.length > 0
            ? await this.prisma.audit_result_notifications.findMany({
                where: { technical_review_id: { in: reviewIds } },
                orderBy: { notification_date: 'desc' },
            })
            : [];

        const certificates = reviewIds.length > 0
            ? await this.prisma.certificates.findMany({
                where: { technical_review_id: { in: reviewIds } },
                orderBy: { issue_date: 'desc' },
            })
            : [];

        const findings = reportIds.length > 0
            ? await this.prisma.audit_findings.findMany({
                where: { report_id: { in: reportIds } },
            })
            : [];

        const applicationReviewIds = project.certification_applications.application_reviews
            .map((review) => review.id);

        const entityIds = Array.from(new Set([
            project.id,
            project.application_id,
            ...(project.contract_id ? [project.contract_id] : []),
            ...(project.agreement_id ? [project.agreement_id] : []),
            ...applicationReviewIds,
            ...programs.map((item) => item.id),
            ...planIds,
            ...reportIds,
            ...findings.map((item) => item.id),
            ...reviewIds,
            ...decisions.map((item) => item.id),
            ...notifications.map((item) => item.id),
            ...certificates.map((item) => item.id),
            ...teamAppointmentIds,
            ...teamMemberIds,
        ]));

        const files = await this.prisma.documentFile.findMany({
            where: {
                entity_id: { in: entityIds },
                is_current: true,
            },
            orderBy: { created_at: 'desc' },
        });

        const normalize = (value?: string | null) =>
            (value ?? '').trim().toLowerCase();

        type ItemStatus = 'completed' | 'pending' | 'not_applicable';
        type DossierItemResult = {
            item_no: number;
            document_key: string;
            document_name: string;
            storage_type: 'system_record' | 'uploaded_file';
            status: ItemStatus;
            reference_id?: string | null;
            entity_type?: string | null;
            entity_id?: string | null;
        };

        const hasFileFor = (
            documentTypes: string[],
            scopedEntityIds: string[],
            allowProjectFallback = false,
        ) => files.some((file) => {
            if (!documentTypes.includes(normalize(file.document_type))) {
                return false;
            }
            if (scopedEntityIds.includes(file.entity_id)) {
                return true;
            }
            return allowProjectFallback && file.entity_id === project.id;
        });

        const application = project.certification_applications;
        const applicationReviewed = application.application_reviews.some(
            (review) => ['accepted', 'approved'].includes(normalize(review.result)),
        );

        const commonItems: DossierItemResult[] = [
            {
                item_no: 1,
                document_key: 'certification_application',
                document_name: 'Phiếu đăng ký chứng nhận',
                storage_type: 'system_record',
                status: 'completed',
                reference_id: application.id,
                entity_type: 'certification_application',
                entity_id: application.id,
            },
            {
                item_no: 2,
                document_key: 'application_review',
                document_name: 'Xem xét đăng ký chứng nhận',
                storage_type: 'system_record',
                status: applicationReviewed ? 'completed' : 'pending',
                reference_id: application.application_reviews[0]?.id ?? null,
                entity_type: 'application_review',
                entity_id: application.application_reviews[0]?.id ?? null,
            },
            {
                item_no: 3,
                document_key: 'business_license',
                document_name: 'Giấy phép đăng ký kinh doanh',
                storage_type: 'uploaded_file',
                status: hasFileFor(
                    ['business_license', 'business_registration'],
                    [application.id],
                    true,
                ) ? 'completed' : 'pending',
                entity_type: 'certification_application',
                entity_id: application.id,
            },
        ];

        const typeOfPlan = (plan: (typeof plans)[number]) => normalize(plan.audit_type);
        const firstPlan = (types: string[]) => plans.find((plan) => types.includes(typeOfPlan(plan))) ?? null;

        const stage1Plan = firstPlan(['stage1', 'stage_1', 'initial_stage1']);
        const stage2Plan = firstPlan(['stage2', 'stage_2', 'initial_stage2'])
            ?? firstPlan(['initial']);

        const projectTeamPlan = firstPlan([
            'project_team',
        ]);
        const projectTeamAppointment = projectTeamPlan
            ? teamAppointments.find(
                (appointment) =>
                    appointment.audit_plan_id ===
                    projectTeamPlan.id,
            ) ?? null
            : null;


        const genericSurveillancePlans = plans.filter(
            (plan) => typeOfPlan(plan) === 'surveillance',
        );
        const surveillance1Plan = firstPlan([
            'surveillance1',
            'surveillance_1',
            'surveillance_year_1',
        ]) ?? genericSurveillancePlans[0] ?? null;
        const surveillance2Plan = firstPlan([
            'surveillance2',
            'surveillance_2',
            'surveillance_year_2',
        ]) ?? genericSurveillancePlans[1] ?? null;

        const planSet = (...candidatePlans: Array<(typeof plans)[number] | null>) =>
            candidatePlans.filter((plan): plan is (typeof plans)[number] => Boolean(plan));

        const dossierContext = (dossierPlans: (typeof plans)[number][]) => {
            const dossierPlanIds = dossierPlans.map((plan) => plan.id);
            const dossierReports = reports.filter((report) => dossierPlanIds.includes(report.audit_plan_id));
            const dossierReportIds = dossierReports.map((report) => report.id);
            const dossierReviews = reviews.filter((review) => dossierReportIds.includes(review.report_id));
            const dossierReviewIds = dossierReviews.map((review) => review.id);
            const dossierAppointments = teamAppointments.filter(
                (appointment) => dossierPlanIds.includes(appointment.audit_plan_id),
            );
            const dossierFindings = findings.filter((finding) => dossierReportIds.includes(finding.report_id));
            const dossierNotifications = notifications.filter(
                (notification) => dossierReviewIds.includes(notification.technical_review_id),
            );
            const dossierDecisions = decisions.filter(
                (decision) => dossierReviewIds.includes(decision.technical_review_id),
            );
            const dossierCertificates = certificates.filter(
                (certificate) => dossierReviewIds.includes(certificate.technical_review_id),
            );
            const scopedEntityIds = [
                ...dossierPlanIds,
                ...dossierReportIds,
                ...dossierReviewIds,
                ...dossierAppointments.map((item) => item.id),
                ...dossierAppointments.flatMap((item) => item.members.map((member) => member.id)),
            ];

            return {
                planIds: dossierPlanIds,
                reports: dossierReports,
                reviews: dossierReviews,
                appointments: dossierAppointments,
                findings: dossierFindings,
                notifications: dossierNotifications,
                decisions: dossierDecisions,
                certificates: dossierCertificates,
                scopedEntityIds,
            };
        };

        const summaryOf = (items: DossierItemResult[]) => {
            const applicable = items.filter((item) => item.status !== 'not_applicable');
            const completed = applicable.filter((item) => item.status === 'completed');
            return {
                total_items: applicable.length,
                completed_items: completed.length,
                pending_items: applicable.length - completed.length,
                completion_percentage: applicable.length === 0
                    ? 0
                    : Math.round((completed.length / applicable.length) * 100),
                dossier_status: applicable.length > 0 && completed.length === applicable.length
                    ? 'completed'
                    : completed.length > 0
                        ? 'in_progress'
                        : 'not_started',
            };
        };

        const createInitialDossier = () => {
            const dossierPlans = planSet(stage1Plan, stage2Plan);
            const context = dossierContext(dossierPlans);
            const stage1Report = stage1Plan
                ? context.reports.find((report) => report.audit_plan_id === stage1Plan.id) ?? null
                : null;
            const stage2Report = stage2Plan
                ? context.reports.find((report) => report.audit_plan_id === stage2Plan.id) ?? null
                : null;
            const issuedAppointment = (
                projectTeamAppointment &&
                normalize(
                    projectTeamAppointment.status,
                ) === 'issued'
            )
                ? projectTeamAppointment
                : context.appointments.find(
                    (item) =>
                        normalize(
                            item.status,
                        ) === 'issued',
                ) ?? null;
            const ncFindings = context.findings.filter((item) =>
                ['minor_nc', 'major_nc', 'minornc', 'majornc'].includes(
                    normalize(item.finding_type),
                ),
            );
            const allFindingsClosed = ncFindings.length > 0
                && ncFindings.every((item) => normalize(item.status) === 'closed');
            const technicalReviewCompleted = context.reviews.some(
                (item) => ['completed', 'complete'].includes(normalize(item.status)),
            );
            const notificationSent = context.notifications.some(
                (item) => normalize(item.status) === 'sent',
            );
            const decisionIssued = context.decisions.some(
                (item) => ['issued', 'approved'].includes(normalize(item.status)),
            );
            const primaryUploadEntityId = stage2Plan?.id ?? stage1Plan?.id ?? project.id;
            const allowLegacyProjectFiles = true;

            const items: DossierItemResult[] = [
                {
                    item_no: 1,
                    document_key: 'audit_team_assignment',
                    document_name: 'Chỉ định đoàn đánh giá',
                    storage_type: 'system_record',
                    status: issuedAppointment ? 'completed' : 'pending',
                    reference_id: issuedAppointment?.id ?? null,
                    entity_type: issuedAppointment ? 'audit_team_appointment' : null,
                    entity_id: issuedAppointment?.id ?? null,
                },
                {
                    item_no: 2,
                    document_key: 'audit_program',
                    document_name: 'Chương trình đánh giá chu kỳ chứng nhận',
                    storage_type: 'system_record',
                    status: programs.length > 0 ? 'completed' : 'pending',
                    reference_id: programs[0]?.id ?? null,
                    entity_type: programs[0] ? 'audit_program' : null,
                    entity_id: programs[0]?.id ?? null,
                },
                {
                    item_no: 3,
                    document_key: 'stage1_audit_plan',
                    document_name: 'Kế hoạch đánh giá giai đoạn 1',
                    storage_type: 'system_record',
                    status: stage1Plan ? 'completed' : 'pending',
                    reference_id: stage1Plan?.id ?? null,
                    entity_type: stage1Plan ? 'audit_plan' : null,
                    entity_id: stage1Plan?.id ?? null,
                },
                {
                    item_no: 4,
                    document_key: 'stage1_audit_report',
                    document_name: 'Báo cáo đánh giá giai đoạn 1',
                    storage_type: 'system_record',
                    status: stage1Report ? 'completed' : 'pending',
                    reference_id: stage1Report?.id ?? null,
                    entity_type: stage1Report ? 'report' : null,
                    entity_id: stage1Report?.id ?? null,
                },
                {
                    item_no: 5,
                    document_key: 'stage2_audit_plan',
                    document_name: 'Kế hoạch đánh giá giai đoạn 2',
                    storage_type: 'system_record',
                    status: stage2Plan ? 'completed' : 'pending',
                    reference_id: stage2Plan?.id ?? null,
                    entity_type: stage2Plan ? 'audit_plan' : null,
                    entity_id: stage2Plan?.id ?? null,
                },
                {
                    item_no: 6,
                    document_key: 'audit_checklist',
                    document_name: 'Bảng kiểm đánh giá',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['audit_checklist', 'audit_checklist_f06_qms', 'audit_checklist_f06_ems', 'audit_checklist_f06_ohsms'],
                        context.scopedEntityIds,
                        allowLegacyProjectFiles,
                    ) ? 'completed' : 'pending',
                    entity_type: stage2Plan ? 'audit_plan' : 'certification_project',
                    entity_id: primaryUploadEntityId,
                },
                {
                    item_no: 7,
                    document_key: 'opening_closing_attendance',
                    document_name: 'Danh sách họp khai mạc/kết thúc',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['opening_closing_attendance', 'attendance_list', 'audit_attendance_f07'],
                        context.scopedEntityIds,
                        allowLegacyProjectFiles,
                    ) ? 'completed' : 'pending',
                    entity_type: stage2Plan ? 'audit_plan' : 'certification_project',
                    entity_id: primaryUploadEntityId,
                },
                {
                    item_no: 8,
                    document_key: 'stage2_audit_report',
                    document_name: 'Báo cáo đánh giá giai đoạn 2',
                    storage_type: 'system_record',
                    status: stage2Report ? 'completed' : 'pending',
                    reference_id: stage2Report?.id ?? null,
                    entity_type: stage2Report ? 'report' : null,
                    entity_id: stage2Report?.id ?? null,
                },
                {
                    item_no: 9,
                    document_key: 'nc_cap',
                    document_name: 'Phiếu yêu cầu hành động khắc phục',
                    storage_type: 'system_record',
                    status: ncFindings.length === 0
                        ? 'not_applicable'
                        : allFindingsClosed ? 'completed' : 'pending',
                    entity_type: stage2Report ? 'report' : null,
                    entity_id: stage2Report?.id ?? null,
                },
                {
                    item_no: 10,
                    document_key: 'technical_review_report',
                    document_name: 'Báo cáo thẩm xét kỹ thuật',
                    storage_type: 'system_record',
                    status: technicalReviewCompleted ? 'completed' : 'pending',
                    reference_id: context.reviews[0]?.id ?? null,
                    entity_type: context.reviews[0] ? 'technical_review' : null,
                    entity_id: context.reviews[0]?.id ?? null,
                },
                {
                    item_no: 11,
                    document_key: 'audit_result_notification',
                    document_name: 'Thông báo kết quả đánh giá',
                    storage_type: 'system_record',
                    status: notificationSent ? 'completed' : 'pending',
                    reference_id: context.notifications[0]?.id ?? null,
                    entity_type: context.notifications[0] ? 'audit_result_notification' : null,
                    entity_id: context.notifications[0]?.id ?? null,
                },
                {
                    item_no: 12,
                    document_key: 'certification_decision',
                    document_name: 'Quyết định chứng nhận',
                    storage_type: 'system_record',
                    status: decisionIssued ? 'completed' : 'pending',
                    reference_id: context.decisions[0]?.id ?? null,
                    entity_type: context.decisions[0] ? 'certification_decision' : null,
                    entity_id: context.decisions[0]?.id ?? null,
                },
                {
                    item_no: 13,
                    document_key: 'certificate',
                    document_name: 'Giấy chứng nhận',
                    storage_type: 'system_record',
                    status: context.certificates.length > 0
                        && hasFileFor(
                            ['certificate_pdf'],
                            context.certificates.map((certificate) => certificate.id),
                        )
                        ? 'completed'
                        : 'pending',
                    reference_id: context.certificates[0]?.id ?? null,
                    entity_type: context.certificates[0] ? 'certificate' : null,
                    entity_id: context.certificates[0]?.id ?? null,
                },
                {
                    item_no: 14,
                    document_key: 'audit_log',
                    document_name: 'Xác nhận đánh giá/ngày công F.15',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['audit_log', 'audit_log_f15'],
                        context.scopedEntityIds,
                        allowLegacyProjectFiles,
                    ) ? 'completed' : 'pending',
                    entity_type: stage2Plan ? 'audit_plan' : 'certification_project',
                    entity_id: primaryUploadEntityId,
                },
                {
                    item_no: 15,
                    document_key: 'audit_monitoring',
                    document_name: 'Theo dõi quá trình đánh giá F.17',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['audit_monitoring_f17'],
                        context.scopedEntityIds,
                        allowLegacyProjectFiles,
                    ) ? 'completed' : 'pending',
                    entity_type: 'certification_project',
                    entity_id: project.id,
                },
            ];

            return {
                dossier_key: 'initial_certification',
                dossier_type: 'initial',
                dossier_label: 'Hồ sơ chứng nhận lần đầu',
                dossier_description: 'Bao gồm đánh giá giai đoạn 1, giai đoạn 2 và quyết định chứng nhận lần đầu.',
                sequence_no: 1,
                plan_ids: context.planIds,
                plan_codes: dossierPlans.map((plan) => plan.plan_code).filter(Boolean),
                planned_start_date: stage1Plan?.planned_start_date ?? stage2Plan?.planned_start_date ?? null,
                summary: summaryOf(items),
                items,
            };
        };

        const createSingleAuditDossier = (
            dossierKey: string,
            dossierType: string,
            dossierLabel: string,
            dossierDescription: string,
            sequenceNo: number,
            plan: (typeof plans)[number] | null,
        ) => {
            const dossierPlans = plan ? [plan] : [];
            const context = dossierContext(dossierPlans);
            const report = context.reports[0] ?? null;
            const issuedAppointment = context.appointments.find(
                (item) => normalize(item.status) === 'issued',
            ) ?? null;
            const ncFindings = context.findings.filter((item) =>
                ['minor_nc', 'major_nc', 'minornc', 'majornc'].includes(
                    normalize(item.finding_type),
                ),
            );
            const allFindingsClosed = ncFindings.length > 0
                && ncFindings.every((item) => normalize(item.status) === 'closed');
            const technicalReviewCompleted = context.reviews.some(
                (item) => ['completed', 'complete'].includes(normalize(item.status)),
            );
            const notification = context.notifications[0] ?? null;
            const notificationSent = normalize(notification?.status) === 'sent';
            const noCertificationChanges = Boolean(notification)
                && notification?.has_certification_changes === false;
            const decisionIssued = context.decisions.some(
                (item) => ['issued', 'approved'].includes(normalize(item.status)),
            );
            const uploadEntityId = plan?.id ?? project.id;

            const items: DossierItemResult[] = [
                {
                    item_no: 1,
                    document_key: 'audit_team_assignment',
                    document_name: 'Chỉ định đoàn đánh giá',
                    storage_type: 'system_record',
                    status: issuedAppointment ? 'completed' : 'pending',
                    reference_id: issuedAppointment?.id ?? null,
                    entity_type: issuedAppointment ? 'audit_team_appointment' : null,
                    entity_id: issuedAppointment?.id ?? null,
                },
                {
                    item_no: 2,
                    document_key: 'audit_plan',
                    document_name: `Kế hoạch ${dossierLabel.toLowerCase()}`,
                    storage_type: 'system_record',
                    status: plan ? 'completed' : 'pending',
                    reference_id: plan?.id ?? null,
                    entity_type: plan ? 'audit_plan' : null,
                    entity_id: plan?.id ?? null,
                },
                {
                    item_no: 3,
                    document_key: 'audit_checklist',
                    document_name: 'Bảng kiểm đánh giá',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['audit_checklist', 'audit_checklist_f06_qms', 'audit_checklist_f06_ems', 'audit_checklist_f06_ohsms'],
                        context.scopedEntityIds,
                    ) ? 'completed' : 'pending',
                    entity_type: plan ? 'audit_plan' : 'certification_project',
                    entity_id: uploadEntityId,
                },
                {
                    item_no: 4,
                    document_key: 'opening_closing_attendance',
                    document_name: 'Danh sách họp khai mạc/kết thúc',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['opening_closing_attendance', 'attendance_list', 'audit_attendance_f07'],
                        context.scopedEntityIds,
                    ) ? 'completed' : 'pending',
                    entity_type: plan ? 'audit_plan' : 'certification_project',
                    entity_id: uploadEntityId,
                },
                {
                    item_no: 5,
                    document_key: 'audit_report',
                    document_name: 'Báo cáo đánh giá',
                    storage_type: 'system_record',
                    status: report ? 'completed' : 'pending',
                    reference_id: report?.id ?? null,
                    entity_type: report ? 'report' : null,
                    entity_id: report?.id ?? null,
                },
                {
                    item_no: 6,
                    document_key: 'nc_cap',
                    document_name: 'Phiếu yêu cầu hành động khắc phục',
                    storage_type: 'system_record',
                    status: ncFindings.length === 0
                        ? 'not_applicable'
                        : allFindingsClosed ? 'completed' : 'pending',
                    entity_type: report ? 'report' : null,
                    entity_id: report?.id ?? null,
                },
                {
                    item_no: 7,
                    document_key: 'technical_review_report',
                    document_name: 'Báo cáo thẩm xét kỹ thuật',
                    storage_type: 'system_record',
                    status: technicalReviewCompleted ? 'completed' : 'pending',
                    reference_id: context.reviews[0]?.id ?? null,
                    entity_type: context.reviews[0] ? 'technical_review' : null,
                    entity_id: context.reviews[0]?.id ?? null,
                },
                {
                    item_no: 8,
                    document_key: 'audit_result_notification',
                    document_name: 'Thông báo kết quả đánh giá',
                    storage_type: 'system_record',
                    status: notificationSent ? 'completed' : 'pending',
                    reference_id: notification?.id ?? null,
                    entity_type: notification ? 'audit_result_notification' : null,
                    entity_id: notification?.id ?? null,
                },
                {
                    item_no: 9,
                    document_key: 'certification_decision',
                    document_name: 'Quyết định duy trì/thay đổi chứng nhận',
                    storage_type: 'system_record',
                    status: noCertificationChanges
                        ? 'not_applicable'
                        : decisionIssued ? 'completed' : 'pending',
                    reference_id: context.decisions[0]?.id ?? null,
                    entity_type: context.decisions[0] ? 'certification_decision' : null,
                    entity_id: context.decisions[0]?.id ?? null,
                },
                {
                    item_no: 10,
                    document_key: 'certificate',
                    document_name: 'Giấy chứng nhận sửa đổi (nếu có)',
                    storage_type: 'system_record',
                    status: noCertificationChanges
                        ? 'not_applicable'
                        : context.certificates.length > 0
                            && hasFileFor(
                                ['certificate_pdf'],
                                context.certificates.map((certificate) => certificate.id),
                            )
                            ? 'completed'
                            : 'pending',
                    reference_id: context.certificates[0]?.id ?? null,
                    entity_type: context.certificates[0] ? 'certificate' : null,
                    entity_id: context.certificates[0]?.id ?? null,
                },
                {
                    item_no: 11,
                    document_key: 'audit_log',
                    document_name: 'Xác nhận đánh giá/ngày công F.15',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['audit_log', 'audit_log_f15'],
                        context.scopedEntityIds,
                    ) ? 'completed' : 'pending',
                    entity_type: plan ? 'audit_plan' : 'certification_project',
                    entity_id: uploadEntityId,
                },
                {
                    item_no: 12,
                    document_key: 'audit_monitoring',
                    document_name: 'Theo dõi quá trình đánh giá F.17',
                    storage_type: 'system_record',
                    status: hasFileFor(
                        ['audit_monitoring_f17'],
                        context.scopedEntityIds,
                        true,
                    ) ? 'completed' : 'pending',
                    entity_type: 'certification_project',
                    entity_id: project.id,
                },
            ];

            return {
                dossier_key: dossierKey,
                dossier_type: dossierType,
                dossier_label: dossierLabel,
                dossier_description: dossierDescription,
                sequence_no: sequenceNo,
                plan_ids: context.planIds,
                plan_codes: dossierPlans.map((item) => item.plan_code).filter(Boolean),
                planned_start_date: plan?.planned_start_date ?? null,
                summary: summaryOf(items),
                items,
            };
        };

        const initialDossier = createInitialDossier();
        const surveillance1Dossier = createSingleAuditDossier(
            'surveillance_1',
            'surveillance1',
            'Hồ sơ giám sát lần 1',
            'Hồ sơ đánh giá giám sát năm thứ nhất; không áp dụng giai đoạn 1.',
            2,
            surveillance1Plan,
        );
        const surveillance2Dossier = createSingleAuditDossier(
            'surveillance_2',
            'surveillance2',
            'Hồ sơ giám sát lần 2',
            'Hồ sơ đánh giá giám sát năm thứ hai; không áp dụng giai đoạn 1.',
            3,
            surveillance2Plan,
        );

        const corePlanIds = new Set([
            ...initialDossier.plan_ids,
            ...surveillance1Dossier.plan_ids,
            ...surveillance2Dossier.plan_ids,
            ...(projectTeamPlan
                ? [
                    projectTeamPlan.id,
                ]
                : []),
        ]);
        const extraPlanLabels: Record<string, { label: string; description: string }> = {
            special: {
                label: 'Hồ sơ đánh giá đặc biệt',
                description: 'Đánh giá phát sinh theo yêu cầu hoặc để xử lý sự kiện đặc biệt.',
            },
            special_audit: {
                label: 'Hồ sơ đánh giá đặc biệt',
                description: 'Đánh giá phát sinh theo yêu cầu hoặc để xử lý sự kiện đặc biệt.',
            },
            extension: {
                label: 'Hồ sơ mở rộng phạm vi',
                description: 'Đánh giá phục vụ mở rộng phạm vi chứng nhận.',
            },
            scope_extension: {
                label: 'Hồ sơ mở rộng phạm vi',
                description: 'Đánh giá phục vụ mở rộng phạm vi chứng nhận.',
            },
            supplementary: {
                label: 'Hồ sơ đánh giá bổ sung',
                description: 'Đánh giá bổ sung để hoàn thiện bằng chứng hoặc xử lý yêu cầu phát sinh.',
            },
            follow_up: {
                label: 'Hồ sơ đánh giá bổ sung',
                description: 'Đánh giá bổ sung để hoàn thiện bằng chứng hoặc xử lý yêu cầu phát sinh.',
            },
            recertification: {
                label: 'Hồ sơ tái chứng nhận',
                description: 'Kỳ tái chứng nhận; nên được dùng để khởi tạo chu kỳ chứng nhận kế tiếp.',
            },
        };

        const extraDossiers = plans
            .filter((plan) => !corePlanIds.has(plan.id))
            .map((plan, index) => {
                const normalizedType = typeOfPlan(plan);
                const metadata = extraPlanLabels[normalizedType] ?? {
                    label: `Hồ sơ ${normalizedType.replaceAll('_', ' ') || 'đánh giá phát sinh'}`,
                    description: 'Hồ sơ đánh giá phát sinh ngoài ba kỳ cơ bản của chu kỳ.',
                };
                return createSingleAuditDossier(
                    `extra_${plan.id}`,
                    normalizedType || 'extra',
                    metadata.label,
                    metadata.description,
                    4 + index,
                    plan,
                );
            });

        const dossiers = [
            initialDossier,
            surveillance1Dossier,
            surveillance2Dossier,
            ...extraDossiers,
        ];

        const allItems = [
            ...commonItems,
            ...dossiers.flatMap((dossier) => dossier.items),
        ];
        const overallSummary = summaryOf(allItems);
        const currentDossier = dossiers.find(
            (dossier) => dossier.summary.dossier_status === 'in_progress',
        ) ?? dossiers.find(
            (dossier) => dossier.summary.dossier_status === 'not_started',
        ) ?? dossiers[0];

        return {
            project: {
                id: project.id,
                project_code: project.project_code,
                status: project.status,
                customer: {
                    id: application.customers.id,
                    customer_code: application.customers.customer_code,
                    company_name: application.customers.company_name,
                },
                standard_name: project.standard_name,
                certification_scope: application.certification_scope,
            },
            summary: overallSummary,
            common_items: commonItems,
            dossiers,
            current_dossier_key: currentDossier?.dossier_key ?? 'initial_certification',
            source_records: {
                application: {
                    ...application,
                    application_reviews: undefined,
                },
                application_review: application.application_reviews[0] ?? null,
            },
            // Giữ trường items để tương thích với các phiên bản giao diện cũ.
            items: [...commonItems, ...initialDossier.items],
            files: files.map((file) => ({
                id: file.id,
                entity_type: file.entity_type,
                entity_id: file.entity_id,
                document_type: file.document_type,
                file_kind: file.file_kind,
                original_name: file.original_name,
                file_url: file.file_url,
                version_no: file.version_no,
                uploaded_at: file.created_at,
            })),
        };
    }
    // Cảnh báo hồ sơ thiếu và công việc quá hạn
    async getAlerts(
        id: string,
        warningDays = 30,
    ) {
        const dossier =
            await this.getDossier(id);

        const safeWarningDays =
            Number.isFinite(warningDays)
                ? Math.min(
                    Math.max(
                        Math.trunc(warningDays),
                        1,
                    ),
                    365,
                )
                : 30;

        const today = new Date();

        today.setHours(
            0,
            0,
            0,
            0,
        );

        const warningDate =
            new Date(today);

        warningDate.setDate(
            warningDate.getDate() +
            safeWarningDays,
        );

        const plans =
            await this.prisma.audit_plans.findMany({
                where: {
                    project_id: id,
                },

                select: {
                    id: true,
                },
            });

        const planIds =
            plans.map((plan) => plan.id);

        const reports =
            planIds.length > 0
                ? await this.prisma.reports.findMany({
                    where: {
                        audit_plan_id: {
                            in: planIds,
                        },
                    },

                    select: {
                        id: true,
                    },
                })
                : [];

        const reportIds =
            reports.map((report) => report.id);

        const reviews =
            reportIds.length > 0
                ? await this.prisma.technical_reviews.findMany({
                    where: {
                        report_id: {
                            in: reportIds,
                        },
                    },

                    select: {
                        id: true,
                        report_id: true,
                        status: true,
                        created_at: true,
                    },
                })
                : [];

        const reviewIds =
            reviews.map((review) => review.id);

        const programs =
            await this.prisma.audit_programs.findMany({
                where: {
                    project_id: id,
                },

                select: {
                    id: true,
                },
            });

        const programIds =
            programs.map((program) => program.id);

        const [
            findings,
            events,
            notifications,
            certificates,
        ] = await Promise.all([
            reportIds.length > 0
                ? this.prisma.audit_findings.findMany({
                    where: {
                        report_id: {
                            in: reportIds,
                        },

                        status: {
                            not: 'closed',
                        },
                    },

                    select: {
                        id: true,
                        finding_code: true,
                        finding_type: true,
                        status: true,
                        due_date: true,
                        report_id: true,
                    },
                })
                : Promise.resolve([]),

            programIds.length > 0
                ? this.prisma.audit_program_events.findMany({
                    where: {
                        program_id: {
                            in: programIds,
                        },

                        status: {
                            notIn: [
                                'completed',
                                'cancelled',
                            ],
                        },
                    },

                    select: {
                        id: true,
                        event_type: true,
                        status: true,
                        planned_start_date: true,
                        program_id: true,
                    },
                })
                : Promise.resolve([]),

            reviewIds.length > 0
                ? this.prisma.audit_result_notifications.findMany({
                    where: {
                        technical_review_id: {
                            in: reviewIds,
                        },

                        status: {
                            not: 'sent',
                        },
                    },

                    select: {
                        id: true,
                        notification_number: true,
                        notification_date: true,
                        status: true,
                        technical_review_id: true,
                    },
                })
                : Promise.resolve([]),

            reviewIds.length > 0
                ? this.prisma.certificates.findMany({
                    where: {
                        technical_review_id: {
                            in: reviewIds,
                        },

                        status: {
                            in: [
                                'active',
                                'suspended',
                            ],
                        },
                    },

                    select: {
                        id: true,
                        cert_number: true,
                        status: true,
                        expire_date: true,
                    },
                })
                : Promise.resolve([]),
        ]);

        const alerts: Array<{
            alert_type: string;
            severity:
            | 'critical'
            | 'warning'
            | 'info';
            message: string;
            reference_id: string | null;
            due_date: Date | null;
        }> = [];

        // Hồ sơ còn thiếu theo từng kỳ đánh giá
        const alertDossierItems = [
            ...((dossier as any).common_items ?? []),
            ...(((dossier as any).dossiers ?? []).flatMap((group: any) =>
                (group.items ?? []).map((item: any) => ({
                    ...item,
                    document_name: `${group.dossier_label}: ${item.document_name}`,
                })),
            )),
        ];

        for (
            const item of
            alertDossierItems
        ) {
            if (
                item.status !== 'pending'
            ) {
                continue;
            }

            if (
                [
                    'nc_cap',
                    'audit_result_notification',
                ].includes(
                    item.document_key,
                )
            ) {
                continue;
            }

            alerts.push({
                alert_type:
                    'missing_document',

                severity:
                    'warning',

                message:
                    `Thiếu hồ sơ: ${item.document_name}`,

                reference_id:
                    item.reference_id ?? null,

                due_date:
                    null,
            });
        }

        // NC/CAP chưa đóng
        for (const finding of findings) {
            const dueDate =
                finding.due_date
                    ? new Date(
                        finding.due_date,
                    )
                    : null;

            const overdue =
                dueDate !== null &&
                dueDate < today;

            alerts.push({
                alert_type:
                    overdue
                        ? 'overdue_finding'
                        : 'open_finding',

                severity:
                    overdue
                        ? 'critical'
                        : 'warning',

                message:
                    overdue
                        ? `NC ${finding.finding_code} đã quá hạn`
                        : `NC ${finding.finding_code} chưa được đóng`,

                reference_id:
                    finding.id,

                due_date:
                    dueDate,
            });
        }

        // Lịch đánh giá
        for (const event of events) {
            const plannedDate =
                event.planned_start_date
                    ? new Date(
                        event.planned_start_date,
                    )
                    : null;

            // Sự kiện chưa lập lịch chưa được coi là quá hạn.
            // Hồ sơ/kế hoạch còn thiếu đã được F.17 cảnh báo riêng.
            if (!plannedDate) {
                continue;
            }

            if (plannedDate < today) {
                alerts.push({
                    alert_type:
                        'overdue_audit_event',

                    severity:
                        'critical',

                    message:
                        `Sự kiện ${event.event_type} đã quá ngày kế hoạch`,

                    reference_id:
                        event.id,

                    due_date:
                        plannedDate,
                });

                continue;
            }

            if (
                plannedDate <=
                warningDate
            ) {
                alerts.push({
                    alert_type:
                        'upcoming_audit_event',

                    severity:
                        'info',

                    message:
                        `Sự kiện ${event.event_type} sắp đến hạn`,

                    reference_id:
                        event.id,

                    due_date:
                        plannedDate,
                });
            }
        }

        // Thông báo chưa gửi
        for (
            const notification of
            notifications
        ) {
            alerts.push({
                alert_type:
                    'unsent_notification',

                severity:
                    'warning',

                message:
                    `Thông báo ${notification.notification_number} chưa gửi khách hàng`,

                reference_id:
                    notification.id,

                due_date:
                    notification.notification_date,
            });
        }

        // Chứng chỉ hết hạn hoặc sắp hết hạn
        for (
            const certificate of
            certificates
        ) {
            if (!certificate.expire_date) {
                alerts.push({
                    alert_type:
                        'certificate_missing_expiry',

                    severity:
                        'critical',

                    message:
                        `Chứng chỉ ${certificate.cert_number} chưa có ngày hết hạn`,

                    reference_id:
                        certificate.id,

                    due_date:
                        null,
                });

                continue;
            }

            const expireDate =
                new Date(
                    certificate.expire_date,
                );

            if (expireDate < today) {
                alerts.push({
                    alert_type:
                        'expired_certificate',

                    severity:
                        'critical',

                    message:
                        `Chứng chỉ ${certificate.cert_number} đã hết hạn`,

                    reference_id:
                        certificate.id,

                    due_date:
                        expireDate,
                });

                continue;
            }

            if (
                expireDate <=
                warningDate
            ) {
                alerts.push({
                    alert_type:
                        'expiring_certificate',

                    severity:
                        'warning',

                    message:
                        `Chứng chỉ ${certificate.cert_number} sắp hết hạn`,

                    reference_id:
                        certificate.id,

                    due_date:
                        expireDate,
                });
            }
        }

        const severityOrder = {
            critical: 1,
            warning: 2,
            info: 3,
        };

        alerts.sort(
            (first, second) => {
                const severityDifference =
                    severityOrder[
                    first.severity
                    ] -
                    severityOrder[
                    second.severity
                    ];

                if (
                    severityDifference !== 0
                ) {
                    return severityDifference;
                }

                if (
                    first.due_date &&
                    second.due_date
                ) {
                    return (
                        first.due_date.getTime() -
                        second.due_date.getTime()
                    );
                }

                return 0;
            },
        );

        return {
            project:
                dossier.project,

            warning_days:
                safeWarningDays,

            generated_at:
                new Date(),

            summary: {
                total:
                    alerts.length,

                critical:
                    alerts.filter(
                        (alert) =>
                            alert.severity ===
                            'critical',
                    ).length,

                warning:
                    alerts.filter(
                        (alert) =>
                            alert.severity ===
                            'warning',
                    ).length,

                info:
                    alerts.filter(
                        (alert) =>
                            alert.severity ===
                            'info',
                    ).length,
            },

            dossier_summary:
                dossier.summary,

            alerts,
        };
    }
    // Tạo hoàn chỉnh hồ sơ thương mại và dự án trong một giao dịch.
    // Nếu một bước lỗi thì hợp đồng/thỏa thuận/dự án đều được hoàn tác.
    async createComplete(
        dto: CreateCompleteCertificationProjectDto,
    ) {
        const application =
            await this.prisma.certification_applications.findUnique({
                where: {
                    id: dto.application_id,
                },
                include: {
                    customers: {
                        select: {
                            address: true,
                        },
                    },
                    sites: {
                        orderBy: {
                            site_no: 'asc',
                        },
                    },
                },
            });

        if (!application) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ đăng ký chứng nhận',
            );
        }

        if (
            (application.status ?? '')
                .trim()
                .toLowerCase() !== 'accepted'
        ) {
            throw new BadRequestException(
                'Hồ sơ đăng ký chưa được chấp nhận',
            );
        }

        if (
            dto.contract_mode === 'none' &&
            dto.agreement_mode === 'none'
        ) {
            throw new BadRequestException(
                'Phải có ít nhất hợp đồng hoặc thỏa thuận chứng nhận',
            );
        }

        if (
            dto.contract_mode === 'new' &&
            !dto.contract
        ) {
            throw new BadRequestException(
                'Thiếu thông tin hợp đồng mới',
            );
        }

        if (
            dto.agreement_mode === 'new' &&
            !dto.agreement
        ) {
            throw new BadRequestException(
                'Thiếu thông tin thỏa thuận chứng nhận mới',
            );
        }

        return this.prisma.$transaction(
            async (tx) => {
                const existingApplicationProject =
                    await tx.certification_projects.findFirst({
                        where: {
                            application_id: dto.application_id,
                        },
                    });

                if (existingApplicationProject) {
                    throw new BadRequestException(
                        'Hồ sơ đăng ký đã được tạo dự án chứng nhận',
                    );
                }

                const existingProjectCode =
                    await tx.certification_projects.findUnique({
                        where: {
                            project_code: dto.project_code.trim(),
                        },
                    });

                if (existingProjectCode) {
                    throw new BadRequestException(
                        'Mã dự án chứng nhận đã tồn tại',
                    );
                }

                // Dữ liệu cũ có thể đã được duyệt khi địa chỉ trụ sở được lưu ở
                // certification_applications/customers nhưng dòng địa điểm 01 còn rỗng.
                // Khởi tạo dự án phải dùng một nguồn dữ liệu thống nhất thay vì buộc
                // người dùng nhập lại thông tin đã được xem xét ở bước trước.
                const fallbackHeadquartersAddress =
                    dto.headquarters_address?.trim() ||
                    application.headquarters_address?.trim() ||
                    application.customers.address?.trim() ||
                    undefined;
                const effectivePersonnel =
                    application.employee_count ??
                    application.total_employee_count ??
                    undefined;
                const sortedSites = [...application.sites].sort(
                    (left, right) => left.site_no - right.site_no,
                );

                if (!sortedSites.length) {
                    if (!fallbackHeadquartersAddress) {
                        throw new BadRequestException(
                            `Đơn ${application.application_code} chưa có địa chỉ trụ sở hoặc địa chỉ địa điểm 01. Hãy bổ sung địa chỉ trong đơn đăng ký trước khi khởi tạo hồ sơ.`,
                        );
                    }

                    await tx.certification_application_sites.create({
                        data: {
                            application_id: application.id,
                            site_no: 1,
                            site_name: 'Trụ sở chính',
                            address: fallbackHeadquartersAddress,
                            activities: application.certification_scope,
                            employee_count: effectivePersonnel,
                            is_headquarters: true,
                        },
                    });
                } else {
                    const headquartersSite =
                        sortedSites.find((site) => site.is_headquarters) ??
                        sortedSites[0];

                    if (!headquartersSite.address?.trim()) {
                        if (!fallbackHeadquartersAddress) {
                            throw new BadRequestException(
                                `Đơn ${application.application_code} chưa có địa chỉ cho địa điểm ${String(headquartersSite.site_no).padStart(2, '0')}. Hãy bổ sung địa chỉ trong đơn đăng ký trước khi khởi tạo hồ sơ.`,
                            );
                        }

                        await tx.certification_application_sites.update({
                            where: {
                                id: headquartersSite.id,
                            },
                            data: {
                                address: fallbackHeadquartersAddress,
                                is_headquarters: true,
                                employee_count:
                                    sortedSites.length === 1
                                        ? effectivePersonnel
                                        : headquartersSite.employee_count,
                            },
                        });
                    } else if (!headquartersSite.is_headquarters) {
                        await tx.certification_application_sites.update({
                            where: {
                                id: headquartersSite.id,
                            },
                            data: {
                                is_headquarters: true,
                            },
                        });
                    }

                    const missingAdditionalSite = sortedSites.find(
                        (site) =>
                            site.id !== headquartersSite.id &&
                            !site.address?.trim(),
                    );

                    if (missingAdditionalSite) {
                        throw new BadRequestException(
                            `Đơn ${application.application_code} chưa có địa chỉ cho địa điểm ${String(missingAdditionalSite.site_no).padStart(2, '0')}. Hãy bổ sung địa chỉ trong đơn đăng ký trước khi khởi tạo hồ sơ.`,
                        );
                    }

                    if (
                        sortedSites.length === 1 &&
                        effectivePersonnel != null &&
                        headquartersSite.employee_count !== effectivePersonnel
                    ) {
                        await tx.certification_application_sites.update({
                            where: {
                                id: headquartersSite.id,
                            },
                            data: {
                                employee_count: effectivePersonnel,
                            },
                        });
                    }
                }

                if (
                    !application.headquarters_address?.trim() &&
                    fallbackHeadquartersAddress
                ) {
                    await tx.certification_applications.update({
                        where: {
                            id: application.id,
                        },
                        data: {
                            headquarters_address: fallbackHeadquartersAddress,
                        },
                    });
                }

                let contractId: string | undefined;

                if (dto.contract_mode === 'existing') {
                    const contract =
                        await tx.contracts.findUnique({
                            where: {
                                id: dto.contract_id!,
                            },
                        });

                    if (!contract) {
                        throw new NotFoundException(
                            'Không tìm thấy hợp đồng đã chọn',
                        );
                    }

                    if (
                        contract.customer_id !==
                        application.customer_id
                    ) {
                        throw new BadRequestException(
                            'Hợp đồng không thuộc khách hàng của hồ sơ đăng ký',
                        );
                    }

                    contractId = contract.id;
                }

                if (dto.contract_mode === 'new') {
                    const contractData = dto.contract!;

                    if (
                        contractData.start_date &&
                        contractData.end_date &&
                        new Date(contractData.end_date) <
                        new Date(contractData.start_date)
                    ) {
                        throw new BadRequestException(
                            'Ngày kết thúc hợp đồng không được trước ngày hiệu lực',
                        );
                    }

                    const duplicateContract =
                        await tx.contracts.findUnique({
                            where: {
                                contract_number:
                                    contractData.contract_number.trim(),
                            },
                        });

                    if (duplicateContract) {
                        throw new BadRequestException(
                            'Số hợp đồng đã tồn tại',
                        );
                    }

                    const contract =
                        await tx.contracts.create({
                            data: {
                                customer_id:
                                    application.customer_id,
                                contract_number:
                                    contractData.contract_number.trim(),
                                sign_date:
                                    contractData.sign_date
                                        ? new Date(contractData.sign_date)
                                        : undefined,
                                start_date:
                                    contractData.start_date
                                        ? new Date(contractData.start_date)
                                        : undefined,
                                end_date:
                                    contractData.end_date
                                        ? new Date(contractData.end_date)
                                        : undefined,
                                total_value:
                                    contractData.total_value,
                            },
                        });

                    contractId = contract.id;
                }

                let agreementId: string | undefined;

                if (dto.agreement_mode === 'existing') {
                    const agreement =
                        await tx.certification_agreements.findUnique({
                            where: {
                                id: dto.agreement_id!,
                            },
                        });

                    if (!agreement) {
                        throw new NotFoundException(
                            'Không tìm thấy thỏa thuận chứng nhận đã chọn',
                        );
                    }

                    if (
                        agreement.customer_id !==
                        application.customer_id
                    ) {
                        throw new BadRequestException(
                            'Thỏa thuận không thuộc khách hàng của hồ sơ đăng ký',
                        );
                    }

                    if (
                        contractId &&
                        agreement.contract_id &&
                        agreement.contract_id !== contractId
                    ) {
                        throw new BadRequestException(
                            'Thỏa thuận không thuộc hợp đồng đã chọn',
                        );
                    }

                    agreementId = agreement.id;

                    if (!contractId && agreement.contract_id) {
                        contractId = agreement.contract_id;
                    }
                }

                if (dto.agreement_mode === 'new') {
                    const agreementData = dto.agreement!;
                    const duplicateAgreement =
                        await tx.certification_agreements.findUnique({
                            where: {
                                agreement_number:
                                    agreementData.agreement_number.trim(),
                            },
                        });

                    if (duplicateAgreement) {
                        throw new BadRequestException(
                            'Số thỏa thuận chứng nhận đã tồn tại',
                        );
                    }

                    const agreement =
                        await tx.certification_agreements.create({
                            data: {
                                customer_id:
                                    application.customer_id,
                                contract_id: contractId,
                                agreement_number:
                                    agreementData.agreement_number.trim(),
                                sign_date:
                                    new Date(agreementData.sign_date),
                            },
                        });

                    agreementId = agreement.id;
                }

                if (!contractId && !agreementId) {
                    throw new BadRequestException(
                        'Phải có ít nhất hợp đồng hoặc thỏa thuận chứng nhận',
                    );
                }

                const project =
                    await tx.certification_projects.create({
                        data: {
                            application_id:
                                dto.application_id,
                            contract_id: contractId,
                            agreement_id: agreementId,
                            project_code:
                                dto.project_code.trim(),
                            standard_name:
                                dto.standard_name?.trim() ||
                                application.standard_name,
                            status: 'draft',
                        },
                        include: {
                            certification_applications: {
                                select: {
                                    id: true,
                                    application_code: true,
                                    standard_name: true,
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
                    });

                await this.createApprovedProjectScopesFromReview(
                    tx,
                    project.id,
                    dto.application_id,
                );

                await tx.certification_applications.update({
                    where: {
                        id: dto.application_id,
                    },
                    data: {
                        status: 'project_created',
                    },
                });

                return project;
            },
            {
                maxWait: 10000,
                timeout: 20000,
            },
        );
    }

    // Tạo dự án chứng nhận
    async create(
        dto: CreateCertificationProjectDto,
    ) {
        // Phải có ít nhất hợp đồng hoặc thỏa thuận
        if (!dto.contract_id && !dto.agreement_id) {
            throw new BadRequestException(
                'Phải có ít nhất hợp đồng hoặc thỏa thuận chứng nhận',
            );
        }

        // Kiểm tra hồ sơ đăng ký
        const application =
            await this.prisma.certification_applications.findUnique({
                where: {
                    id: dto.application_id,
                },
            });

        if (!application) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ đăng ký chứng nhận',
            );
        }

        const applicationStatus = (
            application.status ?? ''
        )
            .trim()
            .toLowerCase();

        if (applicationStatus !== 'accepted') {
            throw new BadRequestException(
                'Hồ sơ đăng ký chưa được chấp nhận',
            );
        }

        // Mỗi hồ sơ chỉ được tạo một dự án
        const existingApplicationProject =
            await this.prisma.certification_projects.findFirst({
                where: {
                    application_id: dto.application_id,
                },
            });

        if (existingApplicationProject) {
            throw new BadRequestException(
                'Hồ sơ đăng ký đã được tạo dự án chứng nhận',
            );
        }

        // Kiểm tra mã dự án
        const existingProject =
            await this.prisma.certification_projects.findUnique({
                where: {
                    project_code: dto.project_code,
                },
            });

        if (existingProject) {
            throw new BadRequestException(
                'Mã dự án chứng nhận đã tồn tại',
            );
        }

        // Kiểm tra hợp đồng
        if (dto.contract_id) {
            const contract =
                await this.prisma.contracts.findUnique({
                    where: {
                        id: dto.contract_id,
                    },
                });

            if (!contract) {
                throw new NotFoundException(
                    'Không tìm thấy hợp đồng',
                );
            }

            if (
                contract.customer_id !==
                application.customer_id
            ) {
                throw new BadRequestException(
                    'Hợp đồng không thuộc khách hàng của hồ sơ đăng ký',
                );
            }
        }

        // Kiểm tra thỏa thuận
        if (dto.agreement_id) {
            const agreement =
                await this.prisma.certification_agreements.findUnique({
                    where: {
                        id: dto.agreement_id,
                    },
                });

            if (!agreement) {
                throw new NotFoundException(
                    'Không tìm thấy thỏa thuận chứng nhận',
                );
            }

            if (
                agreement.customer_id !==
                application.customer_id
            ) {
                throw new BadRequestException(
                    'Thỏa thuận không thuộc khách hàng của hồ sơ đăng ký',
                );
            }

            if (
                dto.contract_id &&
                agreement.contract_id &&
                agreement.contract_id !== dto.contract_id
            ) {
                throw new BadRequestException(
                    'Thỏa thuận không thuộc hợp đồng đã chọn',
                );
            }
        }

        return this.prisma.$transaction(
            async (tx) => {
                const project =
                    await tx.certification_projects.create({
                        data: {
                            application_id:
                                dto.application_id,

                            contract_id:
                                dto.contract_id,

                            agreement_id:
                                dto.agreement_id,

                            project_code:
                                dto.project_code,

                            standard_name:
                                dto.standard_name ??
                                application.standard_name,

                            status: 'draft',
                        },
                        include: {
                            certification_applications: {
                                select: {
                                    id: true,
                                    application_code: true,
                                    standard_name: true,
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
                    });

                await this.createApprovedProjectScopesFromReview(
                    tx,
                    project.id,
                    dto.application_id,
                );

                await tx.certification_applications.update({
                    where: {
                        id: dto.application_id,
                    },
                    data: {
                        status: 'project_created',
                    },
                });

                return project;
            },
        );
    }
}
