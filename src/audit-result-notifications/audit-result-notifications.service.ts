import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateAuditResultNotificationDto } from './dto/create-audit-result-notification.dto';
import { MarkNotificationSentDto } from './dto/mark-notification-sent.dto';

@Injectable()
export class AuditResultNotificationsService {
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

    private normalizeNotification<
        T extends {
            form_data: unknown;
        },
    >(notification: T) {
        return {
            ...notification,

            form_data:
                this.parseFormData(
                    notification.form_data,
                ),
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
                            report_date: true,
                            audit_start_date: true,
                            audit_end_date: true,
                            audit_result: true,
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

            certification_decisions: {
                select: {
                    id: true,
                    decision_number: true,
                    decision_date: true,
                    decision_result: true,
                    effective_date: true,
                    expiry_date: true,
                    status: true,
                },
            },
        };
    }

    async findAll() {
        const notifications =
            await this.prisma.audit_result_notifications.findMany(
                {
                    include:
                        this.getDetailInclude(),

                    orderBy: {
                        created_at: 'desc',
                    },
                },
            );

        return notifications.map(
            (notification) =>
                this.normalizeNotification(
                    notification,
                ),
        );
    }

    async findOne(id: string) {
        const notification =
            await this.prisma.audit_result_notifications.findUnique(
                {
                    where: {
                        id,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!notification) {
            throw new NotFoundException(
                'Không tìm thấy thông báo kết quả đánh giá',
            );
        }

        return this.normalizeNotification(
            notification,
        );
    }

    async findByTechnicalReview(
        technicalReviewId: string,
    ) {
        const notification =
            await this.prisma.audit_result_notifications.findUnique(
                {
                    where: {
                        technical_review_id:
                            technicalReviewId,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!notification) {
            throw new NotFoundException(
                'Hồ sơ thẩm xét chưa có thông báo kết quả đánh giá',
            );
        }

        return this.normalizeNotification(
            notification,
        );
    }

    async create(
        dto: CreateAuditResultNotificationDto,
        createdBy?: string,
    ) {
        const allowedAuditTypes = [
            'initial',
            'surveillance',
            'recertification',
            'special',
        ];

        const allowedResults = [
            'certification_granted',
            'certification_maintained',
            'certification_not_granted',
            'certification_suspended',
            'certification_withdrawn',
        ];

        if (
            !allowedAuditTypes.includes(
                dto.audit_type,
            )
        ) {
            throw new BadRequestException(
                'Loại đánh giá không hợp lệ',
            );
        }

        if (
            !allowedResults.includes(
                dto.notification_result,
            )
        ) {
            throw new BadRequestException(
                'Kết quả thông báo không hợp lệ',
            );
        }

        const existingNotification =
            await this.prisma.audit_result_notifications.findFirst(
                {
                    where: {
                        OR: [
                            {
                                technical_review_id:
                                    dto.technical_review_id,
                            },
                            {
                                notification_number:
                                    dto.notification_number.trim(),
                            },
                        ],
                    },
                },
            );

        if (existingNotification) {
            throw new ConflictException(
                'Hồ sơ thẩm xét hoặc số thông báo đã được sử dụng',
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

        const hasCertificationChanges =
            dto.has_certification_changes ??
            false;

        if (
            dto.audit_type ===
            'surveillance' &&
            !hasCertificationChanges &&
            dto.notification_result !==
            'certification_maintained'
        ) {
            throw new BadRequestException(
                'Đánh giá giám sát không có thay đổi phải có kết quả duy trì chứng nhận',
            );
        }

        if (
            dto.audit_type ===
            'initial' &&
            ![
                'certification_granted',
                'certification_not_granted',
            ].includes(
                dto.notification_result,
            )
        ) {
            throw new BadRequestException(
                'Thông báo chứng nhận lần đầu chỉ được kết luận cấp hoặc không cấp chứng nhận',
            );
        }

        // F.12 is an outbound notification of an already-issued certification
        // decision. This is intentionally uniform for initial, surveillance,
        // recertification and special audits: Technical Review -> Decision -> F.12.
        const requiresDecision = true;

        let decision =
            dto.certification_decision_id
                ? await this.prisma.certification_decisions.findUnique(
                    {
                        where: {
                            id:
                                dto.certification_decision_id,
                        },
                    },
                )
                : null;

        if (
            !decision &&
            requiresDecision
        ) {
            decision =
                await this.prisma.certification_decisions.findUnique(
                    {
                        where: {
                            technical_review_id:
                                dto.technical_review_id,
                        },
                    },
                );
        }

        if (
            dto.certification_decision_id &&
            !decision
        ) {
            throw new NotFoundException(
                'Không tìm thấy quyết định chứng nhận',
            );
        }

        if (
            decision &&
            decision.technical_review_id !==
            dto.technical_review_id
        ) {
            throw new BadRequestException(
                'Quyết định không thuộc hồ sơ thẩm xét này',
            );
        }

        if (
            requiresDecision &&
            !decision
        ) {
            throw new BadRequestException(
                'Trường hợp này phải có quyết định chứng nhận trước khi lập thông báo',
            );
        }

        if (
            decision &&
            decision.status !== 'issued'
        ) {
            throw new BadRequestException(
                'Quyết định chứng nhận chưa được ban hành',
            );
        }

        if (decision) {
            const decisionType = String(decision.decision_type ?? '').trim().toUpperCase();
            const expectedNotificationResult =
                decisionType === 'REFUSE' ||
                decision.decision_result !== 'approved'
                    ? 'certification_not_granted'
                    : decisionType === 'SUSPEND'
                        ? 'certification_suspended'
                        : decisionType === 'WITHDRAW'
                            ? 'certification_withdrawn'
                            : ['MAINTAIN', 'RESTORE'].includes(decisionType)
                                ? 'certification_maintained'
                                : 'certification_granted';

            if (dto.notification_result !== expectedNotificationResult) {
                throw new BadRequestException(
                    'Kết quả thông báo phải phù hợp với quyết định chứng nhận đã ban hành',
                );
            }
        }

        if (
            (
                dto.notification_result ===
                'certification_granted' ||
                (
                    dto.notification_result ===
                    'certification_maintained' &&
                    hasCertificationChanges
                )
            ) &&
            decision?.decision_result !==
            'approved'
        ) {
            throw new BadRequestException(
                'Chưa có quyết định phê duyệt chứng nhận phù hợp',
            );
        }

        const project =
            review.reports.audit_plans
                .certification_projects;

        const application =
            project.certification_applications;

        const customer =
            application.customers;

        const organizationName =
            dto.organization_name?.trim() ||
            decision?.organization_name?.trim() ||
            customer.company_name?.trim();

        const organizationAddress =
            dto.organization_address?.trim() ||
            decision?.organization_address?.trim() ||
            customer.address?.trim() ||
            null;

        const standardName =
            dto.standard_name?.trim() ||
            decision?.standard_name?.trim() ||
            project.standard_name?.trim() ||
            application.standard_name?.trim();

        const certificationScope =
            dto.certification_scope?.trim() ||
            decision?.certification_scope?.trim() ||
            application.certification_scope?.trim();

        if (!organizationName) {
            throw new BadRequestException(
                'Thiếu tên tổ chức nhận thông báo',
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

        const notificationDate =
            this.parseDate(
                dto.notification_date,
                'Ngày thông báo',
            );

        if (!notificationDate) {
            throw new BadRequestException(
                'Thiếu ngày thông báo',
            );
        }

        const auditStartDate =
            this.parseDate(
                dto.audit_start_date,
                'Ngày bắt đầu đánh giá',
            ) ||
            review.reports
                .audit_start_date;

        const auditEndDate =
            this.parseDate(
                dto.audit_end_date,
                'Ngày kết thúc đánh giá',
            ) ||
            review.reports
                .audit_end_date;

        const nextAuditDueDate =
            this.parseDate(
                dto.next_audit_due_date,
                'Ngày đánh giá tiếp theo',
            );

        if (
            auditStartDate &&
            auditEndDate &&
            auditEndDate <
            auditStartDate
        ) {
            throw new BadRequestException(
                'Ngày kết thúc đánh giá phải bằng hoặc sau ngày bắt đầu',
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
                'Thiếu thông tin người ký thông báo',
            );
        }

        const formData = {
            template_code:
                'F.12-P.09',

            template_version:
                '1.1',

            custom_content:
                dto.custom_content ??
                {},
        };

        const notification =
            await this.prisma.audit_result_notifications.create(
                {
                    data: {
                        technical_review_id:
                            dto.technical_review_id,

                        certification_decision_id:
                            decision?.id ??
                            null,

                        notification_number:
                            dto.notification_number.trim(),

                        notification_date:
                            notificationDate,

                        audit_type:
                            dto.audit_type,

                        audit_start_date:
                            auditStartDate,

                        audit_end_date:
                            auditEndDate,

                        notification_result:
                            dto.notification_result,

                        has_certification_changes:
                            hasCertificationChanges,

                        organization_name:
                            organizationName,

                        organization_address:
                            organizationAddress,

                        recipient_name:
                            dto.recipient_name?.trim() ||
                            organizationName,

                        recipient_email:
                            dto.recipient_email?.trim() ||
                            customer.email?.trim() ||
                            null,

                        management_system:
                            dto.management_system?.trim() ||
                            decision?.management_system?.trim() ||
                            null,

                        standard_name:
                            standardName,

                        certification_scope:
                            certificationScope,

                        next_audit_due_date:
                            nextAuditDueDate,

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

        return this.normalizeNotification(
            notification,
        );
    }

    async markAsSent(
        id: string,
        dto: MarkNotificationSentDto,
    ) {
        const current =
            await this.prisma.audit_result_notifications.findUnique({
                where: {
                    id,
                },

                include: {
                    technical_reviews: {
                        select: {
                            reports: {
                                select: {
                                    audit_start_date: true,
                                    audit_end_date: true,

                                    audit_plans: {
                                        select: {
                                            id: true,
                                            audit_event_id: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

        if (!current) {
            throw new NotFoundException(
                'Không tìm thấy thông báo kết quả đánh giá',
            );
        }

        const sentAt = dto.sent_at
            ? new Date(dto.sent_at)
            : current.sent_at ?? new Date();

        if (Number.isNaN(sentAt.getTime())) {
            throw new BadRequestException(
                'Thời gian gửi thông báo không hợp lệ',
            );
        }

        const report =
            current.technical_reviews.reports;

        const auditPlan =
            report.audit_plans;

        return this.prisma.$transaction(
            async (transaction) => {
                const notification =
                    await transaction.audit_result_notifications.update({
                        where: {
                            id,
                        },

                        data: {
                            status: 'sent',

                            sent_at: sentAt,

                            recipient_email:
                                dto.recipient_email?.trim() ||
                                current.recipient_email,
                        },

                        include:
                            this.getDetailInclude(),
                    });

                // Hoàn thành kế hoạch đánh giá
                await transaction.audit_plans.update({
                    where: {
                        id: auditPlan.id,
                    },

                    data: {
                        status: 'completed',
                    },
                });

                // Hoàn thành sự kiện trong chương trình đánh giá
                if (auditPlan.audit_event_id) {
                    await transaction.audit_program_events.update({
                        where: {
                            id: auditPlan.audit_event_id,
                        },

                        data: {
                            status: 'completed',

                            actual_start_date:
                                report.audit_start_date ??
                                undefined,

                            actual_end_date:
                                report.audit_end_date ??
                                undefined,
                        },
                    });
                }

                return this.normalizeNotification(
                    notification,
                );
            },
        );
    }
}