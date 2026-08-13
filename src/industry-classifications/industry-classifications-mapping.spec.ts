import { IndustryClassificationsService } from './industry-classifications.service';

describe('IndustryClassificationsService canonical resolution', () => {
    it('resolves ISIC 2220 to NACE 22.2 and IAF 14', async () => {
        const isic = { id: 'isic-2220', classification_type: 'ISIC', revision: 'REV4', code: '2220', is_active: true };
        const nace = { id: 'nace-22-2', classification_type: 'NACE', revision: 'REV2', code: '22.2', is_active: true };
        const prisma = {
            industry_classifications: { findFirst: jest.fn().mockResolvedValue(isic) },
            industry_code_mappings: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'map-isic-nace',
                    target_code_id: nace.id,
                    target_code: nace,
                    mapping_type: 'EXACT',
                    valid_from: null,
                    valid_to: null,
                }]),
            },
            nace_iaf_mappings: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'map-nace-iaf',
                    iaf_scope: { iaf_code: '14', iaf_name: 'Rubber and plastic products', is_active: true },
                    source_document: 'approved mapping',
                    valid_from: null,
                    valid_to: null,
                }]),
            },
        };
        const service = new IndustryClassificationsService(prisma as any);
        const result = await service.resolve('ISIC', 'REV4', '2220', 'QMS');
        expect(result.nace_candidates[0].nace.code).toBe('22.2');
        expect(result.nace_candidates[0].iaf_candidates[0].iaf_code).toBe('14');
    });
});
