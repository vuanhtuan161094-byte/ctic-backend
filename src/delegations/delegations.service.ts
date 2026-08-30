import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { NotificationEngineService } from '../notifications/notification-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRoles } from '../security/security-request';
import { ACTION_ELIGIBLE_ROLES } from '../work-items/work-item.constants';
import { CreateDelegationDto } from './dto/create-delegation.dto';

type DelegationActor = {
    userId: string;
    roles: string[];
};

@Injectable()
export class DelegationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationEngineService,
    ) { }

    private normalizedActions(values: string[]) {
        const actions = Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
        if (!actions.length || actions.some((action) => !ACTION_ELIGIBLE_ROLES.has(action))) {
            throw new BadRequestException('Phạm vi hành động ủy quyền không hợp lệ');
        }
        return actions;
    }

    private statusFor(record: { status: string; effective_from: Date; effective_to: Date }, now = new Date()) {
        if (record.status === 'REVOKED') return 'REVOKED';
        if (record.effective_to <= now) return 'EXPIRED';
        if (record.effective_from > now) return 'SCHEDULED';
        return 'ACTIVE';
    }

    private safe(record: any) {
        return {
            ...record,
            status: this.statusFor(record),
            action_codes: JSON.parse(record.action_codes_json),
            action_codes_json: undefined,
        };
    }

    private async rolesFor(userId: string) {
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
                status: true,
                user_roles: { select: { roles: { select: { role_name: true } } } },
            },
        });
        if (!user) throw new NotFoundException('Không tìm thấy người dùng');
        return {
            user,
            roles: normalizeRoles(user.user_roles.map((item) => item.roles.role_name)),
        };
    }

    async candidates(actor: DelegationActor) {
        if (normalizeRoles(actor.roles).includes('CUSTOMER')) {
            throw new ForbiddenException('Tài khoản khách hàng không được tạo ủy quyền nội bộ');
        }
        const users = await this.prisma.users.findMany({
            where: { status: 'active', id: { not: actor.userId }, user_roles: { some: { roles: { role_name: { not: 'customer' } } } } },
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
                user_roles: { select: { roles: { select: { role_name: true } } } },
            },
            orderBy: [{ full_name: 'asc' }, { username: 'asc' }],
        });
        return users.map((user) => ({
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            roles: normalizeRoles(user.user_roles.map((item) => item.roles.role_name)),
        }));
    }

    async create(dto: CreateDelegationDto, actor: DelegationActor) {
        const actorRoles = normalizeRoles(actor.roles);
        if (actorRoles.includes('CUSTOMER')) {
            throw new ForbiddenException('Tài khoản khách hàng không được tạo ủy quyền nội bộ');
        }
        const delegatorId = dto.delegator_user_id ?? actor.userId;
        if (delegatorId !== actor.userId && !actorRoles.includes('ADMIN')) {
            throw new ForbiddenException('Chỉ ADMIN được tạo ủy quyền thay người khác');
        }
        if (delegatorId === dto.delegate_user_id) {
            throw new BadRequestException('Không thể tự ủy quyền cho chính mình');
        }
        if (dto.effective_to <= dto.effective_from) {
            throw new BadRequestException('Thời điểm kết thúc phải sau thời điểm bắt đầu');
        }
        if (dto.effective_to <= new Date()) {
            throw new BadRequestException('Không thể tạo ủy quyền đã hết hạn');
        }
        if (dto.scope_type === 'PROJECT_ACTION' && !dto.project_id) {
            throw new BadRequestException('Ủy quyền theo dự án phải có project_id');
        }
        if (dto.scope_type === 'ACTION' && dto.project_id) {
            throw new BadRequestException('Ủy quyền ACTION không nhận project_id');
        }

        const actions = this.normalizedActions(dto.action_codes);
        const [delegator, delegate] = await Promise.all([
            this.rolesFor(delegatorId),
            this.rolesFor(dto.delegate_user_id),
        ]);
        if (delegator.user.status !== 'active' || delegate.user.status !== 'active') {
            throw new BadRequestException('Người ủy quyền và người nhận phải đang hoạt động');
        }
        for (const action of actions) {
            const eligible = ACTION_ELIGIBLE_ROLES.get(action)!;
            if (!delegator.roles.some((role) => eligible.has(role)) || !delegate.roles.some((role) => eligible.has(role))) {
                throw new BadRequestException(`Ủy quyền không thể tạo eligibility cho hành động ${action}`);
            }
        }

        const conflict = await this.prisma.delegations.findFirst({
            where: {
                delegator_user_id: delegatorId,
                delegate_user_id: dto.delegate_user_id,
                status: { not: 'REVOKED' },
                effective_from: { lt: dto.effective_to },
                effective_to: { gt: dto.effective_from },
                project_id: dto.project_id ?? null,
            },
        });
        if (conflict) throw new BadRequestException('Đã có ủy quyền trùng thời gian và phạm vi');

        const record = await this.prisma.delegations.create({
            data: {
                delegator_user_id: delegatorId,
                delegate_user_id: dto.delegate_user_id,
                effective_from: dto.effective_from,
                effective_to: dto.effective_to,
                status: dto.effective_from <= new Date() ? 'ACTIVE' : 'SCHEDULED',
                scope_type: dto.scope_type,
                action_codes_json: JSON.stringify(actions),
                project_id: dto.project_id ?? null,
                reason: dto.reason.trim(),
                created_by: actor.userId,
            },
            include: {
                delegator: { select: { id: true, username: true, full_name: true } },
                delegate: { select: { id: true, username: true, full_name: true } },
            },
        });

        await this.notifications.deliver({
            sourceKey: `DELEGATION_CREATED:${record.id}`,
            category: 'WORKFLOW_UPDATE',
            severity: 'NORMAL',
            title: 'Ủy quyền công việc tạm thời',
            message: `Ủy quyền có hiệu lực từ ${record.effective_from.toISOString()} đến ${record.effective_to.toISOString()}.`,
            recipientIds: [delegatorId, dto.delegate_user_id],
            entityType: 'delegation',
            entityId: record.id,
            projectId: record.project_id,
            destinationPath: '/delegations',
            context: { delegation_id: record.id, action_codes: actions },
        });
        return this.safe(record);
    }

    async listMine(actor: DelegationActor) {
        const records = await this.prisma.delegations.findMany({
            where: { OR: [{ delegator_user_id: actor.userId }, { delegate_user_id: actor.userId }] },
            include: {
                delegator: { select: { id: true, username: true, full_name: true } },
                delegate: { select: { id: true, username: true, full_name: true } },
                project: { select: { id: true, project_code: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        return records.map((record) => this.safe(record));
    }

    async listGovernance(actor: DelegationActor, query: Record<string, string | undefined>) {
        if (!normalizeRoles(actor.roles).includes('ADMIN')) throw new ForbiddenException('Chỉ ADMIN được xem toàn bộ ủy quyền');
        const from = query.from ? new Date(query.from) : undefined;
        const to = query.to ? new Date(query.to) : undefined;
        if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
            throw new BadRequestException('Khoảng thời gian lọc ủy quyền không hợp lệ');
        }
        if (from && to && from > to) {
            throw new BadRequestException('Thời gian bắt đầu bộ lọc phải trước thời gian kết thúc');
        }
        const records = await this.prisma.delegations.findMany({
            where: {
                delegator_user_id: query.delegator_user_id,
                delegate_user_id: query.delegate_user_id,
                status: query.status?.toUpperCase(),
                effective_from: to ? { lte: to } : undefined,
                effective_to: from ? { gte: from } : undefined,
            },
            include: {
                delegator: { select: { id: true, username: true, full_name: true } },
                delegate: { select: { id: true, username: true, full_name: true } },
                project: { select: { id: true, project_code: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 500,
        });
        return records.map((record) => this.safe(record));
    }

    async revoke(id: string, actor: DelegationActor) {
        const record = await this.prisma.delegations.findUnique({ where: { id } });
        if (!record) throw new NotFoundException('Không tìm thấy ủy quyền');
        const roles = normalizeRoles(actor.roles);
        if (record.delegator_user_id !== actor.userId && !roles.includes('ADMIN')) {
            throw new ForbiddenException('Bạn không được thu hồi ủy quyền này');
        }
        if (this.statusFor(record) === 'EXPIRED') throw new BadRequestException('Ủy quyền đã hết hạn');
        if (record.status === 'REVOKED') return this.safe(record);
        const updated = await this.prisma.delegations.update({
            where: { id },
            data: { status: 'REVOKED', revoked_by: actor.userId, revoked_at: new Date() },
        });
        await this.notifications.deliver({
            sourceKey: `DELEGATION_REVOKED:${record.id}`,
            category: 'WORKFLOW_UPDATE',
            severity: 'INFO',
            title: 'Ủy quyền đã được thu hồi',
            message: 'Quyền xử lý thay đã dừng ngay lập tức.',
            recipientIds: [record.delegator_user_id, record.delegate_user_id],
            entityType: 'delegation',
            entityId: record.id,
            projectId: record.project_id,
            destinationPath: '/delegations',
        });
        return this.safe(updated);
    }

    async recordDelegatedAction(input: {
        delegationId: string;
        actor: DelegationActor;
        actionCode: string;
        entityType: string;
        entityId: string;
        projectId?: string | null;
        technicalReviewId?: string | null;
    }) {
        const record = await this.prisma.delegations.findUnique({
            where: { id: input.delegationId },
        });
        const actionCode = input.actionCode.trim().toLowerCase();
        if (!record || record.delegate_user_id !== input.actor.userId || this.statusFor(record) !== 'ACTIVE') {
            throw new ForbiddenException('Ủy quyền không còn hiệu lực cho hành động này');
        }
        const actions = JSON.parse(record.action_codes_json) as unknown;
        const eligibleRoles = ACTION_ELIGIBLE_ROLES.get(actionCode);
        const actorRoles = normalizeRoles(input.actor.roles);
        if (
            !Array.isArray(actions) ||
            !actions.map((value) => String(value).trim().toLowerCase()).includes(actionCode) ||
            !eligibleRoles ||
            !actorRoles.some((role) => eligibleRoles.has(role)) ||
            (record.project_id !== null && record.project_id !== input.projectId)
        ) {
            throw new ForbiddenException('Hành động nằm ngoài phạm vi hoặc eligibility của ủy quyền');
        }
        return this.prisma.delegated_action_logs.create({
            data: {
                delegation_id: record.id,
                actor_user_id: input.actor.userId,
                delegated_for_user_id: record.delegator_user_id,
                action_code: actionCode,
                entity_type: input.entityType,
                entity_id: input.entityId,
                project_id: input.projectId ?? null,
                technical_review_id: input.technicalReviewId ?? null,
            },
        });
    }

    async activeForDelegate(userId: string, now = new Date()) {
        const records = await this.prisma.delegations.findMany({
            where: {
                delegate_user_id: userId,
                status: { in: ['SCHEDULED', 'ACTIVE'] },
                effective_from: { lte: now },
                effective_to: { gt: now },
            },
            include: { delegator: { select: { id: true, username: true, full_name: true } } },
        });
        return records.map((record) => ({
            id: record.id,
            delegatorUserId: record.delegator_user_id,
            delegatedFromUser: record.delegator,
            projectId: record.project_id,
            effectiveFrom: record.effective_from,
            effectiveTo: record.effective_to,
            actions: JSON.parse(record.action_codes_json) as string[],
        }));
    }
}
