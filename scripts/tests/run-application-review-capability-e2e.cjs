const { spawnSync } = require('node:child_process');
const { config: loadDotEnv } = require('dotenv');
const {
  EXPECTED_MIGRATIONS,
  createClient,
  enforceTestDatabaseOptions,
  parseSqlServerUrl,
  replaceDatabase,
} = require('./run-p09-real-e2e.cjs');

const TEST_DATABASE_NAME = 'CTIC_Certification_P09_test';

loadDotEnv({ path: '.env', override: false, quiet: true });

function fail(message) {
  throw new Error(`[APPLICATION REVIEW E2E SAFETY] ${message}`);
}

function testDatabaseUrl() {
  const explicit = String(process.env.TEST_DATABASE_URL || '').trim();
  const source = explicit || String(process.env.DATABASE_URL || '').trim();
  if (!source) fail('DATABASE_URL/TEST_DATABASE_URL is missing.');
  const result = explicit ? source : replaceDatabase(source, TEST_DATABASE_NAME);
  const target = parseSqlServerUrl(result);
  if (target.database !== TEST_DATABASE_NAME || !target.database.toLowerCase().endsWith('_test')) {
    fail(`Refusing non-test database ${target.database || '<missing>'}.`);
  }
  return result;
}

function runNpm(args, env) {
  const npmCli = String(process.env.npm_execpath || '').trim();
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`npm ${args.join(' ')} exited with ${result.status}.`);
}


const FAILED_TAX_MIGRATION = '20260812223000_customer_tax_code_filtered_unique';

