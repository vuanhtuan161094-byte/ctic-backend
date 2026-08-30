import { ConflictException } from '@nestjs/common';
import { MasterDataConfigurationService } from './master-data-configuration.service';

function harness() {
    const prisma: any = {
        certification_schemes: { findUnique: jest.fn() },
        scheme_configuration_versions: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    };
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return { prisma, audit, service: new MasterDataConfigurationService(prisma, audit as any) };
}

const validDto = {
    scheme_id: '00000000-0000-4000-8000-000000000001',
    version_no: 2,
    effective_from: '2026-09-01',
    cycle_duration_months: 36,
    surveillance_frequency_months: 12,
    stage1_applicable: true,
    validity_duration_months: 36,
    renewal_window_days: 90,
    reminder_lead_days: 60,
    required_audit_types: ['INITIAL_STAGE_1', 'INITIAL_STAGE_2', 'SURVEILLANCE', 'RECERTIFICATION'],
    required_decision_types: ['GRANT', 'MAINTAIN', 'RENEW'],
};

describe('scheme configuration direct apply', () => {
    it('creates a configuration as ACTIVE immediately and closes the previous version', async () => {
        const { prisma, audit, service } = harness();
        prisma.certification_schemes.findUnique.mockResolvedValue({ id: validDto.scheme_id, code: 'QMS', name: 'QMS' });
        prisma.scheme_configuration_versions.findFirst.mockResolvedValue(null);
        prisma.scheme_configuration_versions.findMany.mockResolvedValue([{ id: 'v1', version_no: 1, effective_from: new Date('2026-01-01T00:00:00.000Z') }]);
        prisma.scheme_configuration_versions.create.mockImplementation(({ data }: any) => ({
            id: 'v2',
            ...data,
            scheme: { id: validDto.scheme_id, code: 'QMS', name: 'QMS' },
        }));

        const result: any = await service.createConfiguration(validDto as any, 'admin-id');

        expect(prisma.scheme_configuration_versions.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'v1' },
            data: { effective_to: new Date('2026-08-31T00:00:00.000Z') },
        }));
        expect(prisma.scheme_configuration_versions.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'ACTIVE',
                created_by: 'admin-id',
                approved_by: 'admin-id',
            }),
        }));
        expect(result.status).toBe('ACTIVE');
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'SCHEME_CONFIG_CREATED_APPLIED_AND_PREVIOUS_CLOSED',
        }));
    });

    it('cancels only a future scheduled version and restores the previous version window', async () => {
        const { prisma, audit, service } = harness();
        prisma.scheme_configuration_versions.findUnique.mockResolvedValue({
            id: 'future-v2',
            scheme_id: validDto.scheme_id,
            version_no: 2,
            status: 'ACTIVE',
            effective_from: new Date('2099-09-01T00:00:00.000Z'),
            effective_to: null,
            scheme: { id: validDto.scheme_id, code: 'QMS' },
        });
        prisma.scheme_configuration_versions.findFirst
            .mockResolvedValueOnce({ id: 'v1', version_no: 1, effective_from: new Date('2099-01-01T00:00:00.000Z') })
            .mockResolvedValueOnce({ id: 'v3', version_no: 3, effective_from: new Date('2100-01-01T00:00:00.000Z') });
        prisma.scheme_configuration_versions.update.mockImplementation(({ where, data }: any) => ({
            id: where.id,
            ...data,
            scheme: { code: 'QMS' },
        }));

        const result: any = await service.cancelScheduledConfiguration('future-v2', 'admin-id');

        expect(prisma.scheme_configuration_versions.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'future-v2' },
            data: { status: 'RETIRED' },
        }));
        expect(prisma.scheme_configuration_versions.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'v1' },
            data: { effective_to: new Date('2099-12-31T00:00:00.000Z') },
        }));
        expect(result.previous_version_restored.id).toBe('v1');
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHEME_CONFIG_SCHEDULE_CANCELLED' }));
    });

    it('does not let cancel-scheduled rewrite a configuration that has already started', async () => {
        const { prisma, service } = harness();
        prisma.scheme_configuration_versions.findUnique.mockResolvedValue({
            id: 'active-v1',
            scheme_id: validDto.scheme_id,
            version_no: 1,
            status: 'ACTIVE',
            effective_from: new Date('2020-01-01T00:00:00.000Z'),
            effective_to: null,
            scheme: { code: 'QMS' },
        });

        await expect(service.cancelScheduledConfiguration('active-v1', 'admin-id')).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
