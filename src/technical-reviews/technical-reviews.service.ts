import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,

} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { UpdateTechnicalReviewReportDto } from './dto/update-technical-review-report.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AttachReviewDocumentDto } from './dto/attach-review-document.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';
import { SaveTechnicalReviewWorkspaceDto } from './dto/save-technical-review-workspace.dto';
import {
    PRELIMINARY_REVIEW_CRITERIA,
    TECHNICAL_REVIEW_CRITERIA,
    TechnicalReviewCriterionResult,
} from './technical-review-criteria';
import {
    WORK_ITEM_ACTIONS,
} from '../work-items/work-item.constants';
import {
    WorkItemsService,
} from '../work-items/work-items.service';
import { DelegationsService } from '../delegations/delegations.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import type { ResourceActor } from '../security/resource-access.service';
import { normalizeRoles } from '../security/security-request';
import { AssignTechnicalReviewerDto } from './dto/assign-technical-reviewer.dto';
import { ReassignTechnicalReviewerDto } from './dto/reassign-technical-reviewer.dto';
import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';

@Injectable()
export class TechnicalReviewsService {
    private readonly reviewerPolicyService: TechnicalReviewReviewerPolicyService;

    constructor(
        private readonly prisma: PrismaService,
        @Optional()
        private readonly workItems?: WorkItemsService,
        @Optional()
        private readonly delegations?: DelegationsService,
        @Optional()
        private readonly notifications?: NotificationEngineService,
        @Optional()
        reviewerPolicyService?: TechnicalReviewReviewerPolicyService,
    ) {
        this.reviewerPolicyService =
            reviewerPolicyService ??
            new TechnicalReviewReviewerPolicyService(prisma);
    }

