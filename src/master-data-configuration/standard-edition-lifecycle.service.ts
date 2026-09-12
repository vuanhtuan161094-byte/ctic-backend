import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from '../security/security-audit.service';
import {
    CreateStandardEditionDto,
    UpdateStandardEditionDto,
} from './dto/master-data-configuration.dto';

@Injectable()
export class StandardEditionLifecycleService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: SecurityAuditService,
    ) { }

    private label(row: { standard_code: string; edition: string }) {
        const code = row.standard_code.trim();
        const edition = row.edition.trim();
        return code.includes(edition) ? code : `${code}:${edition}`;
    }

    private code(value: string, max = 100) {
        return value.trim().toUpperCase().slice(0, max);
    }

    private date(value: string | undefined, field: string, required = false) {
        if (!value) {
            if (required) throw new BadRequestException(`${field} là bắt buộc`);
            return null;
        }
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
        if (!match) throw new BadRequestException(`${field} phải theo định dạng YYYY-MM-DD`);
        const result = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
        if (result.toISOString().slice(0, 10) !== value.trim()) {
            throw new BadRequestException(`${field} không hợp lệ`);
        }
        return result;
    }

    private period(from: Date | null, to: Date | null) {
        if (from && to && to < from) {
            throw new BadRequestException('Ngày ngừng áp dụng phải bằng hoặc sau ngày bắt đầu áp dụng');
        }
    }

    private todayUtc() {
        const now = new Date();
        return new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
        ));
    }

    private async assertScheme(id: string) {
        const row = await this.prisma.certification_schemes.findUnique({ where: { id } });
        if (!row) throw new BadRequestException('Chương trình chứng nhận không tồn tại');
        return row;
    }

    private async assertEdition(id: string) {
        const row = await this.prisma.standard_editions.findUnique({ where: { id } });
        if (!row) throw new NotFoundException('Không tìm thấy phiên bản tiêu chuẩn');
        return row;
    }

    private historyMatch(standardCode: string, edition: string) {
        return {
            AND: [
                { standard_name: { contains: standardCode } },
                { standard_name: { contains: edition } },
            ],
        };
    }

    async createStandardEdition(dto: CreateStandardEditionDto, userId: string) {
        await this.assertScheme(dto.scheme_id);
        const standardCode = this.code(dto.standard_code);
        const edition = dto.edition.trim();
        const duplicate = await this.prisma.standard_editions.findFirst({
            where: {
                scheme_id: dto.scheme_id,
                standard_code: standardCode,
                edition,
            },
        });
        if (duplicate) throw new ConflictException('Phiên bản tiêu chuẩn đã tồn tại trong chương trình này');

        const effectiveFrom = this.date(dto.effective_from, 'Ngày áp dụng', true)!;
        const withdrawnAt = this.date(dto.withdrawn_at, 'Ngày ngừng áp dụng');
        this.period(effectiveFrom, withdrawnAt);
        if (dto.superseded_by_id) await this.assertEdition(dto.superseded_by_id);

        const row = await this.prisma.standard_editions.create({
            data: {
                scheme_id: dto.scheme_id,
                standard_code: standardCode,
                standard_name: dto.standard_name.trim(),
                edition,
                effective_from: effectiveFrom,
                withdrawn_at: withdrawnAt,
                superseded_by_id: dto.superseded_by_id ?? null,
                status: 'ACTIVE',
                created_by: userId,
                updated_by: userId,
            },
            include: { scheme: true },
        });

        await this.audit.write({
            userId,
            action: 'MASTER_STANDARD_CREATED',
            entityType: 'standard_edition',
            entityId: row.id,
            outcome: 'success',
            statusCode: 201,
        });
        return row;
    }

    async updateStandardEdition(id: string, dto: UpdateStandardEditionDto, userId: string) {
        if (dto.status !== undefined || dto.withdrawn_at !== undefined) {
            throw new BadRequestException(
                'Trạng thái áp dụng không sửa trực tiếp. Hãy dùng thao tác Ngừng áp dụng hoặc Khôi phục áp dụng.',
            );
        }

        const current = await this.assertEdition(id);
        const schemeId = dto.scheme_id ?? current.scheme_id;
        await this.assertScheme(schemeId);
        const standardCode = dto.standard_code ? this.code(dto.standard_code) : current.standard_code;
        const edition = dto.edition?.trim() ?? current.edition;
        const duplicate = await this.prisma.standard_editions.findFirst({
            where: {
                scheme_id: schemeId,
                standard_code: standardCode,
                edition,
                id: { not: id },
            },
        });
        if (duplicate) throw new ConflictException('Phiên bản tiêu chuẩn đã tồn tại trong chương trình này');

        const effectiveFrom = dto.effective_from === undefined
            ? current.effective_from
            : this.date(dto.effective_from, 'Ngày áp dụng', true)!;
        this.period(effectiveFrom, current.withdrawn_at);
        if (dto.superseded_by_id) {
            if (dto.superseded_by_id === id) {
                throw new BadRequestException('Phiên bản không thể tự thay thế chính nó');
            }
            await this.assertEdition(dto.superseded_by_id);
        }

        const row = await this.prisma.standard_editions.update({
            where: { id },
            data: {
                scheme_id: schemeId,
                standard_code: standardCode,
                standard_name: dto.standard_name?.trim(),
                edition,
                effective_from: effectiveFrom,
                superseded_by_id: dto.superseded_by_id === undefined ? undefined : dto.superseded_by_id,
                updated_by: userId,
            },
            include: { scheme: true },
        });

        await this.audit.write({
            userId,
            action: 'MASTER_STANDARD_UPDATED',
            entityType: 'standard_edition',
            entityId: id,
            outcome: 'success',
            statusCode: 200,
        });
        return row;
    }

    async stopStandardEdition(id: string, userId: string) {
        const row = await this.prisma.standard_editions.findUnique({
            where: { id },
            select: {
                id: true,
                standard_code: true,
                edition: true,
                status: true,
                effective_from: true,
                withdrawn_at: true,
            },
        });
        if (!row) {
            throw new NotFoundException('Không tìm thấy phiên bản tiêu chuẩn');
        }

        const today = this.todayUtc();
        const alreadyStopped = row.status !== 'ACTIVE'
            || Boolean(row.withdrawn_at && row.withdrawn_at <= today);
        if (alreadyStopped) {
            throw new BadRequestException(`${this.label(row)} đã ngừng áp dụng.`);
        }
        if (row.effective_from > today) {
            throw new BadRequestException(
                `${this.label(row)} chưa đến ngày áp dụng. Nếu tạo nhầm, hãy sửa hoặc xóa phiên bản khi chưa được sử dụng.`,
            );
        }

        const stopped = await this.prisma.standard_editions.update({
            where: { id },
            data: {
                status: 'WITHDRAWN',
                withdrawn_at: today,
                updated_by: userId,
            },
            include: { scheme: true },
        });

        await this.audit.write({
            userId,
            action: 'MASTER_STANDARD_STOPPED',
            entityType: 'standard_edition',
            entityId: id,
            outcome: 'success',
            statusCode: 200,
        });
        return stopped;
    }

    async restoreStandardEdition(id: string, userId: string) {
        const row = await this.prisma.standard_editions.findUnique({
            where: { id },
            select: {
                id: true,
                standard_code: true,
                edition: true,
                status: true,
                withdrawn_at: true,
            },
        });
        if (!row) {
            throw new NotFoundException('Không tìm thấy phiên bản tiêu chuẩn');
        }

        const stoppedByDate = Boolean(
            row.withdrawn_at && row.withdrawn_at.getTime() <= Date.now(),
        );
        const restorable = row.status === 'WITHDRAWN'
            || (row.status === 'ACTIVE' && stoppedByDate);
        if (!restorable) {
            throw new BadRequestException(
                `${this.label(row)} không ở trạng thái có thể khôi phục áp dụng.`,
            );
        }

        const restored = await this.prisma.standard_editions.update({
            where: { id },
            data: {
                status: 'ACTIVE',
                withdrawn_at: null,
                updated_by: userId,
            },
            include: { scheme: true },
        });

        await this.audit.write({
            userId,
            action: 'MASTER_STANDARD_RESTORED',
            entityType: 'standard_edition',
            entityId: id,
            outcome: 'success',
            statusCode: 200,
        });
        return restored;
    }

    async deleteStandardEdition(id: string, userId: string) {
        const row = await this.prisma.standard_editions.findUnique({
            where: { id },
            select: {
                id: true,
                standard_code: true,
                edition: true,
            },
        });
        if (!row) {
            throw new NotFoundException('Không tìm thấy phiên bản tiêu chuẩn');
        }

        const historyWhere = this.historyMatch(row.standard_code, row.edition);
        const [
            capabilityCount,
            supersedingReferenceCount,
            applicationCount,
            projectCount,
            certificateCount,
        ] = await Promise.all([
            this.prisma.certification_body_capabilities.count({
                where: { standard_edition_id: id },
            }),
            this.prisma.standard_editions.count({
                where: { superseded_by_id: id },
            }),
            this.prisma.certification_applications.count({ where: historyWhere }),
            this.prisma.certification_projects.count({ where: historyWhere }),
            this.prisma.certificates.count({ where: historyWhere }),
        ]);

        const dependencies = [
            capabilityCount ? `${capabilityCount} phạm vi năng lực` : null,
            supersedingReferenceCount ? `${supersedingReferenceCount} phiên bản thay thế` : null,
            applicationCount ? `${applicationCount} đơn đăng ký` : null,
            projectCount ? `${projectCount} hồ sơ chứng nhận` : null,
            certificateCount ? `${certificateCount} chứng chỉ` : null,
        ].filter(Boolean);

        if (dependencies.length) {
            throw new ConflictException(
                `Không thể xóa ${this.label(row)} vì đang được sử dụng (${dependencies.join(', ')}). Hãy ngừng áp dụng để giữ lịch sử.`,
            );
        }

        try {
            await this.prisma.standard_editions.delete({ where: { id } });
        } catch (error) {
            const candidate = error as { code?: string };
            if (candidate?.code === 'P2003') {
                throw new ConflictException(
                    `Không thể xóa ${this.label(row)} vì vẫn còn dữ liệu phụ thuộc. Hãy ngừng áp dụng để giữ lịch sử.`,
                );
            }
            throw error;
        }

        await this.audit.write({
            userId,
            action: 'MASTER_STANDARD_DELETED',
            entityType: 'standard_edition',
            entityId: id,
            outcome: 'success',
            statusCode: 200,
        });

        return { id, deleted: true };
    }
}
