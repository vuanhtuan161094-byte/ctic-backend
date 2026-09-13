import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync } from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import { resolveDocumentStoragePath } from '../common/storage-config';
import {
    isConfigurableNumberingEntity,
    numberingBusinessDate,
    numberingBusinessYear,
} from '../master-data-configuration/numbering-runtime-policy';
import { ResourceAccessService } from '../security/resource-access.service';
import type { ResourceActor } from '../security/resource-access.service';
import { TEMPLATE_ALLOWED_TOKENS } from './template-field-catalog';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { listTemplateTokens } = require('../reports/runtime/ooxml-template-engine.cjs') as {
    listTemplateTokens: (templatePath: string) => string[];
};

import {
    AttachOfficialFileDto,
    CreateControlledDocumentDto,
    CreateControlledDocumentRevisionDto,
    CreateControlledTemplateDto,
    CreateTemplateRevisionDto,
    ControlledVoidDto,
    EffectiveTemplateDto,
    WorkflowNoteDto,
} from './dto/document-control.dto';

const TEMPLATE_IMMUTABLE_STATUSES = new Set([
    'APPROVED',
    'EFFECTIVE',
    'SUPERSEDED',
    'WITHDRAWN',
]);

const DOCUMENT_FINAL_STATUSES = new Set([
    'ISSUED',
    'VOID',
]);

