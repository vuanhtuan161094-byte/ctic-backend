import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { DocumentFilesService } from '../document-files/document-files.service';
import { getStorageConfig } from '../common/storage-config';
import { convertDocxToPdf } from '../common/document-conversion';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveP09RecognizedListDto, CreateP09RecognizedListDto } from './dto/p09-f16.dto';

@Injectable()
export class P09F16Service {
    constructor(private readonly prisma: PrismaService,
        @Optional() private readonly documentFiles?: DocumentFilesService) {}

    private requireActor(actor?: string) {
        if (!actor) throw new ForbiddenException('Không xác định được người thực hiện F.16');
        return actor;
    }

    private present(row: {
        id: string;
        revision_no: number;
        organizations_json: string;
        status: string;
        prepared_by: string;
        approved_by: string | null;
        approved_at: Date | null;
        note: string | null;
        created_at: Date;
    }) {
        return {
            id: row.id, revision_no: row.revision_no, status: row.status,
            prepared_by: row.prepared_by, approved_by: row.approved_by,
            approved_at: row.approved_at, note: row.note, created_at: row.created_at,
            organizations: JSON.parse(row.organizations_json) as Array<{
                name: string; recognition_scope: string;
            }>,
            // F.16 authorization does NOT authorize manday reductions by itself.
            manday_reduction_authorized: false,
            signed_original_attested: false,
        };
    }

    async list() {
        const rows = await this.prisma.p09_recognized_certification_bodies.findMany({
            orderBy: { revision_no: 'desc' },
            take: 100,
        });
        return rows.map((row) => this.present(row));
    }

    async approved() {
        const row = await this.prisma.p09_recognized_certification_bodies.findFirst({
            where: { status: 'approved' },
            orderBy: { revision_no: 'desc' },
        });
        return row ? this.present(row) : null;
    }

