import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ResourceActor } from '../security/resource-access.service';
import {
    CreateDocumentLibraryRevisionDto,
    CreateDocumentLibrarySeriesDto,
    EffectiveDocumentLibraryVersionDto,
    WorkflowNoteDto,
    ControlledVoidDto,
} from './dto/document-control.dto';

const INTERNAL_FINAL = new Set(['APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'WITHDRAWN']);

@Injectable()
export class DocumentLibraryService {
    constructor(private readonly prisma: PrismaService) {}

    private actorId(actor: ResourceActor) {
        if (!actor.userId) throw new ForbiddenException('Không xác định được tài khoản thao tác');
        return actor.userId;
    }

    private code(value: string) {
        const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9._/-]+/g, '-').replace(/-+/g, '-');
        if (!normalized) throw new BadRequestException('Mã tài liệu không hợp lệ');
        return normalized.slice(0, 100);
    }

    private errorCode(error: unknown) {
        if (!error || typeof error !== 'object' || !('code' in error)) return null;
        const code = (error as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
    }

    async list(kind?: string, search?: string) {
        const normalizedKind = kind?.trim().toUpperCase();
        const rows = await this.prisma.document_library_series.findMany({
            where: {
                ...(normalizedKind && ['INTERNAL', 'EXTERNAL'].includes(normalizedKind)
                    ? { library_kind: normalizedKind }
                    : {}),
            },
            orderBy: [{ library_kind: 'asc' }, { document_code: 'asc' }],
            include: {
                versions: {
                    orderBy: { revision_no: 'desc' },
                    include: {
                        file: {
                            select: {
                                id: true,
                                original_name: true,
                                mime_type: true,
                                file_size: true,
                                sha256: true,
                                created_at: true,
                            },
                        },
                    },
                },
            },
        });
        const keyword = search?.trim().toLowerCase();
        return keyword
            ? rows.filter((row) => [row.document_code, row.title, row.category, row.issuing_body]
                .filter(Boolean).join(' ').toLowerCase().includes(keyword))
            : rows;
    }

    async create(dto: CreateDocumentLibrarySeriesDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        try {
            return await this.prisma.document_library_series.create({
                data: {
                    library_kind: dto.library_kind,
                    document_code: this.code(dto.document_code),
                    title: dto.title.trim(),
                    category: dto.category?.trim() || null,
                    issuing_body: dto.issuing_body?.trim() || null,
                    access_scope: dto.access_scope ?? 'INTERNAL',
                    note: dto.note?.trim() || null,
                    created_by: actorId,
                    versions: {
                        create: {
                            revision_no: 1,
                            revision_label: dto.revision_label?.trim() || 'R1',
                            issue_date: dto.issue_date ? new Date(dto.issue_date) : null,
                            effective_date: dto.effective_date ? new Date(dto.effective_date) : null,
                            expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
                            source_reference: dto.source_reference?.trim() || null,
                            created_by: actorId,
                        },
                    },
                },
                include: { versions: true },
            });
        } catch (error) {
            if (this.errorCode(error) === 'P2002') throw new ConflictException('Mã tài liệu đã tồn tại');
            throw error;
        }
    }

    async createRevision(seriesId: string, dto: CreateDocumentLibraryRevisionDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        return this.prisma.$transaction(async (tx) => {
            const series = await tx.document_library_series.findUnique({
                where: { id: seriesId },
                include: { versions: { orderBy: { revision_no: 'desc' }, take: 1 } },
            });
            if (!series) throw new NotFoundException('Không tìm thấy tài liệu');
            if (series.status !== 'ACTIVE') throw new ConflictException('Tài liệu đã ngừng quản lý');
            const latest = series.versions[0];
            if (latest && !INTERNAL_FINAL.has(latest.status)) {
                throw new ConflictException('Phải hoàn tất hoặc rút phiên bản nháp hiện tại trước khi tạo phiên bản mới');
            }
            const revisionNo = (latest?.revision_no ?? 0) + 1;
            return tx.document_library_versions.create({
                data: {
                    series_id: seriesId,
                    revision_no: revisionNo,
                    revision_label: dto.revision_label?.trim() || `R${revisionNo}`,
                    issue_date: dto.issue_date ? new Date(dto.issue_date) : null,
                    effective_date: dto.effective_date ? new Date(dto.effective_date) : null,
                    expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
                    source_reference: dto.source_reference?.trim() || null,
                    change_note: dto.change_note.trim(),
                    created_by: actorId,
                },
            });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async attachFile(versionId: string, fileId: string, actor: ResourceActor) {
        this.actorId(actor);
        const [version, file] = await Promise.all([
            this.prisma.document_library_versions.findUnique({ where: { id: versionId }, include: { series: true } }),
            this.prisma.documentFile.findUnique({ where: { id: fileId } }),
        ]);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
        if (!file) throw new NotFoundException('Không tìm thấy tệp tải lên');
        if (version.status !== 'DRAFT') throw new ConflictException('Chỉ phiên bản nháp được thay tệp');
        if (file.entity_type.trim().toLowerCase() !== 'document_library_version' || file.entity_id !== versionId) {
            throw new BadRequestException('Tệp phải được tải cho đúng phiên bản tài liệu');
        }
        return this.prisma.document_library_versions.update({
            where: { id: versionId },
            data: { file_id: fileId },
            include: { file: true, series: true },
        });
    }

    private async internalTransition(
        versionId: string,
        from: string,
        to: string,
        actor: ResourceActor,
        note?: string,
    ) {
        const actorId = this.actorId(actor);
        const version = await this.prisma.document_library_versions.findUnique({
            where: { id: versionId }, include: { series: true },
        });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
        if (version.series.library_kind !== 'INTERNAL') {
            throw new ConflictException('Luồng review/approve chỉ áp dụng cho tài liệu nội bộ');
        }
        if (version.status !== from) throw new ConflictException(`Chỉ phiên bản ${from} mới có thể chuyển sang ${to}`);
        if (!version.file_id) throw new ConflictException('Phiên bản chưa có tệp');
        if (to === 'APPROVED' && (version.created_by === actorId || version.reviewed_by === actorId)) {
            throw new ForbiddenException('Người tạo hoặc người đã xác nhận nội dung không được tự phê duyệt tài liệu nội bộ');
        }
        const now = new Date();
        const updated = await this.prisma.document_library_versions.update({
            where: { id: versionId },
            data: {
                status: to,
                ...(to === 'REVIEWED' ? { reviewed_by: actorId, reviewed_at: now } : {}),
                ...(to === 'APPROVED' ? { approved_by: actorId, approved_at: now } : {}),
            },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: actorId,
                action: `DOCUMENT_LIBRARY_${to}`,
                entity_type: 'document_library_version',
                entity_id: versionId,
                outcome: 'SUCCESS',
                details_json: JSON.stringify({ before: { status: from }, after: { status: to }, note: note ?? null }),
            },
        });
        return updated;
    }

    submitReview(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.internalTransition(id, 'DRAFT', 'UNDER_REVIEW', actor, dto.note);
    }
    review(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.internalTransition(id, 'UNDER_REVIEW', 'REVIEWED', actor, dto.note);
    }
    approve(id: string, dto: WorkflowNoteDto, actor: ResourceActor) {
        return this.internalTransition(id, 'REVIEWED', 'APPROVED', actor, dto.note);
    }

    /**
     * Import a document that was already approved/effective before CMP started managing it.
     * This is intentionally restricted to the FIRST version of an INTERNAL series so it
     * cannot be used as a shortcut around the normal revision approval workflow.
     */
    async importExistingEffective(
        id: string,
        dto: EffectiveDocumentLibraryVersionDto,
        actor: ResourceActor,
    ) {
        const actorId = this.actorId(actor);
        return this.prisma.$transaction(async (tx) => {
            const version = await tx.document_library_versions.findUnique({
                where: { id },
                include: { series: true },
            });
            if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
            if (version.series.library_kind !== 'INTERNAL') {
                throw new ConflictException('Chức năng nhập tài liệu đang áp dụng chỉ dành cho tài liệu nội bộ');
            }
            if (version.revision_no !== 1) {
                throw new ConflictException('Chỉ phiên bản đầu tiên mới được nhập như tài liệu nền đang áp dụng');
            }
            if (!version.file_id) throw new ConflictException('Phiên bản chưa có tệp');
            if (!['DRAFT', 'UNDER_REVIEW', 'REVIEWED', 'APPROVED'].includes(version.status)) {
                throw new ConflictException('Phiên bản này không còn ở trạng thái có thể nhập làm tài liệu nền');
            }
            const versionCount = await tx.document_library_versions.count({
                where: { series_id: version.series_id },
            });
            if (versionCount !== 1) {
                throw new ConflictException('Tài liệu đã có lịch sử phiên bản; hãy dùng quy trình cập nhật thông thường');
            }
            const now = new Date();
            const updated = await tx.document_library_versions.update({
                where: { id },
                data: {
                    status: 'EFFECTIVE',
                    effective_date: dto.effective_date ? new Date(dto.effective_date) : (version.effective_date ?? now),
                    expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : version.expiry_date,
                    effective_at: now,
                },
                include: { series: true, file: true },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'DOCUMENT_LIBRARY_BASELINE_IMPORTED',
                    entity_type: 'document_library_version',
                    entity_id: id,
                    outcome: 'SUCCESS',
                    details_json: JSON.stringify({
                        before: { status: version.status },
                        after: { status: 'EFFECTIVE' },
                        revision_label: version.revision_label,
                        effective_date: updated.effective_date,
                        reason: dto.note?.trim() || 'Tài liệu đã được phê duyệt trước khi đưa vào CMP',
                    }),
                },
            });
            return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async makeEffective(id: string, dto: EffectiveDocumentLibraryVersionDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        return this.prisma.$transaction(async (tx) => {
            const version = await tx.document_library_versions.findUnique({ where: { id }, include: { series: true } });
            if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
            if (!version.file_id) throw new ConflictException('Phiên bản chưa có tệp');
            const allowed = version.series.library_kind === 'INTERNAL' ? ['APPROVED'] : ['DRAFT', 'APPROVED'];
            if (!allowed.includes(version.status)) {
                throw new ConflictException(
                    version.series.library_kind === 'INTERNAL'
                        ? 'Tài liệu nội bộ phải được phê duyệt trước khi có hiệu lực'
                        : 'Phiên bản tài liệu bên ngoài không ở trạng thái có thể đưa vào sử dụng',
                );
            }
            const now = new Date();
            await tx.document_library_versions.updateMany({
                where: { series_id: version.series_id, status: 'EFFECTIVE', id: { not: id } },
                data: { status: 'SUPERSEDED', superseded_at: now },
            });
            const updated = await tx.document_library_versions.update({
                where: { id },
                data: {
                    status: 'EFFECTIVE',
                    effective_date: dto.effective_date ? new Date(dto.effective_date) : (version.effective_date ?? now),
                    expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : version.expiry_date,
                    effective_at: now,
                    ...(version.series.library_kind === 'EXTERNAL' && !version.approved_by
                        ? { approved_by: actorId, approved_at: now }
                        : {}),
                },
                include: { series: true, file: true },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'DOCUMENT_LIBRARY_EFFECTIVE',
                    entity_type: 'document_library_version',
                    entity_id: id,
                    outcome: 'SUCCESS',
                    details_json: JSON.stringify({
                        library_kind: version.series.library_kind,
                        revision_label: version.revision_label,
                        effective_date: updated.effective_date,
                        note: dto.note ?? null,
                    }),
                },
            });
            return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async withdraw(id: string, dto: ControlledVoidDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const version = await this.prisma.document_library_versions.findUnique({ where: { id } });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
        if (!['DRAFT', 'UNDER_REVIEW', 'REVIEWED', 'APPROVED', 'EFFECTIVE'].includes(version.status)) {
            throw new ConflictException('Phiên bản này không thể rút');
        }
        const updated = await this.prisma.document_library_versions.update({
            where: { id }, data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
        });
        await this.prisma.audit_logs.create({
            data: {
                user_id: actorId,
                action: 'DOCUMENT_LIBRARY_WITHDRAWN',
                entity_type: 'document_library_version',
                entity_id: id,
                outcome: 'SUCCESS',
                details_json: JSON.stringify({ before: { status: version.status }, after: { status: 'WITHDRAWN' }, reason: dto.reason }),
            },
        });
        return updated;
    }
}
