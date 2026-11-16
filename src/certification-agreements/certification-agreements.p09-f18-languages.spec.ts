import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CertificationAgreementsService } from './certification-agreements.service';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { CertificationAgreementsController } from './certification-agreements.controller';

const id='11111111-1111-4111-8111-111111111111';
const sourceSha={
    vi:'d74ba3d3a827f6578d04ce11e0e248b381b2d936ce2a47b73c62c59548f420c0',
    vi_en:'b3254eea3fca969a56e9d8d58d6c9a85752f320381e41920e8838ae84da9077a',
    vi_cn:'29347d5d9c2df454bceb91b9028a56e5980287b653f5888e04bc3afcf17eecf8',
};
describe('P09 F18 original VN/VN-EN/VN-CN source governance',()=>{
    const db={
        controlled_template_versions:{findFirst:jest.fn()},
        certification_agreements:{findUnique:jest.fn()},
        certification_projects:{findFirst:jest.fn()},
    };
    const service=new CertificationAgreementsService(db as never);
    beforeEach(()=>{
        jest.clearAllMocks();
        db.controlled_template_versions.findFirst.mockImplementation(async ({where})=>{
            const code=where.series.template_code as string;
            const language=code.endsWith('.03')?'vi_cn':code.endsWith('.02')?'vi_en':'vi';
            return {id:'template-'+language,source_file:{
                original_name:'F18-'+language+'.docx',
                sha256:sourceSha[language],
            }};
        });
        db.certification_agreements.findUnique.mockResolvedValue({
            id,customers:{company_name:'A&B',address:'Hải Phòng'},
        });
        db.certification_projects.findFirst.mockResolvedValue({
            certification_applications:{
                representative_name:'Đại diện A',representative_position:'Giám đốc',
            },
        });
    });
    it('marks only the two correctly identified original sources ready and blocks F18 VI-CN with F19 footer',async()=>{
        const sources=await service.languageSources();
        expect(sources.map(s=>s.language)).toEqual(['vi','vi_en','vi_cn']);
        expect(sources.map(s=>s.source_ready)).toEqual([true,true,false]);
        expect(sources[2].blocked_reason).toMatch(/F\.19-P\.09/);
        expect(sources.map(s=>s.source_sha256)).toEqual(Object.values(sourceSha));
        await expect(service.prepareLanguage(id,'vi_cn','docx','actor-1'))
            .rejects.toBeInstanceOf(ConflictException);
    });
    it('rejects wrong template hash even when template was marked EFFECTIVE',async()=>{
        db.controlled_template_versions.findFirst.mockResolvedValue({
            id:'other-template',source_file:{original_name:'F18.docx',sha256:'b'.repeat(64)},
        });
        expect((await service.languageSources()).every(s=>!s.source_ready)).toBe(true);
        await expect(service.prepareLanguage(id,'vi_en','docx','actor-1'))
            .rejects.toBeInstanceOf(ConflictException);
    });
    it('rejects missing actor and disallowed language before any output',async()=>{
        await expect(service.prepareLanguage(id,'vi','docx')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.prepareLanguage(id,'unknown' as 'vi','docx','actor'))
            .rejects.toThrow('Ngôn ngữ');
    });
    it('restricts source-to-document output to authorized contract managers',()=>{
        const fn=CertificationAgreementsController.prototype.prepareLanguage;
        expect(Reflect.getMetadata(ROLES_KEY,fn)).toEqual(['ADMIN','STAFF']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY,fn)).toEqual(['contracts.manage']);
    });
});