@Injectable()
export class DocumentControlService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly resourceAccess: ResourceAccessService,
    ) {}

    private actorId(actor: ResourceActor) {
        if (!actor.userId) {
            throw new ForbiddenException('Không xác định được tài khoản thao tác');
        }
        return actor.userId;
    }

    private normalize(value: string) {
        return value.trim().replace(/-/g, '_').toLowerCase();
    }

    private code(value: string, maxLength: number) {
        const normalized = value
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9._/-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        if (!normalized) {
            throw new BadRequestException('Mã tài liệu không hợp lệ');
        }
        return normalized.slice(0, maxLength);
    }

    private errorCode(error: unknown) {
        if (!error || typeof error !== 'object' || !('code' in error)) {
            return null;
        }
        return typeof (error as { code?: unknown }).code === 'string'
            ? (error as { code: string }).code
            : null;
    }

    private isTransactionNotBegunError(error: unknown) {
        const queue: unknown[] = [error];
        const seen = new Set<unknown>();
        while (queue.length > 0) {
            const current = queue.shift();
            if (current == null || seen.has(current)) continue;
            seen.add(current);
            if (typeof current === 'string') {
                if (current.toLowerCase().includes('transaction has not begun')) return true;
                continue;
            }
            if (typeof current !== 'object') continue;
            const candidate = current as Record<string, unknown>;
            if (
                String(candidate.code ?? '').toUpperCase() === 'ENOTBEGUN' ||
                String(candidate.message ?? '').toLowerCase().includes('transaction has not begun')
            ) {
                return true;
            }
            for (const key of ['cause', 'originalError', 'driverAdapterError', 'meta']) {
                if (candidate[key]) queue.push(candidate[key]);
            }
        }
        return false;
    }

    private async serializable<T>(
        operation: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                return await this.prisma.$transaction(operation, {
                    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                });
            } catch (error) {
                lastError = error;
                const retryable =
                    ['P2002', 'P2034'].includes(this.errorCode(error) ?? '') ||
                    this.isTransactionNotBegunError(error);
                if (!retryable || attempt >= 1) {
                    throw error;
                }
                await new Promise<void>((resolve) => setTimeout(resolve, 75));
            }
        }
        throw lastError;
    }

    private async exactEffectiveTemplate(
        client: Prisma.TransactionClient | PrismaService,
        id?: string,
    ) {
        if (!id) return null;
        const version = await client.controlled_template_versions.findUnique({
            where: { id },
            include: { series: true },
        });
        if (!version) {
            throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
        }
        if (version.status !== 'EFFECTIVE') {
            throw new ConflictException(
                'Chỉ phiên bản biểu mẫu EFFECTIVE được dùng để tạo tài liệu mới',
            );
        }
        if (!version.source_file_id) {
            throw new ConflictException('Phiên bản biểu mẫu chưa có tệp nguồn');
        }
        return version;
    }

    async listTemplates() {
        return this.prisma.controlled_template_series.findMany({
            orderBy: [{ template_code: 'asc' }],
            include: {
                versions: {
                    orderBy: { revision_no: 'desc' },
                    include: {
                        source_file: {
                            select: {
                                id: true,
                                original_name: true,
                                mime_type: true,
                                file_size: true,
                                sha256: true,
                                version_no: true,
                                created_at: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async createTemplate(dto: CreateControlledTemplateDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const templateCode = this.code(dto.template_code, 80);
        try {
            return await this.prisma.controlled_template_series.create({
                data: {
                    template_code: templateCode,
                    template_name: dto.template_name.trim(),
                    document_type: this.normalize(dto.document_type),
                    scheme_code: dto.scheme_code?.trim() || null,
                    language: dto.language?.trim().toLowerCase() || 'vi',
                    created_by: actorId,
                    versions: {
                        create: {
                            revision_no: 1,
                            revision_label: dto.revision_label?.trim() || 'R1',
                            change_note: dto.change_note?.trim() || null,
                            created_by: actorId,
                        },
                    },
                },
                include: { versions: true },
            });
        } catch (error) {
            if (this.errorCode(error) === 'P2002') {
                throw new ConflictException('Mã biểu mẫu đã tồn tại');
            }
            throw error;
        }
    }

    async createTemplateRevision(
        seriesId: string,
        dto: CreateTemplateRevisionDto,
        actor: ResourceActor,
    ) {
        const actorId = this.actorId(actor);
        return this.serializable(async (tx) => {
            const series = await tx.controlled_template_series.findUnique({
                where: { id: seriesId },
                include: { versions: { orderBy: { revision_no: 'desc' }, take: 1 } },
            });
            if (!series) throw new NotFoundException('Không tìm thấy template series');
            if (series.status !== 'ACTIVE') {
                throw new ConflictException('Template series đã rút khỏi sử dụng');
            }
            const latest = series.versions[0];
            if (latest && !TEMPLATE_IMMUTABLE_STATUSES.has(latest.status)) {
                throw new ConflictException(
                    'Phải hoàn tất hoặc rút phiên bản draft hiện tại trước khi tạo revision mới',
                );
            }
            const revisionNo = (latest?.revision_no ?? 0) + 1;
            return tx.controlled_template_versions.create({
                data: {
                    series_id: seriesId,
                    revision_no: revisionNo,
                    revision_label: dto.revision_label?.trim() || `R${revisionNo}`,
                    change_note: dto.change_note.trim(),
                    created_by: actorId,
                },
            });
        });
    }

    async attachTemplateSource(versionId: string, fileId: string, actor: ResourceActor) {
        this.actorId(actor);
        const [version, file] = await Promise.all([
            this.prisma.controlled_template_versions.findUnique({ where: { id: versionId } }),
            this.prisma.documentFile.findUnique({ where: { id: fileId } }),
        ]);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
        if (!file) throw new NotFoundException('Không tìm thấy tệp nguồn biểu mẫu');
        if (version.status !== 'DRAFT') {
            throw new ConflictException('Phiên bản biểu mẫu sau Draft là bất biến');
        }
        if (
            this.normalize(file.entity_type) !== 'controlled_template_version' ||
            file.entity_id !== versionId ||
            !['generated_docx', 'generated_xlsx', 'attachment'].includes(file.file_kind) ||
            !['.docx', '.xlsx'].some((extension) => file.original_name.toLowerCase().endsWith(extension))
        ) {
            throw new BadRequestException(
                'Tệp nguồn phải là Word .docx hoặc Excel .xlsx đã tải cho đúng phiên bản biểu mẫu',
            );
        }
        const sourcePath = resolveDocumentStoragePath(file.stored_name);
        if (!existsSync(sourcePath)) {
            throw new NotFoundException('Không tìm thấy tệp nguồn biểu mẫu trong kho lưu trữ');
        }
        const tokens = listTemplateTokens(sourcePath);
        const isExcel = file.original_name.toLowerCase().endsWith('.xlsx');
        const unsupportedRepeatTokens = isExcel
            ? tokens.filter((token) => token.startsWith('#') || token.startsWith('/'))
            : [];
        const unknownTokens = tokens.filter((token) => !TEMPLATE_ALLOWED_TOKENS.has(token));
        const validation = {
            valid: unknownTokens.length === 0 && unsupportedRepeatTokens.length === 0,
            format: isExcel ? 'XLSX' : 'DOCX',
            token_count: tokens.length,
            tokens,
            unknown_tokens: unknownTokens,
            unsupported_repeat_tokens: unsupportedRepeatTokens,
            checked_at: new Date().toISOString(),
        };
        return this.prisma.controlled_template_versions.update({
            where: { id: versionId },
            data: {
                source_file_id: fileId,
                token_snapshot_json: JSON.stringify(tokens),
                validation_json: JSON.stringify(validation),
                validated_at: new Date(),
            },
        });
    }

    private async templateTransition(
        versionId: string,
        from: string,
        to: string,
        actor: ResourceActor,
        note?: string,
    ) {
        const actorId = this.actorId(actor);
        const version = await this.prisma.controlled_template_versions.findUnique({
            where: { id: versionId },
        });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
        if (version.status !== from) {
            throw new ConflictException(`Chỉ phiên bản ${from} mới có thể chuyển sang ${to}`);
        }
        if (!version.source_file_id) {
            throw new ConflictException('Phiên bản biểu mẫu chưa có tệp nguồn');
        }
        if (
            to === 'APPROVED' &&
            (version.created_by === actorId || version.reviewed_by === actorId)
        ) {
            throw new ForbiddenException('Người tạo hoặc người đã xác nhận nội dung không được tự phê duyệt biểu mẫu');
        }
        return this.prisma.controlled_template_versions.update({
            where: { id: versionId },
            data: {
                status: to,
                change_note: note?.trim() || version.change_note,
                ...(to === 'REVIEWED'
                    ? { reviewed_by: actorId, reviewed_at: new Date() }
                    : {}),
                ...(to === 'APPROVED'
                    ? { approved_by: actorId, approved_at: new Date() }
                    : {}),
            },
        });
    }

    submitTemplateReview(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.templateTransition(id, 'DRAFT', 'UNDER_REVIEW', actor, dto.note);
    }

    reviewTemplate(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.templateTransition(id, 'UNDER_REVIEW', 'REVIEWED', actor, dto.note);
    }

    approveTemplate(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.templateTransition(id, 'REVIEWED', 'APPROVED', actor, dto.note);
    }

    async makeTemplateEffective(
        id: string,
        dto: EffectiveTemplateDto,
        actor: ResourceActor,
    ) {
        this.actorId(actor);
        const effectiveDate = new Date(dto.effective_date);
        return this.serializable(async (tx) => {
            const version = await tx.controlled_template_versions.findUnique({
                where: { id },
            });
            if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
            if (version.status !== 'APPROVED') {
                throw new ConflictException('Chỉ phiên bản APPROVED mới được đưa vào hiệu lực');
            }
            if (!version.source_file_id) {
                throw new ConflictException('Biểu mẫu chưa có tệp Word/Excel nguồn');
            }
            const validation = version.validation_json
                ? JSON.parse(version.validation_json) as { valid?: boolean; unknown_tokens?: string[] }
                : null;
            if (!validation?.valid) {
                throw new ConflictException(
                    `Biểu mẫu chưa đạt kiểm tra placeholder${validation?.unknown_tokens?.length ? `: ${validation.unknown_tokens.join(', ')}` : ''}`,
                );
            }
            const now = new Date();
            await tx.controlled_template_versions.updateMany({
                where: { series_id: version.series_id, status: 'EFFECTIVE', id: { not: id } },
                data: { status: 'SUPERSEDED', superseded_at: now },
            });
            return tx.controlled_template_versions.update({
                where: { id },
                data: {
                    status: 'EFFECTIVE',
                    effective_date: effectiveDate,
                    effective_at: now,
                    change_note: dto.note?.trim() || version.change_note,
                },
                include: { series: true },
            });
        });
    }

    /**
     * Import the first template revision as an already-approved baseline template.
     * This is for initial CMP setup only; later revisions still require the normal
     * review/approval workflow.
     */
    async importExistingTemplateEffective(
        id: string,
        dto: EffectiveTemplateDto,
        actor: ResourceActor,
    ) {
        const actorId = this.actorId(actor);
        const effectiveDate = new Date(dto.effective_date);
        return this.serializable(async (tx) => {
            const version = await tx.controlled_template_versions.findUnique({
                where: { id },
            });
            if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
            if (version.revision_no !== 1) {
                throw new ConflictException('Chỉ phiên bản mẫu đầu tiên mới được nhập như mẫu đang áp dụng');
            }
            if (!['DRAFT', 'UNDER_REVIEW', 'REVIEWED', 'APPROVED'].includes(version.status)) {
                throw new ConflictException('Phiên bản mẫu này không còn ở trạng thái có thể nhập làm mẫu nền');
            }
            const versionCount = await tx.controlled_template_versions.count({
                where: { series_id: version.series_id },
            });
            if (versionCount !== 1) {
                throw new ConflictException('Mẫu đã có lịch sử phiên bản; hãy dùng quy trình cập nhật thông thường');
            }
            if (!version.source_file_id) {
                throw new ConflictException('Biểu mẫu chưa có tệp Word/Excel nguồn');
            }
            const validation = version.validation_json
                ? JSON.parse(version.validation_json) as { valid?: boolean; unknown_tokens?: string[] }
                : null;
            if (!validation?.valid) {
                throw new ConflictException(
                    `Biểu mẫu chưa đạt kiểm tra trường dữ liệu${validation?.unknown_tokens?.length ? `: ${validation.unknown_tokens.join(', ')}` : ''}`,
                );
            }
            const now = new Date();
            const updated = await tx.controlled_template_versions.update({
                where: { id },
                data: {
                    status: 'EFFECTIVE',
                    effective_date: effectiveDate,
                    effective_at: now,
                    change_note: dto.note?.trim() || version.change_note,
                },
                include: { series: true },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'CONTROLLED_TEMPLATE_BASELINE_IMPORTED',
                    entity_type: 'controlled_template_version',
                    entity_id: id,
                    outcome: 'SUCCESS',
                    details_json: JSON.stringify({
                        before: { status: version.status },
                        after: { status: 'EFFECTIVE' },
                        effective_date: effectiveDate,
                        reason: dto.note?.trim() || 'Mẫu đã được phê duyệt trước khi đưa vào CMP',
                    }),
                },
            });
            return updated;
        });
    }

    async withdrawTemplate(id: string, dto: ControlledVoidDto, actor: ResourceActor) {
        this.actorId(actor);
        const version = await this.prisma.controlled_template_versions.findUnique({ where: { id } });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
        if (!['APPROVED', 'EFFECTIVE', 'SUPERSEDED'].includes(version.status)) {
            throw new ConflictException('Chỉ revision đã phê duyệt/hiệu lực mới được withdraw');
        }
        return this.prisma.controlled_template_versions.update({
            where: { id },
            data: {
                status: 'WITHDRAWN',
                withdrawn_at: new Date(),
                change_note: dto.reason.trim(),
            },
        });
    }

    async allocateControlledNumber(
        tx: Prisma.TransactionClient,
        prefixInput: string,
        yearInput?: number,
        entityType?: string,
    ) {
        const normalizedEntityType = entityType?.trim().toUpperCase();
        if (
            normalizedEntityType &&
            !isConfigurableNumberingEntity(normalizedEntityType)
        ) {
            throw new BadRequestException(
                `Loại hồ sơ ${normalizedEntityType} không thuộc Numbering Rules runtime`,
            );
        }
        const effectiveAt = numberingBusinessDate();
        const configured = normalizedEntityType && 'numbering_series_configs' in tx
            ? await tx.numbering_series_configs.findFirst({
                where: {
                    entity_type: normalizedEntityType,
                    status: 'ACTIVE',
                    effective_from: { lte: effectiveAt },
                    OR: [
                        { effective_to: null },
                        { effective_to: { gte: effectiveAt } },
                    ],
                },
                orderBy: { effective_from: 'desc' },
            })
            : null;
        const requestedPrefix = this.code(
            configured?.prefix ?? prefixInput,
            50,
        );
        // Persisted numbering_series_configs.series_key is a legacy storage
        // column. Runtime sequence continuation is explicitly owned by the
        // normalized visible prefix plus business year.
        const seriesKey = requestedPrefix;
        const year = yearInput ?? numberingBusinessYear();
        const rows = await tx.$queryRaw<Array<{
            prefix: string;
            next_value: number;
        }>>(Prisma.sql`
            MERGE [dbo].[controlled_number_sequences] WITH (HOLDLOCK) AS target
            USING (
                SELECT
                    CAST(${seriesKey} AS NVARCHAR(100)) AS [series_key],
                    CAST(${year} AS INT) AS [year_no],
                    CAST(${requestedPrefix} AS NVARCHAR(50)) AS [prefix]
            ) AS source
            ON target.[series_key] = source.[series_key]
               AND target.[year_no] = source.[year_no]
            WHEN MATCHED THEN
                UPDATE SET
                    target.[next_value] = target.[next_value] + 1,
                    target.[updated_at] = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (
                    [id], [series_key], [year_no], [prefix], [next_value], [created_at], [updated_at]
                )
                VALUES (
                    NEWID(), source.[series_key], source.[year_no], source.[prefix], 2,
                    SYSUTCDATETIME(), SYSUTCDATETIME()
                )
            OUTPUT inserted.[prefix], inserted.[next_value];
        `);
        const allocated = rows[0];
        if (!allocated) {
            throw new ConflictException('Không thể cấp số tài liệu');
        }
        return `${allocated.prefix}-${year}-${String(allocated.next_value - 1).padStart(configured?.padding ?? 4, '0')}`;
    }

    async createDocument(dto: CreateControlledDocumentDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        await this.resourceAccess.assertDocumentEntityAccess(
            { entity_type: dto.entity_type, entity_id: dto.entity_id },
            actor,
        );
        return this.serializable(async (tx) => {
            const template = await this.exactEffectiveTemplate(tx, dto.template_version_id);
            const documentNumber = await this.allocateControlledNumber(
                tx,
                dto.number_prefix || dto.series_key || dto.document_code,
                dto.number_year,
                'DOCUMENT',
            );
            return tx.controlled_documents.create({
                data: {
                    document_number: documentNumber,
                    document_code: this.code(dto.document_code, 80),
                    document_name: dto.document_name.trim(),
                    document_type: this.normalize(dto.document_type),
                    entity_type: this.normalize(dto.entity_type),
                    entity_id: dto.entity_id,
                    project_id: dto.project_id ?? null,
                    customer_id: dto.customer_id ?? null,
                    owner_id: actorId,
                    versions: {
                        create: {
                            version_no: 1,
                            template_version_id: template?.id ?? null,
                            template_code: template?.series.template_code ?? null,
                            template_revision: template?.revision_label ?? null,
                            change_note: dto.change_note?.trim() || null,
                            created_by: actorId,
                            actions: {
                                create: {
                                    action: 'CREATE',
                                    to_status: 'DRAFT',
                                    actor_id: actorId,
                                    note: dto.change_note?.trim() || null,
                                },
                            },
                        },
                    },
                },
                include: { versions: { include: { actions: true } } },
            });
        });
    }

    async listDocuments(actor: ResourceActor, filters?: {
        status?: string;
        document_type?: string;
        search?: string;
    }) {
        const rows = await this.prisma.controlled_documents.findMany({
            where: {
                ...(filters?.status ? { status: filters.status.trim().toUpperCase() } : {}),
                ...(filters?.document_type
                    ? { document_type: this.normalize(filters.document_type) }
                    : {}),
            },
            orderBy: { created_at: 'desc' },
            include: {
                versions: {
                    orderBy: { version_no: 'desc' },
                    take: 1,
                    include: {
                        template_version: { include: { series: true } },
                        working_file: {
                            select: { id: true, original_name: true, mime_type: true, file_size: true, sha256: true },
                        },
                        official_file: {
                            select: { id: true, original_name: true, mime_type: true, file_size: true, sha256: true },
                        },
                    },
                },
            },
        });
        const scoped = await this.resourceAccess.filterDocumentEntities(rows, actor);
        const keyword = filters?.search?.trim().toLowerCase();
        return keyword
            ? scoped.filter((row) =>
                [row.document_number, row.document_code, row.document_name, row.document_type]
                    .join(' ')
                    .toLowerCase()
                    .includes(keyword),
            )
            : scoped;
    }

    private async accessibleDocument(id: string, actor: ResourceActor) {
        const document = await this.prisma.controlled_documents.findUnique({
            where: { id },
            include: {
                versions: {
                    orderBy: { version_no: 'desc' },
                    include: {
                        template_version: { include: { series: true } },
                        working_file: true,
                        official_file: true,
                        actions: { orderBy: { created_at: 'asc' } },
                    },
                },
            },
        });
        if (!document) throw new NotFoundException('Không tìm thấy controlled document');
        await this.resourceAccess.assertDocumentEntityAccess(document, actor);
        return document;
    }

    findDocument(id: string, actor: ResourceActor) {
        return this.accessibleDocument(id, actor);
    }

    private async accessibleVersion(id: string, actor: ResourceActor) {
        const version = await this.prisma.controlled_document_versions.findUnique({
            where: { id },
            include: { document: true, working_file: true, official_file: true },
        });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
        await this.resourceAccess.assertDocumentEntityAccess(version.document, actor);
        return version;
    }

    async attachWorkingFile(versionId: string, fileId: string, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const [version, file] = await Promise.all([
            this.accessibleVersion(versionId, actor),
            this.prisma.documentFile.findUnique({ where: { id: fileId } }),
        ]);
        if (!file) throw new NotFoundException('Không tìm thấy tệp làm việc');
        if (version.status !== 'DRAFT' || DOCUMENT_FINAL_STATUSES.has(version.status)) {
            throw new ConflictException('Chỉ Draft hiện tại được thay tệp làm việc');
        }
        if (
            this.normalize(file.entity_type) !== this.normalize(version.document.entity_type) ||
            file.entity_id !== version.document.entity_id
        ) {
            throw new BadRequestException('Tệp không thuộc cùng đối tượng nghiệp vụ');
        }
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.controlled_document_versions.update({
                where: { id: versionId },
                data: { working_file_id: fileId },
            });
            await tx.controlled_document_actions.create({
                data: {
                    version_id: versionId,
                    action: version.working_file_id ? 'REPLACE_DRAFT_FILE' : 'ATTACH_DRAFT_FILE',
                    from_status: 'DRAFT',
                    to_status: 'DRAFT',
                    actor_id: actorId,
                    note: file.original_name,
                },
            });
            return updated;
        });
    }

    private async documentTransition(
        versionId: string,
        from: string,
        to: string,
        action: string,
        dto: WorkflowNoteDto,
        actor: ResourceActor,
    ) {
        const actorId = this.actorId(actor);
        const version = await this.accessibleVersion(versionId, actor);
        if (version.status !== from) {
            throw new ConflictException(`Chỉ phiên bản ${from} mới có thể chuyển sang ${to}`);
        }
        if (!version.working_file_id) {
            throw new ConflictException('Phiên bản chưa có tệp làm việc');
        }
        if (to === 'APPROVED' && (version.created_by === actorId || version.reviewed_by === actorId)) {
            throw new ForbiddenException('Người tạo hoặc người đã xác nhận nội dung không được tự phê duyệt tài liệu');
        }
        return this.prisma.$transaction(async (tx) => {
            const now = new Date();
            const updated = await tx.controlled_document_versions.update({
                where: { id: versionId },
                data: {
                    status: to,
                    ...(to === 'REVIEWED' ? { reviewed_by: actorId, reviewed_at: now } : {}),
                    ...(to === 'APPROVED' ? { approved_by: actorId, approved_at: now } : {}),
                },
            });
            await tx.controlled_documents.update({
                where: { id: version.document_id },
                data: { status: to },
            });
            await tx.controlled_document_actions.create({
                data: {
                    version_id: versionId,
                    action,
                    from_status: from,
                    to_status: to,
                    actor_id: actorId,
                    note: dto.note?.trim() || null,
                },
            });
            return updated;
        });
    }

    submitDocumentReview(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.documentTransition(id, 'DRAFT', 'UNDER_REVIEW', 'SUBMIT_REVIEW', dto, actor);
    }

    reviewDocument(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.documentTransition(id, 'UNDER_REVIEW', 'REVIEWED', 'REVIEW', dto, actor);
    }

    approveDocument(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.documentTransition(id, 'REVIEWED', 'APPROVED', 'APPROVE', dto, actor);
    }

    async attachOfficialFile(id: string, dto: AttachOfficialFileDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const [version, file] = await Promise.all([
            this.accessibleVersion(id, actor),
            this.prisma.documentFile.findUnique({ where: { id: dto.file_id } }),
        ]);
        if (!file) throw new NotFoundException('Không tìm thấy official PDF');
        if (version.status !== 'APPROVED') {
            throw new ConflictException('Official PDF chỉ được gắn vào exact version đã APPROVED');
        }
        if (version.official_file_id) {
            throw new ConflictException(
                'Official PDF đã tồn tại; phải tạo controlled version mới để thay thế',
            );
        }
        if (
            file.mime_type !== 'application/pdf' ||
            !file.original_name.toLowerCase().endsWith('.pdf') ||
            !file.sha256
        ) {
            throw new BadRequestException('Official file phải là PDF đã kiểm tra SHA-256');
        }
        if (
            this.normalize(file.entity_type) !== this.normalize(version.document.entity_type) ||
            file.entity_id !== version.document.entity_id
        ) {
            throw new BadRequestException('Official PDF không thuộc cùng đối tượng nghiệp vụ');
        }
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.controlled_document_versions.update({
                where: { id },
                data: {
                    official_file_id: file.id,
                    signature_method: dto.signature_method,
                    signed_by: actorId,
                    signed_at: new Date(),
                    signed_sha256: file.sha256,
                },
            });
            await tx.controlled_document_actions.create({
                data: {
                    version_id: id,
                    action: 'ATTACH_OFFICIAL_PDF',
                    from_status: 'APPROVED',
                    to_status: 'APPROVED',
                    actor_id: actorId,
                    note: `${dto.signature_method}:${file.id}:${file.sha256}`,
                },
            });
            return updated;
        });
    }

    async issueDocument(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const version = await this.accessibleVersion(id, actor);
        if (version.status !== 'APPROVED' || !version.official_file_id || !version.signed_sha256) {
            throw new ConflictException('Chỉ exact version APPROVED có official PDF mới được issue');
        }
        if (version.official_file?.sha256 !== version.signed_sha256) {
            throw new ConflictException('Hash official PDF không còn khớp với approval binding');
        }
        return this.serializable(async (tx) => {
            const now = new Date();
            const updated = await tx.controlled_document_versions.update({
                where: { id },
                data: { status: 'ISSUED', issued_by: actorId, issued_at: now },
            });
            await tx.controlled_documents.update({
                where: { id: version.document_id },
                data: { status: 'ISSUED', issued_at: now },
            });
            await tx.controlled_document_actions.create({
                data: {
                    version_id: id,
                    action: 'ISSUE',
                    from_status: 'APPROVED',
                    to_status: 'ISSUED',
                    actor_id: actorId,
                    note: dto.note?.trim() || null,
                },
            });
            return updated;
        });
    }

    async reviseIssuedDocument(
        documentId: string,
        dto: CreateControlledDocumentRevisionDto,
        actor: ResourceActor,
    ) {
        const actorId = this.actorId(actor);
        await this.accessibleDocument(documentId, actor);
        return this.serializable(async (tx) => {
            const document = await tx.controlled_documents.findUnique({
                where: { id: documentId },
                include: { versions: { orderBy: { version_no: 'desc' }, take: 1 } },
            });
            if (!document) throw new NotFoundException('Không tìm thấy controlled document');
            const current = document.versions[0];
            if (!current || current.status !== 'ISSUED') {
                throw new ConflictException('Chỉ tài liệu ISSUED mới dùng correction/version replacement');
            }
            const template = dto.template_version_id
                ? await this.exactEffectiveTemplate(tx, dto.template_version_id)
                : null;
            const versionNo = current.version_no + 1;
            const created = await tx.controlled_document_versions.create({
                data: {
                    document_id: documentId,
                    version_no: versionNo,
                    previous_version_id: current.id,
                    template_version_id: template?.id ?? current.template_version_id,
                    template_code: template?.series.template_code ?? current.template_code,
                    template_revision: template?.revision_label ?? current.template_revision,
                    change_note: dto.change_note.trim(),
                    created_by: actorId,
                    actions: {
                        create: {
                            action: 'CREATE_REPLACEMENT_VERSION',
                            from_status: 'ISSUED',
                            to_status: 'DRAFT',
                            actor_id: actorId,
                            note: dto.change_note.trim(),
                        },
                    },
                },
                include: { actions: true },
            });
            await tx.controlled_documents.update({
                where: { id: documentId },
                data: { status: 'DRAFT', current_version_no: versionNo },
            });
            return created;
        });
    }

    async voidDocumentVersion(id: string, dto: ControlledVoidDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const version = await this.accessibleVersion(id, actor);
        if (version.status !== 'ISSUED') {
            throw new ConflictException('Chỉ exact version ISSUED mới được void');
        }
        return this.prisma.$transaction(async (tx) => {
            const now = new Date();
            const updated = await tx.controlled_document_versions.update({
                where: { id },
                data: { status: 'VOID' },
            });
            await tx.controlled_documents.update({
                where: { id: version.document_id },
                data: {
                    status: 'VOID',
                    voided_at: now,
                    void_reason: dto.reason.trim(),
                },
            });
            await tx.controlled_document_actions.create({
                data: {
                    version_id: id,
                    action: 'VOID',
                    from_status: 'ISSUED',
                    to_status: 'VOID',
                    actor_id: actorId,
                    note: dto.reason.trim(),
                },
            });
            return updated;
        });
    }
}