async function recoverFailedTaxMigration(testUrl, childEnv) {
  const prisma = createClient(testUrl);
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, migration_name, finished_at, rolled_back_at, applied_steps_count
       FROM dbo._prisma_migrations
       WHERE migration_name = N'${FAILED_TAX_MIGRATION}'
       ORDER BY started_at DESC`,
    );
    const failed = rows.filter(
      (row) => row.finished_at == null && row.rolled_back_at == null,
    );
    if (failed.length === 0) return;
    if (failed.length !== 1 || Number(failed[0]?.applied_steps_count || 0) !== 0) {
      fail(`Unexpected failed history for ${FAILED_TAX_MIGRATION}; refusing automatic recovery.`);
    }

    const filteredIndex = await prisma.$queryRawUnsafe(`
      SELECT name
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.customers')
        AND name = N'UQ_customers_tax_code_not_null';
    `);
    const oldConstraint = await prisma.$queryRawUnsafe(`
      SELECT kc.name
      FROM sys.key_constraints AS kc
      INNER JOIN sys.index_columns AS ic
        ON ic.object_id = kc.parent_object_id
        AND ic.index_id = kc.unique_index_id
      INNER JOIN sys.columns AS c
        ON c.object_id = ic.object_id
        AND c.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID(N'dbo.customers')
        AND kc.type = N'UQ'
        AND c.name = N'tax_code';
    `);
    if (filteredIndex.length !== 0 || oldConstraint.length !== 1) {
      fail(
        `${FAILED_TAX_MIGRATION} may have left partial schema changes; refusing automatic recovery.`,
      );
    }
    console.log(
      `Confirmed failed ${FAILED_TAX_MIGRATION} left no committed partial Tax ID index changes.`,
    );
  } finally {
    await prisma.$disconnect();
  }

  runNpm(
    [
      'exec',
      'prisma',
      '--',
      'migrate',
      'resolve',
      '--rolled-back',
      FAILED_TAX_MIGRATION,
    ],
    childEnv,
  );
  console.log(`Failed test migration ${FAILED_TAX_MIGRATION} marked rolled back: PASS.`);
}

async function verifyMigration(testUrl) {
  const prisma = createClient(testUrl);
  try {
    const current = await prisma.$queryRawUnsafe('SELECT DB_NAME() AS database_name');
    if (String(current[0]?.database_name) !== TEST_DATABASE_NAME) fail('Connected to unexpected database.');
    const migrations = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM dbo._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at',
    );
    const migrationNames = migrations.map((row) => String(row.migration_name));
    if (
      migrationNames.length !== EXPECTED_MIGRATIONS.length ||
      migrationNames.some((name, index) => name !== EXPECTED_MIGRATIONS[index])
    ) {
      fail(
        `Expected canonical ${EXPECTED_MIGRATIONS.length} completed migrations, found ${migrationNames.join(', ') || 'none'}.`,
      );
    }

    const objects = await prisma.$queryRawUnsafe(`
      SELECT
        OBJECT_ID(N'dbo.certification_body_capabilities', N'U') AS capability_table,
        OBJECT_ID(N'dbo.application_review_capability_snapshots', N'U') AS snapshot_table,
        COL_LENGTH(N'dbo.contracts', N'currency') AS contract_currency,
        COL_LENGTH(N'dbo.customers', N'country_code') AS customer_country_code,
        COL_LENGTH(N'dbo.customers', N'country_name') AS customer_country_name,
        COL_LENGTH(N'dbo.application_reviews', N'ems_complexity') AS review_ems_complexity,
        COL_LENGTH(N'dbo.application_reviews', N'ohsms_complexity') AS review_ohsms_complexity,
        COL_LENGTH(N'dbo.application_review_capability_snapshots', N'approval_version') AS snapshot_approval_version;
    `);
    if (
      !objects[0]?.capability_table ||
      !objects[0]?.snapshot_table ||
      objects[0]?.contract_currency == null ||
      objects[0]?.customer_country_code == null ||
      objects[0]?.customer_country_name == null ||
      objects[0]?.review_ems_complexity == null ||
      objects[0]?.review_ohsms_complexity == null ||
      objects[0]?.snapshot_approval_version == null
    ) {
      fail('Migration physical objects are incomplete.');
    }
    const expectedIndexes = [
      // Migration 32 replaces the old program-only key with edition/legacy keys.
      'UQ_cb_capability_standard_iaf',
      'UQ_cb_capability_legacy_program_iaf',
      'IX_certification_body_capability_standard_iaf',
      'IX_certification_body_capability_status_dates',
      'IX_certification_body_capability_iaf',
      'IX_certification_body_capability_created_by',
      'IX_certification_body_capability_updated_by',
      'UQ_application_review_capability_snapshot_version_pair',
      'IX_application_review_capability_snapshot_review_version',
      'IX_application_review_capability_snapshot_review_result',
      'IX_application_review_capability_snapshot_capability',
      'IX_application_review_capability_snapshot_evaluator',
      'UQ_customers_tax_code_not_null',
    ];
    const expectedForeignKeys = [
      'FK_certification_body_capabilities_iaf_scope',
      'FK_certification_body_capabilities_created_by',
      'FK_certification_body_capabilities_updated_by',
      'FK_application_review_capability_snapshots_review',
      'FK_application_review_capability_snapshots_capability',
      'FK_application_review_capability_snapshots_evaluator',
    ];
    const indexes = await prisma.$queryRawUnsafe(
      `SELECT name FROM sys.indexes WHERE name IN (${expectedIndexes.map((name) => `N'${name}'`).join(', ')})`,
    );
    const foreignKeys = await prisma.$queryRawUnsafe(
      `SELECT name FROM sys.foreign_keys WHERE name IN (${expectedForeignKeys.map((name) => `N'${name}'`).join(', ')})`,
    );
    if (indexes.length !== expectedIndexes.length) {
      fail(`Expected ${expectedIndexes.length} migration indexes, found ${indexes.length}.`);
    }
    if (foreignKeys.length !== expectedForeignKeys.length) {
      fail(`Expected ${expectedForeignKeys.length} migration foreign keys, found ${foreignKeys.length}.`);
    }

    const retiredIndexes = await prisma.$queryRawUnsafe(
      `SELECT name FROM sys.indexes WHERE name = N'UQ_application_review_capability_snapshot_pair'`,
    );
    if (retiredIndexes.length !== 0) {
      fail('Retired snapshot unique index is still present after migration 8.');
    }

    const taxIndex = await prisma.$queryRawUnsafe(`
      SELECT name, has_filter, filter_definition
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.customers')
        AND name = N'UQ_customers_tax_code_not_null';
    `);
    if (
      taxIndex.length !== 1 ||
      Number(taxIndex[0]?.has_filter) !== 1 ||
      !String(taxIndex[0]?.filter_definition || '').toLowerCase().includes('tax_code') ||
      !String(taxIndex[0]?.filter_definition || '').toLowerCase().includes('is not null')
    ) {
      fail('Filtered unique Tax ID index is missing or incorrectly configured.');
    }

    console.log(
      `Application Review test database migration contract: ${EXPECTED_MIGRATIONS.length}/${EXPECTED_MIGRATIONS.length} PASS.`,
    );
    console.log(
      `Application Review indexes/FKs: ${indexes.length}/${expectedIndexes.length} indexes, ${foreignKeys.length}/${expectedForeignKeys.length} FKs PASS.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const testUrl = testDatabaseUrl();
  const childEnv = {
    ...process.env,
    DATABASE_URL: testUrl,
    MIGRATION_DATABASE_URL: testUrl,
    TEST_DATABASE_URL: testUrl,
    NODE_ENV: 'test',
    CMP_DATABASE_CONNECTION_ROLE: 'migration',
  };
  console.log(`Application Review E2E target: ${TEST_DATABASE_NAME}`);
  await enforceTestDatabaseOptions(testUrl);
  if (!process.argv.includes('--e2e-only')) {
    await recoverFailedTaxMigration(testUrl, childEnv);
    runNpm(['exec', 'prisma', '--', 'migrate', 'deploy'], childEnv);
  }
  await verifyMigration(testUrl);
  runNpm(['run', 'db:contract'], childEnv);
  for (let run = 1; run <= 2; run += 1) {
    console.log(`Application Review + CB Capability E2E run ${run}/2...`);
    runNpm([
      'run', 'test:e2e', '--', 'application-review-cb-capability.e2e-spec.ts', 'import-integrity.e2e-spec.ts', '--runInBand',
    ], childEnv);
  }
  console.log('Application Review + CB Capability E2E repeatability: 2/2 PASS.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
