const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const lockPath = path.join(root, 'prisma', 'migrations', 'migration_lock.toml');
const backupPath = `${lockPath}.before-patch35a42.bak`;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  fail(`Không tìm thấy schema Prisma: ${schemaPath}`);
}

const schema = fs.readFileSync(schemaPath, 'utf8');
const datasourceMatch = schema.match(/datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*["']([^"']+)["']/i);
if (!datasourceMatch) {
  fail('Không xác định được datasource provider trong prisma/schema.prisma.');
}

const schemaProvider = datasourceMatch[1].trim().toLowerCase();
if (!['sqlserver', 'mssql'].includes(schemaProvider)) {
  fail(`Patch 35A.4.2 chỉ áp dụng cho SQL Server; provider hiện tại là "${schemaProvider}".`);
}

// Prisma CLI 7.8 reports the normalized SQL Server provider as "mssql" in P3019.
// migration_lock.toml must use that exact normalized value.
const expectedLockProvider = 'mssql';

fs.mkdirSync(path.dirname(lockPath), { recursive: true });
if (fs.existsSync(lockPath) && !fs.existsSync(backupPath)) {
  fs.copyFileSync(lockPath, backupPath);
}

const nextContent = [
  '# Generated/normalized by Patch 35A.4.2.',
  '# SQL Server datasource in schema.prisma may be written as "sqlserver";',
  '# Prisma Migrate 7.8 compares migration history using the normalized name "mssql".',
  `provider = "${expectedLockProvider}"`,
  '',
].join('\n');

fs.writeFileSync(lockPath, nextContent, 'utf8');

const written = fs.readFileSync(lockPath, 'utf8');
if (!new RegExp(`provider\\s*=\\s*["']${expectedLockProvider}["']`, 'i').test(written)) {
  fail('Không ghi được provider mssql vào migration_lock.toml.');
}

console.log(`Schema datasource provider: ${schemaProvider}`);
console.log(`Migration lock provider: ${expectedLockProvider}`);
console.log('Đã đồng bộ migration_lock.toml; không xóa lịch sử migration.');
if (fs.existsSync(backupPath)) {
  console.log(`Bản sao lock cũ: ${path.relative(root, backupPath)}`);
}
