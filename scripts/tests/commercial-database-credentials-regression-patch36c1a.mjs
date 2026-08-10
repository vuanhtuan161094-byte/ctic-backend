import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const helper = read('scripts/lib/database-credentials-patch36c1a.cjs');
const migrationPreflight = read('scripts/migration-credentials-preflight-patch36c1a.cjs');
const adopt = read('scripts/adopt-existing-database-patch36c1a.cjs');
const migrate = read('scripts/migrate-with-retry-patch36c1a.cjs');
const dbStabilize = read('scripts/database-stabilize-patch36c1a.cjs');
const commercial = read('scripts/commercial-stabilize-patch36c1a.cjs');
const ps1 = read('scripts/stabilize-windows-patch36c1a.ps1');
const runtimePermissions = read('scripts/runtime-database-permissions-patch36c1a.cjs');
const deployment = read('SINGLE_ORGANIZATION_DEPLOYMENT_36C1A.md');
const envExample = read('.env.migration.example');
const gitignore = read('.gitignore');
const pkg = JSON.parse(read('package.json'));
const prismaConfig = read('prisma.config.ts');
const baseline = read('prisma/migrations/00000000000000_baseline/migration.sql');
const c1 = read('prisma/migrations/20260810120000_patch36c1_legacy_schema_consolidation/migration.sql');

check(fs.existsSync(path.join(root, '.env.migration.example')), 'Có mẫu cấu hình migration credential riêng');
check(gitignore.includes('.env.migration'), '.env.migration bị loại khỏi Git');
check(/MIGRATION_DATABASE_URL/.test(envExample) && !/password=\{?[^C\n]*[A-Za-z0-9]{8}/i.test(envExample), 'Mẫu migration URL không chứa mật khẩu thật');
check(/MIGRATION_DATABASE_URL/.test(helper) && /DATABASE_URL/.test(helper), 'Helper tách runtime URL và migration URL');
check(/MIGRATION_DATABASE_URL/.test(prismaConfig) && /migrationEnvPath/.test(prismaConfig), 'Prisma CLI tự ưu tiên .env.migration khi được cấu hình');
check(/sameTarget/.test(helper) && /migrate nhầm database/.test(helper), 'Migration credential bị chặn nếu trỏ khác database runtime');
check(/ALLOW_RUNTIME_MIGRATION_CREDENTIALS/.test(helper), 'Runtime credential chỉ được dùng cho migration khi bật explicit temporary fallback');
check(/migrationChildEnv/.test(adopt), 'Baseline resolve chạy bằng migration credential');
check(/migrationChildEnv/.test(migrate), 'migrate deploy chạy bằng migration credential');
check(/migration-credentials-preflight-patch36c1a/.test(dbStabilize), 'Database stabilizer kiểm migration credential trước khi baseline');
check(/repair-critical-schema-patch36c0/.test(dbStabilize) && /migration: true/.test(dbStabilize), 'Safety repair dùng migration credential thay vì runtime credential');
check(/CREATE TABLE/.test(migrationPreflight) && /ALTER TABLE/.test(migrationPreflight) && /CREATE INDEX/.test(migrationPreflight), 'Migration preflight thử DDL thực tế trong transaction');
check(/INSERT INTO/.test(migrationPreflight) && /UPDATE/.test(migrationPreflight) && /DELETE FROM/.test(migrationPreflight), 'Migration preflight thử DML cần cho data migration');
check(/ROLLBACK TRANSACTION/.test(migrationPreflight), 'Migration preflight dọn probe bằng transaction rollback');
check(!/password/i.test(migrationPreflight.split('console.log').slice(1).join('console.log')), 'Migration preflight không log password');
check(/db_ddladmin/.test(ps1) && /db_datareader/.test(ps1) && /db_datawriter/.test(ps1), 'Windows dev chỉ cấp các role migration cần thiết');
check(!/ALTER ROLE \[db_owner\] ADD MEMBER/i.test(ps1), 'Windows dev không cấp db_owner');
check(/finally/.test(ps1) && /DROP MEMBER/.test(ps1), 'Quyền migration tạm thời luôn được thu hồi trong finally');
check(/nodeEnv.*production/.test(ps1) && /Production không cho phép/.test(ps1), 'Production cấm cơ chế nâng quyền runtime tạm thời');
check(/db_owner/.test(runtimePermissions) && /db_ddladmin/.test(runtimePermissions) && /--strict/.test(runtimePermissions), 'Có runtime permission guard cho production');
check(/1 installation = 1 certification body/i.test(commercial), 'Commercial stabilizer chốt mô hình một tổ chức chứng nhận mỗi bản cài');
check(/một tổ chức chứng nhận duy nhất/i.test(deployment) && /1 application\/backend riêng/.test(deployment), 'Tài liệu triển khai chốt single-organization với app/database/storage riêng');
check(/00000000000000_baseline/.test(adopt), 'Baseline adoption vẫn chỉ dùng baseline gốc');
check(!/['"]migrate['"]\s*,\s*['"]reset['"]/.test(adopt + migrate + dbStabilize + commercial), 'Luồng commercial không thực thi prisma migrate reset');
check(/CREATE TABLE/.test(baseline) && /SET XACT_ABORT ON/.test(c1), 'Giữ baseline gốc và migration consolidation 36C.1');
check(pkg.scripts['db:migration-permissions']?.includes('patch36c1a'), 'package.json có migration permission preflight');
check(pkg.scripts['db:runtime-permissions']?.includes('patch36c1a'), 'package.json có runtime permission audit');
check(pkg.scripts['db:adopt-existing']?.includes('patch36c1a'), 'package.json dùng baseline adoption 36C.1a');
check(pkg.scripts['db:migrate:retry']?.includes('patch36c1a'), 'package.json dùng migrate retry 36C.1a');
check(pkg.scripts['db:stabilize']?.includes('patch36c1a'), 'package.json dùng database stabilizer 36C.1a');
check(pkg.scripts['stabilize:commercial']?.includes('patch36c1a'), 'package.json dùng commercial stabilizer 36C.1a');
check(fs.existsSync(path.join(root, 'STABILIZE_36C1A.cmd')) && fs.existsSync(path.join(root, 'STABILIZE_36C1A.sh')), 'Có entrypoint Windows và Linux/macOS');

console.log(`\nPatch 36C.1a commercial DB credential regression: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
