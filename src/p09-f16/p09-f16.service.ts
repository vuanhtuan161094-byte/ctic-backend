import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveP09RecognizedListDto, CreateP09RecognizedListDto } from './dto/p09-f16.dto';

@Injectable()
export class P09F16Service {
    constructor(private readonly prisma: PrismaService) {}

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
}
