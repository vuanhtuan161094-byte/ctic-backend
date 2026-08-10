require('dotenv/config');
const { getRuntimeDatabaseUrl, migrationChildEnv } = require('./lib/database-credentials-patch36c1a.cjs');

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_MIGRATION = '00000000000000_baseline';
const BASELINE_SQL = path.join(
  ROOT,
  'prisma',
  'migrations',
  BASELINE_MIGRATION,
  'migration.sql',
);
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const OPTIONAL_BASELINE_TABLES = new Set(['sysdiagrams']);

function fail(message, details) {
  console.error(`BASELINE ADOPTION: FAIL - ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function numberValue(value) {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCreateTableContract(sql) {
  const contract = new Map();
  const createRegex = /CREATE\s+TABLE\s+(?:\[?dbo\]?\.)?\[?([A-Za-z0-9_]+)\]?\s*\(/gi;
  let match;

  while ((match = createRegex.exec(sql))) {
    const table = normalize(match[1]);
    let index = createRegex.lastIndex;
    let depth = 1;
    let body = '';

    while (index < sql.length && depth > 0) {
      const ch = sql[index];
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth > 0) body += ch;
      index += 1;
    }

    const columns = new Set();
    let current = '';
    let innerDepth = 0;
    const clauses = [];

    for (const ch of body) {
      if (ch === '(') innerDepth += 1;
      if (ch === ')') innerDepth -= 1;
      if (ch === ',' && innerDepth === 0) {
        clauses.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) clauses.push(current);

    for (const clause of clauses) {
      const trimmed = clause.trim();
      const columnMatch = trimmed.match(/^\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+/);
      if (!columnMatch) continue;
      const token = normalize(columnMatch[1]);
      if (
        ['constraint', 'primary', 'unique', 'foreign', 'check', 'index'].includes(
          token,
        )
      ) {
        continue;
      }
      columns.add(token);
    }

    contract.set(table, columns);
    createRegex.lastIndex = index;
  }

  return contract;
}

async function readPhysicalSchema(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      LOWER(t.name) AS table_name,
      LOWER(c.name) AS column_name
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    INNER JOIN sys.columns c ON c.object_id = t.object_id
    WHERE s.name = N'dbo'
      AND t.is_ms_shipped = 0
    ORDER BY t.name, c.column_id;
  `);

  const result = new Map();
  for (const row of rows) {
    const table = normalize(row.table_name);
    const column = normalize(row.column_name);
    if (!result.has(table)) result.set(table, new Set());
    result.get(table).add(column);
  }
  return result;
}

async function readMigrationState(prisma) {
  const stateRows = await prisma.$queryRawUnsafe(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo._prisma_migrations', N'U') IS NULL THEN 0 ELSE 1 END AS migration_table_exists,
      (
        SELECT COUNT(*)
        FROM sys.tables t
        INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE s.name = N'dbo'
          AND t.is_ms_shipped = 0
          AND t.name <> N'_prisma_migrations'
      ) AS user_table_count;
  `);

  const state = stateRows[0] || {};
  const migrationTableExists = numberValue(state.migration_table_exists) === 1;
  const userTableCount = numberValue(state.user_table_count);

  if (!migrationTableExists) {
    return {
      migrationTableExists,
      userTableCount,
      rows: [],
    };
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at, logs
    FROM dbo._prisma_migrations
    ORDER BY started_at ASC;
  `);

  return {
    migrationTableExists,
    userTableCount,
    rows,
  };
}

function integerEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transientPrismaCliError(output) {
  return /\bP1001\b|\bP1002\b|\bP1017\b|ECONNRESET|ECONNREFUSED|ETIMEOUT|EINVALIDSTATE|Can't reach database server|Failed to connect/i.test(
    output,
  );
}

async function runResolveBaseline() {
  if (!fs.existsSync(PRISMA_CLI)) {
    fail(
      `Không tìm thấy Prisma CLI cục bộ: ${PRISMA_CLI}`,
      'Chạy npm install trước khi ổn định database.',
    );
  }

  const maxAttempts = integerEnv('DB_MIGRATION_MAX_ATTEMPTS', 6, 1, 20);
  const baseDelayMs = integerEnv('DB_MIGRATION_RETRY_DELAY_MS', 2500, 250, 60000);
  const maxDelayMs = integerEnv('DB_MIGRATION_MAX_RETRY_DELAY_MS', 15000, baseDelayMs, 120000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`Prisma migrate resolve baseline attempt ${attempt}/${maxAttempts}...`);
    const result = spawnSync(
      process.execPath,
      [PRISMA_CLI, 'migrate', 'resolve', '--applied', BASELINE_MIGRATION],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        shell: false,
        windowsHide: true,
        env: migrationChildEnv(process.env),
      },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error) {
      fail('Không thể chạy Prisma migrate resolve.', result.error.stack || result.error);
    }

    if (result.status === 0) return;

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const lower = output.toLowerCase();
    if (
      lower.includes('p3008') ||
      lower.includes('already recorded as applied') ||
      lower.includes('already been applied')
    ) {
      return;
    }

    if (!transientPrismaCliError(output) || attempt === maxAttempts) {
      fail(
        `Prisma migrate resolve thất bại (exit ${String(result.status)}).`,
        'Không chạy migrate reset/migrate dev trên database hiện hữu.',
      );
    }

    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    console.warn(`WARN: Kết nối SQL gián đoạn khi ghi baseline history. Thử lại sau ${delay} ms...`);
    await wait(delay);
  }
}

