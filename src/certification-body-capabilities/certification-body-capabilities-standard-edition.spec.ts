import { CertificationBodyCapabilitiesService } from './certification-body-capabilities.service';

const qmsScope = {
    isic_code: '2220',
    nace_code: '22.29',
    iaf_code: '14',
    isic_nace_mapping_id: 'isic-nace-id',
    nace_iaf_mapping_id: 'nace-iaf-id',
    management_system: 'QMS',
};

function evaluationHarness(capabilities: any[], standardName = 'ISO 9001:2015', scope = qmsScope) {
    const prisma = {
        application_reviews: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'review-1',
                industry_scopes_json: JSON.stringify([scope]),
                certification_applications: { standard_name: standardName },
            }),
        },
        certification_body_capabilities: {
            findMany: jest.fn().mockResolvedValue(capabilities),
        },
    };
    const audit = { write: jest.fn() };
    return new CertificationBodyCapabilitiesService(prisma as any, audit as any);
}

describe('CertificationBodyCapabilitiesService - standard edition capability', () => {
    it('accepts the exact standard edition capability', async () => {
        const service = evaluationHarness([{
            id: 'cap-2015',
            program_code: 'ISO_9001',
            standard_edition_id: 'std-2015',
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
            standard_edition: { standard_code: 'ISO 9001', edition: '2015' },
        }]);
        const result = await service.evaluateReview('review-1', new Date('2026-08-26'));
        expect(result.overall_result).toBe('CAPABLE');
        expect(result.items[0].program_name).toBe('ISO 9001:2015');
    });

    it('does not use a 2026-only capability for an ISO 9001:2015 application', async () => {
        const service = evaluationHarness([{
            id: 'cap-2026',
            program_code: 'ISO_9001',
            standard_edition_id: 'std-2026',
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
            standard_edition: { standard_code: 'ISO 9001', edition: '2026' },
        }]);
        const result = await service.evaluateReview('review-1', new Date('2026-08-26'));
        expect(result.overall_result).toBe('NOT_CAPABLE');
    });

    it('does not use a 2015 capability for an ISO 9001:2026 application', async () => {
        const service = evaluationHarness([{
            id: 'cap-2015',
            program_code: 'ISO_9001',
            standard_edition_id: 'std-2015',
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
            standard_edition: { standard_code: 'ISO 9001', edition: '2015' },
        }], 'ISO 9001:2026');
        const result = await service.evaluateReview('review-1', new Date('2026-08-26'));
        expect(result.overall_result).toBe('NOT_CAPABLE');
    });

    it('keeps legacy program-level capability as a backward-compatible fallback', async () => {
        const service = evaluationHarness([{
            id: 'legacy-cap',
            program_code: 'ISO_9001',
            standard_edition_id: null,
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
            standard_edition: null,
        }]);
        const result = await service.evaluateReview('review-1', new Date('2026-08-26'));
        expect(result.overall_result).toBe('CAPABLE');
    });

    it('isolates ISO 9001:2015 + IAF 19 capability from the 2026 edition', async () => {
        const capabilities = [{
            id: 'cap-2015-iaf19',
            program_code: 'ISO_9001',
            standard_edition_id: 'std-2015',
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '19' },
            standard_edition: { standard_code: 'ISO 9001', edition: '2015' },
        }];
        const scope = { ...qmsScope, isic_code: '2651', nace_code: '26.51', iaf_code: '19' };
        const at = new Date('2026-08-29');
        const current = await evaluationHarness(capabilities, 'ISO 9001:2015', scope).evaluateReview('review-1', at);
        const future = await evaluationHarness(capabilities, 'ISO 9001:2026', scope).evaluateReview('review-1', at);
        expect(current.overall_result).toBe('CAPABLE');
        expect(current.items[0].capability?.id).toBe('cap-2015-iaf19');
        expect(future.overall_result).toBe('NOT_CAPABLE');
        expect(future.items[0].capability).toBeNull();
    });

    it('batch-adds only IAF scopes not already configured for the selected edition', async () => {
        const tx = {
            certification_body_capabilities: {
                findMany: jest
                    .fn()
                    .mockResolvedValueOnce([{ iaf_scope_id: '00000000-0000-4000-8000-000000000014' }])
                    .mockResolvedValueOnce([]),
                createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        };
        const prisma = {
            standard_editions: {
                findUnique: jest.fn().mockResolvedValue({
                    id: '00000000-0000-4000-8000-000000002015',
                    standard_code: 'ISO 9001:2015',
                    standard_name: 'Quality management systems',
                    edition: '2015',
                    scheme: { code: 'QMS', name: 'Hệ thống quản lý chất lượng' },
                }),
            },
            iaf_scopes: {
                findMany: jest.fn().mockResolvedValue([
                    { id: '00000000-0000-4000-8000-000000000014', iaf_code: '14', is_active: true },
                    { id: '00000000-0000-4000-8000-000000000019', iaf_code: '19', is_active: true },
                ]),
            },
            $transaction: jest.fn(async (callback: any) => callback(tx)),
        };
        const audit = { write: jest.fn().mockResolvedValue(undefined) };
        const service = new CertificationBodyCapabilitiesService(prisma as any, audit as any);
        const result = await service.createBatch({
            standard_edition_id: '00000000-0000-4000-8000-000000002015',
            iaf_scope_ids: [
                '00000000-0000-4000-8000-000000000014',
                '00000000-0000-4000-8000-000000000019',
            ],
            status: 'ACTIVE',
            effective_from: '2026-01-01',
        }, 'user-1');
        expect(result.created_count).toBe(1);
        expect(result.existing_count).toBe(1);
        expect(tx.certification_body_capabilities.createMany).toHaveBeenCalledWith(expect.objectContaining({
            data: [expect.objectContaining({
                iaf_scope_id: '00000000-0000-4000-8000-000000000019',
                program_code: 'ISO_9001',
                program_name: 'ISO 9001:2015',
            })],
        }));
    });
});
