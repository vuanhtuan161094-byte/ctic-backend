import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';

import {
    Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
    ResourceAccessService,
} from '../security/resource-access.service';
import type {
    ResourceActor,
} from '../security/resource-access.service';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { WorkItemsService } from '../work-items/work-items.service';

import { CloseAuditFindingDto } from './dto/close-audit-finding.dto';
import { CreateAuditFindingDto } from './dto/create-audit-finding.dto';
import { CreateCorrectiveActionDto } from './dto/create-corrective-action.dto';
import { ReviewCorrectiveActionDto } from './dto/review-corrective-action.dto';

@Injectable()
export class AuditFindingsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly resourceAccess:
            ResourceAccessService,
        @Optional()
        private readonly workItems?:
            WorkItemsService,
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

    private getCustomerFindingSelect() {
        return {
            id: true,
            finding_code: true,
            finding_type: true,
            clause: true,
            requirement: true,
            description: true,
            objective_evidence: true,
            detected_date: true,
            due_date: true,
            status: true,
            closed_at: true,
            close_comment: true,
            created_at: true,
            updated_at: true,

            corrective_actions: {
                orderBy: {
                    version_no: 'desc' as const,
                },
                select: {
                    id: true,
                    version_no: true,
                    root_cause: true,
                    correction: true,
                    corrective_action_plan: true,
                    responsible_person: true,
                    target_date: true,
                    status: true,
                    submitted_by: true,
                    submitted_at: true,
                    reviewed_by: true,
                    reviewed_at: true,
                    review_comment: true,
                    form_data: true,
                    created_at: true,
                    updated_at: true,
                },
            },
        } as const;
    }
    private async normalizeCustomerFindingsWithEvidence(
        findings: any[],
    ) {
        const actionIds = findings.flatMap(
            (finding) =>
                (finding.corrective_actions ?? [])
                    .map((action: any) => action.id),
        );

        const userIds = Array.from(
            new Set(
                findings.flatMap(
                    (finding) =>
                        (finding.corrective_actions ?? [])
                            .flatMap((action: any) => [
                                action.submitted_by,
                                action.reviewed_by,
                            ].filter(Boolean)),
                ),
            ),
        ) as string[];

        const [files, users] = await Promise.all([
            actionIds.length
                ? this.prisma.documentFile.findMany({
                    where: {
                        entity_type:
                            'corrective_action',
                        entity_id: {
                            in: actionIds,
                        },
                        document_type:
                            'corrective_action_evidence',
                        is_current: true,
                    },
                    select: {
                        id: true,
                        entity_id: true,
                        original_name: true,
                        file_kind: true,
                        version_no: true,
                        is_current: true,
                        created_at: true,
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
                    where: {
                        id: {
                            in: userIds,
                        },
                    },
                    select: {
                        id: true,
                        full_name: true,
                    },
                })
                : Promise.resolve([]),
        ]);

        const filesByAction = new Map<string, any[]>();
        for (const file of files) {
            const current =
                filesByAction.get(file.entity_id) ?? [];

            current.push({
                id: file.id,
                original_name: file.original_name,
                file_kind: file.file_kind,
                version_no: file.version_no,
                is_current: file.is_current,
                created_at: file.created_at,
                download_url:
                    `/document-files/customer/${file.id}/download`,
            });

            filesByAction.set(
                file.entity_id,
                current,
            );
        }

        const usersById = new Map(
            users.map((user) => [
                user.id,
                {
                    full_name: user.full_name,
                },
            ] as const),
        );

        return findings.map((finding) => ({
            id: finding.id,
            finding_code: finding.finding_code,
            finding_type: finding.finding_type,
            clause: finding.clause,
            requirement: finding.requirement,
            description: finding.description,
            objective_evidence:
                finding.objective_evidence,
            detected_date: finding.detected_date,
            due_date: finding.due_date,
            status: finding.status,
            closed_at: finding.closed_at,
            close_comment: finding.close_comment,
            created_at: finding.created_at,
            updated_at: finding.updated_at,
            is_overdue:
                finding.status !== 'closed' &&
                finding.due_date !== null &&
                new Date(finding.due_date).getTime() <
                    Date.now(),
            corrective_actions:
                (finding.corrective_actions ?? [])
                    .map((action: any) => ({
                        id: action.id,
                        version_no: action.version_no,
                        root_cause: action.root_cause,
                        correction: action.correction,
                        corrective_action_plan:
                            action.corrective_action_plan,
                        responsible_person:
                            action.responsible_person,
                        target_date: action.target_date,
                        status: action.status,
                        submitted_at: action.submitted_at,
                        reviewed_at: action.reviewed_at,
                        review_comment:
                            action.review_comment,
                        created_at: action.created_at,
                        updated_at: action.updated_at,
                        form_data:
                            this.parseFormData(
                                action.form_data,
                            ),
                        submitted_by_user:
                            action.submitted_by
                                ? usersById.get(
                                    action.submitted_by,
                                ) ?? null
                                : null,
                        reviewed_by_user:
                            action.reviewed_by
                                ? usersById.get(
                                    action.reviewed_by,
                                ) ?? null
                                : null,
                        evidence_files:
                            filesByAction.get(
                                action.id,
                            ) ?? [],
                    })),
        }));
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

    async findCustomerOne(id: string) {
        const finding =
            await this.prisma.audit_findings.findUnique({
                where: {
                    id,
                },
                select:
                    this.getCustomerFindingSelect(),
            });

        if (!finding) {
            throw new NotFoundException(
                'Không tìm thấy phát hiện đánh giá',
            );
        }

        const [normalized] =
            await this.normalizeCustomerFindingsWithEvidence([
                finding,
            ]);

        return normalized;
    }

    async findCustomerWorkspaceIndex(
        customerIds: string[],
    ) {
        if (customerIds.length === 0) {
            return [];
        }

        const plans =
            await this.prisma.audit_plans.findMany({
                where: {
                    certification_projects: {
                        certification_applications: {
                            customer_id: {
                                in: customerIds,
                            },
                        },
                    },
                },
                select: {
                    id: true,
                    plan_code: true,
                    audit_type: true,
                    planned_start_date: true,
                    planned_end_date: true,
                    status: true,
                    certification_projects: {
                        select: {
                            project_code: true,
                            standard_name: true,
                            status: true,
                            certification_applications: {
                                select: {
                                    customers: {
                                        select: {
                                            customer_code: true,
                                            company_name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    reports: {
                        select: {
                            audit_findings: {
                                select: {
                                    status: true,
                                    due_date: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [
                    { planned_start_date: 'desc' },
                    { created_at: 'desc' },
                ],
            });

        const now = Date.now();

        return plans.map((plan) => {
            const findings = plan.reports.flatMap(
                (report) => report.audit_findings,
            );
            const openFindings = findings.filter(
                (finding) =>
                    finding.status !== 'closed',
            );

            return {
                plan: {
                    id: plan.id,
                    plan_code: plan.plan_code,
                    audit_type: plan.audit_type,
                    planned_start_date:
                        plan.planned_start_date,
                    planned_end_date:
                        plan.planned_end_date,
                    status: plan.status,
                },
                project: {
                    project_code:
                        plan.certification_projects.project_code,
                    standard_name:
                        plan.certification_projects.standard_name,
                    status:
                        plan.certification_projects.status,
                },
                customer: {
                    customer_code:
                        plan.certification_projects
                            .certification_applications
                            .customers.customer_code,
                    company_name:
                        plan.certification_projects
                            .certification_applications
                            .customers.company_name,
                },
                finding_summary: {
                    total: findings.length,
                    open: openFindings.length,
                    overdue: openFindings.filter(
                        (finding) =>
                            finding.due_date !== null &&
                            new Date(
                                finding.due_date,
                            ).getTime() < now,
                    ).length,
                },
            };
        });
    }

    async findCustomerWorkspaceByPlan(
        auditPlanId: string,
    ) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id: auditPlanId,
                },
                select: {
                    id: true,
                    plan_code: true,
                    audit_type: true,
                    planned_start_date: true,
                    planned_end_date: true,
                    certification_projects: {
                        select: {
                            project_code: true,
                            standard_name: true,
                            certification_applications: {
                                select: {
                                    customers: {
                                        select: {
                                            company_name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        const findings =
            await this.prisma.audit_findings.findMany({
                where: {
                    reports: {
                        audit_plan_id:
                            auditPlanId,
                    },
                },
                select:
                    this.getCustomerFindingSelect(),
                orderBy: [
                    { detected_date: 'asc' },
                    { created_at: 'asc' },
                ],
            });

        return {
            plan,
            findings:
                await this.normalizeCustomerFindingsWithEvidence(
                    findings,
                ),
        };
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
                                id: true,
                                project_id: true,
                                audit_event_id: true,
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

                    await this.workItems?.openWorkItem(
                        {
                            sourceKey:
                                `cap:${finding.id}:${WORK_ITEM_ACTIONS.CAP_RESPOND}`,
                            workType:
                                'CAP_ACTION_OR_REVIEW',
                            actionCode:
                                WORK_ITEM_ACTIONS.CAP_RESPOND,
                            title:
                                `Phản hồi CAP ${finding.finding_code}`,
                            entityType:
                                'audit_finding',
                            entityId:
                                finding.id,
                            projectId:
                                report.audit_plans.project_id,
                            auditEventId:
                                report.audit_plans.audit_event_id,
                            auditPlanId:
                                report.audit_plans.id,
                            assignedRole:
                                'CUSTOMER',
                            priority:
                                'HIGH',
                            dueAt:
                                finding.due_date,
                            destinationPath:
                                `/projects/${report.audit_plans.project_id}?workspace=cap&finding_id=${finding.id}&audit_plan_id=${report.audit_plan_id}`,
                            context: {
                                finding_code:
                                    finding.finding_code,
                                finding_type:
                                    finding.finding_type,
                            },
                        },
                        transaction,
                    );
                }

                return this.normalizeFinding(
                    finding,
                );
            },
        );
    }

    private prepareCorrectiveActionInput(
        dto: CreateCorrectiveActionDto,
    ) {
        const rootCause = dto.root_cause?.trim();
        const correction = dto.correction?.trim();
        const actionPlan = dto.corrective_action_plan?.trim();

        if (!rootCause || !correction || !actionPlan) {
            throw new BadRequestException(
                'Thiếu nguyên nhân, khắc phục tức thời hoặc kế hoạch hành động',
            );
        }

        return {
            rootCause,
            correction,
            actionPlan,
            targetDate: this.parseDate(
                dto.target_date,
                'Ngày dự kiến hoàn thành',
            ),
            responsiblePerson:
                dto.responsible_person?.trim() || null,
            formData: {
                custom_content: dto.custom_content ?? {},
            },
        };
    }

    private validateCorrectiveActionFinding(
        finding: {
            finding_type: string;
            status: string;
        },
    ) {
        if (
            !['major_nc', 'minor_nc'].includes(
                finding.finding_type,
            )
        ) {
            throw new BadRequestException(
                'Chỉ NC nhẹ hoặc NC nặng mới yêu cầu hành động khắc phục',
            );
        }

        const status =
            this.normalizeText(
                finding.status,
            );

        if (
            ![
                'open',
                'revision_required',
            ].includes(status)
        ) {
            throw new ConflictException(
                status === 'response_submitted'
                    ? 'Phản hồi CAP đang chờ xem xét'
                    : 'Phát hiện không ở trạng thái cho phép gửi CAP',
            );
        }
    }

    private getPrismaErrorCode(
        error: unknown,
    ) {
        if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error)
        ) {
            return null;
        }

        const code =
            (error as { code?: unknown }).code;

        return typeof code === 'string'
            ? code
            : null;
    }

    private async createCorrectiveActionTransaction(
        findingId: string,
        dto: CreateCorrectiveActionDto,
        submittedBy: string | undefined,
        customerActor?: ResourceActor,
    ) {
        const prepared =
            this.prepareCorrectiveActionInput(dto);

        const execute = () =>
            this.prisma.$transaction(
                async (transaction) => {
                    if (customerActor) {
                        await this.resourceAccess
                            .assertCustomerEntityAccess(
                                {
                                    entity_type: 'audit_finding',
                                    entity_id: findingId,
                                },
                                customerActor,
                                transaction,
                            );
                    }

                    const finding =
                        await transaction.audit_findings.findUnique({
                            where: {
                                id: findingId,
                            },
                            select: {
                                id: true,
                                finding_type: true,
                                status: true,
                                due_date: true,
                                finding_code: true,
                                reports: {
                                    select: {
                                        audit_plan_id:
                                            true,
                                        audit_plans: {
                                            select: {
                                                project_id:
                                                    true,
                                                audit_event_id:
                                                    true,
                                            },
                                        },
                                    },
                                },
                            },
                        });

                    if (!finding) {
                        if (customerActor) {
                            throw new ForbiddenException(
                                'Bạn không có quyền truy cập dữ liệu của khách hàng này',
                            );
                        }

                        throw new NotFoundException(
                            'Không tìm thấy phát hiện đánh giá',
                        );
                    }

                    this.validateCorrectiveActionFinding(
                        finding,
                    );

                    const latest =
                        await transaction.corrective_actions.aggregate({
                            where: {
                                finding_id: findingId,
                            },
                            _max: {
                                version_no: true,
                            },
                        });

                    const versionNo =
                        (latest._max.version_no ?? 0) + 1;

                    const action =
                        await transaction.corrective_actions.create({
                            data: {
                                finding_id: findingId,
                                version_no: versionNo,
                                root_cause: prepared.rootCause,
                                correction: prepared.correction,
                                corrective_action_plan:
                                    prepared.actionPlan,
                                responsible_person:
                                    prepared.responsiblePerson,
                                target_date:
                                    prepared.targetDate,
                                status: 'submitted',
                                submitted_by:
                                    submittedBy ?? null,
                                form_data:
                                    JSON.stringify(
                                        prepared.formData,
                                    ),
                            },
                        });

                    await transaction.audit_findings.update({
                        where: {
                            id: findingId,
                        },
                        data: {
                            status: 'response_submitted',
                        },
                    });

                    await this.workItems?.completeMatchingWorkItems(
                        {
                            actionCode:
                                WORK_ITEM_ACTIONS.CAP_RESPOND,
                            entityType:
                                'audit_finding',
                            entityId:
                                findingId,
                        },
                        submittedBy,
                        transaction,
                    );

                    await this.workItems?.openWorkItem(
                        {
                            sourceKey:
                                `cap:${findingId}:${WORK_ITEM_ACTIONS.CAP_REVIEW}`,
                            workType:
                                'CAP_ACTION_OR_REVIEW',
                            actionCode:
                                WORK_ITEM_ACTIONS.CAP_REVIEW,
                            title:
                                `Xem xét CAP ${finding.finding_code}`,
                            entityType:
                                'audit_finding',
                            entityId:
                                findingId,
                            projectId:
                                finding.reports.audit_plans.project_id,
                            auditEventId:
                                finding.reports.audit_plans.audit_event_id,
                            auditPlanId:
                                finding.reports.audit_plan_id,
                            assignedRole:
                                'LEAD_AUDITOR',
                            priority:
                                'HIGH',
                            dueAt:
                                finding.due_date,
                            destinationPath:
                                `/projects/${finding.reports.audit_plans.project_id}?workspace=cap&finding_id=${findingId}&audit_plan_id=${finding.reports.audit_plan_id}`,
                            context: {
                                corrective_action_id:
                                    action.id,
                                finding_code:
                                    finding.finding_code,
                            },
                        },
                        transaction,
                    );

                    return {
                        ...action,
                        form_data:
                            prepared.formData,
                    };
                },
                {
                    isolationLevel:
                        Prisma
                            .TransactionIsolationLevel
                            .Serializable,
                },
            );

        for (
            let attempt = 1;
            attempt <= 2;
            attempt += 1
        ) {
            try {
                return await execute();
            } catch (error) {
                const code =
                    this.getPrismaErrorCode(error);

                const retryable =
                    code === 'P2034' ||
                    code === 'P2002';

                if (
                    !retryable ||
                    attempt === 2
                ) {
                    if (retryable) {
                        throw new ConflictException(
                            'Có thay đổi đồng thời đối với hành động khắc phục. Vui lòng tải lại và thử lại.',
                        );
                    }

                    throw error;
                }
            }
        }

        throw new ConflictException(
            'Không thể tạo hành động khắc phục do xung đột đồng thời',
        );
    }

    async createCorrectiveAction(
        findingId: string,
        dto: CreateCorrectiveActionDto,
        submittedBy?: string,
    ) {
        return this.createCorrectiveActionTransaction(
            findingId,
            dto,
            submittedBy,
        );
    }

    async createCustomerCorrectiveAction(
        findingId: string,
        dto: CreateCorrectiveActionDto,
        actor: ResourceActor,
    ) {
        const submittedBy =
            actor.userId?.trim();

        if (!submittedBy) {
            throw new ForbiddenException(
                'Không xác định được tài khoản khách hàng',
            );
        }

        return this.createCorrectiveActionTransaction(
            findingId,
            dto,
            submittedBy,
            actor,
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
                                        audit_plans: {
                                            select: {
                                                project_id:
                                                    true,
                                                audit_event_id:
                                                    true,
                                            },
                                        },
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

                await this.workItems?.completeMatchingWorkItems(
                    {
                        actionCode:
                            WORK_ITEM_ACTIONS.CAP_REVIEW,
                        entityType:
                            'audit_finding',
                        entityId:
                            findingId,
                    },
                    reviewedBy,
                    transaction,
                );

                if (
                    dto.review_result ===
                    'revision_required'
                ) {
                    await this.workItems?.openWorkItem(
                        {
                            sourceKey:
                                `cap:${findingId}:${WORK_ITEM_ACTIONS.CAP_RESPOND}:${action.version_no + 1}`,
                            workType:
                                'CAP_ACTION_OR_REVIEW',
                            actionCode:
                                WORK_ITEM_ACTIONS.CAP_RESPOND,
                            title:
                                `Bổ sung CAP ${action.audit_findings.finding_code}`,
                            entityType:
                                'audit_finding',
                            entityId:
                                findingId,
                            projectId:
                                action.audit_findings.reports.audit_plans.project_id,
                            auditEventId:
                                action.audit_findings.reports.audit_plans.audit_event_id,
                            auditPlanId:
                                action.audit_findings.reports.audit_plan_id,
                            assignedRole:
                                'CUSTOMER',
                            priority:
                                'HIGH',
                            dueAt:
                                action.audit_findings.due_date,
                            destinationPath:
                                `/projects/${action.audit_findings.reports.audit_plans.project_id}?workspace=cap&finding_id=${findingId}&audit_plan_id=${action.audit_findings.reports.audit_plan_id}`,
                            context: {
                                corrective_action_id:
                                    actionId,
                                revision_no:
                                    action.version_no + 1,
                            },
                        },
                        transaction,
                    );
                }

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

                await this.workItems?.completeMatchingWorkItems(
                    {
                        actionCode:
                            WORK_ITEM_ACTIONS.CAP_REVIEW,
                        entityType:
                            'audit_finding',
                        entityId:
                            id,
                    },
                    closedBy,
                    transaction,
                );

                await this.workItems?.completeMatchingWorkItems(
                    {
                        actionCode:
                            WORK_ITEM_ACTIONS.CAP_RESPOND,
                        entityType:
                            'audit_finding',
                        entityId:
                            id,
                    },
                    closedBy,
                    transaction,
                );

                return this.normalizeFinding(
                    closedFinding,
                );
            },
        );
    }
}
