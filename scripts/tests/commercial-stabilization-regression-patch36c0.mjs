import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const ts = require(require.resolve('typescript', { paths: [root] }));

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${message}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${message}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const prestartDev = pkg.scripts['prestart:dev'] ?? '';
const prestartProd = pkg.scripts['prestart:prod'] ?? '';
const verify = pkg.scripts.verify ?? '';
const schemaService = read('src/prisma/database-schema.service.ts');
const prismaModule = read('src/prisma/prisma.module.ts');
const main = read('src/main.ts');
const health = read('src/health/health.service.ts');
const filter = read('src/common/filters/global-exception.filter.ts');
const doctor = read('scripts/database-doctor-patch36c0.cjs');
const repair = read('scripts/repair-critical-schema-patch36c0.cjs');
const runtime = read('scripts/runtime-compatibility-check-patch36c0.cjs');
const lan = read('scripts/configure-lan-patch36c0.cjs');

const conversion = read('src/common/document-conversion.ts');
const reportDocs = read('src/reports/report-documents.service.ts');
const auditDocs = read('src/audit-documents/audit-documents.service.ts');
const certificationResults = read('src/certification-results/certification-results.service.ts');

check(pkg.engines?.node === '^22.12.0 || ^24.0.0', 'Backend khóa dải Node tương thích Prisma 7');
check(pkg.scripts['db:doctor']?.includes('database-doctor-patch36c0') || pkg.scripts['db:doctor']?.includes('database-schema-contract-patch36c1'), 'Có lệnh db:doctor/full contract');
check(pkg.scripts['db:repair']?.includes('repair-critical-schema-patch36c0'), 'Có lệnh db:repair');
check((pkg.scripts['db:stabilize']?.includes('prisma migrate deploy') && pkg.scripts['db:stabilize']?.includes('database-doctor-patch36c0')) || pkg.scripts['db:stabilize']?.includes('database-stabilize-patch36c1'), 'db:stabilize deploy/adopt + repair + verify');
check((pkg.scripts['stabilize']?.includes('db:stabilize') && pkg.scripts['stabilize']?.includes('test:regression')) || pkg.scripts['stabilize']?.includes('stabilize:commercial'), 'Có một lệnh stabilize chạy chuỗi kiểm tra');
check(
  prestartDev.includes('runtime-compatibility-check-patch36c0') &&
    prestartDev.includes('prisma generate') &&
    prestartDev.includes('verify-prisma-client-patch35a4.cjs') &&
    prestartDev.includes('db:preflight') &&
    !prestartDev.includes('db:contract') &&
    !prestartDev.includes('database-doctor'),
  'start:dev giữ prestart nhẹ: runtime + Prisma generate/verify + DB preflight',
);
check(prestartProd.includes('--strict') && prestartProd.includes('db:contract'), 'production kiểm runtime + full schema contract trước khi start');
check(verify.includes('test:regression') && verify.includes('db:contract'), 'verification gate luôn chạy regression + full schema contract');
check(pkg.scripts['env:lan']?.includes('configure-lan-patch36c0'), 'Có lệnh cấu hình LAN không đè secret');

for (const required of [
  "dbo.document_files', N'sha256",
  "dbo.audit_logs', N'request_id",
  "dbo.audit_logs', N'outcome",
  "dbo.audit_logs', N'status_code",
  "dbo.audit_logs', N'duration_ms",
]) {
  check(schemaService.includes(required), `Runtime schema contract kiểm ${required}`);
  check(doctor.includes(required), `Database doctor kiểm ${required}`);
  check(repair.includes(required), `Database repair xử lý ${required}`);
}

