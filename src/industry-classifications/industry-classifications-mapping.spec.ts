import { IndustryClassificationsService } from './industry-classifications.service';

describe('IndustryClassificationsService canonical resolution', () => {
    it('resolves ISIC 2220 through all candidate NACE classes to IAF 14', async () => {
        const isic = { id: 'isic-2220', classification_type: 'ISIC', revision: 'ISIC_REV_4', code: '2220', level: 4, is_active: true };
        const nace = { id: 'nace-22-29', classification_type: 'NACE', revision: 'NACE_REV_2', code: '22.29', title_en: 'Other plastic products', title_vi: 'Sản xuất sản phẩm nhựa khác', parent_code: '22.2', level: 4, is_active: true };
        const prisma = {
            industry_classifications: { findFirst: jest.fn().mockResolvedValue(isic) },
            industry_code_mappings: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'map-isic-nace',
                    source_code_id: isic.id,
                    target_code_id: nace.id,
                    source_code: { code: '2220' },
                    target_code: nace,
                    mapping_type: 'EXACT',
                    valid_from: null,
                    valid_to: null,
                }]),
            },
            nace_iaf_mappings: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'map-nace-iaf',
                    iaf_scope: { iaf_code: '14', iaf_name: 'Cao su và sản phẩm nhựa', is_active: true },
                    source_document: 'IAF ID 1:2023',
                    valid_from: null,
                    valid_to: null,
                }]),
            },
        };
        const service = new IndustryClassificationsService(prisma as any);
        const result = await service.resolve('ISIC', 'ISIC_REV_4', '2220', 'QMS');
        expect(result.nace_candidates[0].nace.code).toBe('22.29');
        expect(result.nace_candidates[0].iaf_candidates[0].iaf_code).toBe('14');
        expect(result.iaf_summary.status).toBe('UNIQUE');
        expect(result.iaf_auto_resolved).toBe(true);
    });

    it('resolves parent NACE 26.5 from child classes 26.51 and 26.52 to unique IAF 19', async () => {
        const source = { id: 'nace-265', classification_type: 'NACE', revision: 'NACE_REV_2', code: '26.5', title_en: 'Measuring instruments and watches', title_vi: null, parent_code: '26', level: 3, is_active: true };
        const child1 = { id: 'nace-2651', classification_type: 'NACE', revision: 'NACE_REV_2', code: '26.51', title_en: 'Measuring instruments', title_vi: null, parent_code: '26.5', level: 4, is_active: true };
        const child2 = { id: 'nace-2652', classification_type: 'NACE', revision: 'NACE_REV_2', code: '26.52', title_en: 'Watches and clocks', title_vi: null, parent_code: '26.5', level: 4, is_active: true };
        const iaf19 = { id: 'iaf-19', iaf_code: '19', iaf_name: 'Thiết bị điện và quang học', is_active: true };
        const prisma = {
            industry_classifications: {
                findFirst: jest.fn().mockResolvedValue(source),
                findMany: jest.fn().mockResolvedValue([source, child1, child2]),
            },
            nace_iaf_mappings: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([
                        { id: 'm1', nace_code_id: child1.id, nace_code: { code: '26.51' }, iaf_scope: iaf19, source_document: 'IAF ID 1:2023', valid_from: null, valid_to: null },
                        { id: 'm2', nace_code_id: child2.id, nace_code: { code: '26.52' }, iaf_scope: iaf19, source_document: 'IAF ID 1:2023', valid_from: null, valid_to: null },
                    ]),
            },
        };
        const service = new IndustryClassificationsService(prisma as any);
        const result = await service.resolve('NACE', 'NACE_REV_2', '26.5', 'QMS');
        expect(result.iaf_summary.status).toBe('UNIQUE');
        expect(result.iaf_summary.iaf_codes).toEqual(['19']);
        expect(result.nace_candidates[0].mapping_type).toBe('DERIVED_FROM_CHILDREN');
        expect(result.nace_candidates[0].derived_from_nace_classes).toEqual(['26.51', '26.52']);
    });

    it('keeps a broad NACE code as multiple IAF when descendants span more than one IAF', async () => {
        const source = { id: 'nace-23', classification_type: 'NACE', revision: 'NACE_REV_2', code: '23', title_en: 'Non-metallic mineral products', title_vi: null, parent_code: 'C', level: 2, is_active: true };
        const child1 = { id: 'nace-2311', classification_type: 'NACE', revision: 'NACE_REV_2', code: '23.11', title_en: 'Flat glass', title_vi: null, parent_code: '23.1', level: 4, is_active: true };
        const child2 = { id: 'nace-2351', classification_type: 'NACE', revision: 'NACE_REV_2', code: '23.51', title_en: 'Cement', title_vi: null, parent_code: '23.5', level: 4, is_active: true };
        const prisma = {
            industry_classifications: {
                findFirst: jest.fn().mockResolvedValue(source),
                findMany: jest.fn().mockResolvedValue([
                    source,
                    { id: 'nace-231', classification_type: 'NACE', revision: 'NACE_REV_2', code: '23.1', title_en: 'Glass', title_vi: null, parent_code: '23', level: 3, is_active: true },
                    { id: 'nace-235', classification_type: 'NACE', revision: 'NACE_REV_2', code: '23.5', title_en: 'Cement', title_vi: null, parent_code: '23', level: 3, is_active: true },
                    child1,
                    child2,
                ]),
            },
            nace_iaf_mappings: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([
                        { id: 'm15', nace_code: { code: '23.11' }, iaf_scope: { iaf_code: '15', iaf_name: 'Sản phẩm khoáng phi kim loại', is_active: true }, source_document: 'IAF ID 1:2023', valid_from: null, valid_to: null },
                        { id: 'm16', nace_code: { code: '23.51' }, iaf_scope: { iaf_code: '16', iaf_name: 'Bê tông, xi măng, vôi, thạch cao', is_active: true }, source_document: 'IAF ID 1:2023', valid_from: null, valid_to: null },
                    ]),
            },
        };
        const service = new IndustryClassificationsService(prisma as any);
        const result = await service.resolve('NACE', 'NACE_REV_2', '23', 'QMS');
        expect(result.iaf_summary.status).toBe('MULTIPLE');
        expect(result.iaf_summary.iaf_codes).toEqual(['15', '16']);
        expect(result.requires_selection).toBe(true);
    });

    it('marks NACE 97/98/99 as outside IAF table instead of pretending the mapping is missing', async () => {
        const source = { id: 'nace-9700', classification_type: 'NACE', revision: 'NACE_REV_2', code: '97.00', title_en: 'Households as employers', title_vi: null, parent_code: '97', level: 4, is_active: true };
        const prisma = {
            industry_classifications: { findFirst: jest.fn().mockResolvedValue(source) },
            nace_iaf_mappings: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const service = new IndustryClassificationsService(prisma as any);
        const result = await service.resolve('NACE', 'NACE_REV_2', '97.00', 'QMS');
        expect(result.iaf_summary.status).toBe('OUTSIDE_IAF_TABLE');
        expect(result.nace_candidates[0].outside_iaf_table).toBe(true);
    });
});
