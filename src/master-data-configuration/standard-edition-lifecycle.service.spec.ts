import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { StandardEditionLifecycleService } from './standard-edition-lifecycle.service';

function harness() {
    const prisma: any = {
        certification_schemes: {
            findUnique: jest.fn().mockResolvedValue({ id: 'scheme-1', code: 'QMS' }),
        },
        standard_editions: {
            findUnique: jest.fn(),
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation(({ data }: any) => ({
                id: 'standard-1',
                ...data,
                scheme: { id: data.scheme_id, code: 'QMS' },
            })),
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
        certification_body_capabilities: { count: jest.fn().mockResolvedValue(0) },
        certification_applications: { count: jest.fn().mockResolvedValue(0) },
        certification_projects: { count: jest.fn().mockResolvedValue(0) },
        certificates: { count: jest.fn().mockResolvedValue(0) },
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return {
        prisma,
        audit,
        service: new StandardEditionLifecycleService(prisma, audit as any),
    };
}

describe('StandardEditionLifecycleService', () => {
    it('lists only editions whose program and rule package are operational now', async () => {
        const { service, prisma } = harness();

        await service.listOperationalStandardEditions();

        expect(prisma.standard_editions.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                status: 'ACTIVE',
                effective_from: expect.any(Object),
                scheme: expect.objectContaining({
                    status: 'ACTIVE',
                    AND: expect.arrayContaining([
                        expect.objectContaining({
                            configurations: {
                                some: expect.objectContaining({ status: 'ACTIVE' }),
                            },
                        }),
                    ]),
                }),
            }),
            include: { scheme: true },
        }));
    });

    it('creates an edition consistently with the database-wide code plus edition uniqueness', async () => {
        const { service, prisma, audit } = harness();
        const dto = {
            scheme_id: '00000000-0000-4000-8000-000000000001',
            standard_code: ' iso 9001 ',
            standard_name: 'Hệ thống quản lý chất lượng',
            edition: '2015',
            effective_from: '2026-01-01',
        };
        prisma.certification_schemes.findUnique.mockResolvedValue({ id: dto.scheme_id, code: 'QMS' });

        await service.createStandardEdition(dto, 'admin');

        expect(prisma.standard_editions.findFirst).toHaveBeenCalledWith({
            where: {
                standard_code: 'ISO 9001',
                edition: '2015',
            },
        });
        expect(prisma.standard_editions.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                scheme_id: dto.scheme_id,
                standard_code: 'ISO 9001',
                edition: '2015',
                status: 'ACTIVE',
            }),
        }));
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MASTER_STANDARD_CREATED' }));
    });

    it('updates edition metadata without allowing raw status mutation', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1',
            scheme_id: 'scheme-1',
            standard_code: 'ISO 9001',
            standard_name: 'Quality',
            edition: '2015',
            effective_from: new Date('2020-01-01T00:00:00.000Z'),
            withdrawn_at: null,
        });

        await service.updateStandardEdition('standard-1', {
            standard_name: 'Hệ thống quản lý chất lượng',
            effective_from: '2021-01-01',
        }, 'admin');

        expect(prisma.standard_editions.findFirst).toHaveBeenCalledWith({
            where: expect.objectContaining({
                standard_code: 'ISO 9001',
                edition: '2015',
                id: { not: 'standard-1' },
            }),
        });
        expect(prisma.standard_editions.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.not.objectContaining({ status: expect.anything() }),
        }));

        await expect(service.updateStandardEdition('standard-1', {
            status: 'WITHDRAWN',
        }, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    });

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

        await expect(service.stopStandardEdition('standard-1', 'admin'))
            .resolves.toEqual(expect.objectContaining({ status: 'WITHDRAWN' }));
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MASTER_STANDARD_STOPPED' }));
    });

    it('does not use stop semantics for a future edition that has never started', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1', standard_code: 'ISO 9001', edition: '2099', status: 'ACTIVE',
            effective_from: new Date('2099-01-01T00:00:00.000Z'), withdrawn_at: null,
        });
        await expect(service.stopStandardEdition('standard-1', 'admin'))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('restores a stopped edition by clearing its stop date', async () => {
        const { service, prisma, audit } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1', standard_code: 'ISO 9001', edition: '2015', status: 'WITHDRAWN',
            withdrawn_at: new Date('2026-09-01T00:00:00.000Z'),
        });
        await expect(service.restoreStandardEdition('standard-1', 'admin'))
            .resolves.toEqual(expect.objectContaining({ status: 'ACTIVE', withdrawn_at: null }));
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MASTER_STANDARD_RESTORED' }));
    });

    it('does not restore an edition that is not stopped', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({
            id: 'standard-1', standard_code: 'ISO 9001', edition: '2015', status: 'ACTIVE', withdrawn_at: null,
        });
        await expect(service.restoreStandardEdition('standard-1', 'admin'))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('hard deletes a mistaken edition when it has no business dependencies', async () => {
        const { service, prisma, audit } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({ id: 'standard-1', standard_code: 'ISO 9001', edition: '2026' });
        await expect(service.deleteStandardEdition('standard-1', 'admin'))
            .resolves.toEqual({ id: 'standard-1', deleted: true });
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MASTER_STANDARD_DELETED' }));
    });

    it('blocks deletion when business data references the edition', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({ id: 'standard-1', standard_code: 'ISO 9001', edition: '2015' });
        prisma.certification_body_capabilities.count.mockResolvedValue(1);
        prisma.certification_projects.count.mockResolvedValue(2);
        await expect(service.deleteStandardEdition('standard-1', 'admin'))
            .rejects.toBeInstanceOf(ConflictException);
        expect(prisma.standard_editions.delete).not.toHaveBeenCalled();
    });

    it('returns not found for unknown lifecycle targets', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue(null);
        await expect(service.deleteStandardEdition('missing', 'admin')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.restoreStandardEdition('missing', 'admin')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.stopStandardEdition('missing', 'admin')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.updateStandardEdition('missing', {}, 'admin')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('turns a database foreign-key guard into a business conflict', async () => {
        const { service, prisma } = harness();
        prisma.standard_editions.findUnique.mockResolvedValue({ id: 'standard-1', standard_code: 'ISO 9001', edition: '2026' });
        prisma.standard_editions.delete.mockRejectedValue({ code: 'P2003' });
        await expect(service.deleteStandardEdition('standard-1', 'admin'))
            .rejects.toBeInstanceOf(ConflictException);
    });
});
