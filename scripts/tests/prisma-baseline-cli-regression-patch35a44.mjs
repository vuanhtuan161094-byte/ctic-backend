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

const baselineName = '00000000000000_baseline';
const baselineSql = path.join(root, 'prisma', 'migrations', baselineName, 'migration.sql');
const imsSql = path.join(root, 'prisma', 'migrations', '20260805230000_patch35a3_integrated_manday_allocation', 'migration.sql');
const helperPath = path.join(root, 'scripts', 'baseline-existing-database-patch35a44.cjs');
const applyPath = path.join(root, 'scripts', 'apply-patch35a44.cmd');
const lockPath = path.join(root, 'prisma', 'migrations', 'migration_lock.toml');

const helper = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : '';
const apply = fs.existsSync(applyPath) ? fs.readFileSync(applyPath, 'utf8') : '';
const lock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : '';

check(fs.existsSync(baselineSql), 'Có migration baseline hiện hữu');
check(fs.existsSync(imsSql), 'Có migration ma trận man-day IMS');
check(fs.existsSync(helperPath), 'Có helper baseline Patch 35A.4.4');
check(fs.existsSync(applyPath), 'Có script cài đặt Patch 35A.4.4');
check(/provider\s*=\s*["']mssql["']/i.test(lock), 'Migration lock dùng provider mssql');
check(helper.includes("node_modules', 'prisma', 'build', 'index.js'"), 'Helper định vị Prisma CLI cục bộ');
check(helper.includes('process.execPath'), 'Helper chạy Prisma CLI bằng Node hiện tại');
check(helper.includes("'migrate', 'resolve', '--applied'"), 'Baseline dùng migrate resolve --applied');
check(helper.includes('result.error'), 'Helper hiển thị lỗi khởi chạy child process');
check(helper.includes('result.status'), 'Helper kiểm tra mã thoát Prisma CLI');
check(!helper.includes("process.platform === 'win32' ? 'npx.cmd'"), 'Không còn gọi npx.cmd bằng spawnSync');
check(helper.includes("OBJECT_ID(N'[dbo].[_prisma_migrations]'"), 'Kiểm tra lịch sử migration trước baseline');
check(/prisma migrate deploy/i.test(apply), 'Sau baseline tiếp tục migrate deploy');
check(/npm run build/i.test(apply), 'Build backend sau migration');
check(!/migrate reset/i.test(apply + helper), 'Không dùng prisma migrate reset');
check(!/drop\s+database|drop\s+table/i.test(apply + helper), 'Không có lệnh xóa database hoặc bảng');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
