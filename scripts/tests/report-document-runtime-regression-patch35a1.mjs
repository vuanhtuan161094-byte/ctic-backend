import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..', '..');

let pass = 0;
let fail = 0;

function check(condition, label, detail = '') {
    if (condition) {
        pass += 1;
        console.log(`✓ ${label}`);
    } else {
        fail += 1;
        console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

const servicePath = path.join(
    backendRoot,
    'src',
    'reports',
    'report-documents.service.ts',
);
const packagePath = path.join(backendRoot, 'package.json');
const copyScriptPath = path.join(
    backendRoot,
    'scripts',
    'copy-report-assets.cjs',
);

const serviceText = fs.readFileSync(servicePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

check(
    serviceText.includes("join(process.cwd(), 'src'") ||
        serviceText.includes("'src',\n            'reports',\n            'runtime'"),
    'Service có đường dẫn dự phòng tới runtime trong src',
);
check(
    serviceText.includes('loadOoxmlTemplateEngine'),
    'Runtime được nạp qua hàm kiểm tra nhiều đường dẫn',
);
check(
    packageJson.scripts?.postbuild ===
        'node scripts/copy-report-assets.cjs',
    'npm run build tự sao chép tài nguyên sau biên dịch',
);
check(
    String(packageJson.scripts?.['start:prod'] ?? '').includes(
        'copy-report-assets.cjs',
    ),
    'start:prod bảo đảm tài nguyên tồn tại trước khi chạy',
);
check(fs.existsSync(copyScriptPath), 'Có script sao chép tài nguyên báo cáo');

try {
    execFileSync(process.execPath, [copyScriptPath], {
        cwd: backendRoot,
        stdio: 'pipe',
    });

    const distEngine = path.join(
        backendRoot,
        'dist',
        'reports',
        'runtime',
        'ooxml-template-engine.cjs',
    );
    const stage1Template = path.join(
        backendRoot,
        'dist',
        'reports',
        'templates',
        'F.09-P.09-01.audit-report-stage-1.template.docx',
    );
    const stage2Template = path.join(
        backendRoot,
        'dist',
        'reports',
        'templates',
        'F.09-P.09-02.audit-report-stage-2.template.docx',
    );

    check(fs.existsSync(distEngine), 'Engine đã được copy vào dist');
    check(fs.existsSync(stage1Template), 'Mẫu GĐ1 đã được copy vào dist');
    check(fs.existsSync(stage2Template), 'Mẫu GĐ2 đã được copy vào dist');

    const engine = require(distEngine);
    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'patch35a1-'),
    );

    try {
        const output = path.join(tempDir, 'runtime-smoke.docx');
        engine.renderDocxTemplate({
            templatePath: stage1Template,
            outputPath: output,
            data: {
                customer_code: 'PATCH35A1',
                document_status: 'DỰ THẢO / DRAFT',
            },
        });
        check(
            fs.existsSync(output) && fs.statSync(output).size > 20_000,
            'Engine trong dist sinh được DOCX thực tế',
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
} catch (error) {
    check(
        false,
        'Sao chép và chạy runtime trong dist',
        error instanceof Error ? error.message : String(error),
    );
}

console.log('');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);

if (fail > 0) process.exit(1);
