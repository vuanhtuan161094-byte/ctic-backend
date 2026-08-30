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
  throw new Error(`[SURVEILLANCE INFORMATION E2E SAFETY] ${message}`);
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
    cwd: process.cwd(), env, stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`npm ${args.join(' ')} exited with ${result.status}.`);
}

async function verifyMigration(testUrl) {
  const prisma = createClient(testUrl);
  try {
    const current = await prisma.$queryRawUnsafe('SELECT DB_NAME() AS database_name');
    if (String(current[0]?.database_name) !== TEST_DATABASE_NAME) fail('Connected to unexpected database.');
    const migrations = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM dbo._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at',
    );
    const names = migrations.map((row) => String(row.migration_name));
    if (
      names.length !== EXPECTED_MIGRATIONS.length ||
      names.some((name, index) => name !== EXPECTED_MIGRATIONS[index])
    ) {
      fail(`Expected canonical ${EXPECTED_MIGRATIONS.length} migrations, found ${names.join(', ') || 'none'}.`);
    }

    const table = await prisma.$queryRawUnsafe(`
      SELECT OBJECT_ID(N'dbo.surveillance_information_snapshots', N'U') AS object_id;
    `);
    if (!table[0]?.object_id) fail('dbo.surveillance_information_snapshots is missing.');

    const expectedIndexes = [
      'UQ_surveillance_information_event_version',
      'IX_surveillance_information_project_status',
      'IX_surveillance_information_event_status',
      'IX_surveillance_information_source',
      'IX_surveillance_information_confirmed_at',
    ];
    const expectedForeignKeys = [
      'FK_surveillance_information_project',
      'FK_surveillance_information_event',
      'FK_surveillance_information_prepared_by',
      'FK_surveillance_information_confirmed_by',
    ];
    const indexes = await prisma.$queryRawUnsafe(
      `SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.surveillance_information_snapshots') AND name IN (${expectedIndexes.map((name) => `N'${name}'`).join(', ')})`,
    );
    const fks = await prisma.$queryRawUnsafe(
      `SELECT name FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID(N'dbo.surveillance_information_snapshots') AND name IN (${expectedForeignKeys.map((name) => `N'${name}'`).join(', ')})`,
    );
    if (indexes.length !== expectedIndexes.length) fail(`Expected ${expectedIndexes.length} snapshot indexes, found ${indexes.length}.`);
    if (fks.length !== expectedForeignKeys.length) fail(`Expected ${expectedForeignKeys.length} snapshot FKs, found ${fks.length}.`);

    console.log(`Surveillance snapshot migration contract: ${EXPECTED_MIGRATIONS.length}/${EXPECTED_MIGRATIONS.length} migrations PASS.`);
    console.log(`Surveillance snapshot indexes/FKs: ${indexes.length}/${expectedIndexes.length} indexes, ${fks.length}/${expectedForeignKeys.length} FKs PASS.`);
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
  console.log(`Surveillance Information E2E target: ${TEST_DATABASE_NAME}`);
  await enforceTestDatabaseOptions(testUrl);
  if (!process.argv.includes('--e2e-only')) {
    runNpm(['exec', 'prisma', '--', 'migrate', 'deploy'], childEnv);
    runNpm(['run', 'prisma:generate'], childEnv);
  }
  await verifyMigration(testUrl);
  for (let run = 1; run <= 2; run += 1) {
    console.log(`Surveillance Information Snapshot E2E run ${run}/2...`);
    runNpm(['run', 'test:e2e', '--', 'surveillance-information-snapshot.e2e-spec.ts', '--runInBand'], childEnv);
  }
  console.log('Surveillance Information Snapshot E2E repeatability: 2/2 PASS.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
