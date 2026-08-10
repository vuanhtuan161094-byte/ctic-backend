import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    pass += 1;
    console.log(`✓ ${label}`);
  } else {
    fail += 1;
    console.error(`✗ ${label}`);
  }
}

const baselineMigrationName = '00000000000000_baseline';
const migrationPath = path.join(root, 'prisma', 'migrations', baselineMigrationName, 'migration.sql');
const helperPath = path.join(root, 'scripts', 'baseline-existing-database-patch35a43.cjs');
const applyPath = path.join(root, 'scripts', 'apply-patch35a43.cmd');
const lockPath = path.join(root, 'prisma', 'migrations', 'migration_lock.toml');

const helper = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : '';
const apply = fs.existsSync(applyPath) ? fs.readFileSync(applyPath, 'utf8') : '';
const lock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : '';

check(fs.existsSync(migrationPath), 'Có migration baseline hiện hữu');
check(fs.existsSync(helperPath), 'Có script kiểm tra và baseline database');
check(fs.existsSync(applyPath), 'Có script cài đặt Patch 35A.4.3');
check(/provider\s*=\s*["']mssql["']/i.test(lock), 'Migration lock dùng provider mssql');
check(helper.includes("prisma', 'migrate', 'resolve', '--applied'"), 'Baseline dùng prisma migrate resolve --applied');
check(helper.includes(baselineMigrationName), 'Chỉ đánh dấu đúng migration baseline');
check(helper.includes("OBJECT_ID(N'[dbo].[_prisma_migrations]'"), 'Kiểm tra bảng lịch sử Prisma trước khi baseline');
check(helper.includes('userTableCount === 0'), 'Không baseline cơ sở dữ liệu trống');
check(helper.includes('migrationHistoryCount > 0'), 'Dừng khi phát hiện lịch sử migration khác');
check(/prisma migrate deploy/i.test(apply), 'Sau baseline tiếp tục migrate deploy');
check(/npm run build/i.test(apply), 'Build backend sau migration');
check(!/migrate reset/i.test(apply + helper), 'Không dùng prisma migrate reset');
check(!/drop\s+database|drop\s+table/i.test(apply + helper), 'Không có lệnh xóa database hoặc bảng');
check(!/rmdir\s+\/s\s+\/q\s+.*prisma\\migrations/i.test(apply), 'Không xóa thư mục migrations');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
