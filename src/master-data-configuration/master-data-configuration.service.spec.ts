import { BadRequestException, ConflictException } from '@nestjs/common';
import { MasterDataConfigurationService } from './master-data-configuration.service';

function harness() {
    const prisma: any = {
        certification_schemes: {
            findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockImplementation(({ data }) => ({ id: 'scheme-1', ...data })), update: jest.fn(),
        },
        standard_editions: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        scheme_configuration_versions: {
            findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(),
        },
        organization_profiles: { findUnique: jest.fn(), upsert: jest.fn() },
        numbering_series_configs: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
        iaf_scopes: { findMany: jest.fn().mockResolvedValue([]) },
        industry_classifications: { findMany: jest.fn().mockResolvedValue([]) },
        industry_code_mappings: { findMany: jest.fn().mockResolvedValue([]) },
        nace_iaf_mappings: { findMany: jest.fn().mockResolvedValue([]) },
        import_jobs: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return { prisma, audit, service: new MasterDataConfigurationService(prisma, audit as any) };
}

describe('MasterDataConfigurationService', () => {
    it('rejects duplicate scheme code and does not mutate existing data', async () => {
        const { service, prisma } = harness();
        prisma.certification_schemes.findUnique.mockResolvedValue({ id: 'existing', code: 'QMS' });
        await expect(service.createScheme({ code: 'qms', name: 'Quality' }, 'admin'))
            .rejects.toBeInstanceOf(ConflictException);
        expect(prisma.certification_schemes.create).not.toHaveBeenCalled();
    });

    it('creates normalized scheme and audits the mutation', async () => {
        const { service, prisma, audit } = harness();
        prisma.certification_schemes.findUnique.mockResolvedValue(null);
        const result = await service.createScheme({ code: ' qms ', name: ' Quality ' }, 'admin');
        expect(result.code).toBe('QMS');
        expect(prisma.certification_schemes.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ code: 'QMS', name: 'Quality' }),
        }));
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MASTER_SCHEME_CREATED' }));
    });

    it('rejects invalid scheme config combinations without exposing security/SoD toggles', async () => {
        const { service, prisma } = harness();
        prisma.certification_schemes.findUnique.mockResolvedValue({ id: 'scheme-1' });
        await expect(service.createConfiguration({
            scheme_id: '00000000-0000-4000-8000-000000000001', version_no: 1,
            effective_from: '2026-01-01', cycle_duration_months: 36,
            surveillance_frequency_months: 12, stage1_applicable: true,
            validity_duration_months: 36, renewal_window_days: 90, reminder_lead_days: 60,
            required_audit_types: ['INITIAL_STAGE_2'], required_decision_types: ['GRANT'],
        }, 'admin')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.scheme_configuration_versions.create).not.toHaveBeenCalled();
    });

    it('resolves the exact effective configuration for the requested date', async () => {
        const { service, prisma } = harness();
        prisma.certification_schemes.findUnique.mockResolvedValue({ id: 'scheme-1', code: 'QMS' });
        prisma.scheme_configuration_versions.findFirst.mockResolvedValue({
            id: 'config-v1', required_audit_types: 'INITIAL_STAGE_1,INITIAL_STAGE_2', required_decision_types: 'GRANT',
        });
        const result = await service.resolveConfiguration('qms', '2026-06-01');
        expect(result.id).toBe('config-v1');
        expect(result.required_audit_types).toEqual(['INITIAL_STAGE_1', 'INITIAL_STAGE_2']);
        expect(prisma.scheme_configuration_versions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ effective_from: { lte: new Date('2026-06-01T00:00:00.000Z') } }),
        }));
    });

    it('validate/preview persists only import job rows, not master records', async () => {
        const { service, prisma } = harness();
        prisma.import_jobs.create.mockImplementation(({ data }: any) => ({ id: 'job-1', ...data, rows: data.rows.create }));
        const file = {
            originalname: 'schemes.csv', size: 54,
            buffer: Buffer.from('code,name,description,effective_from,effective_to\nQMS,Quality,,,', 'utf8'),
        } as Express.Multer.File;
        const result = await service.validateImport('SCHEME', 'CREATE_ONLY', file, 'admin');
        expect(result.status).toBeUndefined();
        expect(prisma.import_jobs.create).toHaveBeenCalled();
        expect(prisma.certification_schemes.create).not.toHaveBeenCalled();
    });

    it('rejects spreadsheet formula cells during preview', async () => {
        const { service, prisma } = harness();
        prisma.import_jobs.create.mockImplementation(({ data }: any) => ({ id: 'job-1', ...data }));
        const file = {
            originalname: 'schemes.csv', size: 64,
            buffer: Buffer.from('code,name,description,effective_from,effective_to\nQMS,=CMD,,,', 'utf8'),
        } as Express.Multer.File;
        const result: any = await service.validateImport('SCHEME', 'CREATE_ONLY', file, 'admin');
        expect(result.invalid_rows).toBe(1);
        expect(result.valid_rows).toBe(0);
    });

    it('does not allow a committed import job to run twice', async () => {
        const { service, prisma } = harness();
        prisma.import_jobs.findUnique.mockResolvedValue({ id: 'job-1', status: 'COMMITTED', rows: [] });
        await expect(service.commitImport('job-1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    });
});
