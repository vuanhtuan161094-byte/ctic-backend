import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CloseAuditFindingDto } from './dto/close-audit-finding.dto';
import { CreateAuditFindingDto } from './dto/create-audit-finding.dto';
import { CreateCorrectiveActionDto } from './dto/create-corrective-action.dto';
import { ReviewCorrectiveActionDto } from './dto/review-corrective-action.dto';

@Injectable()
export class AuditFindingsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private getDetailInclude() {
        return {
            reports: {
                select: {
                    id: true,
                    report_code: true,
                    audit_plan_id: true,
                    audit_result: true,
                    status: true,
                },
            },

            corrective_actions: {
                orderBy: {
                    version_no:
                        'desc' as const,
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

        const parsed = new Date(value);

        if (
            Number.isNaN(
                parsed.getTime(),
            )
        ) {
            throw new BadRequestException(
                `${fieldName} không hợp lệ`,
            );
        }

        return parsed;
    }

    private parseFormData(
        value: string | null,
    ) {
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }

    private normalizeFinding(
        finding: any,
    ) {
        return {
            ...finding,

            is_overdue:
                finding.status !== 'closed' &&
                finding.due_date !== null &&
                new Date(
                    finding.due_date,
                ).getTime() <
                new Date().getTime(),

            corrective_actions:
                finding.corrective_actions?.map(
                    (action: any) => ({
                        ...action,

                        form_data:
                            this.parseFormData(
                                action.form_data,
                            ),
                    }),
                ) ?? [],
        };
    }

    private async generateFindingCode(
        findingType: string,
        year: number,
    ) {
        const prefixMap:
            Record<string, string> = {
            major_nc:
                `MAJ-${year}-`,

            minor_nc:
                `MIN-${year}-`,

            ofi:
                `OFI-${year}-`,
        };

        const prefix =
            prefixMap[findingType];

        const latest =
            await this.prisma.audit_findings.findFirst(
                {
                    where: {
                        finding_code: {
                            startsWith:
                                prefix,
                        },
                    },

                    orderBy: {
                        finding_code:
                            'desc',
                    },

                    select: {
                        finding_code:
                            true,
                    },
                },
            );

        let nextNumber = 1;

        if (latest) {
            const currentNumber =
                Number(
                    latest.finding_code.replace(
                        prefix,
                        '',
                    ),
                );

            if (
                !Number.isNaN(
                    currentNumber,
                )
            ) {
                nextNumber =
                    currentNumber + 1;
            }
        }

        return `${prefix}${String(
            nextNumber,
        ).padStart(4, '0')}`;
    }

    async findAll() {
        const findings =
            await this.prisma.audit_findings.findMany(
                {
                    include:
                        this.getDetailInclude(),

                    orderBy: {
                        created_at:
                            'desc',
                    },
                },
            );

        return findings.map(
            (finding) =>
                this.normalizeFinding(
                    finding,
                ),
        );
    }

    async findByReport(
        reportId: string,
    ) {
        const report =
            await this.prisma.reports.findUnique(
                {
                    where: {
                        id:
                            reportId,
                    },

                    select: {
                        id: true,
                    },
                },
            );

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        }

        const findings =
            await this.prisma.audit_findings.findMany(
                {
                    where: {
                        report_id:
                            reportId,
                    },

                    include:
                        this.getDetailInclude(),

                    orderBy: {
                        created_at:
                            'asc',
                    },
                },
            );

        return findings.map(
            (finding) =>
                this.normalizeFinding(
                    finding,
                ),
        );
    }

    async findOne(id: string) {
        const finding =
            await this.prisma.audit_findings.findUnique(
                {
                    where: {
                        id,
                    },

                    include:
                        this.getDetailInclude(),
                },
            );

        if (!finding) {
            throw new NotFoundException(
                'Không tìm thấy phát hiện đánh giá',
            );
        }

        return this.normalizeFinding(
            finding,
        );
    }

    async create(
        dto: CreateAuditFindingDto,
        createdBy?: string,
    ) {
        const allowedTypes = [
            'major_nc',
            'minor_nc',
            'ofi',
        ];

        if (
            !allowedTypes.includes(
                dto.finding_type,
            )
        ) {
            throw new BadRequestException(
                'Loại phát hiện không hợp lệ',
            );
        }

        const report =
            await this.prisma.reports.findUnique(
                {
                    where: {
                        id:
                            dto.report_id,
                    },

                    include: {
                        technical_reviews: {
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            );

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        }

        if (
            report.technical_reviews.length >
            0
        ) {
            throw new BadRequestException(
                'Không thể thêm phát hiện sau khi hồ sơ đã được chuyển thẩm xét',
            );
        }

        if (
            [
                'approved',
                'completed',
                'technical_review_completed',
            ].includes(
                report.status,
            )
        ) {
            throw new BadRequestException(
                'Không thể thêm phát hiện vào báo cáo đã hoàn thành',
            );
        }

        const description =
            dto.description?.trim();

        const objectiveEvidence =
            dto.objective_evidence?.trim();

        if (
            !description ||
            !objectiveEvidence
        ) {
            throw new BadRequestException(
                'Thiếu mô tả hoặc bằng chứng khách quan',
            );
        }

        const detectedDate =
            this.parseDate(
                dto.detected_date,
                'Ngày phát hiện',
            ) ||
            report.audit_end_date ||
            report.report_date ||
            new Date();

        const dueDate =
            this.parseDate(
                dto.due_date,
                'Hạn hành động khắc phục',
            );

        if (
            dto.finding_type !==
            'ofi' &&
            !dueDate
        ) {
            throw new BadRequestException(
                'NC phải có hạn hoàn thành hành động khắc phục',
            );
        }

        if (
            dueDate &&
            dueDate < detectedDate
        ) {
            throw new BadRequestException(
                'Hạn hành động khắc phục phải sau ngày phát hiện',
            );
        }

        const findingCode =
            await this.generateFindingCode(
                dto.finding_type,
                detectedDate.getFullYear(),
            );

        return this.prisma.$transaction(
            async (transaction) => {
                const finding =
                    await transaction.audit_findings.create(
                        {
                            data: {
                                report_id:
                                    dto.report_id,

                                finding_code:
                                    findingCode,

                                finding_type:
                                    dto.finding_type,

                                clause:
                                    dto.clause?.trim() ||
                                    null,

                                requirement:
                                    dto.requirement?.trim() ||
                                    null,

                                description,

                                objective_evidence:
                                    objectiveEvidence,

                                detected_date:
                                    detectedDate,

                                due_date:
                                    dueDate,

                                status:
                                    'open',

                                created_by:
                                    createdBy ??
                                    null,
                            },

                            include:
                                this.getDetailInclude(),
                        },
                    );

                if (
                    dto.finding_type !==
                    'ofi'
                ) {
                    await transaction.reports.update(
                        {
                            where: {
                                id:
                                    dto.report_id,
                            },

                            data: {
                                audit_result:
                                    'nonconformities_found',

                                status:
                                    'corrective_action_required',
                            },
                        },
                    );
                }

                return this.normalizeFinding(
                    finding,
                );
            },
        );
    }

    async createCorrectiveAction(
        findingId: string,
        dto: CreateCorrectiveActionDto,
        submittedBy?: string,
    ) {
        const finding =
            await this.prisma.audit_findings.findUnique(
                {
                    where: {
                        id:
                            findingId,
                    },
                },
            );

        if (!finding) {
            throw new NotFoundException(
                'Không tìm thấy phát hiện đánh giá',
            );
        }

        if (
            finding.status === 'closed'
        ) {
            throw new BadRequestException(
                'Phát hiện đã được đóng',
            );
        }

        if (
            finding.status ===
            'action_accepted'
        ) {
            throw new ConflictException(
                'Hành động khắc phục đã được chấp nhận',
            );
        }

        const rootCause =
            dto.root_cause?.trim();

        const correction =
            dto.correction?.trim();

        const actionPlan =
            dto.corrective_action_plan?.trim();

        if (
            !rootCause ||
            !correction ||
            !actionPlan
        ) {
            throw new BadRequestException(
                'Thiếu nguyên nhân, khắc phục tức thời hoặc kế hoạch hành động',
            );
        }

        const targetDate =
            this.parseDate(
                dto.target_date,
                'Ngày dự kiến hoàn thành',
            );

        const latest =
            await this.prisma.corrective_actions.aggregate(
                {
                    where: {
                        finding_id:
                            findingId,
                    },

                    _max: {
                        version_no:
                            true,
                    },
                },
            );

        const versionNo =
            (
                latest._max.version_no ??
                0
            ) + 1;

        const formData = {
            custom_content:
                dto.custom_content ??
                {},
        };

        return this.prisma.$transaction(
            async (transaction) => {
                const action =
                    await transaction.corrective_actions.create(
                        {
                            data: {
                                finding_id:
                                    findingId,

                                version_no:
                                    versionNo,

                                root_cause:
                                    rootCause,

                                correction,

                                corrective_action_plan:
                                    actionPlan,

                                responsible_person:
                                    dto.responsible_person?.trim() ||
                                    null,

                                target_date:
                                    targetDate,

                                status:
                                    'submitted',

                                submitted_by:
                                    submittedBy ??
                                    null,

                                form_data:
                                    JSON.stringify(
                                        formData,
                                    ),
                            },
                        },
                    );

                await transaction.audit_findings.update(
                    {
                        where: {
                            id:
                                findingId,
                        },

                        data: {
                            status:
                                'response_submitted',
                        },
                    },
                );

                return {
                    ...action,

                    form_data:
                        formData,
                };
            },
        );
    }

    async reviewCorrectiveAction(
        findingId: string,
        actionId: string,
        dto: ReviewCorrectiveActionDto,
        reviewedBy?: string,
    ) {
        const action =
            await this.prisma.corrective_actions.findFirst(
                {
                    where: {
                        id:
                            actionId,

                        finding_id:
                            findingId,
                    },

                    include: {
                        audit_findings:
                            true,
                    },
                },
            );

        if (!action) {
            throw new NotFoundException(
                'Không tìm thấy hành động khắc phục',
            );
        }

        if (
            action.audit_findings.status ===
            'closed'
        ) {
            throw new BadRequestException(
                'Phát hiện đã được đóng',
            );
        }

        const allowedResults = [
            'accepted',
            'revision_required',
        ];

        if (
            !allowedResults.includes(
                dto.review_result,
            )
        ) {
            throw new BadRequestException(
                'Kết quả xem xét không hợp lệ',
            );
        }

        if (
            dto.review_result ===
            'accepted'
        ) {
            const evidenceCount =
                await this.prisma.documentFile.count(
                    {
                        where: {
                            entity_type:
                                'corrective_action',

                            entity_id:
                                actionId,

                            document_type:
                                'corrective_action_evidence',

                            is_current:
                                true,
                        },
                    },
                );

            if (
                evidenceCount === 0
            ) {
                throw new BadRequestException(
                    'Chưa có bằng chứng thực hiện hành động khắc phục',
                );
            }
        }

        const findingStatus =
            dto.review_result ===
                'accepted'
                ? 'action_accepted'
                : 'revision_required';

        return this.prisma.$transaction(
            async (transaction) => {
                const reviewedAction =
                    await transaction.corrective_actions.update(
                        {
                            where: {
                                id:
                                    actionId,
                            },

                            data: {
                                status:
                                    dto.review_result,

                                reviewed_by:
                                    reviewedBy ??
                                    null,

                                reviewed_at:
                                    new Date(),

                                review_comment:
                                    dto.review_comment?.trim() ||
                                    null,
                            },
                        },
                    );

                await transaction.audit_findings.update(
                    {
                        where: {
                            id:
                                findingId,
                        },

                        data: {
                            status:
                                findingStatus,
                        },
                    },
                );

                return reviewedAction;
            },
        );
    }

    async close(
        id: string,
        dto: CloseAuditFindingDto,
        closedBy?: string,
    ) {
        const finding =
            await this.prisma.audit_findings.findUnique(
                {
                    where: {
                        id,
                    },

                    include: {
                        corrective_actions: {
                            orderBy: {
                                version_no:
                                    'desc',
                            },
                        },
                    },
                },
            );

        if (!finding) {
            throw new NotFoundException(
                'Không tìm thấy phát hiện đánh giá',
            );
        }

        if (
            finding.status === 'closed'
        ) {
            throw new ConflictException(
                'Phát hiện đã được đóng',
            );
        }

        if (
            finding.finding_type !==
            'ofi'
        ) {
            const acceptedAction =
                finding.corrective_actions.find(
                    (action) =>
                        action.status ===
                        'accepted',
                );

            if (!acceptedAction) {
                throw new BadRequestException(
                    'Chưa có hành động khắc phục được chấp nhận',
                );
            }
        }

        return this.prisma.$transaction(
            async (transaction) => {
                const closedFinding =
                    await transaction.audit_findings.update(
                        {
                            where: {
                                id,
                            },

                            data: {
                                status:
                                    'closed',

                                closed_by:
                                    closedBy ??
                                    null,

                                closed_at:
                                    new Date(),

                                close_comment:
                                    dto.close_comment?.trim() ||
                                    null,
                            },

                            include:
                                this.getDetailInclude(),
                        },
                    );

                const remainingNc =
                    await transaction.audit_findings.count(
                        {
                            where: {
                                report_id:
                                    finding.report_id,

                                finding_type: {
                                    in: [
                                        'major_nc',
                                        'minor_nc',
                                    ],
                                },

                                status: {
                                    not:
                                        'closed',
                                },
                            },
                        },
                    );

                if (
                    remainingNc === 0
                ) {
                    await transaction.reports.update(
                        {
                            where: {
                                id:
                                    finding.report_id,
                            },

                            data: {
                                audit_result:
                                    'conformity_after_ca',

                                status:
                                    'ready_for_technical_review',
                            },
                        },
                    );
                }

                return this.normalizeFinding(
                    closedFinding,
                );
            },
        );
    }
}