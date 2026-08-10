require('dotenv/config');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

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

    await prisma.$executeRawUnsafe(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      IF OBJECT_ID(N'dbo.document_files', N'U') IS NULL
      BEGIN
        THROW 51001, 'Thiếu bảng dbo.document_files; không thể tự sửa an toàn.', 1;
      END;

      IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
      BEGIN
        THROW 51002, 'Thiếu bảng dbo.audit_logs; không thể tự sửa an toàn.', 1;
      END;

      IF COL_LENGTH(N'dbo.document_files', N'sha256') IS NULL
      BEGIN
        ALTER TABLE dbo.document_files
          ADD sha256 NVARCHAR(64) NULL;
      END;

      IF COL_LENGTH(N'dbo.audit_logs', N'request_id') IS NULL
      BEGIN
        ALTER TABLE dbo.audit_logs
          ADD request_id NVARCHAR(100) NULL;
      END;

      IF COL_LENGTH(N'dbo.audit_logs', N'outcome') IS NULL
      BEGIN
        ALTER TABLE dbo.audit_logs
          ADD outcome NVARCHAR(20) NULL;
      END;

      IF COL_LENGTH(N'dbo.audit_logs', N'status_code') IS NULL
      BEGIN
        ALTER TABLE dbo.audit_logs
          ADD status_code INT NULL;
      END;

      IF COL_LENGTH(N'dbo.audit_logs', N'duration_ms') IS NULL
      BEGIN
        ALTER TABLE dbo.audit_logs
          ADD duration_ms INT NULL;
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
          AND name = N'IX_audit_logs_request_id'
      )
      BEGIN
        CREATE INDEX IX_audit_logs_request_id
          ON dbo.audit_logs(request_id);
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
          AND name = N'IX_audit_logs_outcome_created'
      )
      BEGIN
        CREATE INDEX IX_audit_logs_outcome_created
          ON dbo.audit_logs(outcome, created_at DESC);
      END;

      COMMIT TRANSACTION;
    `);

    console.log('Critical database schema repaired/verified successfully.');
  } catch (error) {
    try {
      await prisma.$executeRawUnsafe(`
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
      `);
    } catch {
      // Ignore rollback cleanup failure; original error is more useful.
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