    private transactionNotBegun(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;
        const candidate = error as { code?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
        if (String(candidate.code ?? '').toUpperCase() === 'ENOTBEGUN') return true;
        if (typeof candidate.message === 'string' && candidate.message.toLowerCase().includes('transaction has not begun')) {
            return true;
        }
        return this.transactionNotBegun(candidate.cause) || this.transactionNotBegun(candidate.meta);
    }

    private async retryTransaction<T>(
        operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    ) {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                return await this.prisma.$transaction(operation);
            } catch (error) {
                if (!this.transactionNotBegun(error) || attempt === 2) throw error;
            }
        }
        throw new ConflictException('Không thể bắt đầu transaction phân công lại');
    }

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


    private normalizeCriterionRows(
        value: unknown,
        definitions: ReadonlyArray<{
            key: string;
            label: string;
        }>,
    ) {
        const supplied = Array.isArray(value)
            ? value
            : [];

        const suppliedByKey = new Map(
            supplied
                .filter(
                    (item): item is Record<string, unknown> =>
                        Boolean(item) &&
                        typeof item === 'object' &&
                        !Array.isArray(item),
                )
                .map((item) => [
                    String(item.key ?? ''),
                    item,
                ] as const),
        );

        return definitions.map((definition) => {
            const current =
                suppliedByKey.get(definition.key);

            const rawResult =
                String(
                    current?.result ??
                    'pending',
                )
                    .trim()
                    .toLowerCase();

            const result: TechnicalReviewCriterionResult =
                [
                    'yes',
                    'no',
                    'not_applicable',
                    'pending',
                ].includes(rawResult)
                    ? rawResult as TechnicalReviewCriterionResult
                    : 'pending';

            return {
                key: definition.key,
                label: definition.label,
                result,
                comment:
                    typeof current?.comment ===
                    'string'
                        ? current.comment
                        : '',
            };
        });
    }

    private buildDefaultF11(
        current?: Record<string, any>,
    ) {
        const today =
            new Date()
                .toISOString()
                .slice(0, 10);

        return {
            review_date:
                typeof current?.review_date ===
                'string'
                    ? current.review_date
                    : today,

            audit_language:
                typeof current?.audit_language ===
                'string'
                    ? current.audit_language
                    : 'Tiếng Việt',

            preliminary_criteria:
                this.normalizeCriterionRows(
                    current?.preliminary_criteria,
                    PRELIMINARY_REVIEW_CRITERIA,
                ),

            technical_criteria:
                this.normalizeCriterionRows(
                    current?.technical_criteria,
                    TECHNICAL_REVIEW_CRITERIA,
                ),

            preliminary_other_comment:
                typeof current
                    ?.preliminary_other_comment ===
                'string'
                    ? current
                        .preliminary_other_comment
                    : '',

            technical_other_comment:
                typeof current
                    ?.technical_other_comment ===
                'string'
                    ? current
                        .technical_other_comment
                    : '',

            recommendation:
                [
                    'certification_recommended',
                    'certification_not_recommended',
                ].includes(
                    String(
                        current?.recommendation ??
                        '',
                    ),
                )
                    ? current?.recommendation
                    : 'certification_recommended',

            recommendation_comment:
                typeof current
                    ?.recommendation_comment ===
                'string'
                    ? current
                        .recommendation_comment
                    : '',

            conditions:
                typeof current?.conditions ===
                'string'
                    ? current.conditions
                    : '',

            prepared_at:
                current?.prepared_at ??
                null,

            updated_at:
                current?.updated_at ??
                null,
        };
    }

    private validateF11ForCompletion(
        formData: Record<string, any>,
    ) {
        const f11 =
            this.buildDefaultF11(
                formData.f11 &&
                typeof formData.f11 ===
                'object' &&
                !Array.isArray(
                    formData.f11,
                )
                    ? formData.f11
                    : {},
            );

        const unanswered = [
            ...f11.preliminary_criteria,
            ...f11.technical_criteria,
        ].filter(
            (item) =>
                item.result ===
                'pending',
        );

        if (unanswered.length > 0) {
            throw new BadRequestException(
                `F.11 còn ${unanswered.length} tiêu chí chưa kết luận Yes/No/Không áp dụng`,
            );
        }

        if (!f11.review_date) {
            throw new BadRequestException(
                'F.11 chưa có ngày thẩm xét',
            );
        }

        if (
            f11.recommendation ===
                'certification_not_recommended' &&
            !String(
                f11.recommendation_comment ??
                '',
            ).trim()
        ) {
            throw new BadRequestException(
                'Phải nhập lý do khi kiến nghị không cấp chứng nhận',
            );
        }

        return f11;
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
                    'generated_document',

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
                    'generated_document',

                required: true,

                file_name: null,
                file_url: null,
            }, {
                document_key: 'audit_log',

                document_name:
                    'Xác nhận đánh giá/ngày công (F.15-P.09)',

                document_id: null,

                source_type: 'generated_document',

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
                [
                    'uploaded_file',
                    'generated_document',
                ].includes(document.source_type) ||
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

                files: [],

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

    private async attachCurrentDocumentFiles(
        report: any,
        reviewItems: any[],
    ) {
        const planId =
            report?.audit_plan_id ??
            report?.audit_plans?.id;

        if (!planId || !report?.id) {
            return reviewItems;
        }

        const [memberIds, findingIds] =
            await Promise.all([
                this.prisma.audit_team_members.findMany({
                    where: {
                        audit_team_appointments: {
                            audit_plan_id:
                                planId,
                        },
                    },
                    select: {
                        id: true,
                    },
                }),
                this.prisma.audit_findings.findMany({
                    where: {
                        report_id:
                            report.id,
                    },
                    select: {
                        id: true,
                    },
                }),
            ]);

        const explicitEntityIds =
            reviewItems
                .map((item: any) =>
                    item.document_id,
                )
                .filter(Boolean) as string[];

        const entityIds =
            Array.from(
                new Set([
                    planId,
                    report.id,
                    ...explicitEntityIds,
                    ...memberIds.map(
                        (member) =>
                            member.id,
                    ),
                    ...findingIds.map(
                        (finding) =>
                            finding.id,
                    ),
                ]),
            );

        const currentFiles =
            await this.prisma.documentFile.findMany({
                where: {
                    is_current: true,
                    entity_id: {
                        in: entityIds,
                    },
                },
                orderBy: [
                    {
                        document_type:
                            'asc',
                    },
                    {
                        file_kind:
                            'asc',
                    },
                    {
                        version_no:
                            'desc',
                    },
                ],
            });

        const generatedMatches = (
            documentKey: string,
            documentType: string,
        ) => {
            if (
                documentKey ===
                'audit_program'
            ) {
                return [
                    'audit_program',
                    'audit_program_f03',
                ].includes(documentType);
            }

            if (
                documentKey ===
                'audit_plan'
            ) {
                return [
                    'audit_plan',
                    'stage1_audit_plan',
                    'stage2_audit_plan',
                    'audit_plan_f05',
                    'audit_plan_stage1_f05',
                ].includes(documentType);
            }

            if (
                documentKey ===
                'audit_checklist'
            ) {
                return documentType.startsWith(
                    'audit_checklist_f06',
                );
            }

            if (
                documentKey ===
                'opening_closing_attendance'
            ) {
                return [
                    'audit_attendance_f07',
                    'opening_closing_attendance',
                ].includes(documentType);
            }

            if (
                documentKey ===
                'audit_log'
            ) {
                return [
                    'audit_log_f15',
                    'audit_log',
                ].includes(documentType);
            }

            if (
                documentKey ===
                'audit_report'
            ) {
                return [
                    'stage1_audit_report',
                    'stage2_audit_report',
                    'audit_report',
                ].includes(documentType);
            }

            if (
                documentKey ===
                'nc_cap'
            ) {
                return [
                    'nc_cap',
                    'corrective_action_request_f10',
                ].includes(documentType);
            }

            return false;
        };

        return reviewItems.map((item) => {
            const filePriority = (file: any) => {
                const isPdf =
                    file.mime_type === 'application/pdf' ||
                    String(file.original_name ?? '')
                        .toLowerCase()
                        .endsWith('.pdf');

                if (file.file_kind === 'signed_scan' && isPdf) {
                    return 0;
                }

                if (file.file_kind === 'generated_pdf' || isPdf) {
                    return 1;
                }

                if (file.file_kind === 'generated_docx') {
                    return 2;
                }

                return 3;
            };

            const files = currentFiles
                .filter((file) => {
                    if (
                        item.document_id &&
                        file.entity_id ===
                            item.document_id &&
                        file.document_type ===
                            item.document_key
                    ) {
                        return true;
                    }

                    if (
                        generatedMatches(
                            item.document_key,
                            file.document_type,
                        )
                    ) {
                        return true;
                    }

                    return false;
                })
                .map((file) => ({
                    ...file,
                    download_url:
                        `/document-files/${file.id}/download`,
                }))
                .sort((left, right) => {
                    const priorityDifference =
                        filePriority(left) -
                        filePriority(right);

                    if (priorityDifference !== 0) {
                        return priorityDifference;
                    }

                    return (right.version_no ?? 0) -
                        (left.version_no ?? 0);
                });

            const primary =
                files[0] ??
                null;

            const previousIds =
                Array.isArray(item.files)
                    ? item.files
                        .map(
                            (file: any) =>
                                file.id,
                        )
                        .filter(Boolean)
                        .sort()
                    : [];

            const currentIds =
                files
                    .map((file) => file.id)
                    .sort();

            const changed =
                JSON.stringify(previousIds) !==
                JSON.stringify(currentIds);

            return {
                ...item,
                files,
                document_file_id:
                    primary?.id ??
                    null,
                document_version:
                    primary?.version_no ??
                    null,
                file_kind:
                    primary?.file_kind ??
                    null,
                file_name:
                    primary?.original_name ??
                    item.file_name ??
                    null,
                file_url:
                    primary
                        ? `/document-files/${primary.id}/download`
                        : item.file_url ??
                            null,
                attached_at:
                    primary?.created_at ??
                    item.attached_at ??
                    null,
                ...(changed &&
                item.status === 'accepted'
                    ? {
                        status: 'pending',
                        reviewer_comment:
                            'Tài liệu có phiên bản mới; cần thẩm xét lại.',
                        reviewed_at: null,
                        accepted_at: null,
                    }
                    : {}),
            };
        });
    }

    private previewText(
        value: unknown,
    ): string {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return '—';
        }

        if (value instanceof Date) {
            return value
                .toISOString()
                .slice(0, 10);
        }

        if (
            typeof value === 'object'
        ) {
            try {
                return JSON.stringify(
                    value,
                );
            } catch {
                return String(value);
            }
        }

        return String(value);
    }

    async getReviewItemPreview(
        id: string,
        documentKey: string,
    ) {
        const review =
            await this.getReviewOrThrow(id);

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const reviewItems =
            await this.attachCurrentDocumentFiles(
                review.reports,
                Array.isArray(
                    formData.review_items,
                )
                    ? formData.review_items
                    : [],
            );

        const item =
            reviewItems.find(
                (candidate: any) =>
                    candidate.document_key ===
                    documentKey,
            );

        if (!item) {
            throw new NotFoundException(
                'Không tìm thấy hạng mục thẩm xét',
            );
        }

        const fields: Array<{
            label: string;
            value: string;
        }> = [];

        const add = (
            label: string,
            value: unknown,
        ) => {
            fields.push({
                label,
                value:
                    this.previewText(
                        value,
                    ),
            });
        };

        const documentId =
            item.document_id as
                | string
                | null
                | undefined;

        switch (documentKey) {
            case 'certification_application': {
                const record = documentId
                    ? await this.prisma.certification_applications.findUnique({
                        where: { id: documentId },
                        include: { customers: true },
                    })
                    : null;
                if (record) {
                    add('Mã đơn', record.application_code);
                    add('Ngày đăng ký', record.application_date);
                    add('Khách hàng', record.customers?.company_name);
                    add('Tiêu chuẩn', record.standard_name);
                    add('Phạm vi chứng nhận', record.certification_scope);
                    add('Nhân sự', record.total_employee_count ?? record.employee_count);
                    add('Số địa điểm', record.site_count);
                    add('Trạng thái', record.status);
                }
                break;
            }
            case 'contract': {
                const record = documentId
                    ? await this.prisma.contracts.findUnique({
                        where: { id: documentId },
                        include: { customers: true },
                    })
                    : null;
                if (record) {
                    add('Số hợp đồng', record.contract_number);
                    add('Khách hàng', record.customers?.company_name);
                    add('Ngày ký', record.sign_date);
                    add('Ngày bắt đầu', record.start_date);
                    add('Ngày kết thúc', record.end_date);
                    add('Giá trị', record.total_value);
                }
                break;
            }
            case 'certification_agreement': {
                const record = documentId
                    ? await this.prisma.certification_agreements.findUnique({
                        where: { id: documentId },
                        include: { customers: true },
                    })
                    : null;
                if (record) {
                    add('Số thỏa thuận', record.agreement_number);
                    add('Khách hàng', record.customers?.company_name);
                    add('Ngày ký', record.sign_date);
                }
                break;
            }
            case 'audit_program': {
                const record = documentId
                    ? await this.prisma.audit_programs.findUnique({
                        where: { id: documentId },
                    })
                    : null;
                if (record) {
                    add('Mã chương trình', record.program_code);
                    add('Năm chương trình', record.program_year);
                    add('Tổ chức', record.organization_name);
                    add('Tiêu chuẩn', record.standard_name);
                    add('Phạm vi', record.certification_scope);
                    add('Nhân sự hiệu dụng', record.effective_personnel);
                    add('Loại chứng nhận', record.certification_type);
                    add('Trạng thái', record.status);
                }
                break;
            }
            case 'audit_plan': {
                const record = documentId
                    ? await this.prisma.audit_plans.findUnique({
                        where: { id: documentId },
                    })
                    : null;
                if (record) {
                    add('Mã kế hoạch', record.plan_code);
                    add('Loại đánh giá', record.audit_type);
                    add('Ngày bắt đầu', record.planned_start_date);
                    add('Ngày kết thúc', record.planned_end_date);
                    add('Địa điểm', record.location);
                    add('Mục tiêu', record.audit_objectives);
                    add('Phạm vi đánh giá', record.audit_scope);
                    add('Tiêu chí', record.audit_criteria);
                    add('Trạng thái', record.status);
                }
                break;
            }
            case 'audit_report': {
                const record = documentId
                    ? await this.prisma.reports.findUnique({
                        where: { id: documentId },
                    })
                    : null;
                if (record) {
                    add('Mã báo cáo', record.report_code);
                    add('Ngày báo cáo', record.report_date);
                    add('Ngày đánh giá', `${this.previewText(record.audit_start_date)} – ${this.previewText(record.audit_end_date)}`);
                    add('Kết quả', record.audit_result);
                    add('Kết luận', record.conclusion);
                    add('Trạng thái', record.status);
                    add('Phiên bản', record.version_no);
                }
                break;
            }
            case 'nc_cap': {
                const findings = documentId
                    ? await this.prisma.audit_findings.findMany({
                        where: { report_id: documentId },
                        include: {
                            corrective_actions: {
                                orderBy: { version_no: 'desc' },
                            },
                        },
                        orderBy: { created_at: 'asc' },
                    })
                    : [];
                add('Số phát hiện', findings.length);
                add(
                    'NC đang mở',
                    findings.filter((finding) =>
                        ['major_nc', 'minor_nc'].includes(String(finding.finding_type)) &&
                        finding.status !== 'closed',
                    ).length,
                );
                for (const finding of findings) {
                    const latest = finding.corrective_actions[0];
                    add(
                        finding.finding_code,
                        [
                            finding.finding_type,
                            finding.description,
                            `Hạn: ${this.previewText(finding.due_date)}`,
                            latest ? `CAP v${latest.version_no}: ${latest.status}` : 'Chưa có CAP',
                        ].join(' | '),
                    );
                }
                break;
            }
            default:
                if (documentId) {
                    add('Mã tham chiếu', documentId);
                }
                break;
        }

        return {
            document_key:
                item.document_key,
            document_name:
                item.document_name,
            source_type:
                item.source_type,
            status:
                item.status,
            fields,
            files:
                Array.isArray(item.files)
                    ? item.files
                    : [],
        };
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
                                audit_plans: {
                                    select: {
                                        project_id: true,
                                        audit_event_id: true,
                                    },
                                },
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
                        assignments: {
                            orderBy: { assigned_at: 'desc' },
                            include: {
                                reviewer: { select: { id: true, username: true, full_name: true, email: true } },
                                actor: { select: { id: true, username: true, full_name: true } },
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


    private async loadPlanReviewContext(
        planId: string,
    ) {
        const plan =
            await this.prisma.audit_plans.findUnique({
                where: {
                    id: planId,
                },
                include: {
                    certification_projects: {
                        include: {
                            certification_applications: {
                                include: {
                                    customers: true,
                                },
                            },
                        },
                    },
                    audit_team_appointment: {
                        include: {
                            members: {
                                include: {
                                    experts: {
                                        select: {
                                            id: true,
                                            user_id: true,
                                            full_name: true,
                                            employee_code: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    reports: {
                        orderBy: [
                            {
                                version_no: 'desc',
                            },
                            {
                                created_at: 'desc',
                            },
                        ],
                        include: {
                            audit_findings: {
                                select: {
                                    id: true,
                                    finding_code: true,
                                    finding_type: true,
                                    status: true,
                                },
                            },
                            technical_reviews: {
                                orderBy: {
                                    created_at: 'desc',
                                },
                                include: {
                                    reviewer: {
                                        select: {
                                            id: true,
                                            username: true,
                                            full_name: true,
                                            email: true,
                                        },
                                    },
                                    assignments: {
                                        orderBy: { assigned_at: 'desc' },
                                        include: {
                                            reviewer: { select: { id: true, username: true, full_name: true, email: true } },
                                            actor: { select: { id: true, username: true, full_name: true } },
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

        const report =
            plan.reports[0] ??
            null;

        return {
            plan,
            report,
        };
    }

    private assertReviewerIndependent(
        plan: any,
        reviewerId: string,
    ) {
        return this.reviewerPolicyService.assertReviewerIndependent(
            plan,
            reviewerId,
        );
    }

    private async assertReviewerEligible(
        reviewerId: string,
    ) {
        return this.reviewerPolicyService.assertReviewerEligible(
            reviewerId,
        );
    }

    private assertAssignmentActor(
        actor: ResourceActor,
        adminOverrideReason?: string,
    ) {
        return this.reviewerPolicyService.assertAssignmentActor(
            actor,
            adminOverrideReason,
        );
    }

    async getReviewerCandidates(
        planId: string,
    ) {
        const context = await this.loadPlanReviewContext(planId);
        this.assertReportReady(context.report);
        return this.reviewerPolicyService.getReviewerCandidates(
            context.plan,
        );
    }

    async assertCanPerformReview(
        reviewId: string,
        actor: ResourceActor,
    ) {
        const actorId = actor.userId;
        const roles = normalizeRoles(actor.roles);
        if (!actorId || !roles.includes('TECHNICAL_REVIEWER')) {
            throw new BadRequestException('Chỉ người thẩm xét đủ eligibility được xử lý F.11');
        }
        const review = await this.getReviewOrThrow(reviewId);
        const context = await this.loadPlanReviewContext(review.reports.audit_plan_id);
        this.assertReviewerIndependent(context.plan, review.reviewer_id);

        if (review.reviewer_id === actorId) {
            return { review, delegation: null };
        }
        const active = this.delegations
            ? await this.delegations.activeForDelegate(actorId)
            : [];
        const delegation = active.find((item) =>
            item.delegatorUserId === review.reviewer_id &&
            item.actions.includes(WORK_ITEM_ACTIONS.TECHNICAL_REVIEW) &&
            (!item.projectId || item.projectId === review.reports.audit_plans.project_id),
        );
        if (!delegation) {
            throw new BadRequestException('Hồ sơ không được phân công hoặc ủy quyền hợp lệ cho người dùng hiện tại');
        }
        this.assertReviewerIndependent(context.plan, actorId);
        return { review, delegation };
    }

    private assertReportReady(
        report: any,
    ) {
        if (!report) {
            throw new BadRequestException(
                'Kế hoạch chưa có báo cáo đánh giá để thẩm xét',
            );
        }

        const normalizedStatus =
            String(report.status ?? '')
                .trim()
                .toLowerCase();

        if (
            ![
                'ready_for_technical_review',
                'technical_review_completed',
            ].includes(normalizedStatus)
        ) {
            throw new BadRequestException(
                'Báo cáo chưa được nộp hoặc chưa sẵn sàng thẩm xét kỹ thuật',
            );
        }

        const unresolvedNc =
            (report.audit_findings ?? [])
                .filter(
                    (finding: any) =>
                        [
                            'major_nc',
                            'minor_nc',
                        ].includes(
                            String(
                                finding.finding_type ??
                                '',
                            )
                                .trim()
                                .toLowerCase(),
                        ) &&
                        String(
                            finding.status ??
                            '',
                        )
                            .trim()
                            .toLowerCase() !==
                        'closed',
                );

        if (unresolvedNc.length > 0) {
            throw new BadRequestException(
                `Còn ${unresolvedNc.length} NC chưa được đóng`,
            );
        }
    }

    async getCaseWorkspace(planId: string, caseId: string) {
        const context = await this.prisma.audit_plans.findFirst({
            where: { id: planId, project_id: caseId },
            select: { id: true },
        });
        if (!context) throw new ForbiddenException();
        return this.getWorkspaceByPlan(planId);
    }

    async getWorkspaceByPlan(
        planId: string,
    ) {
        const context =
            await this.loadPlanReviewContext(
                planId,
            );

        const report =
            context.report;

        const review =
            report
                ?.technical_reviews?.[0] ??
            null;

        const formData =
            review
                ? this.parseFormData(
                    review.form_data,
                )
                : {};

        const f11 =
            this.buildDefaultF11(
                formData.f11 &&
                typeof formData.f11 ===
                'object' &&
                !Array.isArray(
                    formData.f11,
                )
                    ? formData.f11
                    : {},
            );

        const workspaceReviewItems =
            review && report
                ? await this.attachCurrentDocumentFiles(
                    report,
                    Array.isArray(
                        formData.review_items,
                    )
                        ? formData.review_items
                        : [],
                )
                : [];

        const documentHistory =
            review
                ? await this.prisma.documentFile.findMany({
                    where: {
                        entity_type:
                            'technical_review',
                        entity_id:
                            review.id,
                        document_type:
                            'technical_review_report_f11',
                    },
                    orderBy: [
                        {
                            version_no: 'desc',
                        },
                        {
                            created_at: 'desc',
                        },
                    ],
                })
                : [];

        const eligibilityErrors: string[] =
            [];

        if (!report) {
            eligibilityErrors.push(
                'Kế hoạch chưa có báo cáo đánh giá.',
            );
        } else {
            try {
                this.assertReportReady(
                    report,
                );
            } catch (error) {
                eligibilityErrors.push(
                    error instanceof Error
                        ? error.message
                        : 'Báo cáo chưa đủ điều kiện thẩm xét.',
                );
            }
        }

        return {
            plan: {
                id: context.plan.id,
                plan_code:
                    context.plan.plan_code,
                audit_type:
                    context.plan.audit_type,
                planned_start_date:
                    context.plan
                        .planned_start_date,
                planned_end_date:
                    context.plan
                        .planned_end_date,
                project_code:
                    context.plan
                        .certification_projects
                        ?.project_code,
                standard_name:
                    context.plan
                        .certification_projects
                        ?.standard_name,
                organization_name:
                    context.plan
                        .certification_projects
                        ?.certification_applications
                        ?.customers
                        ?.company_name,
            },
            report: report
                ? {
                    id: report.id,
                    report_code:
                        report.report_code,
                    version_no:
                        report.version_no,
                    status:
                        report.status,
                }
                : null,
            can_start:
                eligibilityErrors.length ===
                0,
            can_assign:
                eligibilityErrors.length === 0 && !review,
            assignment_status:
                review ? 'ASSIGNED' : 'UNASSIGNED',
            current_assignment:
                review?.assignments?.find((assignment: any) => assignment.status === 'CURRENT') ?? null,
            assignment_history:
                review?.assignments ?? [],
            eligibility_errors:
                eligibilityErrors,
            review: review
                ? this.normalizeReview({
                    ...review,
                    form_data: {
                        ...formData,
                        review_items:
                            workspaceReviewItems,
                        f11,
                    },
                })
                : null,
            document_history:
                documentHistory.map((file) => ({
                    ...file,
                    download_url:
                        `/document-files/${file.id}/download`,
                })),
            criteria: {
                preliminary:
                    PRELIMINARY_REVIEW_CRITERIA,
                technical:
                    TECHNICAL_REVIEW_CRITERIA,
            },
        };
    }

    async assignForPlan(
        planId: string,
        dto: AssignTechnicalReviewerDto,
        actor: ResourceActor,
    ) {
        if (!actor.userId) throw new BadRequestException('Không xác định được người phân công');
        this.assertAssignmentActor(actor, dto.admin_override_reason);
        const context = await this.loadPlanReviewContext(planId);
        this.assertReportReady(context.report);
        this.assertReviewerIndependent(context.plan, dto.reviewer_id);
        await this.assertReviewerEligible(dto.reviewer_id);

        const existing = context.report?.technical_reviews?.[0];
        if (existing) {
            if (existing.reviewer_id === dto.reviewer_id) return this.getWorkspaceByPlan(planId);
            throw new ConflictException('Hồ sơ đã được giao; hãy dùng chức năng phân công lại');
        }

        const reviewItems = await this.attachCurrentDocumentFiles(
            context.report,
            this.buildReviewItems(context.report),
        );
        const now = new Date().toISOString();
        const result = await this.retryTransaction(async (transaction) => {
            const created = await transaction.technical_reviews.create({
                data: {
                    report_id: context.report.id,
                    reviewer_id: dto.reviewer_id,
                    status: 'pending',
                    general_comment: null,
                    form_data: JSON.stringify({
                        review_items: reviewItems,
                        final_confirmation: { all_documents_accepted: false, confirmed_at: null },
                        f11: { ...this.buildDefaultF11(), prepared_at: now, updated_at: now },
                    }),
                },
            });
            const assignment = await transaction.technical_review_assignments.create({
                data: {
                    technical_review_id: created.id,
                    reviewer_id: dto.reviewer_id,
                    assigned_by: actor.userId!,
                    due_at: dto.due_at ?? null,
                    note: dto.note?.trim() || null,
                    reason: dto.admin_override_reason?.trim() || null,
                },
            });
            await this.workItems?.completeMatchingWorkItems({
                actionCode: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW_ASSIGN,
                entityType: 'report',
                entityId: context.report.id,
            }, actor.userId, transaction);
            const workItem = await this.workItems?.openWorkItem({
                sourceKey: `technical-review:${created.id}:${assignment.id}`,
                workType: 'TECHNICAL_REVIEW',
                actionCode: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                title: `Thẩm xét kỹ thuật ${context.report.report_code}`,
                entityType: 'technical_review',
                entityId: created.id,
                projectId: context.plan.project_id,
                auditEventId: context.plan.audit_event_id,
                auditPlanId: context.plan.id,
                assignedUserId: dto.reviewer_id,
                dueAt: dto.due_at ?? null,
                destinationPath: `/projects/${context.plan.project_id}?workspace=technical-review&technical_review_id=${created.id}&audit_plan_id=${planId}`,
                context: { report_id: context.report.id, report_code: context.report.report_code, assignment_id: assignment.id },
            }, transaction);
            await transaction.audit_logs.create({
                data: {
                    user_id: actor.userId,
                    action: dto.admin_override_reason ? 'technical_review.assign.admin_override' : 'technical_review.assign',
                    entity_type: 'technical_review',
                    entity_id: created.id,
                    outcome: 'success',
                    status_code: 201,
                },
            });
            return { created, workItem };
        });
        if (result.workItem && this.notifications) await this.notifications.notifyWorkAssigned(result.workItem);
        return this.getWorkspaceByPlan(planId);
    }

    async reassign(
        reviewId: string,
        dto: ReassignTechnicalReviewerDto,
        actor: ResourceActor,
    ) {
        if (!actor.userId) throw new BadRequestException('Không xác định được người phân công');
        this.assertAssignmentActor(actor, dto.admin_override_reason);
        const review = await this.getReviewOrThrow(reviewId);
        if (review.status === 'completed') throw new ConflictException('Không thể phân công lại hồ sơ đã hoàn thành');
        if (review.status !== 'pending') {
            throw new ConflictException('Hồ sơ đã có dữ liệu thẩm xét; không được phân công lại theo luồng thông thường');
        }
        if (review.reviewer_id === dto.reviewer_id) throw new BadRequestException('Người thẩm xét mới phải khác người hiện tại');
        const context = await this.loadPlanReviewContext(review.reports.audit_plan_id);
        this.assertReportReady(context.report);
        this.assertReviewerIndependent(context.plan, dto.reviewer_id);
        await this.assertReviewerEligible(dto.reviewer_id);

        const result = await this.retryTransaction(async (transaction) => {
            const endedAt = new Date();
            await transaction.technical_review_assignments.updateMany({
                where: { technical_review_id: reviewId, status: 'CURRENT' },
                data: { status: 'REASSIGNED', ended_at: endedAt, reason: dto.reason.trim() },
            });
            await transaction.work_items.updateMany({
                where: {
                    entity_type: 'technical_review',
                    entity_id: reviewId,
                    action_code: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                    status: { in: ['OPEN', 'IN_PROGRESS'] },
                },
                data: { status: 'CANCELLED', cancelled_at: endedAt, updated_at: endedAt },
            });
            await transaction.technical_reviews.update({
                where: { id: reviewId },
                data: { reviewer_id: dto.reviewer_id },
            });
            const assignment = await transaction.technical_review_assignments.create({
                data: {
                    technical_review_id: reviewId,
                    reviewer_id: dto.reviewer_id,
                    assigned_by: actor.userId!,
                    due_at: dto.due_at ?? null,
                    note: dto.note?.trim() || null,
                    reason: dto.reason.trim(),
                },
            });
            const workItem = await this.workItems?.openWorkItem({
                sourceKey: `technical-review:${reviewId}:${assignment.id}`,
                workType: 'TECHNICAL_REVIEW',
                actionCode: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                title: `Thẩm xét kỹ thuật ${review.reports.report_code}`,
                entityType: 'technical_review',
                entityId: reviewId,
                projectId: review.reports.audit_plans.project_id,
                auditEventId: review.reports.audit_plans.audit_event_id,
                auditPlanId: review.reports.audit_plan_id,
                assignedUserId: dto.reviewer_id,
                dueAt: dto.due_at ?? null,
                destinationPath: `/projects/${review.reports.audit_plans.project_id}?workspace=technical-review&technical_review_id=${reviewId}&audit_plan_id=${review.reports.audit_plan_id}`,
                context: { report_id: review.report_id, assignment_id: assignment.id, reassignment_reason: dto.reason.trim() },
            }, transaction);
            await transaction.audit_logs.create({
                data: {
                    user_id: actor.userId,
                    action: dto.admin_override_reason ? 'technical_review.reassign.admin_override' : 'technical_review.reassign',
                    entity_type: 'technical_review',
                    entity_id: reviewId,
                    outcome: 'success',
                    status_code: 200,
                },
            });
            return workItem;
        });
        if (result && this.notifications) await this.notifications.notifyWorkAssigned(result);
        return this.findOne(reviewId);
    }

    async saveWorkspace(
        id: string,
        dto: SaveTechnicalReviewWorkspaceDto,
    ) {
        const review =
            await this.getReviewOrThrow(id);

        if (
            review.status ===
            'completed'
        ) {
            throw new BadRequestException(
                'Hồ sơ đã hoàn thành thẩm xét; không thể sửa F.11',
            );
        }

        const formData =
            this.parseFormData(
                review.form_data,
            );

        const now =
            new Date()
                .toISOString();

        const f11 = {
            ...this.buildDefaultF11(
                formData.f11 &&
                typeof formData.f11 ===
                'object' &&
                !Array.isArray(
                    formData.f11,
                )
                    ? formData.f11
                    : {},
            ),
            review_date:
                dto.review_date,
            audit_language:
                dto.audit_language?.trim() ||
                'Tiếng Việt',
            preliminary_criteria:
                this.normalizeCriterionRows(
                    dto.preliminary_criteria,
                    PRELIMINARY_REVIEW_CRITERIA,
                ),
            technical_criteria:
                this.normalizeCriterionRows(
                    dto.technical_criteria,
                    TECHNICAL_REVIEW_CRITERIA,
                ),
            preliminary_other_comment:
                dto.preliminary_other_comment
                    ?.trim() ||
                '',
            technical_other_comment:
                dto.technical_other_comment
                    ?.trim() ||
                '',
            recommendation:
                dto.recommendation,
            recommendation_comment:
                dto.recommendation_comment
                    ?.trim() ||
                '',
            conditions:
                dto.conditions?.trim() ||
                '',
            prepared_at:
                (formData.f11 as any)
                    ?.prepared_at ??
                now,
            updated_at:
                now,
        };

        const updated =
            await this.prisma.technical_reviews.update({
                where: {
                    id,
                },
                data: {
                    form_data:
                        JSON.stringify({
                            ...formData,
                            f11,
                        }),
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
            await this.attachCurrentDocumentFiles(
                review.reports,
                Array.isArray(
                    formData.review_items,
                )
                    ? formData.review_items
                    : [],
            );

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
            [
                'uploaded_file',
                'generated_document',
            ].includes(
                currentItem.source_type,
            ) &&
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

    async complete(
        id: string,
        actor: ResourceActor,
    ) {
        const authorization =
            await this.assertCanPerformReview(id, actor);
        const review = authorization.review;
        const actingUserId = actor.userId!;

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

        const completedF11 =
            this.validateF11ForCompletion(
                formData,
            );

        const reviewItems =
            await this.attachCurrentDocumentFiles(
                review.reports,
                Array.isArray(
                    formData.review_items,
                )
                    ? formData.review_items
                    : [],
            );

        if (reviewItems.length === 0) {
            throw new BadRequestException(
                'Hồ sơ thẩm xét chưa có danh mục tài liệu',
            );
        }
        const missingFiles =
            reviewItems.filter(
                (item: any) =>
                    item.required === true &&
                    [
                        'uploaded_file',
                        'generated_document',
                    ].includes(
                        item.source_type,
                    ) &&
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
        const missingOfficialPdfs =
            reviewItems.filter(
                (item: any) => {
                    if (item.required !== true) {
                        return false;
                    }

                    const files =
                        Array.isArray(item.files)
                            ? item.files
                            : [];

                    return !files.some((file: any) =>
                        file.file_kind === 'signed_scan' &&
                        (
                            file.mime_type === 'application/pdf' ||
                            String(file.original_name ?? '')
                                .toLowerCase()
                                .endsWith('.pdf')
                        ),
                    );
                },
            );

        if (missingOfficialPdfs.length > 0) {
            const documentNames =
                missingOfficialPdfs
                    .map(
                        (item: any) =>
                            item.document_name,
                    )
                    .join(', ');

            throw new BadRequestException(
                `Chưa có PDF đã ký/chốt cho các hồ sơ: ${documentNames}`,
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

            f11: {
                ...completedF11,
                completed_at:
                    completedAt.toISOString(),
            },

            technical_review_report: {
                review_date:
                    completedF11.review_date,
                preliminary_review_result:
                    completedF11.preliminary_other_comment ||
                    'Đã hoàn thành thẩm xét sơ bộ theo F.11-P.09.',
                technical_review_result:
                    completedF11.technical_other_comment ||
                    'Đã hoàn thành thẩm xét kỹ thuật theo F.11-P.09.',
                conclusion:
                    completedF11.recommendation_comment ||
                    (
                        completedF11.recommendation ===
                        'certification_recommended'
                            ? 'Đủ cơ sở kiến nghị cấp/duy trì chứng nhận.'
                            : 'Không đủ cơ sở kiến nghị cấp/duy trì chứng nhận.'
                    ),
                recommendation:
                    completedF11.recommendation,
                conditions:
                    completedF11.conditions ||
                    null,
                additional_comment:
                    completedF11.technical_other_comment ||
                    null,
                prepared_at:
                    completedF11.prepared_at ??
                    completedAt.toISOString(),
                updated_at:
                    completedAt.toISOString(),
            },

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

                await transaction.technical_review_assignments.updateMany({
                    where: { technical_review_id: id, status: 'CURRENT' },
                    data: { status: 'COMPLETED', ended_at: completedAt },
                });

                await this.workItems?.completeMatchingWorkItems(
                    {
                        actionCode: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                        entityType: 'technical_review',
                        entityId: id,
                    },
                    actingUserId,
                    transaction,
                );

                if (authorization.delegation) {
                    await transaction.delegated_action_logs.create({
                        data: {
                            delegation_id: authorization.delegation.id,
                            actor_user_id: actingUserId,
                            delegated_for_user_id: review.reviewer_id,
                            action_code: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                            entity_type: 'technical_review',
                            entity_id: id,
                            project_id: review.reports.audit_plans.project_id,
                            technical_review_id: id,
                        },
                    });
                }

                await this.workItems?.openWorkItem(
                    {
                        sourceKey:
                            `certification-decision:${id}`,
                        workType:
                            'CERTIFICATION_DECISION',
                        actionCode:
                            WORK_ITEM_ACTIONS.CERTIFICATION_DECISION,
                        title:
                            `Ra quyết định chứng nhận ${review.reports.report_code}`,
                        entityType:
                            'technical_review',
                        entityId:
                            id,
                        projectId:
                            review.reports.audit_plans.project_id,
                        auditEventId:
                            review.reports.audit_plans.audit_event_id,
                        auditPlanId:
                            review.reports.audit_plan_id,
                        assignedRole:
                            'DECISION_MAKER',
                        priority:
                            'HIGH',
                        destinationPath:
                            `/projects/${review.reports.audit_plans.project_id}?workspace=certification-decision&technical_review_id=${id}&audit_plan_id=${review.reports.audit_plan_id}`,
                        context: {
                            report_id:
                                review.report_id,
                            report_code:
                                review.reports.report_code,
                        },
                    },
                    transaction,
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

        const reviewItems =
            await this.attachCurrentDocumentFiles(
                report,
                [
                    ...mergedItems,
                    ...additionalItems,
                ],
            );

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