check(prismaModule.includes('DatabaseSchemaService') && /exports:\s*\[[\s\S]*DatabaseSchemaService/.test(prismaModule), 'DatabaseSchemaService được provider/export toàn hệ thống');
check(
  main.indexOf('await databaseSchema') >= 0 &&
    main.indexOf('.assertCompatible()') > main.indexOf('await databaseSchema') &&
    main.indexOf('app.listen') > main.indexOf('.assertCompatible()'),
  'DatabaseSchemaService kiểm schema runtime trước app.listen',
);
check(main.includes("'unhandledRejection'") && main.includes('[FATAL] Backend không thể khởi động'), 'Startup có fatal handler rõ ràng');
check(main.includes('PUBLIC_BASE_URL đang trỏ localhost') && main.includes('npm run env:lan'), 'Startup cảnh báo QR/link sai khi chạy LAN');
check(health.includes("database_schema: 'compatible'"), 'Health readiness báo schema tương thích');
check(filter.includes('P2022') && filter.includes('Cơ sở dữ liệu chưa đồng bộ'), 'P2022 được map thành lỗi vận hành dễ hiểu');
check(filter.includes('P2024') && filter.includes('P2034'), 'Có mapping pool timeout và transaction conflict');
check(repair.includes('SET XACT_ABORT ON') && repair.includes('BEGIN TRANSACTION') && repair.includes('COMMIT TRANSACTION'), 'Schema repair chạy transaction + XACT_ABORT');
check(repair.includes("IF COL_LENGTH(N'dbo.document_files', N'sha256') IS NULL"), 'Schema repair idempotent cho sha256');
check(runtime.includes('major === 22 || major === 24') && runtime.includes('--strict'), 'Runtime checker chốt Node 22/24 và strict production');
check(lan.includes("setEnvLine(source, 'PUBLIC_BASE_URL'") && lan.includes("setEnvLine(source, 'FRONTEND_BASE_URL'") && lan.includes("setEnvLine(source, 'CORS_ORIGINS'"), 'LAN configurator chỉ cập nhật biến network cần thiết');
check(!lan.includes('DATABASE_URL=') && !lan.includes('JWT_SECRET='), 'LAN configurator không ghi đè database/JWT secret');

check(conversion.includes("process.platform === 'win32'") && conversion.includes("process.platform === 'darwin'"), 'Bộ chuyển PDF nhận diện Windows/macOS/Linux');
check(conversion.includes("'/usr/bin/libreoffice'") && conversion.includes("'/Applications/LibreOffice.app/Contents/MacOS/soffice'"), 'Bộ chuyển PDF có fallback Linux/macOS');
check(conversion.includes('process.env.LIBREOFFICE_PATH') && conversion.includes("'soffice'") && conversion.includes("'libreoffice'"), 'Bộ chuyển PDF ưu tiên cấu hình/PATH đa nền tảng');
for (const [label, source] of [
  ['report documents', reportDocs],
  ['audit documents', auditDocs],
  ['certification results', certificationResults],
]) {
  check(source.includes("../common/document-conversion"), `${label} dùng converter chung`);
  check(!source.includes('C:\\Program Files\\LibreOffice'), `${label} không còn hard-code LibreOffice Windows`);
  check(!source.includes('execFileAsync'), `${label} không còn tự triển khai process conversion riêng`);
}

for (const rel of [
  'src/prisma/database-schema.service.ts',
  'src/prisma/prisma.module.ts',
  'src/health/health.service.ts',
  'src/main.ts',
  'src/common/filters/global-exception.filter.ts',
  'src/common/document-conversion.ts',
  'src/reports/report-documents.service.ts',
  'src/audit-documents/audit-documents.service.ts',
  'src/certification-results/certification-results.service.ts',
]) {
  const source = read(rel);
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      isolatedModules: true,
    },
    fileName: rel,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diag) => diag.category === ts.DiagnosticCategory.Error,
  );
  check(errors.length === 0, `${rel} transpile syntax PASS`);
}

for (const rel of [
  'scripts/database-doctor-patch36c0.cjs',
  'scripts/repair-critical-schema-patch36c0.cjs',
  'scripts/runtime-compatibility-check-patch36c0.cjs',
  'scripts/configure-lan-patch36c0.cjs',
]) {
  check(fs.existsSync(path.join(root, rel)), `${rel} tồn tại`);
}

console.log(`\nPatch 36C.0 commercial stabilization regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
