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

const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const lockPath = path.join(root, 'prisma', 'migrations', 'migration_lock.toml');
const normalizePath = path.join(root, 'scripts', 'normalize-prisma-migration-provider-patch35a42.cjs');
const applyPath = path.join(root, 'scripts', 'apply-patch35a42.cmd');

check(fs.existsSync(schemaPath), 'Có prisma/schema.prisma');
check(fs.existsSync(lockPath), 'Có prisma/migrations/migration_lock.toml');
check(fs.existsSync(normalizePath), 'Có script chuẩn hóa provider');
check(fs.existsSync(applyPath), 'Có script cài đặt Patch 35A.4.2');

const schema = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
const lock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : '';
const normalize = fs.existsSync(normalizePath) ? fs.readFileSync(normalizePath, 'utf8') : '';
const apply = fs.existsSync(applyPath) ? fs.readFileSync(applyPath, 'utf8') : '';

check(/provider\s*=\s*["'](?:sqlserver|mssql)["']/i.test(schema), 'Schema vẫn dùng SQL Server');
check(/provider\s*=\s*["']mssql["']/i.test(lock), 'Migration lock dùng provider mssql');
check(normalize.includes('before-patch35a42.bak'), 'Script sao lưu migration lock cũ');
check(!/rmdir\s+\/s\s+\/q\s+.*prisma\\migrations/i.test(apply), 'Không xóa thư mục lịch sử migration');
check(/prisma migrate deploy/i.test(apply), 'Script tiếp tục dùng migrate deploy');
check(/npm run build/i.test(apply), 'Script build backend sau migration');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
