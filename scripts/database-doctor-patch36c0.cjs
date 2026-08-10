require('dotenv/config');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function yes(value) {
  return Number(value ?? 0) === 1;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL trong .env');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMssql(databaseUrl),
  });

  try {
    await prisma.$connect();

    const info = await prisma.$queryRawUnsafe(`
      SELECT
        DB_NAME() AS database_name,
        CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(100)) AS server_version,
        CASE WHEN OBJECT_ID(N'dbo.document_files', N'U') IS NULL THEN 0 ELSE 1 END AS document_files_table,
        CASE WHEN OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL THEN 0 ELSE 1 END AS audit_logs_table,
        CASE WHEN OBJECT_ID(N'dbo._prisma_migrations', N'U') IS NULL THEN 0 ELSE 1 END AS prisma_migrations_table,
        CASE WHEN COL_LENGTH(N'dbo.document_files', N'sha256') IS NULL THEN 0 ELSE 1 END AS document_files_sha256,
        CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'request_id') IS NULL THEN 0 ELSE 1 END AS audit_logs_request_id,
        CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'outcome') IS NULL THEN 0 ELSE 1 END AS audit_logs_outcome,
        CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'status_code') IS NULL THEN 0 ELSE 1 END AS audit_logs_status_code,
        CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'duration_ms') IS NULL THEN 0 ELSE 1 END AS audit_logs_duration_ms,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
            AND name = N'IX_audit_logs_request_id'
        ) THEN 1 ELSE 0 END AS ix_audit_logs_request_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
            AND name = N'IX_audit_logs_outcome_created'
        ) THEN 1 ELSE 0 END AS ix_audit_logs_outcome_created;
    `);

    const row = info[0] || {};
    console.log(`Database: ${row.database_name ?? '(unknown)'}`);
    console.log(`SQL Server: ${row.server_version ?? '(unknown)'}`);

    const required = [
      ['Bảng dbo.document_files', row.document_files_table],
      ['Bảng dbo.audit_logs', row.audit_logs_table],
      ['Cột dbo.document_files.sha256', row.document_files_sha256],
      ['Cột dbo.audit_logs.request_id', row.audit_logs_request_id],
      ['Cột dbo.audit_logs.outcome', row.audit_logs_outcome],
      ['Cột dbo.audit_logs.status_code', row.audit_logs_status_code],
      ['Cột dbo.audit_logs.duration_ms', row.audit_logs_duration_ms],
    ];

    let hasError = false;
    for (const [label, value] of required) {
      if (yes(value)) {
        console.log(`PASS: ${label}`);
      } else {
        console.error(`FAIL: ${label}`);
        hasError = true;
      }
    }

    const indexes = [
      ['Index IX_audit_logs_request_id', row.ix_audit_logs_request_id],
      ['Index IX_audit_logs_outcome_created', row.ix_audit_logs_outcome_created],
    ];

    for (const [label, value] of indexes) {
      if (yes(value)) {
        console.log(`PASS: ${label}`);
      } else {
        console.warn(`WARN: ${label} chưa có`);
      }
    }

    if (yes(row.prisma_migrations_table)) {
      const migrations = await prisma.$queryRawUnsafe(`
        SELECT
          migration_name,
          finished_at,
          rolled_back_at,
          logs
        FROM dbo._prisma_migrations
        ORDER BY started_at ASC;
      `);

      const failed = migrations.filter(
        (item) => !item.finished_at && !item.rolled_back_at,
      );

      console.log(`Prisma migrations recorded: ${migrations.length}`);
      if (failed.length > 0) {
        hasError = true;
        console.error(
          `FAIL: Có ${failed.length} migration chưa hoàn tất: ${failed.map((item) => item.migration_name).join(', ')}`,
        );
      } else {
        console.log('PASS: Không có migration Prisma đang lỗi/dang dở');
      }
    } else {
      console.warn('WARN: Chưa có bảng _prisma_migrations');
    }

    if (hasError) {
      fail('Database chưa tương thích với source hiện tại. Chạy: npm run db:stabilize');
      return;
    }

    console.log('DATABASE DOCTOR: PASS');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
