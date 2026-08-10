const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');
const {
  getRuntimeDatabaseUrl,
  describeTarget,
  describePrincipal,
} = require('./lib/database-credentials-patch36c1a.cjs');

const strict = process.argv.includes('--strict') || process.env.NODE_ENV === 'production';

async function main() {
  const url = getRuntimeDatabaseUrl();
  const prisma = new PrismaClient({ adapter: new PrismaMssql(url) });
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        ISNULL(IS_ROLEMEMBER(N'db_owner'), 0) AS is_db_owner,
        ISNULL(IS_ROLEMEMBER(N'db_ddladmin'), 0) AS is_db_ddladmin,
        ISNULL(IS_ROLEMEMBER(N'db_datareader'), 0) AS is_db_datareader,
        ISNULL(IS_ROLEMEMBER(N'db_datawriter'), 0) AS is_db_datawriter,
        HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CREATE TABLE') AS can_create_table;
    `);
    const row = rows[0] || {};
    const hasDdl =
      Number(row.is_db_owner || 0) === 1 ||
      Number(row.is_db_ddladmin || 0) === 1 ||
      Number(row.can_create_table || 0) === 1;

    console.log(`Runtime DB target:    ${describeTarget(url)}`);
    console.log(`Runtime DB principal: ${describePrincipal(url)}`);
    console.log(
      `Runtime roles: owner=${Number(row.is_db_owner || 0)}, ddladmin=${Number(row.is_db_ddladmin || 0)}, datareader=${Number(row.is_db_datareader || 0)}, datawriter=${Number(row.is_db_datawriter || 0)}`,
    );

    if (hasDdl) {
      const message = 'Runtime database account still has DDL/owner privilege. Commercial production should keep schema-change rights on the migration account only.';
      if (strict) {
        console.error(`RUNTIME DB PERMISSIONS: FAIL - ${message}`);
        process.exitCode = 1;
        return;
      }
      console.warn(`WARN: ${message}`);
    }

    console.log('RUNTIME DB PERMISSIONS: PASS');
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
