const crypto = require('node:crypto');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');
const {
  getRuntimeDatabaseUrl,
  getMigrationDatabaseUrl,
  describeTarget,
  describePrincipal,
  migrationCredentialSource,
} = require('./lib/database-credentials-patch36c1a.cjs');

function fail(message, detail) {
  console.error(`MIGRATION CREDENTIALS: FAIL - ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function main() {
  let runtimeUrl;
  let migrationUrl;
  try {
    runtimeUrl = getRuntimeDatabaseUrl();
    migrationUrl = getMigrationDatabaseUrl();
  } catch (error) {
    fail(error.message || String(error));
  }

  console.log(`Runtime database target:   ${describeTarget(runtimeUrl)}`);
  console.log(`Migration database target: ${describeTarget(migrationUrl)}`);
  console.log(`Migration credential:      ${migrationCredentialSource()}`);
  console.log(`Migration principal:       ${describePrincipal(migrationUrl)}`);

  const prisma = new PrismaClient({ adapter: new PrismaMssql(migrationUrl) });
  const probe = `__cmp_migration_probe_${crypto.randomBytes(6).toString('hex')}`;

  try {
    await prisma.$connect();

    const identityRows = await prisma.$queryRawUnsafe(`
      SELECT
        ORIGINAL_LOGIN() AS original_login,
        SUSER_SNAME() AS login_name,
        USER_NAME() AS database_user,
        DB_NAME() AS database_name,
        ISNULL(IS_ROLEMEMBER(N'db_owner'), 0) AS is_db_owner,
        ISNULL(IS_ROLEMEMBER(N'db_ddladmin'), 0) AS is_db_ddladmin,
        ISNULL(IS_ROLEMEMBER(N'db_datareader'), 0) AS is_db_datareader,
        ISNULL(IS_ROLEMEMBER(N'db_datawriter'), 0) AS is_db_datawriter;
    `);

    const identity = identityRows[0] || {};
    console.log(
      `SQL identity: ${identity.login_name || identity.original_login || '<unknown>'} -> ${identity.database_user || '<unknown>'}`,
    );
    console.log(
      `Roles: owner=${Number(identity.is_db_owner || 0)}, ddladmin=${Number(identity.is_db_ddladmin || 0)}, datareader=${Number(identity.is_db_datareader || 0)}, datawriter=${Number(identity.is_db_datawriter || 0)}`,
    );

    await prisma.$executeRawUnsafe(`
      SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        CREATE TABLE dbo.[${probe}] (
          id INT NOT NULL,
          note NVARCHAR(50) NULL
        );
        ALTER TABLE dbo.[${probe}] ADD changed_at DATETIME2 NULL;
        CREATE INDEX IX_${probe}_id ON dbo.[${probe}](id);
        INSERT INTO dbo.[${probe}](id, note) VALUES (1, N'probe');
        UPDATE dbo.[${probe}] SET note = N'updated' WHERE id = 1;
        DELETE FROM dbo.[${probe}] WHERE id = 1;
        DROP TABLE dbo.[${probe}];
        ROLLBACK TRANSACTION;
      END TRY
      BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH;
    `);

    console.log('PASS: Migration credential can CREATE/ALTER/INDEX and perform migration DML.');
    console.log('MIGRATION CREDENTIALS: PASS');
  } catch (error) {
    const text = error?.message || String(error);
    if (/permission denied|permission|CREATE TABLE|ALTER TABLE/i.test(text)) {
      fail(
        'Tài khoản migration chưa đủ quyền DDL/DML để baseline/migrate.',
        'Production: cấu hình MIGRATION_DATABASE_URL bằng tài khoản triển khai riêng. Windows development: chạy STABILIZE_36C1A.cmd bằng Windows account có quyền quản trị database; script chỉ cấp role tạm thời rồi thu hồi.',
      );
    }
    fail('Không kiểm tra được tài khoản migration.', text);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));
