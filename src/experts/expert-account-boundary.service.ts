import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { ExpertsService } from './experts.service';

@Injectable()
export class ExpertAccountBoundaryService extends ExpertsService {
    constructor(
        private readonly accountBoundaryPrisma: PrismaService,
    ) {
        super(accountBoundaryPrisma);
    }

    private hasCustomerRole(roles: string[]) {
        return roles.some(
            (role) => role.trim().toUpperCase() === 'CUSTOMER',
        );
    }

    private async assertExpertLinkableAccount(userId: string) {
        const account = await this.accountBoundaryPrisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                status: true,
                user_roles: {
                    select: {
                        roles: {
                            select: { role_name: true },
                        },
                    },
                },
                customer_access: {
                    select: { id: true },
                    take: 1,
                },
            },
        });

        if (!account) {
            throw new NotFoundException('Không tìm thấy tài khoản người dùng');
        }

        if (account.status?.toLowerCase() !== 'active') {
            throw new BadRequestException('Tài khoản người dùng không hoạt động');
        }

        const roles = account.user_roles.map((item) => item.roles.role_name);
        if (account.customer_access.length > 0 || this.hasCustomerRole(roles)) {
            throw new BadRequestException(
                'Tài khoản khách hàng không thể liên kết với hồ sơ chuyên gia',
            );
        }
    }

    override async getAccountOptions() {
        const accounts = await this.accountBoundaryPrisma.users.findMany({
            where: { status: 'active' },
            orderBy: [
                { full_name: 'asc' },
                { username: 'asc' },
            ],
            select: {
                id: true,
                username: true,
                email: true,
                full_name: true,
                status: true,
                user_roles: {
                    select: {
                        roles: {
                            select: { role_name: true },
                        },
                    },
                },
                customer_access: {
                    select: { id: true },
                    take: 1,
                },
                expert_profile: {
                    select: {
                        id: true,
                        employee_code: true,
                        full_name: true,
                    },
                },
            },
        });

        return accounts.flatMap((account) => {
            const roles = account.user_roles.map((item) => item.roles.role_name);
            const isCustomerAccount =
                account.customer_access.length > 0 || this.hasCustomerRole(roles);

            if (isCustomerAccount) {
                return [];
            }

            return [{
                id: account.id,
                username: account.username,
                email: account.email,
                full_name: account.full_name,
                status: account.status,
                roles,
                linked_expert: account.expert_profile,
                available: !account.expert_profile,
            }];
        });
    }

    override async create(dto: CreateExpertDto) {
        await this.assertExpertLinkableAccount(dto.user_id);
        return super.create(dto);
    }

    override async update(id: string, dto: UpdateExpertDto) {
        if (dto.user_id) {
            await this.assertExpertLinkableAccount(dto.user_id);
        }
        return super.update(id, dto);
    }
}
