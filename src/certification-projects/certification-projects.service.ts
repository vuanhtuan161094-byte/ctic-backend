import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationProjectDto } from './dto/create-certification-project.dto';

@Injectable()
export class CertificationProjectsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Lấy danh sách dự án chứng nhận
    async findAll() {
        return this.prisma.certification_projects.findMany({
            include: {
                certification_applications: {
                    select: {
                        id: true,
                        application_code: true,
                        standard_name: true,
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
                                },
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
    // Tổng hợp hồ sơ dự án theo F.17-P.09
    async getDossier(id: string) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id,
                },

                include: {
                    certification_applications: {
                        include: {
                            customers: true,
                            application_reviews: {
                                orderBy: {
                                    created_at: 'desc',
                                },
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

        const programs =
            await this.prisma.audit_programs.findMany({
                where: {
                    project_id: id,
                },

                orderBy: {
                    program_year: 'asc',
                },
            });

        const plans =
            await this.prisma.audit_plans.findMany({
                where: {
                    project_id: id,
                },

                orderBy: {
                    created_at: 'asc',
                },
            });

        const planIds =
            plans.map((plan) => plan.id);
        const teamAppointments =
            planIds.length > 0
                ? await this.prisma.audit_team_appointments.findMany({
                    where: {
                        audit_plan_id: {
                            in: planIds,
                        },
                    },

                    orderBy: {
                        created_at:
                            'desc',
                    },
                })
                : [];

        const issuedTeamAppointment =
            teamAppointments.find(
                (appointment) =>
                    appointment.status
                        .trim()
                        .toLowerCase() ===
                    'issued',
            ) ?? null;

        const teamAppointmentIds =
            teamAppointments.map(
                (appointment) =>
                    appointment.id,
            );

        const reports =
            planIds.length > 0
                ? await this.prisma.reports.findMany({
                    where: {
                        audit_plan_id: {
                            in: planIds,
                        },
                    },

                    orderBy: {
                        created_at: 'asc',
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

                    orderBy: {
                        created_at: 'asc',
                    },
                })
                : [];

        const reviewIds =
            reviews.map((review) => review.id);

        const decisions =
            reviewIds.length > 0
                ? await this.prisma.certification_decisions.findMany({
                    where: {
                        technical_review_id: {
                            in: reviewIds,
                        },
                    },

                    orderBy: {
                        decision_date: 'desc',
                    },
                })
                : [];

        const notifications =
            reviewIds.length > 0
                ? await this.prisma.audit_result_notifications.findMany({
                    where: {
                        technical_review_id: {
                            in: reviewIds,
                        },
                    },

                    orderBy: {
                        notification_date: 'desc',
                    },
                })
                : [];

        const certificates =
            reviewIds.length > 0
                ? await this.prisma.certificates.findMany({
                    where: {
                        technical_review_id: {
                            in: reviewIds,
                        },
                    },

                    orderBy: {
                        issue_date: 'desc',
                    },
                })
                : [];

        const findings =
            reportIds.length > 0
                ? await this.prisma.audit_findings.findMany({
                    where: {
                        report_id: {
                            in: reportIds,
                        },
                    },
                })
                : [];

        const entityIds = Array.from(
            new Set([
                project.id,
                project.application_id,
                ...planIds,
                ...reportIds,
                ...reviewIds,
                ...teamAppointmentIds,
            ]),
        );

        const files =
            await this.prisma.documentFile.findMany({
                where: {
                    entity_id: {
                        in: entityIds,
                    },

                    is_current: true,
                },

                orderBy: {
                    created_at: 'desc',
                },
            });

        const normalize = (
            value?: string | null,
        ) =>
            (value ?? '')
                .trim()
                .toLowerCase();

        const hasFile = (
            ...documentTypes: string[]
        ) =>
            files.some((file) =>
                documentTypes.includes(
                    normalize(file.document_type),
                ),
            );

        const application =
            project.certification_applications;

        const applicationReviewed =
            application.application_reviews.some(
                (review) =>
                    [
                        'accepted',
                        'approved',
                    ].includes(
                        normalize(review.result),
                    ),
            );

        const stage1Plan =
            plans.find((plan) =>
                [
                    'stage1',
                    'stage_1',
                    'initial_stage1',
                ].includes(
                    normalize(plan.audit_type),
                ),
            );

        const stage2Plan =
            plans.find((plan) =>
                [
                    'stage2',
                    'stage_2',
                    'initial_stage2',
                ].includes(
                    normalize(plan.audit_type),
                ),
            ) ??
            plans.find(
                (plan) =>
                    normalize(plan.audit_type) ===
                    'initial',
            );

        const stage1Report =
            stage1Plan
                ? reports.find(
                    (report) =>
                        report.audit_plan_id ===
                        stage1Plan.id,
                )
                : null;

        const stage2Report =
            stage2Plan
                ? reports.find(
                    (report) =>
                        report.audit_plan_id ===
                        stage2Plan.id,
                )
                : null;

        const technicalReviewCompleted =
            reviews.some((review) =>
                [
                    'completed',
                    'complete',
                ].includes(
                    normalize(review.status),
                ),
            );

        const notificationSent =
            notifications.some(
                (notification) =>
                    normalize(
                        notification.status,
                    ) === 'sent',
            );

        const decisionIssued =
            decisions.some((decision) =>
                [
                    'issued',
                    'approved',
                ].includes(
                    normalize(decision.status),
                ),
            );

        const hasSurveillanceWithoutChanges =
            notifications.some(
                (notification) =>
                    normalize(
                        notification.audit_type,
                    ).includes(
                        'surveillance',
                    ) &&
                    !notification.has_certification_changes,
            );

        const hasCertificate =
            certificates.length > 0;

        const allFindingsClosed =
            findings.length > 0 &&
            findings.every(
                (finding) =>
                    normalize(finding.status) ===
                    'closed',
            );

        const items = [
            {
                item_no: 1,
                document_key:
                    'certification_application',
                document_name:
                    'Phiếu đăng ký chứng nhận',
                storage_type: 'system_record',
                status: 'completed',
                reference_id: application.id,
            },
            {
                item_no: 2,
                document_key:
                    'application_review',
                document_name:
                    'Xem xét đăng ký chứng nhận',
                storage_type: 'system_record',
                status: applicationReviewed
                    ? 'completed'
                    : 'pending',
                reference_id:
                    application
                        .application_reviews[0]
                        ?.id ?? null,
            },
            {
                item_no: 3,
                document_key:
                    'business_license',
                document_name:
                    'Giấy phép đăng ký kinh doanh',
                storage_type: 'uploaded_file',
                status: hasFile(
                    'business_license',
                    'business_registration',
                )
                    ? 'completed'
                    : 'pending',
            },
            {
                item_no: 4,

                document_key:
                    'audit_team_assignment',

                document_name:
                    'Chỉ định đoàn đánh giá',

                storage_type:
                    'system_record',

                status:
                    issuedTeamAppointment ||
                        hasFile(
                            'audit_team_assignment',
                            'audit_team_assignment_letter',
                        )
                        ? 'completed'
                        : 'pending',

                reference_id:
                    issuedTeamAppointment
                        ?.id ??
                    null,
            },
            {
                item_no: 5,
                document_key: 'audit_program',
                document_name:
                    'Chương trình đánh giá',
                storage_type: 'system_record',
                status:
                    programs.length > 0
                        ? 'completed'
                        : 'pending',
                reference_id:
                    programs[0]?.id ?? null,
            },
            {
                item_no: 6,
                document_key:
                    'stage1_audit_plan',
                document_name:
                    'Kế hoạch đánh giá giai đoạn 1',
                storage_type: 'system_record',
                status: stage1Plan
                    ? 'completed'
                    : 'pending',
                reference_id:
                    stage1Plan?.id ?? null,
            },
            {
                item_no: 7,
                document_key:
                    'stage1_audit_report',
                document_name:
                    'Báo cáo đánh giá giai đoạn 1',
                storage_type: 'system_record',
                status: stage1Report
                    ? 'completed'
                    : 'pending',
                reference_id:
                    stage1Report?.id ?? null,
            },
            {
                item_no: 8,
                document_key:
                    'stage2_audit_plan',
                document_name:
                    'Kế hoạch đánh giá giai đoạn 2',
                storage_type: 'system_record',
                status: stage2Plan
                    ? 'completed'
                    : 'pending',
                reference_id:
                    stage2Plan?.id ?? null,
            },
            {
                item_no: 9,
                document_key:
                    'audit_checklist',
                document_name:
                    'Bảng kiểm đánh giá',
                storage_type: 'uploaded_file',
                status: hasFile(
                    'audit_checklist',
                )
                    ? 'completed'
                    : 'pending',
            },
            {
                item_no: 10,
                document_key:
                    'opening_closing_attendance',
                document_name:
                    'Danh sách họp khai mạc/kết thúc',
                storage_type: 'uploaded_file',
                status: hasFile(
                    'opening_closing_attendance',
                    'attendance_list',
                )
                    ? 'completed'
                    : 'pending',
            },
            {
                item_no: 11,
                document_key:
                    'stage2_audit_report',
                document_name:
                    'Báo cáo đánh giá giai đoạn 2',
                storage_type:
                    'system_record',
                status: stage2Report
                    ? 'completed'
                    : 'pending',
                reference_id:
                    stage2Report?.id ?? null,
            },
            {
                item_no: 12,
                document_key: 'nc_cap',
                document_name:
                    'Phiếu yêu cầu hành động khắc phục',
                storage_type: 'system_record',
                status:
                    findings.length === 0
                        ? 'not_applicable'
                        : allFindingsClosed
                            ? 'completed'
                            : 'pending',
            },
            {
                item_no: 13,
                document_key:
                    'technical_review_report',
                document_name:
                    'Báo cáo thẩm xét',
                storage_type: 'system_record',
                status:
                    technicalReviewCompleted
                        ? 'completed'
                        : 'pending',
                reference_id:
                    reviews[0]?.id ?? null,
            },
            {
                item_no: 14,
                document_key:
                    'audit_result_notification',
                document_name:
                    'Thông báo kết quả đánh giá',
                storage_type: 'system_record',
                status: notificationSent
                    ? 'completed'
                    : 'pending',
                reference_id:
                    notifications[0]?.id ??
                    null,
            },
            {
                item_no: 15,
                document_key:
                    'certification_decision',
                document_name:
                    'Quyết định chứng nhận',
                storage_type: 'system_record',
                status: decisionIssued
                    ? 'completed'
                    : hasSurveillanceWithoutChanges
                        ? 'not_applicable'
                        : 'pending',
                reference_id:
                    decisions[0]?.id ?? null,
            },
            {
                item_no: 16,
                document_key: 'certificate',
                document_name:
                    'Giấy chứng nhận',
                storage_type: 'system_record',
                status: hasCertificate
                    ? 'completed'
                    : 'pending',
                reference_id:
                    certificates[0]?.id ??
                    null,
            },
            {
                item_no: 17,
                document_key: 'audit_log',
                document_name:
                    'Xác nhận đánh giá/ngày công F.15',
                storage_type: 'uploaded_file',
                status: hasFile(
                    'audit_log',
                    'audit_log_f15',
                )
                    ? 'completed'
                    : 'pending',
            },
        ];

        const applicableItems =
            items.filter(
                (item) =>
                    item.status !==
                    'not_applicable',
            );

        const completedItems =
            applicableItems.filter(
                (item) =>
                    item.status ===
                    'completed',
            );

        return {
            project: {
                id: project.id,
                project_code:
                    project.project_code,
                status: project.status,

                customer: {
                    id: application.customers.id,
                    customer_code:
                        application.customers
                            .customer_code,
                    company_name:
                        application.customers
                            .company_name,
                },

                standard_name:
                    project.standard_name,

                certification_scope:
                    application
                        .certification_scope,
            },

            summary: {
                total_items:
                    applicableItems.length,

                completed_items:
                    completedItems.length,

                pending_items:
                    applicableItems.length -
                    completedItems.length,

                completion_percentage:
                    applicableItems.length === 0
                        ? 0
                        : Math.round(
                            (
                                completedItems.length /
                                applicableItems.length
                            ) *
                            100,
                        ),

                dossier_status:
                    completedItems.length ===
                        applicableItems.length
                        ? 'completed'
                        : 'in_progress',
            },

            items,

            files: files.map((file) => ({
                id: file.id,
                document_type:
                    file.document_type,
                file_kind: file.file_kind,
                original_name:
                    file.original_name,
                file_url: file.file_url,
                version_no:
                    file.version_no,
                uploaded_at:
                    file.created_at,
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

        // Hồ sơ còn thiếu theo F.17
        for (
            const item of
            dossier.items
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