require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_MIGRATION = '00000000000000_baseline';
const BASELINE_DIR = path.join(ROOT, 'prisma', 'migrations', BASELINE_MIGRATION);
const BASELINE_SQL = path.join(BASELINE_DIR, 'migration.sql');
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');

function numberValue(value) {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fail(message, details) {
  console.error(`ERROR: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function assertBaselineFiles() {
  if (!fs.existsSync(BASELINE_DIR)) {
    fail(`Không tìm thấy thư mục migration baseline: ${BASELINE_DIR}`);
  }
  if (!fs.existsSync(BASELINE_SQL)) {
    fail(`Không tìm thấy file migration baseline: ${BASELINE_SQL}`);
  }
  if (!fs.existsSync(PRISMA_CLI)) {
    fail(
      `Không tìm thấy Prisma CLI cục bộ: ${PRISMA_CLI}.`,
      'Hãy chạy npm install hoặc kiểm tra thư mục node_modules trước khi tiếp tục.',
    );
  }
}

function runResolveBaseline() {
  assertBaselineFiles();

  console.log(`Đang đánh dấu baseline bằng Prisma CLI cục bộ: ${BASELINE_MIGRATION}`);

  // Không gọi npx.cmd bằng child_process vì trên một số máy Windows lệnh .cmd
  // không khởi chạy được với shell:false và chỉ trả status=null/ENOENT.
  // Gọi trực tiếp file JavaScript của Prisma bằng chính Node đang chạy.
  const result = spawnSync(
    process.execPath,
    [PRISMA_CLI, 'migrate', 'resolve', '--applied', BASELINE_MIGRATION],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
      env: process.env,
      windowsHide: true,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    fail(
      `Không thể khởi chạy Prisma CLI để baseline ${BASELINE_MIGRATION}.`,
      result.error.stack || result.error.message || String(result.error),
    );
  }

  if (result.status === 0) {
    console.log(`Đã baseline migration: ${BASELINE_MIGRATION}`);
    return;
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.toLowerCase();
  if (
    output.includes('p3008') ||
    output.includes('already recorded as applied') ||
    output.includes('already been applied')
  ) {
    console.log(`Migration ${BASELINE_MIGRATION} đã được baseline trước đó; tiếp tục.`);
    return;
  }

  fail(
    `Prisma migrate resolve trả mã lỗi ${String(result.status)} khi baseline ${BASELINE_MIGRATION}.`,
    'Toàn bộ stdout/stderr của Prisma đã được in ngay phía trên.',
  );
}

async function readDatabaseState(prisma) {
  const databaseState = await prisma.$queryRawUnsafe(`
    SELECT
      (
        SELECT COUNT(*)
        FROM sys.tables
        WHERE is_ms_shipped = 0
          AND [name] <> N'_prisma_migrations'
      ) AS user_table_count,
      CASE
        WHEN OBJECT_ID(N'[dbo].[_prisma_migrations]', N'U') IS NULL THEN 0
        ELSE 1
      END AS migration_table_exists;
  `);

  const state = Array.isArray(databaseState) ? databaseState[0] : null;
  const userTableCount = numberValue(state?.user_table_count);
  const migrationTableExists = numberValue(state?.migration_table_exists) === 1;

  let migrationHistoryCount = 0;
  let baselineAppliedCount = 0;

  if (migrationTableExists) {
    const migrationState = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS migration_history_count,
        SUM(
          CASE
            WHEN [migration_name] = N'${BASELINE_MIGRATION}'
              AND [finished_at] IS NOT NULL
              AND [rolled_back_at] IS NULL
            THEN 1
            ELSE 0
          END
        ) AS baseline_applied_count
      FROM [dbo].[_prisma_migrations];
    `);

    const history = Array.isArray(migrationState) ? migrationState[0] : null;
    migrationHistoryCount = numberValue(history?.migration_history_count);
    baselineAppliedCount = numberValue(history?.baseline_applied_count);
  }

  return {
    userTableCount,
    migrationTableExists,
    migrationHistoryCount,
    baselineAppliedCount,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('Thiếu biến môi trường DATABASE_URL trong file .env.');
  }

  assertBaselineFiles();

  const prisma = new PrismaClient({
    adapter: new PrismaMssql(databaseUrl),
  });

  let state;
  try {
    await prisma.$connect();
    state = await readDatabaseState(prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Số bảng nghiệp vụ hiện có: ${state.userTableCount}`);
  console.log(`Có bảng _prisma_migrations: ${state.migrationTableExists ? 'Có' : 'Không'}`);

  if (state.userTableCount === 0) {
    console.log('Cơ sở dữ liệu đang trống; không baseline. migrate deploy sẽ tạo toàn bộ schema.');
    return;
  }

  if (state.baselineAppliedCount > 0) {
    console.log(`Baseline ${BASELINE_MIGRATION} đã được ghi nhận; không thay đổi lịch sử.`);
    return;
  }

  if (state.migrationTableExists && state.migrationHistoryCount > 0) {
    fail(
      'Cơ sở dữ liệu đã có lịch sử migration khác nhưng chưa có baseline của dự án. ' +
        'Dừng để tránh sửa nhầm lịch sử migration.',
    );
  }

  console.log('Cơ sở dữ liệu đã có dữ liệu nhưng chưa có lịch sử Prisma. Bắt đầu baseline an toàn...');
  runResolveBaseline();
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