async function main() {
  const databaseUrl = getRuntimeDatabaseUrl();
  if (!fs.existsSync(BASELINE_SQL)) fail(`Thiếu baseline SQL: ${BASELINE_SQL}`);

  const baselineContract = parseCreateTableContract(
    fs.readFileSync(BASELINE_SQL, 'utf8'),
  );

  if (baselineContract.size < 10) {
    fail('Không đọc được contract baseline; dừng để tránh baseline nhầm database.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMssql(databaseUrl),
  });

  try {
    await prisma.$connect();
    const migrationState = await readMigrationState(prisma);

    console.log(`Database user tables: ${migrationState.userTableCount}`);
    console.log(
      `Prisma migration history: ${migrationState.migrationTableExists ? 'present' : 'absent'}`,
    );

    if (migrationState.userTableCount === 0) {
      console.log('Database trống: không baseline; Prisma Migrate sẽ tạo schema mới.');
      console.log('BASELINE ADOPTION: PASS (fresh database; migration credential will create schema)');
      return;
    }

    const appliedBaseline = migrationState.rows.find(
      (row) =>
        normalize(row.migration_name) === normalize(BASELINE_MIGRATION) &&
        row.finished_at &&
        !row.rolled_back_at,
    );

    if (appliedBaseline) {
      console.log(`Baseline ${BASELINE_MIGRATION} đã được ghi nhận.`);
      console.log('BASELINE ADOPTION: PASS (already adopted)');
      return;
    }

    const unfinished = migrationState.rows.filter(
      (row) => !row.finished_at && !row.rolled_back_at,
    );
    if (unfinished.length > 0) {
      fail(
        'Có migration đang lỗi/dang dở trước khi baseline.',
        unfinished.map((row) => `- ${row.migration_name}`).join('\n'),
      );
    }

    const successfulOther = migrationState.rows.filter(
      (row) =>
        normalize(row.migration_name) !== normalize(BASELINE_MIGRATION) &&
        row.finished_at &&
        !row.rolled_back_at,
    );
    if (successfulOther.length > 0) {
      fail(
        'Database đã có migration history khác nhưng thiếu baseline. Không tự viết lại lịch sử.',
        successfulOther.map((row) => `- ${row.migration_name}`).join('\n'),
      );
    }

    const physicalSchema = await readPhysicalSchema(prisma);
    const missingTables = [];
    const missingColumns = [];

    for (const [table, columns] of baselineContract.entries()) {
      if (OPTIONAL_BASELINE_TABLES.has(table)) continue;
      const actual = physicalSchema.get(table);
      if (!actual) {
        missingTables.push(`dbo.${table}`);
        continue;
      }
      for (const column of columns) {
        if (!actual.has(column)) missingColumns.push(`dbo.${table}.${column}`);
      }
    }

    if (missingTables.length > 0 || missingColumns.length > 0) {
      const details = [
        ...(missingTables.length
          ? [`Missing tables (${missingTables.length}): ${missingTables.slice(0, 25).join(', ')}`]
          : []),
        ...(missingColumns.length
          ? [
              `Missing baseline columns (${missingColumns.length}): ${missingColumns
                .slice(0, 40)
                .join(', ')}`,
            ]
          : []),
      ].join('\n');
      fail(
        'Database không khớp cấu trúc baseline tối thiểu; không được đánh dấu baseline tự động.',
        details,
      );
    }

    console.log(
      `Đã xác minh ${baselineContract.size - OPTIONAL_BASELINE_TABLES.size}+ bảng baseline và các cột lõi trên database hiện hữu.`,
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Đang ghi nhận baseline ${BASELINE_MIGRATION} bằng Prisma Migrate...`);
  await runResolveBaseline();
  console.log('BASELINE ADOPTION: PASS');
}

main().catch((error) => {
  fail('Baseline adoption phát sinh lỗi.', error?.stack || error?.message || String(error));
});
