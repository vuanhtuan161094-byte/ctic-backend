import {
    Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type AlertSeverity =
    | 'critical'
    | 'warning'
    | 'info';

export interface DashboardAlert {
    id: string;
    alert_type: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    entity_type: string;
    entity_id: string;
    due_date: Date | null;
}

interface StatusGroup {
    status: string | null;
    _count: {
        _all: number;
    };
}

@Injectable()
export class DashboardService {
    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private normalizeWarningDays(
        warningDays: number,
    ) {
        if (
            !Number.isFinite(
                warningDays,
            )
        ) {
            return 30;
        }

        return Math.min(
            Math.max(
                Math.trunc(
                    warningDays,
                ),
                1,
            ),
            365,
        );
    }

    private getDateRange(
        warningDays: number,
    ) {
        const today =
            new Date();

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
            warningDays,
        );

        return {
            today,
            warningDate,
        };
    }

    private normalizeStatusGroups(
        groups: StatusGroup[],
    ) {
        return groups
            .map((group) => ({
                status:
                    group.status ??
                    'unknown',

                count:
                    group._count._all,
            }))
            .sort(
                (first, second) =>
                    second.count -
                    first.count,
            );
    }

    async getOverview(
        warningDays = 30,
    ) {
        const safeWarningDays =
            this.normalizeWarningDays(
                warningDays,
            );

        const {
            today,
            warningDate,
        } = this.getDateRange(
            safeWarningDays,
        );

        const [
            totalCustomers,
            activeCustomers,
            totalProjects,
            activeProjects,
            pendingApplications,
            activeCertificates,
            expiringCertificates,
            expiredCertificates,
            upcomingAudits,
            overdueAudits,
            openFindings,
            overdueFindings,
            pendingReviews,
            unsentNotifications,
            projectStatusGroups,
            certificateStatusGroups,
            applicationStatusGroups,
            reviewStatusGroups,
            recentProjects,
            recentCertificates,
            upcomingAuditEvents,
        ] = await Promise.all([
            this.prisma.customers.count(),

            this.prisma.customers.count({
                where: {
                    status: 'active',
                },
            }),

            this.prisma.certification_projects.count(),

            this.prisma.certification_projects.count({
                where: {
                    status: {
                        notIn: [
                            'cancelled',
                            'closed',
                        ],
                    },
                },
            }),

            this.prisma.certification_applications.count({
                where: {
                    status: {
                        notIn: [
                            'accepted',
                            'project_created',
                            'rejected',
                            'cancelled',
                        ],
                    },
                },
            }),

            this.prisma.certificates.count({
                where: {
                    status: 'active',
                },
            }),

            this.prisma.certificates.count({
                where: {
                    status: {
                        in: [
                            'active',
                            'suspended',
                        ],
                    },

                    expire_date: {
                        gte: today,
                        lte: warningDate,
                    },
                },
            }),

            this.prisma.certificates.count({
                where: {
                    OR: [
                        {
                            status:
                                'expired',
                        },
                        {
                            status: {
                                in: [
                                    'active',
                                    'suspended',
                                ],
                            },

                            expire_date: {
                                lt: today,
                            },
                        },
                    ],
                },
            }),

            this.prisma.audit_program_events.count({
                where: {
                    status: {
                        notIn: [
                            'completed',
                            'cancelled',
                        ],
                    },

                    planned_start_date: {
                        gte: today,
                        lte: warningDate,
                    },
                },
            }),

            this.prisma.audit_program_events.count({
                where: {
                    status: {
                        notIn: [
                            'completed',
                            'cancelled',
                        ],
                    },

                    planned_start_date: {
                        lt: today,
                    },
                },
            }),

            this.prisma.audit_findings.count({
                where: {
                    status: {
                        not: 'closed',
                    },
                },
            }),

            this.prisma.audit_findings.count({
                where: {
                    status: {
                        not: 'closed',
                    },

                    due_date: {
                        lt: today,
                    },
                },
            }),

            this.prisma.technical_reviews.count({
                where: {
                    status: {
                        not: 'completed',
                    },
                },
            }),

            this.prisma.audit_result_notifications.count({
                where: {
                    status: {
                        not: 'sent',
                    },
                },
            }),

            this.prisma.certification_projects.groupBy({
                by: [
                    'status',
                ],

                _count: {
                    _all: true,
                },
            }),

            this.prisma.certificates.groupBy({
                by: [
                    'status',
                ],

                _count: {
                    _all: true,
                },
            }),

            this.prisma.certification_applications.groupBy({
                by: [
                    'status',
                ],

                _count: {
                    _all: true,
                },
            }),

            this.prisma.technical_reviews.groupBy({
                by: [
                    'status',
                ],

                _count: {
                    _all: true,
                },
            }),

            this.prisma.certification_projects.findMany({
                take: 5,

                orderBy: {
                    updated_at: 'desc',
                },

                select: {
                    id: true,
                    project_code: true,
                    standard_name: true,
                    status: true,
                    created_at: true,
                    updated_at: true,

                    certification_applications: {
                        select: {
                            application_code: true,
                            certification_type: true,

                            customers: {
                                select: {
                                    id: true,
                                    customer_code: true,
                                    company_name: true,
                                },
                            },
                        },
                    },
                },
            }),

            this.prisma.certificates.findMany({
                take: 5,

                orderBy: {
                    created_at: 'desc',
                },

                select: {
                    id: true,
                    verification_code: true,
                    cert_number: true,
                    issue_date: true,
                    expire_date: true,
                    status: true,
                    created_at: true,
                },
            }),

            this.prisma.audit_program_events.findMany({
                take: 10,

                where: {
                    status: {
                        notIn: [
                            'completed',
                            'cancelled',
                        ],
                    },

                    planned_start_date: {
                        gte: today,
                        lte: warningDate,
                    },
                },

                orderBy: {
                    planned_start_date:
                        'asc',
                },

                select: {
                    id: true,
                    event_type: true,
                    planned_start_date: true,
                    planned_end_date: true,
                    planned_mandays: true,
                    status: true,

                    audit_programs: {
                        select: {
                            id: true,
                            project_id: true,
                            program_code: true,
                            organization_name: true,
                            standard_name: true,
                        },
                    },
                },
            }),
        ]);

        const globalAlerts =
            await this.getAlerts(
                safeWarningDays,
            );

        return {
            generated_at:
                new Date(),

            warning_days:
                safeWarningDays,

            summary: {
                customers: {
                    total:
                        totalCustomers,

                    active:
                        activeCustomers,
                },

                projects: {
                    total:
                        totalProjects,

                    active:
                        activeProjects,
                },

                applications: {
                    pending:
                        pendingApplications,
                },

                certificates: {
                    active:
                        activeCertificates,

                    expiring:
                        expiringCertificates,

                    expired:
                        expiredCertificates,
                },

                audits: {
                    upcoming:
                        upcomingAudits,

                    overdue:
                        overdueAudits,
                },

                findings: {
                    open:
                        openFindings,

                    overdue:
                        overdueFindings,
                },

                technical_reviews: {
                    pending:
                        pendingReviews,
                },

                notifications: {
                    unsent:
                        unsentNotifications,
                },

                alerts:
                    globalAlerts.summary,
            },

            status_breakdown: {
                projects:
                    this.normalizeStatusGroups(
                        projectStatusGroups,
                    ),

                certificates:
                    this.normalizeStatusGroups(
                        certificateStatusGroups,
                    ),

                applications:
                    this.normalizeStatusGroups(
                        applicationStatusGroups,
                    ),

                technical_reviews:
                    this.normalizeStatusGroups(
                        reviewStatusGroups,
                    ),
            },

            recent_projects:
                recentProjects,

            recent_certificates:
                recentCertificates,

            upcoming_audits:
                upcomingAuditEvents,

            priority_alerts:
                globalAlerts.alerts.slice(
                    0,
                    10,
                ),
        };
    }

    async getAlerts(
        warningDays = 30,
    ) {
        const safeWarningDays =
            this.normalizeWarningDays(
                warningDays,
            );

        const {
            today,
            warningDate,
        } = this.getDateRange(
            safeWarningDays,
        );

        const [
            findings,
            auditEvents,
            certificates,
            notifications,
            revisionReviews,
        ] = await Promise.all([
            this.prisma.audit_findings.findMany({
                where: {
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
            }),

            this.prisma.audit_program_events.findMany({
                where: {
                    status: {
                        notIn: [
                            'completed',
                            'cancelled',
                        ],
                    },

                    planned_start_date: {
                        not: null,
                        lte: warningDate,
                    },
                },

                select: {
                    id: true,
                    event_type: true,
                    status: true,
                    planned_start_date: true,
                    planned_end_date: true,

                    audit_programs: {
                        select: {
                            project_id: true,
                            program_code: true,
                            organization_name: true,
                        },
                    },
                },
            }),

            this.prisma.certificates.findMany({
                where: {
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
            }),

            this.prisma.audit_result_notifications.findMany({
                where: {
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
            }),

            this.prisma.technical_reviews.findMany({
                where: {
                    status:
                        'revision_required',
                },

                select: {
                    id: true,
                    report_id: true,
                    status: true,
                    updated_at: true,

                    reports: {
                        select: {
                            report_code: true,
                        },
                    },
                },
            }),
        ]);

        const alerts:
            DashboardAlert[] = [];

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
                id:
                    `finding:${finding.id}`,

                alert_type:
                    overdue
                        ? 'overdue_finding'
                        : 'open_finding',

                severity:
                    overdue
                        ? 'critical'
                        : 'warning',

                title:
                    overdue
                        ? 'NC/CAP quá hạn'
                        : 'NC/CAP chưa đóng',

                message:
                    overdue
                        ? `NC ${finding.finding_code} đã quá hạn xử lý`
                        : `NC ${finding.finding_code} đang ở trạng thái ${finding.status}`,

                entity_type:
                    'audit_finding',

                entity_id:
                    finding.id,

                due_date:
                    dueDate,
            });
        }

        for (
            const event of
            auditEvents
        ) {
            const plannedDate =
                event.planned_start_date
                    ? new Date(
                        event.planned_start_date,
                    )
                    : null;

            if (!plannedDate) {
                continue;
            }

            const overdue =
                plannedDate < today;

            alerts.push({
                id:
                    `audit_event:${event.id}`,

                alert_type:
                    overdue
                        ? 'overdue_audit'
                        : 'upcoming_audit',

                severity:
                    overdue
                        ? 'critical'
                        : 'info',

                title:
                    overdue
                        ? 'Lịch đánh giá quá hạn'
                        : 'Lịch đánh giá sắp tới',

                message:
                    `${event.audit_programs.organization_name} – ${event.event_type}`,

                entity_type:
                    'audit_program_event',

                entity_id:
                    event.id,

                due_date:
                    plannedDate,
            });
        }

        for (
            const certificate of
            certificates
        ) {
            if (
                !certificate.expire_date
            ) {
                alerts.push({
                    id:
                        `certificate:${certificate.id}`,

                    alert_type:
                        'certificate_missing_expiry',

                    severity:
                        'critical',

                    title:
                        'Chứng chỉ thiếu ngày hết hạn',

                    message:
                        `Chứng chỉ ${certificate.cert_number} chưa có ngày hết hạn`,

                    entity_type:
                        'certificate',

                    entity_id:
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

            if (
                expireDate >
                warningDate
            ) {
                continue;
            }

            const expired =
                expireDate < today;

            alerts.push({
                id:
                    `certificate:${certificate.id}`,

                alert_type:
                    expired
                        ? 'expired_certificate'
                        : 'expiring_certificate',

                severity:
                    expired
                        ? 'critical'
                        : 'warning',

                title:
                    expired
                        ? 'Chứng chỉ đã hết hạn'
                        : 'Chứng chỉ sắp hết hạn',

                message:
                    `Chứng chỉ ${certificate.cert_number}`,

                entity_type:
                    'certificate',

                entity_id:
                    certificate.id,

                due_date:
                    expireDate,
            });
        }

        for (
            const notification of
            notifications
        ) {
            alerts.push({
                id:
                    `notification:${notification.id}`,

                alert_type:
                    'unsent_notification',

                severity:
                    'warning',

                title:
                    'Thông báo chưa gửi',

                message:
                    `Thông báo ${notification.notification_number} chưa gửi khách hàng`,

                entity_type:
                    'audit_result_notification',

                entity_id:
                    notification.id,

                due_date:
                    notification.notification_date,
            });
        }

        for (
            const review of
            revisionReviews
        ) {
            alerts.push({
                id:
                    `technical_review:${review.id}`,

                alert_type:
                    'technical_review_revision',

                severity:
                    'warning',

                title:
                    'Hồ sơ cần sửa đổi',

                message:
                    `Thẩm xét báo cáo ${review.reports.report_code ?? review.report_id} yêu cầu sửa đổi`,

                entity_type:
                    'technical_review',

                entity_id:
                    review.id,

                due_date:
                    null,
            });
        }

        const severityOrder:
            Record<
                AlertSeverity,
                number
            > = {
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
                    severityDifference !==
                    0
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
            generated_at:
                new Date(),

            warning_days:
                safeWarningDays,

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

            alerts,
        };
    }
}