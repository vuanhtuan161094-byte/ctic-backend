import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';

function user(id = 'target') {
    return {
        id,
        username: 'admin',
        email: 'admin@example.test',
        full_name: 'Admin',
        status: 'active',
        failed_login_count: 0,
        locked_until: null,
        created_at: new Date(),
        user_roles: [{ roles: { id: 'role-admin', role_name: 'admin', description: null, role_permissions: [] } }],
    };
}

describe('UsersService Phase 9 governance', () => {
    it('keeps role and permission definitions code-governed', async () => {
        const service = new UsersService({} as never);
        await expect(service.createRole({ role_name: 'unsafe' }, 'actor')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.createPermission({ permission_name: 'unsafe.bypass' }, 'actor')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.replaceRolePermissions('role', { permission_names: [] }, 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('projects only code-supported internal roles as assignable', async () => {
        const prisma = {
            roles: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'staff', role_name: 'staff', description: null, role_permissions: [], _count: { user_roles: 1 } },
                    { id: 'technical-expert', role_name: 'technical_expert', description: null, role_permissions: [], _count: { user_roles: 0 } },
                    { id: 'approver', role_name: 'APPROVER', description: 'Legacy application-review approver', role_permissions: [], _count: { user_roles: 0 } },
                    { id: 'customer', role_name: 'customer', description: null, role_permissions: [], _count: { user_roles: 1 } },
                ]),
            },
        };
        const service = new UsersService(prisma as never);
        const roles = await service.findRoles() as Array<{ role_name: string; assignable: boolean }>;
        expect(roles.find((role) => role.role_name === 'staff')?.assignable).toBe(true);
        expect(roles.find((role) => role.role_name === 'technical_expert')?.assignable).toBe(true);
        expect(roles.find((role) => role.role_name === 'APPROVER')?.assignable).toBe(false);
        expect(roles.find((role) => role.role_name === 'customer')?.assignable).toBe(false);
    });

    it('does not create CUSTOMER through internal account administration', async () => {
        const prisma = {
            users: { findFirst: jest.fn().mockResolvedValue(null) },
            roles: { findMany: jest.fn().mockResolvedValue([{ id: 'customer', role_name: 'customer' }]) },
        };
        const service = new UsersService(prisma as never);
        await expect(service.create({ username: 'customer', email: 'customer@example.test', password: 'StrongPass1', role_names: ['customer'] }, 'actor'))
            .rejects.toThrow('Phase 3.2B');
    });

    it('prevents disabling the last active ADMIN inside a SERIALIZABLE transaction', async () => {
        const prisma: any = {
            users: {
                findUnique: jest.fn().mockResolvedValue(user()),
                findMany: jest.fn().mockResolvedValue([{ id: 'target', locked_until: null }]),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
        };
        const service = new UsersService(prisma);
        await expect(service.update('target', { status: 'inactive' }, 'other-admin')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.users.update).not.toHaveBeenCalled();
        expect(prisma.$transaction.mock.calls[0][1]?.isolationLevel).toBe('Serializable');
    });

    it('prevents removing the last active ADMIN role', async () => {
        const prisma: any = {
            users: {
                findUnique: jest.fn().mockResolvedValue(user()),
                findMany: jest.fn().mockResolvedValue([{ id: 'target', locked_until: null }]),
            },
            roles: { findMany: jest.fn().mockResolvedValue([{ id: 'staff', role_name: 'staff' }]) },
            user_roles: { deleteMany: jest.fn(), createMany: jest.fn() },
            user_sessions: { updateMany: jest.fn() },
            audit_logs: { create: jest.fn() },
            $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
        };
        const service = new UsersService(prisma);
        await expect(service.replaceRoles('target', { role_names: ['staff'] }, 'other-admin')).rejects.toThrow('ADMIN hoạt động cuối cùng');
        expect(prisma.user_roles.deleteMany).not.toHaveBeenCalled();
    });
});
