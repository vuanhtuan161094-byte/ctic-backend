import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const engine = require('./runtime/ooxml-template-engine.cjs') as {
    readZipEntries: (path: string) => Array<{ name: string; data: Buffer }>;
};
const builder = require('./runtime/p09-f08-builder.cjs') as {
    renderAuditNotesDocx: (input: {
        baseTemplatePath: string; outputPath: string; data: Record<string, unknown>;
    }) => string;
};

describe('F.08-P.09 original-field DOCX production', () => {
    it('creates an unzip-readable audit note with escaped contents and no F03 visible body', () => {
        const source = join(process.cwd(), 'src', 'reports', 'templates', 'F.03-P.09.audit-program.template.docx');
        expect(existsSync(source)).toBe(true);
        const temp = mkdtempSync(join(tmpdir(), 'p09-f08-'));
        try {
            const out = join(temp, 'f08.docx');
            builder.renderAuditNotesDocx({
                baseTemplatePath: source, outputPath: out,
                data: {
                    customer_code: 'C123', organization_name: 'Công ty A&B',
                    audit_location: 'Nhà máy số 1', auditor_name: 'Chuyên gia B',
                    audit_date: '16/11/2026',
                    rows: [{ clause: '8.5.1', content: 'Hồ sơ chất lượng <đã xem>', finding: 'Điểm lưu ý & theo dõi' }],
                },
            });
            const xml = engine.readZipEntries(out).find((entry) => entry.name === 'word/document.xml');
            expect(xml).toBeDefined();
            const body = xml?.data.toString('utf8') ?? '';
            expect(body).toContain('GHI CHÉP ĐÁNH GIÁ');
            expect(body).toContain('Công ty A&amp;B');
            expect(body).toContain('Hồ sơ chất lượng &lt;đã xem&gt;');
            expect(body).toContain('Điểm lưu ý &amp; theo dõi');
            expect(body).toContain('8.5.1');
            expect(readFileSync(out).subarray(0, 2).toString('utf8')).toBe('PK');
        } finally {
            rmSync(temp, { recursive: true, force: true });
        }
    });
});
