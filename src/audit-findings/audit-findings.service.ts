import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
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

    private normalizeText(value: string | null | undefined) {
        return (value ?? '').trim().toLowerCase();
    }

    private async normalizeFindingsWithEvidence(findings: any[]) {
        const actionIds = findings.flatMap((finding) =>
            (finding.corrective_actions ?? []).map((action: any) => action.id),
        );
        const userIds = Array.from(new Set(findings.flatMap((finding) =>
            (finding.corrective_actions ?? []).flatMap((action: any) => [
                action.submitted_by,
                action.reviewed_by,
            ].filter(Boolean)),
        ))) as string[];

        const [files, users] = await Promise.all([
            actionIds.length
                ? this.prisma.documentFile.findMany({
                    where: {
                        entity_type: 'corrective_action',
                        entity_id: { in: actionIds },
                        document_type: 'corrective_action_evidence',
                    },
                    orderBy: [
                        { entity_id: 'asc' },
                        { version_no: 'desc' },
                        { created_at: 'desc' },
                    ],
                })
                : Promise.resolve([]),
            userIds.length
                ? this.prisma.users.findMany({
                    where: { id: { in: userIds } },
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                })
                : Promise.resolve([]),
        ]);

        const filesByAction = new Map<string, any[]>();
        for (const file of files) {
            const current = filesByAction.get(file.entity_id) ?? [];
            current.push({
                ...file,
                download_url: `/document-files/${file.id}/download`,
            });
            filesByAction.set(file.entity_id, current);
        }
        const usersById = new Map<
            string,
            {
                id: string;
                username: string;
                full_name: string | null;
                email: string | null;
            }
        >(
            users.map((user) => [user.id, user] as const),
        );

        return findings.map((finding) => {
            const normalized = this.normalizeFinding(finding);
            return {
                ...normalized,
                corrective_actions: normalized.corrective_actions.map((action: any) => ({
                    ...action,
                    evidence_files: filesByAction.get(action.id) ?? [],
                    submitted_by_user: action.submitted_by
                        ? usersById.get(action.submitted_by) ?? null
                        : null,
                    reviewed_by_user: action.reviewed_by
                        ? usersById.get(action.reviewed_by) ?? null
                        : null,
                })),
            };
        });
    }

    private async assertFindingAccess(
        userId: string | undefined,
        auditPlanId: string,
    ) {
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được người ghi nhận phát hiện',
            );
        }

        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            include: {
                user_roles: {
                    include: {
                        roles: true,
                    },
                },
                expert_profile: {
                    select: {
                        id: true,
                    },
                },
            },
        });

        if (!user) {
            throw new ForbiddenException(
                'Không tìm thấy tài khoản người thực hiện',
            );
        }

        const roleNames = user.user_roles.map((item) =>
            this.normalizeText(item.roles.role_name),
        );

        if (roleNames.some((role) => ['admin', 'staff'].includes(role))) {
            return;
        }

        const appointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    audit_plan_id: auditPlanId,
                },
                include: {
                    members: {
                        select: {
                            expert_id: true,
                        },
                    },
                },
            });

        const expertId = user.expert_profile?.id;
        const isAssigned = Boolean(
            appointment?.status === 'issued' &&
            expertId &&
            appointment.members.some(
                (member) => member.expert_id === expertId,
            ),
        );

        if (!isAssigned) {
            throw new ForbiddenException(
                'Chỉ thành viên được phân công trong đoàn đánh giá mới được ghi nhận phát hiện',
            );
        }
    }

    private async generateFindingCode(
        findingType: string,
        year: number,
    ) {
        const prefixMap:
            Record<string, string> = {
            conformity:
                `CON-${year}-`,

            observation:
                `OBS-${year}-`,

            ofi:
                `OFI-${year}-`,

            minor_nc:
                `MIN-${year}-`,

            major_nc:
                `MAJ-${year}-`,
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

        return this.normalizeFindingsWithEvidence(findings);
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

        return this.normalizeFindingsWithEvidence(findings);
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

        const [normalized] = await this.normalizeFindingsWithEvidence([
            finding,
        ]);
        return normalized;
    }

    async findByPlan(auditPlanId: string) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id: auditPlanId },
            select: { id: true },
        });

        if (!plan) {
            throw new NotFoundException('Không tìm thấy kế hoạch đánh giá');
        }

        const findings = await this.prisma.audit_findings.findMany({
            where: {
                reports: {
                    audit_plan_id: auditPlanId,
                },
            },
            include: this.getDetailInclude(),
            orderBy: [
                { detected_date: 'asc' },
                { created_at: 'asc' },
            ],
        });

        return this.normalizeFindingsWithEvidence(findings);
    }

    async create(
        dto: CreateAuditFindingDto,
        createdBy?: string,
    ) {
        const allowedTypes = [
            'conformity',
            'observation',
            'ofi',
            'minor_nc',
            'major_nc',
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
                        audit_plans: {
                            select: {
                                audit_type: true,
                                audit_event: {
                                    select: {
                                        event_type: true,
                                    },
                                },
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

        await this.assertFindingAccess(
            createdBy,
            report.audit_plan_id,
        );

        if (
            report.technical_reviews.length >
            0
        ) {
            throw new BadRequestException(
                'Không thể thêm phát hiện sau khi hồ sơ đã được chuyển thẩm xét',
            );
        }

        const reportFormData = this.parseFormData(
            report.form_data,
        );
        const workflow =
            reportFormData &&
            typeof reportFormData === 'object' &&
            !Array.isArray(reportFormData)
                ? (reportFormData as Record<string, unknown>).workflow
                : null;
        const submittedAt =
            workflow &&
            typeof workflow === 'object' &&
            !Array.isArray(workflow)
                ? (workflow as Record<string, unknown>).submitted_at
                : null;

        if (submittedAt) {
            throw new BadRequestException(
                'Không thể thêm phát hiện sau khi báo cáo đã được nộp',
            );
        }

        if (
            [
                'approved',
                'completed',
                'technical_review_completed',
                'ready_for_technical_review',
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

        const isNonconformity =
            ['major_nc', 'minor_nc'].includes(
                dto.finding_type,
            );

        const auditType =
            this.normalizeText(
                report.audit_plans?.audit_type ??
                report.audit_plans?.audit_event?.event_type,
            ).replace(/[\s_-]+/g, '');

        const correctiveActionDays =
            auditType.includes('surveillance') ||
            auditType.includes('giamsat')
                ? 30
                : 45;

        const suppliedDueDate =
            this.parseDate(
                dto.due_date,
                'Hạn hành động khắc phục',
            );

        const dueDate =
            suppliedDueDate ??
            (isNonconformity
                ? new Date(
                    detectedDate.getTime() +
                    correctiveActionDays * 24 * 60 * 60 * 1000,
                )
                : null);

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
                                    ['major_nc', 'minor_nc'].includes(
                                        dto.finding_type,
                                    )
                                        ? 'open'
                                        : 'recorded',

                                created_by:
                                    createdBy ??
                                    null,
                            },

                            include:
                                this.getDetailInclude(),
                        },
                    );

                if (
                    ['major_nc', 'minor_nc'].includes(
                        dto.finding_type,
                    )
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
            !['major_nc', 'minor_nc'].includes(
                finding.finding_type,
            )
        ) {
            throw new BadRequestException(
                'Chỉ NC nhẹ hoặc NC nặng mới yêu cầu hành động khắc phục',
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
                        audit_findings: {
                            include: {
                                reports: {
                                    select: {
                                        audit_plan_id: true,
                                    },
                                },
                            },
                        },
                    },
                },
            );

        if (!action) {
            throw new NotFoundException(
                'Không tìm thấy hành động khắc phục',
            );
        }

        await this.assertFindingAccess(
            reviewedBy,
            action.audit_findings.reports.audit_plan_id,
        );

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
                        reports: {
                            select: {
                                audit_plan_id: true,
                                form_data: true,
                                status: true,
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

        await this.assertFindingAccess(
            closedBy,
            finding.reports.audit_plan_id,
        );

        if (
            finding.status === 'closed'
        ) {
            throw new ConflictException(
                'Phát hiện đã được đóng',
            );
        }

        if (
            ['major_nc', 'minor_nc'].includes(
                finding.finding_type,
            )
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
                    const reportFormData = this.parseFormData(
                        finding.reports.form_data,
                    );
                    const workflow =
                        reportFormData &&
                        typeof reportFormData === 'object' &&
                        !Array.isArray(reportFormData)
                            ? (reportFormData as Record<string, unknown>).workflow
                            : null;
                    const submittedAt =
                        workflow &&
                        typeof workflow === 'object' &&
                        !Array.isArray(workflow)
                            ? (workflow as Record<string, unknown>).submitted_at
                            : null;

                    await transaction.reports.update(
                        {
                            where: {
                                id:
                                    finding.report_id,
                            },

                            data: {
                                audit_result:
                                    'conformity_after_ca',

                                // Chỉ chuyển sang thẩm xét nếu báo cáo đã được nộp chính thức.
                                status: submittedAt
                                    ? 'ready_for_technical_review'
                                    : 'draft',
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