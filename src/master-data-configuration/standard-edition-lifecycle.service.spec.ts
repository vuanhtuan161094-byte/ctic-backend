import {
    BadRequestException,
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
            update: jest.fn().mockResolvedValue({
                id: 'standard-1',
                standard_code: 'ISO 9001',
                edition: '2015',
                status: 'ACTIVE',
                withdrawn_at: null,
                scheme: { id: 'scheme-1', code: 'QMS' },
            }),
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
    it('stops a currently applied edition through the lifecycle command', async () => {
        const { service, prisma, audit } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2015',
            status: 'ACTIVE',
            effective_from: new Date('2020-01-01T00:00:00.000Z'),
            withdrawn_at: null,
        });
        prisma.standard_editions.update.mockImplementation(({ data }: any) => Promise.resolve({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2015',
            ...data,
            scheme: { id: 'scheme-1', code: 'QMS' },
        }));

        await expect(
            service.stopStandardEdition('standard-1', 'admin'),
        ).resolves.toEqual(expect.objectContaining({
            id: 'standard-1',
            status: 'WITHDRAWN',
        }));

        expect(prisma.standard_editions.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'standard-1' },
            data: expect.objectContaining({
                status: 'WITHDRAWN',
                updated_by: 'admin',
            }),
        }));
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'MASTER_STANDARD_STOPPED',
            entityId: 'standard-1',
        }));
    });

    it('does not use stop semantics for a future edition that has never started', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2099',
            status: 'ACTIVE',
            effective_from: new Date('2099-01-01T00:00:00.000Z'),
            withdrawn_at: null,
        });

        await expect(
            service.stopStandardEdition('standard-1', 'admin'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.standard_editions.update).not.toHaveBeenCalled();
    });

    it('restores a stopped edition by clearing its stop date', async () => {
        const { service, prisma, audit } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2015',
            status: 'WITHDRAWN',
            withdrawn_at: new Date('2026-09-01T00:00:00.000Z'),
        });

        await expect(
            service.restoreStandardEdition('standard-1', 'admin'),
        ).resolves.toEqual(expect.objectContaining({
            id: 'standard-1',
            status: 'ACTIVE',
            withdrawn_at: null,
        }));

        expect(prisma.standard_editions.update).toHaveBeenCalledWith({
            where: { id: 'standard-1' },
            data: {
                status: 'ACTIVE',
                withdrawn_at: null,
                updated_by: 'admin',
            },
            include: { scheme: true },
        });
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'MASTER_STANDARD_RESTORED',
            entityId: 'standard-1',
        }));
    });

    it('also restores an active edition whose stop date has already passed', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2015',
            status: 'ACTIVE',
            withdrawn_at: new Date('2020-01-01T00:00:00.000Z'),
        });

        await expect(
            service.restoreStandardEdition('standard-1', 'admin'),
        ).resolves.toEqual(expect.objectContaining({ status: 'ACTIVE' }));
    });

    it('does not restore an edition that is not stopped', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            standard_code: 'ISO 9001',
            edition: '2015',
            status: 'ACTIVE',
            withdrawn_at: null,
        });

        await expect(
            service.restoreStandardEdition('standard-1', 'admin'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.standard_editions.update).not.toHaveBeenCalled();
    });

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
        await expect(
            service.restoreStandardEdition('missing', 'admin'),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.stopStandardEdition('missing', 'admin'),
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
