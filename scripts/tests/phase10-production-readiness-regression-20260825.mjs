import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const frontendCandidates = [path.resolve(root, '../ctic-frontend'), path.resolve(root, '../frontend')];
const frontendRoot = frontendCandidates.find((candidate) => fs.existsSync(candidate));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readFrontend = (file) => fs.readFileSync(path.join(frontendRoot, file), 'utf8');
let pass = 0;
let fail = 0;
function check(condition, label) {
  if (condition) { pass += 1; console.log(`PASS: ${label}`); }
  else { fail += 1; console.error(`FAIL: ${label}`); }
}

const readiness = read('src/common/production-readiness.ts');
const main = read('src/main.ts');
const pkg = JSON.parse(read('package.json'));
const p09 = read('scripts/tests/run-p09-real-e2e.cjs');
const backendProdEnv = read('.env.production.example');
const frontendProdEnv = readFrontend('.env.production.example');
const vite = readFrontend('vite.ctic.config.ts');
const backup = read('scripts/production/backup-database.sql');
const backupWrapper = read('scripts/production/backup-database.ps1');
const restoreDrill = read('scripts/production/restore-drill.ps1');
const checklist = read('docs/production/PRODUCTION_CHECKLIST.md');
const safeLog = read('src/common/safe-error-log.ts');
const exceptionFilter = read('src/common/filters/global-exception.filter.ts');

check(/SUPPORTED_NODE_ENVIRONMENTS/.test(readiness), 'NODE_ENV chỉ nhận development/test/production');
check(/TEST_DATABASE_URL/.test(readiness) && /P09_DISABLE_NOTIFICATION_SCHEDULER/.test(readiness), 'Production reject test-only environment flags');
check(/MIGRATION_DATABASE_URL/.test(readiness) && /không được đưa vào tiến trình backend production/.test(readiness), 'Runtime production không nhận migration credential');
check(/STORAGE_ROOT production phải là đường dẫn tuyệt đối/.test(readiness), 'Production bắt buộc storage root tuyệt đối');
check(/không được nằm bên trong thư mục deploy\/source/.test(readiness), 'Production tách storage khỏi deploy directory');
check(/SECURITY_HEADERS_ENABLED không được tắt/.test(readiness), 'Production fail closed nếu tắt security headers');
check(/APP_VERSION là bắt buộc/.test(readiness), 'Production có release version rõ ràng');
check(main.includes('validateRuntimeEnvironment({') && main.indexOf('validateRuntimeEnvironment({') < main.indexOf('ensureStorageLayout();'), 'Runtime guard chạy trước khi tạo storage layout');
check(!/Storage root: \$\{storage\.rootDirectory\}/.test(main.split("deployment.isProduction")[0] || ''), 'Không log storage path trước production branch');
check(p09.includes('refuses NODE_ENV=production'), 'P09 runner hard-block production invocation');
check(pkg.scripts['prod:env:check'] && pkg.scripts['prod:http-smoke'] && pkg.scripts['release:manifest'], 'Có executable production/release gates');
check(pkg.scripts['prestart:prod'].includes('prod:env:check'), 'Production start chạy env gate trước runtime');
check(backendProdEnv.includes('NODE_ENV=production') && backendProdEnv.includes('STORAGE_ROOT=E:\\CMP-DATA\\storage'), 'Có backend production env contract không chứa secret thật');
check(frontendProdEnv.includes('VITE_DEPLOYMENT_TARGET=production'), 'Có frontend production build contract');
check(vite.includes('VITE_DEPLOYMENT_TARGET') && vite.includes('không được trỏ localhost'), 'Frontend production build reject explicit localhost API');
check(/COPY_ONLY/.test(backup) && /CHECKSUM/.test(backup) && /RESTORE VERIFYONLY/.test(backup), 'DB backup script có COPY_ONLY/checksum/verify');
check(/EngineEdition/.test(backup) && /Express/.test(backup) && /COMPRESSION/.test(backup), 'DB backup tự tắt COMPRESSION trên SQL Server Express');
check(!/:setvar\s+DatabaseName/i.test(backup) && !/:setvar\s+BackupFile/i.test(backup), 'DB backup SQL không ghi đè SQLCMD variables do operator truyền vào');
check(/DatabaseName/.test(backupWrapper) && /BackupFile/.test(backupWrapper) && /TrustServerCertificate/.test(backupWrapper), 'Có PowerShell DB backup wrapper tránh lỗi quoting và hỗ trợ local certificate opt-in');
check(/SqlUsername/.test(backupWrapper) && /SQLCMDPASSWORD/.test(backupWrapper), 'DB backup wrapper hỗ trợ SQL authentication mà không đưa password lên command line');
check(/TrustServerCertificate/.test(restoreDrill) && /StorageRestoreRoot must be empty/.test(restoreDrill), 'Restore drill hỗ trợ local certificate opt-in và restore storage vào target trống');
check(/SqlUsername/.test(restoreDrill) && /InstanceDefaultDataPath/.test(restoreDrill), 'Restore drill hỗ trợ SQL authentication và mặc định dùng SQL Server data path');
check(safeLog.includes('sqlserver:') && safeLog.includes('Bearer') && exceptionFilter.includes('safeErrorForLog'), 'Critical error logs redact connection/token material before console output');
check(fs.existsSync(path.join(root, 'scripts/production/restore-drill.ps1')), 'Có isolated DB/storage restore drill script');
check(fs.existsSync(path.join(root, 'scripts/production/backup-storage.ps1')), 'Có persistent storage backup script');
check(checklist.includes('restore drill passed') || checklist.includes('restore drill'), 'Production checklist bắt buộc restore drill');
check(fs.existsSync(path.join(root, 'docs/production/RELEASE_ROLLBACK.md')) && fs.existsSync(path.join(root, 'docs/production/MONITORING.md')), 'Có release/rollback và monitoring runbook');
const migrations = fs.readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
check(migrations.length === 32 && migrations.at(-1) === '20260826151000_cb_capability_standard_editions', 'Post-Step11 giữ migration contract 32/32, không tạo schema migration không cần thiết');

console.log(`\nPhase 10 production readiness regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
