import {
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { StandardEditionLifecycleService } from './standard-edition-lifecycle.service';

function harness() {
    const prisma: any = {
        standard_editions: {
            findUnique: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            delete: jest.fn().mockResolvedValue({ id: 'standard-1' }),
        },
        certification_body_capabilities: {
            count: jest.fn().mockResolvedValue(0),
        },
        certification_applications: {
            count: jest.fn().mockResolvedValue(0),
        },
        certification_projects: {
            count: jest.fn().mockResolvedValue(0),
        },
        certificates: {
            count: jest.fn().mockResolvedValue(0),
        },
    };
    const audit = {
        write: jest.fn().mockResolvedValue(undefined),
    };
    return {
        prisma,
        audit,
        service: new StandardEditionLifecycleService(prisma, audit as any),
    };
}

describe('StandardEditionLifecycleService', () => {
    it('hard deletes a mistaken edition when it has no business dependencies', async () => {
        const { service, prisma, audit } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2026',
        });

        await expect(
            service.deleteStandardEdition('standard-1', 'admin'),
        ).resolves.toEqual({
            id: 'standard-1',
            deleted: true,
        });

        expect(prisma.standard_editions.delete).toHaveBeenCalledWith({
            where: { id: 'standard-1' },
        });
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'MASTER_STANDARD_DELETED',
            entityId: 'standard-1',
        }));
    });

    it('blocks deletion when capability or historical business data references the edition', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2015',
        });
        prisma.certification_body_capabilities.count.mockResolvedValue(1);
        prisma.certification_projects.count.mockResolvedValue(2);

        await expect(
            service.deleteStandardEdition('standard-1', 'admin'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.standard_editions.delete).not.toHaveBeenCalled();
    });

    it('blocks deletion when another edition points to it as the superseding edition', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2026',
        });
        prisma.standard_editions.count.mockResolvedValue(1);

        await expect(
            service.deleteStandardEdition('standard-1', 'admin'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.standard_editions.delete).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown edition', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue(null);

        await expect(
            service.deleteStandardEdition('missing', 'admin'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('turns a database foreign-key guard into a business conflict', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2026',
        });
        prisma.standard_editions.delete.mockRejectedValue({ code: 'P2003' });

        await expect(
            service.deleteStandardEdition('standard-1', 'admin'),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
