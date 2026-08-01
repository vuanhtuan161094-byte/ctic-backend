import {
    BadRequestException,
    ConflictException,
    GoneException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { UpdateCertificateStatusDto } from './dto/update-certificate-status.dto';

import {
    existsSync,
} from 'fs';

import {
    join,
} from 'path';

import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';

import { CreateCertificateDto } from './dto/create-certificate.dto';

@Injectable()
export class CertificatesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
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
                            decision_number: true,
                            decision_date: true,
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

    private getPublicBaseUrl() {
        const configuredUrl =
            this.configService.get<string>(
                'PUBLIC_BASE_URL',
            );

        return (
            configuredUrl?.replace(
                /\/+$/,
                '',
            ) ||
            'http://localhost:3000'
        );
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
    ) {
        const existingCertificate =
            await this.prisma.certificates.findFirst(
                {
                    where: {
                        OR: [
                            {
                                technical_review_id:
                                    dto.technical_review_id,
                            },
                            {
                                cert_number:
                                    dto.cert_number.trim(),
                            },
                        ],
                    },
                },
            );

        if (existingCertificate) {
            throw new ConflictException(
                'Hồ sơ thẩm xét hoặc số chứng chỉ đã được sử dụng',
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
                                            true,
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

        const project =
            review.reports.audit_plans
                .certification_projects;

        return this.prisma.$transaction(
            async (transaction) => {
                // Tìm chứng chỉ đang có hiệu lực của cùng dự án
                const previousCertificates =
                    await transaction.certificates.findMany({
                        where: {
                            status: 'active',

                            technical_reviews: {
                                reports: {
                                    audit_plans: {
                                        project_id:
                                            project.id,
                                    },
                                },
                            },
                        },

                        select: {
                            id: true,
                            cert_number: true,
                        },
                    });

                // Tạo chứng chỉ mới hoặc chứng chỉ sửa đổi
                const certificate =
                    await transaction.certificates.create({
                        data: {
                            technical_review_id:
                                dto.technical_review_id,

                            cert_number:
                                dto.cert_number.trim(),

                            issue_date:
                                issueDate,

                            expire_date:
                                expireDate,

                            status:
                                'active',
                        },

                        include:
                            this.getDetailInclude(),
                    });

                // Chứng chỉ cũ không còn là bản hiện hành
                if (
                    previousCertificates.length >
                    0
                ) {
                    await transaction.certificates.updateMany({
                        where: {
                            id: {
                                in:
                                    previousCertificates.map(
                                        (item) =>
                                            item.id,
                                    ),
                            },
                        },

                        data: {
                            status:
                                'replaced',

                            updated_at:
                                new Date(),
                        },
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

                return {
                    ...certificate,

                    replaced_certificates:
                        previousCertificates,
                };
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
            certificate.status ?? 'active';

        const targetStatus =
            dto.status.trim().toLowerCase();

        if (currentStatus === targetStatus) {
            throw new BadRequestException(
                `Giấy chứng nhận đang ở trạng thái ${targetStatus}`,
            );
        }

        const allowedTransitions:
            Record<string, string[]> = {
            active: [
                'suspended',
                'withdrawn',
                'expired',
            ],

            suspended: [
                'active',
                'withdrawn',
                'expired',
            ],

            replaced: [],
            withdrawn: [],
            expired: [],
        };

        const allowedTargets =
            allowedTransitions[currentStatus] ?? [];

        if (
            !allowedTargets.includes(
                targetStatus,
            )
        ) {
            throw new BadRequestException(
                `Không được chuyển trạng thái từ ${currentStatus} sang ${targetStatus}`,
            );
        }

        if (
            targetStatus === 'active' &&
            certificate.expire_date &&
            certificate.expire_date.getTime() <
            new Date().getTime()
        ) {
            throw new BadRequestException(
                'Không thể khôi phục chứng chỉ đã hết hạn',
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
                        technical_reviews: {
                            select: {
                                certification_decision:
                                {
                                    select: {
                                        organization_name:
                                            true,

                                        organization_address:
                                            true,

                                        management_system:
                                            true,

                                        standard_name:
                                            true,

                                        certification_scope:
                                            true,
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

        const decision =
            certificate
                .technical_reviews
                .certification_decision;

        const expired =
            this.isExpired(
                certificate.expire_date,
            );

        return {
            cert_number:
                certificate.cert_number,

            issue_date:
                certificate.issue_date,

            expire_date:
                certificate.expire_date,

            status:
                certificate.status,

            is_valid:
                certificate.status ===
                'active' &&
                !expired,

            organization_name:
                decision?.organization_name ??
                null,

            organization_address:
                decision?.organization_address ??
                null,

            management_system:
                decision?.management_system ??
                null,

            standard_name:
                decision?.standard_name ??
                null,

            certification_scope:
                decision?.certification_scope ??
                null,
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

        const absolutePath =
            join(
                process.cwd(),
                'uploads',
                'documents',
                documentFile.stored_name,
            );

        if (
            !existsSync(
                absolutePath,
            )
        ) {
            throw new NotFoundException(
                'File PDF của giấy chứng nhận không tồn tại trên máy chủ',
            );
        }

        return {
            certificate,
            documentFile,
            absolutePath,
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
            `${certificate.verification_code}/pdf`;

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