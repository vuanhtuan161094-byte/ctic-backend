import { BadRequestException } from '@nestjs/common';

import {
    CertificationBodyCapabilitiesService,
    normalizeProgramCode,
    programForManagementSystem,
} from './certification-body-capabilities.service';

const qmsScope = {
    isic_code: '2220',
    nace_code: '22.2',
    iaf_code: '14',
    isic_nace_mapping_id: 'isic-nace-id',
    nace_iaf_mapping_id: 'nace-iaf-id',
    management_system: 'QMS',
    scope_description: 'Manufacture of plastic products',
    is_primary: true,
};

function createHarness(options?: {
    standardName?: string;
    scopes?: unknown;
    capabilities?: any[];
    approvedReview?: any;
}) {
    const prisma = {
        application_reviews: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'review-1',
                industry_scopes_json: JSON.stringify(options?.scopes ?? [qmsScope]),
                certification_applications: {
                    standard_name: options?.standardName ?? 'ISO 9001:2015',
                },
            }),
            findFirst: jest.fn().mockResolvedValue(options?.approvedReview ?? null),
        },
        certification_body_capabilities: {
            findMany: jest.fn().mockResolvedValue(options?.capabilities ?? []),
        },
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return {
        prisma,
        audit,
        service: new CertificationBodyCapabilitiesService(prisma as any, audit as any),
    };
}

describe('CertificationBodyCapabilitiesService', () => {
    it('normalizes known programs independently from expert capability', () => {
        expect(normalizeProgramCode('ISO 9001:2015')).toBe('ISO_9001');
        expect(programForManagementSystem('QMS')).toEqual({ code: 'ISO_9001', name: 'ISO 9001' });
        expect(programForManagementSystem('unknown')).toBeNull();
    });

    it('returns CAPABLE for an active effective Program + IAF pair', async () => {
        const active = {
            id: 'cap-1',
            program_code: 'ISO_9001',
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01T00:00:00.000Z'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
        };
        const { service } = createHarness({ capabilities: [active] });
        const result = await service.evaluateReview('review-1', new Date('2026-08-12T10:00:00.000Z'));
        expect(result.overall_result).toBe('CAPABLE');
        expect(result.items).toEqual(expect.arrayContaining([
            expect.objectContaining({ program_code: 'ISO_9001', iaf_code: '14', result: 'CAPABLE' }),
        ]));
    });

    it.each([
        ['missing', []],
        ['inactive', [{ id: 'cap-1', program_code: 'ISO_9001', status: 'INACTIVE', effective_from: new Date('2026-01-01'), effective_to: null, iaf_scope: { iaf_code: '14' } }]],
        ['expired', [{ id: 'cap-1', program_code: 'ISO_9001', status: 'ACTIVE', effective_from: new Date('2025-01-01'), effective_to: new Date('2026-01-01'), iaf_scope: { iaf_code: '14' } }]],
        ['future', [{ id: 'cap-1', program_code: 'ISO_9001', status: 'ACTIVE', effective_from: new Date('2027-01-01'), effective_to: null, iaf_scope: { iaf_code: '14' } }]],
    ])('returns NOT_CAPABLE for %s capability', async (_label, capabilities) => {
        const { service } = createHarness({ capabilities });
        const result = await service.evaluateReview('review-1', new Date('2026-08-12T10:00:00.000Z'));
        expect(result.overall_result).toBe('NOT_CAPABLE');
    });

    it('requires all requested programs to be capable', async () => {
        const scopes = [
            qmsScope,
            { ...qmsScope, management_system: 'EMS', is_primary: false },
        ];
        const capabilities = [{
            id: 'cap-qms',
            program_code: 'ISO_9001',
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
        }];
        const { service } = createHarness({
            standardName: 'ISO 9001:2015 + ISO 14001:2015',
            scopes,
            capabilities,
        });
        const result = await service.evaluateReview('review-1', new Date('2026-08-12'));
        expect(result.items).toHaveLength(2);
        expect(result.overall_result).toBe('NOT_CAPABLE');
    });

    it('returns CAPABLE when every program is covered and deduplicates multiple activities', async () => {
        const scopes = [
            qmsScope,
            { ...qmsScope, scope_description: 'Secondary plastic activity', is_primary: false },
            { ...qmsScope, management_system: 'EMS', is_primary: false },
        ];
        const capabilities = ['ISO_9001', 'ISO_14001'].map((programCode) => ({
            id: `cap-${programCode}`,
            program_code: programCode,
            status: 'ACTIVE',
            effective_from: new Date('2026-01-01'),
            effective_to: null,
            iaf_scope: { iaf_code: '14' },
        }));
        const { service } = createHarness({
            standardName: 'ISO 9001:2015 + ISO 14001:2015',
            scopes,
            capabilities,
        });
        const result = await service.evaluateReview('review-1', new Date('2026-08-12'));
        expect(result.overall_result).toBe('CAPABLE');
        expect(result.items).toHaveLength(2);
    });

    it('returns REVIEW_REQUIRED for incomplete classification', async () => {
        const { service } = createHarness({ scopes: [{ ...qmsScope, nace_code: undefined }] });
        const result = await service.evaluateReview('review-1');
        expect(result.overall_result).toBe('REVIEW_REQUIRED');
    });

    it('allows contract progression based only on an approved review', async () => {
        const approvedReview = { id: 'review-1', workflow_status: 'APPROVED' };
        const { service, prisma } = createHarness({ approvedReview });
        await expect(service.assertApplicationApprovedForContract('application-1')).resolves.toBe(approvedReview);
        expect(prisma.certification_body_capabilities.findMany).not.toHaveBeenCalled();
    });

    it('blocks contract progression when the latest review was invalidated after an earlier approval', async () => {
        const invalidatedReview = { id: 'review-1', workflow_status: 'RETURNED' };
        const { service, audit } = createHarness({ approvedReview: invalidatedReview });
        await expect(service.assertApplicationApprovedForContract('application-1'))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'CONTRACT_PROGRESSION_DENIED',
            outcome: 'blocked',
        }));
    });

    it('stamps capability snapshots with an approval version', () => {
        const { service } = createHarness();
        const data = service.snapshotData({
            review_id: 'review-1',
            evaluated_at: new Date('2026-08-12T00:00:00.000Z'),
            overall_result: 'CAPABLE',
            items: [{
                program_code: 'ISO_9001',
                program_name: 'ISO 9001',
                iaf_code: '14',
                result: 'CAPABLE',
                reason: 'Covered',
                capability: null,
            }],
        }, 'reviewer-1', 2);
        expect(data[0].approval_version).toBe(2);
    });

    it('blocks contract progression when no approved review exists and audits denial', async () => {
        const { service, audit } = createHarness();
        await expect(service.assertApplicationApprovedForContract('application-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'CONTRACT_PROGRESSION_DENIED',
            outcome: 'blocked',
        }));
    });
});
