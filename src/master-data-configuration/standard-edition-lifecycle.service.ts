import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from '../security/security-audit.service';

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

    private historyMatch(standardCode: string, edition: string) {
        return {
            AND: [
                { standard_name: { contains: standardCode } },
                { standard_name: { contains: edition } },
            ],
        };
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

        const historyWhere = this.historyMatch(
            row.standard_code,
            row.edition,
        );
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
            this.prisma.certification_applications.count({
                where: historyWhere,
            }),
            this.prisma.certification_projects.count({
                where: historyWhere,
            }),
            this.prisma.certificates.count({
                where: historyWhere,
            }),
        ]);

        const dependencies = [
            capabilityCount
                ? `${capabilityCount} phạm vi năng lực`
                : null,
            supersedingReferenceCount
                ? `${supersedingReferenceCount} phiên bản thay thế`
                : null,
            applicationCount
                ? `${applicationCount} đơn đăng ký`
                : null,
            projectCount
                ? `${projectCount} hồ sơ chứng nhận`
                : null,
            certificateCount
                ? `${certificateCount} chứng chỉ`
                : null,
        ].filter(Boolean);

        if (dependencies.length) {
            throw new ConflictException(
                `Không thể xóa ${this.label(row)} vì đang được sử dụng (${dependencies.join(', ')}). Hãy ngừng áp dụng để giữ lịch sử.`,
            );
        }

        try {
            await this.prisma.standard_editions.delete({
                where: { id },
            });
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

        return {
            id,
            deleted: true,
        };
    }
}
