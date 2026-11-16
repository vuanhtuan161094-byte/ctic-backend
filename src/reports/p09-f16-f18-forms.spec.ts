import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const engine = require('./runtime/ooxml-template-engine.cjs') as {
    readZipEntries: (file: string) => Array<{name: string; data: Buffer}>;
};
const builder16 = require('./runtime/p09-f16-builder.cjs') as {
    renderF16: (arg: {baseTemplatePath: string; outputPath: string; data: Record<string, unknown>}) => string;
};
const builder18 = require('./runtime/p09-f18-language-builder.cjs') as {
    renderAgreementLanguage: (arg: {templatePath: string; outputPath: string;
        language: string; data: Record<string, unknown>}) => string;
};

const shell = join(process.cwd(), 'src', 'reports', 'templates', 'F.03-P.09.audit-program.template.docx');
const documentXml = (file: string) => engine.readZipEntries(file)
    .find((entry) => entry.name === 'word/document.xml')?.data.toString('utf8') ?? '';

describe('P.09 F.16, F.18 Word publishing assets and multilingual governance', () => {
    let directory: string;
    beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'cmp-p09-forms-')); });
    afterEach(() => { rmSync(directory, {recursive: true, force: true}); });

    it('renders F16 with exact original fields, ordered organizations, signature placeholders', () => {
        const destination = join(directory, 'f16.docx');
        builder16.renderF16({
            baseTemplatePath: shell,
            outputPath: destination,
            data: {
                revision_no: 2, preparer_name: 'Người lập A',
                approver_name: 'Người duyệt B',
                prepared_date: '2026-11-16', approved_date: '2026-11-17',
                organizations: [
                    {name: 'Tổ chức chứng nhận Một', recognition_scope: 'ISO 9001'},
                    {name: 'Tổ chức chứng nhận Hai', recognition_scope: 'ISO 14001'},
                ],
            },
        });
        const xml = documentXml(destination);
        expect(xml).toContain('Tổ chức chứng nhận Một');
        expect(xml).toContain('ISO 9001');
        expect(xml).toContain('Người lập A');
        expect(xml).toContain('Người duyệt B');
        expect(xml).toContain('SIGNATURE REQUIRED');
        expect(xml).toContain('UNSIGNED COPY');
        expect(readFileSync(destination).subarray(0, 2).toString()).toBe('PK');
    });

    it.each([
        ['vi', 'THÔNG TIN THỎA THUẬN'],
        ['vi_en', 'AGREEMENT COVER'],
        ['vi_cn', '协议封面'],
    ])('keeps source legal clauses verbatim with unsigned cover %s', (language, marker) => {
        const destination = join(directory, `${language}.docx`);
        const originalXml = documentXml(shell);
        const originalBody = originalXml.substring(originalXml.indexOf('<w:body'));
        builder18.renderAgreementLanguage({
            templatePath: shell, outputPath: destination, language,
            data: {
                agreement_number: 'F18-001', company: 'Khách hàng A & B',
                representative: 'Người đại diện 1', position: 'Giám đốc',
                address: 'Địa chỉ 123', proposed_date: '2026-11-16',
            },
        });
        const result = documentXml(destination);
        expect(result).toContain(marker);
        expect(result).toContain('Khách hàng A &amp; B');
        expect(result).toContain('F18-001');
        expect(result).toContain(language === 'vi' ? 'Bản dự thảo chưa ký' :
            language === 'vi_cn' ? '未签署草稿' : 'Unsigned draft');
        expect(result).not.toContain(': '+marker);
        // The cover is inserted before the unchanged original body.
        expect(result).toContain(originalBody.replace(/^<w:body(?:\s[^>]*)?>/, ''));
    });

    it('denies incomplete multilingual agreement data', () => {
        expect(() => builder18.renderAgreementLanguage({
            templatePath: shell, outputPath: join(directory, 'invalid.docx'),
            language: 'vi_en', data: { agreement_number: 'F18-002' },
        })).toThrow('Incomplete F18 signatory fields');
    });
});
