import { PrismaService } from '../prisma/prisma.service';

import { ExpertAccountBoundaryService } from './expert-account-boundary.service';

const user = (
    id: string,
    roles: string[],
    options?: {
        customerAccess?: boolean;
        linkedExpert?: boolean;
    },
) => ({
    id,
    username: id,
    email: `${id}@example.test`,
    full_name: id,
    status: 'active',
    user_roles: roles.map((role_name) => ({ roles: { role_name } })),
    customer_access: options?.customerAccess ? [{ id: `access-${id}` }] : [],
    expert_profile: options?.linkedExpert
        ? { id: `expert-${id}`, employee_code: null, full_name: id }
        : null,
});

describe('ExpertAccountBoundaryService', () => {
    function createService() {
        const prisma = {
            users: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
            },
            experts: {
                findUnique: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
        };
        return {
            prisma,
            service: new ExpertAccountBoundaryService(
                prisma as unknown as PrismaService,
            ),
        };
    }

    it('returns only internal active accounts while preserving linked-expert metadata', async () => {
        const { prisma, service } = createService();
        prisma.users.findMany.mockResolvedValue([
            user('internal-free', ['AUDITOR']),
            user('internal-linked', ['ADMIN'], { linkedExpert: true }),
            user('portal-mapping', [], { customerAccess: true }),
            user('legacy-customer-role', ['CUSTOMER']),
        ]);

        const result = await service.getAccountOptions();

        expect(result.map((item) => item.id)).toEqual([
            'internal-free',
            'internal-linked',
        ]);
        expect(result[0].available).toBe(true);
        expect(result[1].available).toBe(false);
    });

    it('rejects a customer-scoped account even when a direct create payload bypasses the selector', async () => {
        const { prisma, service } = createService();
        prisma.users.findUnique.mockResolvedValue(
            user('portal-mapping', [], { customerAccess: true }),
        );

        await expect(service.create({ user_id: 'portal-mapping' }))
            .rejects
            .toThrow('Tài khoản khách hàng không thể liên kết với hồ sơ chuyên gia');
        expect(prisma.experts.create).not.toHaveBeenCalled();
    });

    it('rejects legacy CUSTOMER role accounts when changing an expert account link', async () => {
        const { prisma, service } = createService();
        prisma.users.findUnique.mockResolvedValue(
            user('legacy-customer-role', ['CUSTOMER']),
        );

        await expect(service.update('expert-1', {
            user_id: 'legacy-customer-role',
        }))
            .rejects
            .toThrow('Tài khoản khách hàng không thể liên kết với hồ sơ chuyên gia');
        expect(prisma.experts.update).not.toHaveBeenCalled();
    });
});
