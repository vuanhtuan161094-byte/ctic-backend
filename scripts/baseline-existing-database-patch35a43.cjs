require('dotenv/config');

const { spawnSync } = require('node:child_process');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

const BASELINE_MIGRATION = '00000000000000_baseline';

function numberValue(value) {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function runResolveBaseline() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    command,
    ['prisma', 'migrate', 'resolve', '--applied', BASELINE_MIGRATION],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

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

  fail(`Không thể đánh dấu baseline ${BASELINE_MIGRATION}.`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('Thiếu biến môi trường DATABASE_URL trong file .env.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMssql(databaseUrl),
  });

  let userTableCount = 0;
  let migrationTableExists = false;
  let migrationHistoryCount = 0;
  let baselineAppliedCount = 0;

  try {
    await prisma.$connect();

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
    userTableCount = numberValue(state?.user_table_count);
    migrationTableExists = numberValue(state?.migration_table_exists) === 1;

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
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Số bảng nghiệp vụ hiện có: ${userTableCount}`);
  console.log(`Có bảng _prisma_migrations: ${migrationTableExists ? 'Có' : 'Không'}`);

  if (userTableCount === 0) {
    console.log('Cơ sở dữ liệu đang trống; không baseline. migrate deploy sẽ tạo toàn bộ schema.');
    return;
  }

  if (baselineAppliedCount > 0) {
    console.log(`Baseline ${BASELINE_MIGRATION} đã được ghi nhận; không thay đổi lịch sử.`);
    return;
  }

  if (migrationTableExists && migrationHistoryCount > 0) {
    fail(
      'Cơ sở dữ liệu đã có lịch sử migration khác nhưng chưa có baseline của dự án. ' +
        'Dừng để tránh sửa nhầm lịch sử migration.',
    );
  }

  console.log('Cơ sở dữ liệu đã có dữ liệu nhưng chưa có lịch sử Prisma. Bắt đầu baseline an toàn...');
  runResolveBaseline();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