    async create(dto: CreateP09RecognizedListDto, actor?: string) {
        const preparer = this.requireActor(actor);
        const organizations = dto.organizations?.map((item) => ({
            name: item.name.trim(), recognition_scope: item.recognition_scope.trim(),
        }));
        if (!organizations?.length || organizations.length > 100 ||
            organizations.some((item) => item.name.length < 2 ||
                item.recognition_scope.length < 3) ||
            !dto.justification?.trim() || dto.justification.trim().length < 20) {
            throw new BadRequestException('F.16 phải có danh sách, phạm vi thừa nhận và lý do sửa đổi');
        }
        const names = organizations.map((item) => item.name.toLocaleLowerCase('vi-VN'));
        if (new Set(names).size !== names.length) {
            throw new BadRequestException('Không được trùng tổ chức trong cùng phiên bản F.16');
        }

        return this.prisma.$transaction(async (tx) => {
            const rows = await tx.p09_recognized_certification_bodies.findMany({
                orderBy: { revision_no: 'desc' }, take: 1,
            });
            if (rows[0]?.status === 'draft') {
                throw new ConflictException('Phiên bản F.16 trước đang chờ duyệt');
            }
            const row = await tx.p09_recognized_certification_bodies.create({
                data: {
                    revision_no: (rows[0]?.revision_no ?? 0) + 1,
                    organizations_json: JSON.stringify(organizations),
                    prepared_by: preparer,
                    note: dto.justification.trim(),
                    status: 'draft',
                },
            });
            await tx.audit_logs.create({ data: {
                user_id: preparer, action: 'P09_F16_PREPARE',
                entity_type: 'p09_f16', entity_id: row.id, outcome: 'SUCCESS',
                details_json: JSON.stringify({
                    revision_no: row.revision_no, organizations_count: organizations.length,
                }),
            } });
            return this.present(row);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async approve(id: string, dto: ApproveP09RecognizedListDto, actor?: string) {
        const approver = this.requireActor(actor);
        if (!dto.approval_note?.trim() || dto.approval_note.trim().length < 20) {
            throw new BadRequestException('Thiếu căn cứ phê duyệt F.16');
        }
        return this.prisma.$transaction(async (tx) => {
            // The latest draft only can be approved; no historical revision overwrite.
            const row = await tx.p09_recognized_certification_bodies.findUnique({ where: { id } });
            if (!row) throw new NotFoundException('Không tìm thấy phiên bản F.16');
            if (row.status !== 'draft') {
                throw new ConflictException('Phiên bản F.16 không còn ở trạng thái chờ duyệt');
            }
            if (row.prepared_by.toLowerCase() === approver.toLowerCase()) {
                throw new ForbiddenException('Người lập F.16 không được tự phê duyệt');
            }
            const latest = await tx.p09_recognized_certification_bodies.findFirst({
                orderBy: { revision_no: 'desc' },
            });
            if (latest?.id !== id) {
                throw new ConflictException('Chỉ được duyệt phiên bản F.16 hiện hành');
            }
            const updated = await tx.p09_recognized_certification_bodies.updateMany({
                where: { id, status: 'draft', approved_by: null },
                data: {
                    status: 'approved', approved_by: approver, approved_at: new Date(),
                    note: [row.note, 'Phê duyệt: ' + dto.approval_note.trim()].filter(Boolean).join('\n'),
                },
            });
            if (updated.count !== 1) throw new ConflictException('F.16 vừa được xử lý bởi tài khoản khác');
            await tx.audit_logs.create({ data: {
                user_id: approver, action: 'P09_F16_APPROVE',
                entity_type: 'p09_f16', entity_id: id, outcome: 'SUCCESS',
                details_json: JSON.stringify({ revision_no: row.revision_no, prepared_by: row.prepared_by }),
            } });
            const published = await tx.p09_recognized_certification_bodies.findUnique({ where: { id } });
            if (!published) throw new NotFoundException('Không tìm thấy bản F.16 đã phê duyệt');
            return this.present(published);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async renderForm(id: string, format: 'docx' | 'pdf', actor?: string) {
        const userId = this.requireActor(actor);
        if (!['docx', 'pdf'].includes(format)) throw new BadRequestException('Chỉ hỗ trợ Word hoặc PDF');
        const item = await this.prisma.p09_recognized_certification_bodies.findUnique({ where: { id } });
        if (!item || item.status !== 'approved' || !item.approved_by) {
            throw new ConflictException('Phải phê duyệt độc lập phiên bản F.16 trước khi xuất');
        }
        if (!this.documentFiles) throw new ConflictException('Dịch vụ quản lý tài liệu chưa được cấu hình');
        const templateCandidates = [
            join(__dirname, '..', 'reports', 'templates', 'F.03-P.09.audit-program.template.docx'),
            join(process.cwd(), 'dist', 'reports', 'templates', 'F.03-P.09.audit-program.template.docx'),
            join(process.cwd(), 'src', 'reports', 'templates', 'F.03-P.09.audit-program.template.docx'),
        ];
        const template = templateCandidates.find(existsSync);
        const rendererCandidates = [
            join(__dirname, '..', 'reports', 'runtime', 'p09-f16-builder.cjs'),
            join(process.cwd(), 'dist', 'reports', 'runtime', 'p09-f16-builder.cjs'),
            join(process.cwd(), 'src', 'reports', 'runtime', 'p09-f16-builder.cjs'),
        ];
        const rendererPath = rendererCandidates.find(existsSync);
        if (!template || !rendererPath) throw new NotFoundException('Thiếu tài nguyên mẫu F.16');
        const renderer = require(rendererPath) as {
            renderF16: (input: {baseTemplatePath: string; outputPath: string; data: Record<string, unknown>}) => string;
        };
        const directory = getStorageConfig().documentsDirectory;
        mkdirSync(directory, { recursive: true });
        const basename = randomUUID();
        const docxPath = join(directory, basename + '.docx');
        const pdfPath = join(directory, basename + '.pdf');
        try {
            renderer.renderF16({
                baseTemplatePath: template,
                outputPath: docxPath,
                data: {
                    organizations: JSON.parse(item.organizations_json),
                    revision_no: item.revision_no,
                    preparer_name: item.prepared_by,
                    approver_name: item.approved_by,
                    prepared_date: item.created_at.toISOString().slice(0, 10),
                    approved_date: item.approved_at?.toISOString().slice(0, 10) ?? '',
                },
            });
            if (format === 'pdf') await convertDocxToPdf(docxPath, pdfPath, 600_000);
            const sourcePath = format === 'docx' ? docxPath : pdfPath;
            const saved = await this.documentFiles.registerGenerated({
                entity_type: 'p09_f16', entity_id: item.id,
                document_type: 'recognized_certification_bodies_f16',
                file_kind: format === 'docx' ? 'generated_docx' : 'generated_pdf',
                original_name: `F.16-P.09-v${item.revision_no}.${format}`,
                stored_name: basename + '.' + format,
                absolute_path: sourcePath,
                mime_type: format === 'docx'
                    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    : 'application/pdf',
                note: 'Bản hệ thống chưa ký; cần bản scan có chữ ký được xác minh độc lập trước phát hành chính thức.',
                uploaded_by: userId,
            });
            await this.prisma.audit_logs.create({ data: {
                user_id: userId,
                action: 'P09_F16_RENDER_UNSIGNED',
                entity_type: 'p09_f16', entity_id: item.id, outcome: 'SUCCESS',
                details_json: JSON.stringify({ revision_no: item.revision_no, format, file_id: saved.id }),
            }});
            return { form_code: 'F.16-P.09', format, unsigned: true, document: saved };
        } finally {
            if (existsSync(docxPath) && format === 'pdf') unlinkSync(docxPath);
        }
    }

    async issueStatus(id: string) {
        const item = await this.prisma.p09_recognized_certification_bodies.findUnique({ where: { id } });
        if (!item) throw new NotFoundException('Không tìm thấy phiên bản F.16');
        const current = await this.prisma.documentFile.findFirst({
            where: { entity_type: 'p09_f16', entity_id: id,
                document_type: 'recognized_certification_bodies_f16',
                file_kind: 'signed_scan', is_current: true },
            orderBy: { version_no: 'desc' },
        });
        const decision = await this.prisma.workflow_approvals.findFirst({
            where: { entity_type: 'P09_F16_OFFICIAL_ISSUE', entity_id: id, status: 'approved' },
            orderBy: { step_no: 'desc' },
        });
        let evidence: {signed_file_id?: string; sha256?: string} = {};
        try { evidence = JSON.parse(decision?.comment ?? '{}'); } catch { /* fail-closed */ }
        const issued = Boolean(item.status === 'approved' && current?.sha256 && decision &&
            evidence.signed_file_id === current.id && evidence.sha256 === current.sha256);
        return {
            form_code: 'F.16-P.09', revision_no: item.revision_no,
            official_issued: issued,
            signed_file_id: current?.id ?? null,
            signed_file_sha256: current?.sha256 ?? null,
            issued_by: issued ? decision?.approver_id : null,
            issued_at: issued ? decision?.approved_at : null,
        };
    }

    async issueOfficial(id: string, signedFileId: string, issueNote: string, actor?: string) {
        const publisher = this.requireActor(actor);
        if (!issueNote?.trim() || issueNote.trim().length < 20) {
            throw new BadRequestException('Cần ghi căn cứ kiểm tra chữ ký và phát hành F.16');
        }
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM dbo.p09_recognized_certification_bodies WITH (UPDLOCK, HOLDLOCK) WHERE id = ${id}`;
            const item = await tx.p09_recognized_certification_bodies.findUnique({ where: { id } });
            if (!item || item.status !== 'approved' || !item.approved_by) {
                throw new ConflictException('Chỉ phát hành phiên bản F.16 được phê duyệt');
            }
            if (publisher.toLowerCase() === item.prepared_by.toLowerCase()) {
                throw new ForbiddenException('Người lập không được tự phát hành F.16');
            }
            const signed = await tx.documentFile.findFirst({
                where: {
                    id: signedFileId,
                    entity_type: 'p09_f16',
                    entity_id: id,
                    document_type: 'recognized_certification_bodies_f16',
                    file_kind: 'signed_scan', is_current: true,
                },
            });
            if (!signed?.sha256 || !/^[a-f0-9]{64}$/i.test(signed.sha256)) {
                throw new BadRequestException('Thiếu bản ký hiện hành F.16 có SHA-256');
            }
            if (!signed.uploaded_by || signed.uploaded_by.toLowerCase() === publisher.toLowerCase()) {
                throw new ForbiddenException('Không có người tải bản ký độc lập để xác nhận phát hành');
            }
            const prior = await tx.workflow_approvals.findFirst({
                where: { entity_type: 'P09_F16_OFFICIAL_ISSUE', entity_id: id },
                orderBy: { step_no: 'desc' },
            });
            if (prior?.status === 'approved') {
                try {
                    const proof = JSON.parse(prior.comment ?? '{}');
                    if (proof.signed_file_id === signed.id && proof.sha256 === signed.sha256) {
                        throw new ConflictException('Phiên bản bản ký này đã được phát hành');
                    }
                } catch (e) { if (e instanceof ConflictException) throw e; }
            }
            const approval = await tx.workflow_approvals.create({
                data: {
                    entity_type: 'P09_F16_OFFICIAL_ISSUE', entity_id: id,
                    step_no: (prior?.step_no ?? 0) + 1, status: 'approved',
                    approver_id: publisher, approved_at: new Date(),
                    comment: JSON.stringify({
                        signed_file_id: signed.id, sha256: signed.sha256,
                        revision_no: item.revision_no, approved_by: item.approved_by,
                        evidence_note: issueNote.trim(),
                    }),
                },
            });
            await tx.audit_logs.create({ data: {
                user_id: publisher, action: 'P09_F16_OFFICIAL_ISSUE',
                entity_type: 'p09_f16', entity_id: id, outcome: 'SUCCESS',
                details_json: JSON.stringify({
                    approval_id: approval.id, revision_no: item.revision_no,
                    signed_file_id: signed.id, signed_sha256: signed.sha256,
                }),
            }});
            return { id, revision_no: item.revision_no, official_issued: true,
                signed_file_id: signed.id, issued_by: publisher, decision_id: approval.id };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

}
