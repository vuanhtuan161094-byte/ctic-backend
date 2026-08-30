import { BadRequestException } from '@nestjs/common';

import { UsersService } from './users.service';

function targetUser(
    roleName = 'technical_reviewer',
) {
    return {
        id: 'target',
        username: 'reviewer',
        email: 'reviewer@example.test',
        full_name: 'Reviewer',
        status: 'active',
        failed_login_count: 0,
        locked_until: null,
        created_at: new Date(),
        user_roles: [
            {
                roles: {
                    id: 'role-reviewer',
                    role_name: roleName,
                    description: null,
                    role_permissions: [
                        {
                            permissions: {
                                permission_name: 'technical_reviews.read',
                            },
                        },
                        {
                            permissions: {
                                permission_name: 'technical_reviews.perform',
                            },
                        },
                    ],
                },
            },
        ],
    };
}

describe('UsersService user permission overrides', () => {
    it('does not apply permission overrides to ADMIN', async () => {
        const prisma = {
            users: {
                findUnique: jest.fn().mockResolvedValue(
                    targetUser('admin'),
                ),
            },
        };

        const service = new UsersService(
            prisma as never,
        );

        await expect(
            service.replacePermissionOverrides(
                'target',
                {
                    allow_permissions: [],
                    deny_permissions: [],
                    reason: 'Không áp dụng cho ADMIN',
                },
                'actor',
            ),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('rejects redundant ALLOW that already comes from the role', async () => {
        const prisma = {
            users: {
                findUnique: jest.fn().mockResolvedValue(
                    targetUser(),
                ),
            },
        };

        const service = new UsersService(
            prisma as never,
        );

        await expect(
            service.replacePermissionOverrides(
                'target',
                {
                    allow_permissions: [
                        'technical_reviews.read',
                    ],
                    deny_permissions: [],
                    reason: 'Không tạo override dư thừa',
                },
                'actor',
            ),
        ).rejects.toThrow(
            'không cần cấp riêng',
        );
    });

    it('stores ALLOW/DENY and writes a before/after audit event', async () => {
        const tx = {
            user_permission_overrides: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
            audit_logs: {
                create: jest.fn(),
            },
        };

        const prisma: any = {
            users: {
                findUnique: jest.fn().mockResolvedValue(
                    targetUser(),
                ),
            },
            permissions: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'permission-extra',
                        permission_name: 'reports.manage',
                    },
                    {
                        id: 'permission-deny',
                        permission_name: 'technical_reviews.perform',
                    },
                ]),
            },
            user_permission_overrides: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn(
                async (
                    callback: (transaction: typeof tx) => unknown,
                ) => callback(tx),
            ),
        };

        const service = new UsersService(
            prisma,
        );

        jest.spyOn(
            service,
            'getPermissionProfile',
        ).mockResolvedValue({
            user_id: 'target',
        } as never);

        await service.replacePermissionOverrides(
            'target',
            {
                allow_permissions: [
                    'reports.manage',
                ],
                deny_permissions: [
                    'technical_reviews.perform',
                ],
                reason: 'Phân quyền riêng theo phân công',
            },
            'actor',
        );

        expect(
            tx.user_permission_overrides.createMany,
        ).toHaveBeenCalledWith({
            data: expect.arrayContaining([
                expect.objectContaining({
                    permission_id: 'permission-extra',
                    effect: 'ALLOW',
                }),
                expect.objectContaining({
                    permission_id: 'permission-deny',
                    effect: 'DENY',
                }),
            ]),
        });

        expect(
            tx.audit_logs.create,
        ).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'USER_PERMISSION_OVERRIDES_UPDATED',
                entity_id: 'target',
            }),
        });
    });
});
