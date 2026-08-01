import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,

} from '@nestjs/common';

import { UpdateTechnicalReviewReportDto } from './dto/update-technical-review-report.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AttachReviewDocumentDto } from './dto/attach-review-document.dto';
import { CreateTechnicalReviewDto } from './dto/create-technical-review.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';

@Injectable()
export class TechnicalReviewsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private parseFormData(
        value: unknown,
    ): Record<string, any> {
        if (!value) {
            return {};
        }

        if (
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            return value as Record<string, any>;
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);

                if (
                    parsed &&
                    typeof parsed === 'object' &&
                    !Array.isArray(parsed)
                ) {
                    return parsed;
                }

                return {};
            } catch {
                return {};
            }
        }

        return {};
    }

    private normalizeReview(review: any) {
        return {
            ...review,
            form_data: this.parseFormData(
                review.form_data,
            ),
        };
    }

    private buildReviewItems(report: any) {

        const auditPlan =
            report.audit_plans;

        const project =
            auditPlan?.certification_projects;

        const auditEvent =
            auditPlan?.audit_event;

        const documents = [
            {
                document_key:
                    'certification_application',

                document_name:
                    'Đơn đăng ký chứng nhận',

                document_id:
                    project?.application_id,

                source_type:
                    'system_record',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key: 'contract',

                document_name:
                    'Hợp đồng chứng nhận',

                document_id:
                    project?.contract_id,

                source_type:
                    'system_record',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key:
                    'certification_agreement',

                document_name:
                    'Thỏa thuận chứng nhận',

                document_id:
                    project?.agreement_id,

                source_type:
                    'system_record',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key:
                    'audit_program',

                document_name:
                    'Chương trình đánh giá',

                document_id:
                    auditEvent?.program_id,

                source_type:
                    'system_record',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key:
                    'audit_plan',

                document_name:
                    'Kế hoạch đánh giá',

                document_id:
                    auditPlan?.id ??
                    report.audit_plan_id,

                source_type:
                    'system_record',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key:
                    'audit_checklist',

                document_name:
                    'Bảng kiểm đánh giá',

                document_id: null,

                source_type:
                    'uploaded_file',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key:
                    'opening_closing_attendance',

                document_name:
                    'Danh sách họp khai mạc/kết thúc',

                document_id: null,

                source_type:
                    'uploaded_file',

                required: true,

                file_name: null,
                file_url: null,
            }, {
                document_key: 'audit_log',

                document_name:
                    'Xác nhận đánh giá/ngày công (F.15-P.09)',

                document_id: null,

                source_type: 'uploaded_file',

                required: true,

                file_name: null,
                file_url: null,
            },
            {
                document_key:
                    'audit_report',

                document_name:
                    'Báo cáo đánh giá',

                document_id:
                    report.id,

                source_type:
                    'system_record',

                required: true,

                file_name: null,
                file_url: null,
            },
            ...(
                Array.isArray(
                    report.audit_findings,
                ) &&
                    report.audit_findings.length > 0
                    ? [
                        {
                            document_key:
                                'nc_cap',

                            document_name:
                                'Hồ sơ NC/CAP',

                            document_id:
                                report.id,

                            source_type:
                                'system_record',

                            required:
                                true,

                            file_name:
                                null,

                            file_url:
                                null,
                        },
                    ]
                    : []
            ),
        ].filter(
            (document) =>
                document.source_type ===
                'uploaded_file' ||
                (
                    document.document_id !==
                    undefined &&
                    document.document_id !==
                    null
                ),
        );

        return documents.map(
            (document, index) => ({
                item_no: index + 1,

                document_key:
                    document.document_key,

                document_name:
                    document.document_name,

                document_id:
                    document.document_id,

                source_type:
                    document.source_type,

                required:
                    document.required,

                file_name:
                    document.file_name,

                file_url:
                    document.file_url,

                attached_at: null,

                status: 'pending',

                reviewer_comment: null,
                submitted_note: null,

                reviewed_at: null,
                resubmitted_at: null,
                accepted_at: null,
                updated_at: null,
            }),
        );
    }

    private calculateOverallStatus(
        reviewItems: any[],
    ) {
        if (
            reviewItems.some(
                (item) =>
                    item.status ===
                    'revision_required',
            )
        ) {
            return 'revision_required';
        }

        if (
            reviewItems.every(
                (item) =>
                    item.status === 'pending',
            )
        ) {
            return 'pending';
        }

        return 'in_review';
    }

    private async getReviewOrThrow(
        id: string,
    ) {
        const review =
            await this.prisma.technical_reviews.findUnique(
                {
                    where: {
                        id,
                    },

                    include: {
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
            );

        if (!review) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ thẩm xét',
            );
        }

        return review;
    }

    async create(
        dto: CreateTechnicalReviewDto,
    ) {
        const existingReview =
            await this.prisma.technical_reviews.findFirst(
                {
                    where: {
                        report_id:
                            dto.report_id,
                    },
                },
            );

        if (existingReview) {
            throw new ConflictException(
                'Báo cáo này đã có hồ sơ thẩm xét',
            );
        }

        const reviewer =
            await this.prisma.users.findUnique({
                where: {
                    id: dto.reviewer_id,
                },

                select: {
                    id: true,
                },
            });

        if (!reviewer) {
            throw new NotFoundException(
                'Không tìm thấy người thẩm xét',
            );
        }

        const report =
            await this.prisma.reports.findUnique({
                where: {
                    id: dto.report_id,
                },

                include: {
                    audit_findings: {
                        select: {
                            id: true,
                            finding_code: true,
                            finding_type: true,
                            status: true,
                        },
                    }, audit_plans: {
                        include: {
                            certification_projects:
                                true,

                            audit_event: true,
                        },
                    },
                },
            });

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        } const unresolvedNc =
            report.audit_findings.filter((finding) =>
                [
                    'major_nc',
                    'minor_nc',
                ].includes(
                    finding.finding_type,
                ) &&
                finding.status !==
                'closed',
            );

        if (unresolvedNc.length > 0) {
            throw new BadRequestException(
                `Còn ${unresolvedNc.length} NC chưa được đóng`,
            );
        }
        const reviewItems =
            this.buildReviewItems(report);

        if (reviewItems.length === 0) {
            throw new BadRequestException(
                'Không xác định được hồ sơ cần thẩm xét',
            );
        }

        const formData = {
            review_items: reviewItems,

            final_confirmation: {
                all_documents_accepted:
                    false,

                confirmed_at: null,
            },
        };

        const created =
            await this.prisma.technical_reviews.create(
                {
                    data: {
                        report_id:
                            dto.report_id,

                        reviewer_id:
                            dto.reviewer_id,

                        status: 'pending',

                        general_comment:
                            dto.general_comment ??
                            null,

                        form_data:
                            JSON.stringify(
                                formData,
                            ),
                    },

                    include: {
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
            );

        return this.normalizeReview(
            created,
        );
    }

    async findAll() {
        const reviews =
            await this.prisma.technical_reviews.findMany(
                {
                    orderBy: {
                        created_at: 'desc',
                    },

                    include: {
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
            );

        return reviews.map((review) =>
            this.normalizeReview(review),
        );
    }

    async findOne(id: string) {
        const review =
            await this.getReviewOrThrow(id);

        return this.normalizeReview(
            review,
        );
    }

    async findByReport(
        reportId: string,
    ) {
        const reviews =
            await this.prisma.technical_reviews.findMany(
                {
                    where: {
                        report_id: reportId,
                    },

                    orderBy: {
                        created_at: 'desc',
                    },

                    include: {
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
            );

        return reviews.map((review) =>
            this.normalizeReview(review),
        );
    }

    async updateReviewItem(
        id: string,
        documentKey: string,
        dto: UpdateReviewItemDto,
    ) {
        const review =
            await this.getReviewOrThrow(id);

        if (
            review.status === 'completed'
        ) {
            throw new BadRequestException(
                'Hồ sơ đã hoàn thành thẩm xét',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const reviewItems =
            Array.isArray(
                formData.review_items,
            )
                ? formData.review_items
                : [];

        const itemIndex =
            reviewItems.findIndex(
                (item: any) =>
                    item.document_key ===
                    documentKey,
            );

        if (itemIndex === -1) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ cần thẩm xét',
            );
        }

        const currentItem =
            reviewItems[itemIndex];

        const currentStatus =
            currentItem.status ??
            'pending';

        const allowedTransitions: Record<
            string,
            string[]
        > = {
            pending: [
                'revision_required',
                'accepted',
            ],

            revision_required: [
                'resubmitted',
            ],

            resubmitted: [
                'revision_required',
                'accepted',
            ],

            accepted: [
                'revision_required',
            ],
        };

        if (
            dto.status !== currentStatus &&
            !allowedTransitions[
                currentStatus
            ]?.includes(dto.status)
        ) {
            throw new BadRequestException(
                `Không thể chuyển trạng thái từ ${currentStatus} sang ${dto.status}`,
            );
        }

        if (
            dto.status ===
            'revision_required' &&
            !dto.reviewer_comment?.trim()
        ) {
            throw new BadRequestException(
                'Phải nhập nhận xét khi yêu cầu sửa hồ sơ',
            );
        }
        if (
            dto.status === 'accepted' &&
            currentItem.source_type ===
            'uploaded_file' &&
            !currentItem.file_url
        ) {
            throw new BadRequestException(
                `Chưa gán file cho hồ sơ: ${currentItem.document_name}`,
            );
        }
        const now =
            new Date().toISOString();


        const updatedItem = {
            ...currentItem,

            status: dto.status,

            reviewer_comment:
                dto.reviewer_comment !==
                    undefined
                    ? dto.reviewer_comment
                    : currentItem.reviewer_comment,

            submitted_note:
                dto.submitted_note !==
                    undefined
                    ? dto.submitted_note
                    : currentItem.submitted_note,

            updated_at: now,
        };

        if (
            dto.status ===
            'revision_required'
        ) {
            updatedItem.reviewed_at =
                now;

            updatedItem.accepted_at =
                null;
        }

        if (
            dto.status === 'resubmitted'
        ) {
            updatedItem.resubmitted_at =
                now;

            updatedItem.accepted_at =
                null;
        }

        if (
            dto.status === 'accepted'
        ) {
            updatedItem.reviewed_at =
                now;

            updatedItem.accepted_at =
                now;
        }

        reviewItems[itemIndex] =
            updatedItem;

        const nextOverallStatus =
            this.calculateOverallStatus(
                reviewItems,
            );

        const nextFormData = {
            ...formData,

            review_items: reviewItems,

            final_confirmation: {
                all_documents_accepted:
                    false,

                confirmed_at: null,
            },
        };

        const updated =
            await this.prisma.technical_reviews.update(
                {
                    where: {
                        id,
                    },

                    data: {
                        status:
                            nextOverallStatus,

                        completed_at: null,

                        form_data:
                            JSON.stringify(
                                nextFormData,
                            ),
                    },

                    include: {
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
            );

        return this.normalizeReview(
            updated,
        );
    }

    async complete(id: string) {
        const review =
            await this.getReviewOrThrow(id);

        if (
            review.status === 'completed'
        ) {
            throw new BadRequestException(
                'Hồ sơ đã hoàn thành thẩm xét',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const reviewItems =
            Array.isArray(
                formData.review_items,
            )
                ? formData.review_items
                : [];

        if (reviewItems.length === 0) {
            throw new BadRequestException(
                'Hồ sơ thẩm xét chưa có danh mục tài liệu',
            );
        }
        const missingFiles =
            reviewItems.filter(
                (item: any) =>
                    item.required === true &&
                    item.source_type ===
                    'uploaded_file' &&
                    !item.file_url,
            );

        if (
            missingFiles.length > 0
        ) {
            const documentNames =
                missingFiles
                    .map(
                        (item: any) =>
                            item.document_name,
                    )
                    .join(', ');

            throw new BadRequestException(
                `Chưa gán file cho các hồ sơ: ${documentNames}`,
            );
        }
        const unacceptedItems =
            reviewItems.filter(
                (item: any) =>
                    item.status !==
                    'accepted',
            );

        if (
            unacceptedItems.length > 0
        ) {
            const documentNames =
                unacceptedItems
                    .map(
                        (item: any) =>
                            item.document_name,
                    )
                    .join(', ');

            throw new BadRequestException(
                `Chưa thể hoàn thành. Các hồ sơ chưa đạt: ${documentNames}`,
            );
        }

        const completedAt =
            new Date();

        const nextFormData = {
            ...formData,

            final_confirmation: {
                all_documents_accepted:
                    true,

                confirmed_at:
                    completedAt.toISOString(),
            },
        };

        return this.prisma.$transaction(
            async (transaction) => {
                await transaction.reports.update({
                    where: {
                        id: review.report_id,
                    },

                    data: {
                        status:
                            'technical_review_completed',
                    },
                });

                const completed =
                    await transaction.technical_reviews.update(
                        {
                            where: {
                                id,
                            },

                            data: {
                                status: 'completed',

                                completed_at:
                                    completedAt,

                                form_data:
                                    JSON.stringify(
                                        nextFormData,
                                    ),
                            },

                            include: {
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
                    );

                return this.normalizeReview(
                    completed,
                );
            },
        );
    }
    async updateTechnicalReviewReport(
        id: string,
        dto: UpdateTechnicalReviewReportDto,
    ) {
        const review =
            await this.getReviewOrThrow(id);

        if (review.status !== 'completed') {
            throw new BadRequestException(
                'Chỉ được lập báo cáo sau khi hoàn thành thẩm xét',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const currentReport =
            formData.technical_review_report &&
                typeof formData.technical_review_report ===
                'object' &&
                !Array.isArray(
                    formData.technical_review_report,
                )
                ? formData.technical_review_report
                : {};

        const now =
            new Date().toISOString();

        const technicalReviewReport = {
            ...currentReport,

            review_date:
                dto.review_date,

            preliminary_review_result:
                dto.preliminary_review_result.trim(),

            technical_review_result:
                dto.technical_review_result.trim(),

            conclusion:
                dto.conclusion.trim(),

            recommendation:
                dto.recommendation,

            conditions:
                dto.conditions?.trim() ||
                null,

            additional_comment:
                dto.additional_comment?.trim() ||
                null,

            prepared_at:
                currentReport.prepared_at ??
                now,

            updated_at:
                now,
        };

        const nextFormData = {
            ...formData,

            technical_review_report:
                technicalReviewReport,
        };

        const updated =
            await this.prisma.technical_reviews.update(
                {
                    where: {
                        id,
                    },

                    data: {
                        form_data:
                            JSON.stringify(
                                nextFormData,
                            ),
                    },

                    include: {
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
            );

        return this.normalizeReview(
            updated,
        );
    }

    async getTechnicalReviewReport(
        id: string,
    ) {
        const review =
            await this.getReviewOrThrow(id);

        if (review.status !== 'completed') {
            throw new BadRequestException(
                'Hồ sơ chưa hoàn thành thẩm xét',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const technicalReviewReport =
            formData.technical_review_report;

        if (
            !technicalReviewReport ||
            typeof technicalReviewReport !==
            'object' ||
            Array.isArray(
                technicalReviewReport,
            )
        ) {
            throw new NotFoundException(
                'Chưa lập báo cáo thẩm xét kỹ thuật',
            );
        }

        return {
            technical_review_id:
                review.id,

            report_id:
                review.report_id,

            review_status:
                review.status,

            completed_at:
                review.completed_at,

            source_report:
                review.reports,

            reviewer:
                review.reviewer,

            review_items:
                Array.isArray(
                    formData.review_items,
                )
                    ? formData.review_items
                    : [],

            final_confirmation:
                formData.final_confirmation ??
                null,

            technical_review_report:
                technicalReviewReport,
        };
    }
    async syncDocuments(id: string) {
        const review =
            await this.getReviewOrThrow(id);

        if (
            review.status === 'completed'
        ) {
            throw new BadRequestException(
                'Hồ sơ đã hoàn thành thẩm xét',
            );
        }

        const report =
            await this.prisma.reports.findUnique({
                where: {
                    id: review.report_id,
                },

                include: {
                    audit_plans: {
                        include: {
                            certification_projects:
                                true,

                            audit_event: true,
                        },
                    },
                },
            });

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const currentItems =
            Array.isArray(
                formData.review_items,
            )
                ? formData.review_items
                : [];

        const templateItems =
            this.buildReviewItems(report);

        const templateKeys =
            new Set(
                templateItems.map(
                    (item: any) =>
                        item.document_key,
                ),
            );

        const mergedItems =
            templateItems.map(
                (
                    templateItem: any,
                    index: number,
                ) => {
                    const currentItem =
                        currentItems.find(
                            (item: any) =>
                                item.document_key ===
                                templateItem.document_key,
                        );

                    if (!currentItem) {
                        return {
                            ...templateItem,

                            item_no:
                                index + 1,
                        };
                    }

                    return {
                        ...templateItem,
                        ...currentItem,

                        item_no:
                            index + 1,

                        document_name:
                            templateItem.document_name,

                        document_id:
                            templateItem.document_id ??
                            currentItem.document_id ??
                            null,

                        source_type:
                            templateItem.source_type,

                        required:
                            templateItem.required,
                    };
                },
            );

        const additionalItems =
            currentItems
                .filter(
                    (item: any) =>
                        !templateKeys.has(
                            item.document_key,
                        ),
                )
                .map(
                    (
                        item: any,
                        index: number,
                    ) => ({
                        ...item,

                        item_no:
                            mergedItems.length +
                            index +
                            1,
                    }),
                );

        const reviewItems = [
            ...mergedItems,
            ...additionalItems,
        ];

        const nextFormData = {
            ...formData,

            review_items:
                reviewItems,

            final_confirmation: {
                all_documents_accepted:
                    false,

                confirmed_at: null,
            },
        };

        const nextStatus =
            this.calculateOverallStatus(
                reviewItems,
            );

        const updated =
            await this.prisma.technical_reviews.update(
                {
                    where: {
                        id,
                    },

                    data: {
                        status:
                            nextStatus,

                        completed_at:
                            null,

                        form_data:
                            JSON.stringify(
                                nextFormData,
                            ),
                    },

                    include: {
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
            );

        return this.normalizeReview(
            updated,
        );
    }

    async attachDocument(
        id: string,
        documentKey: string,
        dto: AttachReviewDocumentDto,
    ) {
        const review =
            await this.getReviewOrThrow(id);

        const documentFile =
            await this.prisma.documentFile.findUnique({
                where: {
                    id: dto.document_file_id,
                },
            });

        if (!documentFile) {
            throw new NotFoundException(
                'Không tìm thấy file hồ sơ',
            );
        }

        if (!documentFile.is_current) {
            throw new BadRequestException(
                'Không thể gán phiên bản file đã cũ',
            );
        }

        const allowedDocumentTypes: Record<
            string,
            string[]
        > = {
            audit_checklist: [
                'audit_checklist',
            ],

            opening_closing_attendance: [
                'opening_closing_attendance',
                'attendance_list',
            ],

            audit_log: [
                'audit_log',
                'audit_log_f15',
            ],
        };

        const expectedTypes =
            allowedDocumentTypes[documentKey];

        if (
            expectedTypes &&
            !expectedTypes.includes(
                documentFile.document_type,
            )
        ) {
            throw new BadRequestException(
                'Loại file không phù hợp với hồ sơ',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const reviewItems =
            Array.isArray(
                formData.review_items,
            )
                ? formData.review_items
                : [];

        const itemIndex =
            reviewItems.findIndex(
                (item: any) =>
                    item.document_key ===
                    documentKey,
            );

        if (itemIndex === -1) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ cần gán file',
            );
        }

        const currentItem =
            reviewItems[itemIndex];

        const fileChanged =
            currentItem.document_file_id !==
            documentFile.id;

        const now =
            new Date().toISOString();

        const updatedItem: any = {
            ...currentItem,

            document_file_id:
                documentFile.id,

            document_version:
                documentFile.version_no,

            file_kind:
                documentFile.file_kind,

            file_name:
                documentFile.original_name,

            file_url:
                documentFile.file_url,

            attached_at:
                now,

            updated_at:
                now,
        };

        if (fileChanged) {
            updatedItem.status =
                'pending';

            updatedItem.reviewed_at =
                null;

            updatedItem.accepted_at =
                null;

            updatedItem.resubmitted_at =
                null;
        }

        reviewItems[itemIndex] =
            updatedItem;

        const nextStatus =
            this.calculateOverallStatus(
                reviewItems,
            );

        const nextFormData = {
            ...formData,

            review_items:
                reviewItems,

            final_confirmation: {
                all_documents_accepted:
                    false,

                confirmed_at:
                    null,
            },
        };

        const updated =
            await this.prisma.technical_reviews.update({
                where: {
                    id,
                },

                data: {
                    status:
                        nextStatus,

                    completed_at:
                        null,

                    form_data:
                        JSON.stringify(
                            nextFormData,
                        ),
                },

                include: {
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
            });

        return this.normalizeReview(
            updated,
        );
    }
}
