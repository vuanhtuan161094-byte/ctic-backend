import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');

let ts;
try {
  const typescriptPath = require.resolve('typescript', { paths: [root] });
  ts = require(typescriptPath);
} catch (error) {
  throw new Error(
    'Không tìm thấy package TypeScript cục bộ của backend. Hãy chạy npm install (hoặc npm ci) trong ctic-backend rồi chạy lại regression.',
    { cause: error },
  );
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let pass = 0;
let fail = 0;
function check(condition, label) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
}

const storageSource = read('src/common/storage-config.ts');
const mainSource = read('src/main.ts');
const healthSource = read('src/health/health.service.ts');
const docController = read('src/document-files/document-files.controller.ts');
const uploadSecurity = read('src/common/upload-security.ts');
const docService = read('src/document-files/document-files.service.ts');
const certController = read('src/certificates/certificates.controller.ts');
const certService = read('src/certificates/certificates.service.ts');
const reportSource = read('src/reports/report-documents.service.ts');
const auditDocsSource = read('src/audit-documents/audit-documents.service.ts');
const resultsSource = read('src/certification-results/certification-results.service.ts');
const envExample = read('.env.example');

check(storageSource.includes('STORAGE_ROOT'), 'Có cấu hình STORAGE_ROOT dùng chung');
check(storageSource.includes("'documents'") && storageSource.includes("'temp'") && storageSource.includes("'backups'"), 'Kho lưu trữ có documents/temp/backups');
check(storageSource.includes('assertStorageWritable') && storageSource.includes('.storage-probe-'), 'Có kiểm tra quyền ghi thực tế bằng probe file');
check(storageSource.includes('resolveDocumentStoragePath'), 'Có helper resolve đường dẫn tệp an toàn');
check(storageSource.includes("basename(") && storageSource.includes('Tên tệp lưu trữ không hợp lệ'), 'Chặn stored_name chứa path traversal');
check(mainSource.indexOf('await NestFactory.create') < mainSource.indexOf('getDeploymentConfig()'), '.env được nạp trước khi đọc deployment config');
check(mainSource.includes('ensureStorageLayout()'), 'Backend tạo và kiểm tra storage layout khi khởi động');
check(mainSource.includes('Storage root:'), 'Backend log storage root thực tế khi khởi động');
check(healthSource.includes("storage: 'writable'"), 'Readiness phản ánh tình trạng kho lưu trữ');
check(healthSource.includes('assertStorageWritable'), 'Health readiness kiểm tra quyền đọc/ghi storage');
check(docController.includes('createSecureUploadOptions()') && uploadSecurity.includes('getStorageConfig().tempDirectory'), 'Upload hồ sơ dùng storage config chung qua secure pipeline');
check(certController.includes("createSecureUploadOptions(['.pdf'])") && uploadSecurity.includes('getStorageConfig().tempDirectory'), 'Upload chứng chỉ dùng storage config chung qua secure pipeline');
check(docService.includes('resolveDocumentStoragePath') && !docService.includes("process.cwd(),\n                'uploads'"), 'Download hồ sơ dùng safe storage resolver');
check(certService.includes('documentFilesService.getDownload('), 'PDF chứng chỉ công khai dùng safe storage resolver qua DocumentFilesService');
check(reportSource.includes('getStorageConfig()') && auditDocsSource.includes('getStorageConfig()') && resultsSource.includes('getStorageConfig()'), 'Các engine sinh Word/PDF dùng cùng kho documents');
check(envExample.includes('STORAGE_ROOT=./uploads'), '.env.example giữ tương thích kho uploads hiện tại');
check(envExample.includes('Production nên dùng đường dẫn tuyệt đối'), '.env.example hướng dẫn tách dữ liệu khỏi source production');

// Chạy logic storage helper thực tế sau khi transpile TS thuần sang CommonJS.
const transpiled = ts.transpileModule(storageSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;

const compileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-storage-compile-'));
const compiledPath = path.join(compileDir, 'storage-config.cjs');
fs.writeFileSync(compiledPath, transpiled);
const storage = require(compiledPath);

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-storage-data-'));
const config = storage.ensureStorageLayout({ STORAGE_ROOT: testRoot });
check(config.rootDirectory === path.resolve(testRoot), 'STORAGE_ROOT tuyệt đối được resolve đúng');
check(fs.existsSync(config.documentsDirectory) && fs.existsSync(config.tempDirectory) && fs.existsSync(config.backupsDirectory), 'ensureStorageLayout tạo đủ thư mục dữ liệu');

const safePath = storage.resolveDocumentStoragePath('abc.pdf', { STORAGE_ROOT: testRoot });
check(safePath === path.join(testRoot, 'documents', 'abc.pdf'), 'Tên file hợp lệ được resolve trong documents');

let traversalRejected = false;
try {
  storage.resolveDocumentStoragePath('../secret.txt', { STORAGE_ROOT: testRoot });
} catch {
  traversalRejected = true;
}
check(traversalRejected, 'Path traversal ../ bị reject thực tế');

storage.assertStorageWritable(config);
check(!fs.readdirSync(config.tempDirectory).some((name) => name.startsWith('.storage-probe-')), 'Probe kiểm tra ghi được dọn sạch sau khi chạy');

fs.rmSync(testRoot, { recursive: true, force: true });
fs.rmSync(compileDir, { recursive: true, force: true });

console.log(`\nPatch 36B.4 storage safety regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
