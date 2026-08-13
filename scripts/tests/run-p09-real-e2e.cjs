const { spawnSync } = require('node:child_process');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');
const { config: loadDotEnv } = require('dotenv');

const TEST_DATABASE_NAME = 'CTIC_Certification_P09_test';
const LOCAL_DERIVATION_CONFIRMATION =
  'I_UNDERSTAND_THIS_IS_A_LOCAL_TEST_DATABASE';
const FAILED_MIGRATION = '20260810120000_patch36c1_legacy_schema_consolidation';
const FAILED_MIGRATION_RECOVERY_CONFIRMATION =
  'I_UNDERSTAND_THIS_RECOVERS_ONLY_THE_P09_TEST_DATABASE';
const EXPECTED_MIGRATIONS = [
  '00000000000000_baseline',
  '20260805230000_patch35a3_integrated_manday_allocation',
  '20260810001500_patch36b5_document_file_integrity',
  '20260810013000_patch36b6_security_audit',
  '20260810120000_patch36c1_legacy_schema_consolidation',
  '20260810180000_p09_customer_user_access',
  '20260812120000_application_review_cb_capability',
  '20260812204000_application_review_invalidation_country',
  '20260812223000_customer_tax_code_filtered_unique',
  '20260812230000_uat_country_review_roundtrip',
];

loadDotEnv({
  path: '.env',
  override: false,
  quiet: true,
});

function fail(message) {
  throw new Error(`[P09 E2E SAFETY] ${message}`);
}

function splitConnectionParts(value) {
  const parts = [];
  let current = '';
  let braceDepth = 0;

  for (const character of value) {
    if (character === '{') braceDepth += 1;
    if (character === '}' && braceDepth > 0) braceDepth -= 1;

    if (character === ';' && braceDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function unwrap(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function parseSqlServerUrl(url) {
  if (!url || !/^sqlserver:\/\//i.test(url)) {
    fail('TEST_DATABASE_URL must use sqlserver:// format.');
  }

  const parts = splitConnectionParts(url.replace(/^sqlserver:\/\//i, ''));
  const hostPart = String(parts.shift() || '').trim();
  const lastColon = hostPart.lastIndexOf(':');
  const server = (
    lastColon > 0 ? hostPart.slice(0, lastColon) : hostPart
  ).trim();
  const port = lastColon > 0 ? Number(hostPart.slice(lastColon + 1)) : 1433;
  const params = new Map();

  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    params.set(
      part.slice(0, separator).trim().toLowerCase(),
      unwrap(part.slice(separator + 1)),
    );
  }

  return {
    server,
    port: Number.isFinite(port) && port > 0 ? port : 1433,
    database: params.get('database') || params.get('initial catalog') || '',
    user:
      params.get('user') || params.get('username') || params.get('uid') || '',
    password: params.get('password') || params.get('pwd') || '',
    encrypt: ['1', 'true', 'yes', 'on'].includes(
      String(params.get('encrypt') || '').toLowerCase(),
    ),
    trustServerCertificate: ['1', 'true', 'yes', 'on'].includes(
      String(params.get('trustservercertificate') || '').toLowerCase(),
    ),
    rawParts: parts,
  };
}

function replaceDatabase(url, databaseName) {
  const body = url.replace(/^sqlserver:\/\//i, '');
  const parts = splitConnectionParts(body);
  const host = parts.shift();
  let replaced = false;
  const nextParts = parts.map((part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return part;
    const key = part.slice(0, separator).trim().toLowerCase();
    if (key === 'database' || key === 'initial catalog') {
      replaced = true;
      return `${part.slice(0, separator)}=${databaseName}`;
    }
    return part;
  });

  if (!replaced) nextParts.push(`database=${databaseName}`);
  return `sqlserver://${[host, ...nextParts].join(';')}`;
}

function assertTestTarget(url) {
  const target = parseSqlServerUrl(url);
  const normalized = target.database.trim().toLowerCase();

  if (!normalized.endsWith('_test') && !normalized.endsWith('_ci')) {
    fail(
      `Refusing database without _test/_ci suffix: ${target.server}:${target.port}/${target.database}`,
    );
  }

  if (normalized === 'ctic_certification') {
    fail('Runtime database can never be used as TEST_DATABASE_URL.');
  }

  return target;
}

function resolveTestDatabaseUrl() {
  const explicit = String(process.env.TEST_DATABASE_URL || '').trim();
  if (explicit) {
    assertTestTarget(explicit);
    return explicit;
  }

  if (
    process.env.P09_CREATE_LOCAL_TEST_DATABASE !== LOCAL_DERIVATION_CONFIRMATION
  ) {
    fail(
      'TEST_DATABASE_URL is required. For the isolated local database only, set P09_CREATE_LOCAL_TEST_DATABASE to the documented confirmation value.',
    );
  }

  const runtimeUrl = String(process.env.DATABASE_URL || '').trim();
  const runtime = parseSqlServerUrl(runtimeUrl);
  const normalizedHost = runtime.server.trim().toLowerCase();

  if (
    !['localhost', '127.0.0.1', '::1'].includes(normalizedHost) ||
    runtime.database.trim().toLowerCase() !== 'ctic_certification'
  ) {
    fail(
      'Automatic test URL derivation is allowed only from localhost:*/CTIC_Certification.',
    );
  }

  const derived = replaceDatabase(runtimeUrl, TEST_DATABASE_NAME);
  assertTestTarget(derived);
  return derived;
}

function adapterConfig(url, databaseOverride) {
  const parsed = parseSqlServerUrl(url);
  return {
    server: parsed.server,
    port: parsed.port,
    database: databaseOverride || parsed.database,
    ...(parsed.user ? { user: parsed.user } : {}),
    ...(parsed.password ? { password: parsed.password } : {}),
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
    pool: {
      max: 2,
      min: 0,
      idleTimeoutMillis: 5_000,
    },
    options: {
      encrypt: parsed.encrypt,
      trustServerCertificate: parsed.trustServerCertificate,
      packetSize: 4096,
      enableArithAbort: true,
    },
  };
}

function createClient(url, databaseOverride) {
  return new PrismaClient({
    adapter: new PrismaMssql(adapterConfig(url, databaseOverride)),
  });
}

async function ensureTestDatabase(testUrl) {
  const target = assertTestTarget(testUrl);
  if (target.database !== TEST_DATABASE_NAME) {
    fail(
      `This local runner is restricted to ${TEST_DATABASE_NAME}; received ${target.database}.`,
    );
  }

  const master = createClient(testUrl, 'master');
  try {
    const existing = await master.$queryRawUnsafe(
      `SELECT DB_ID(N'${TEST_DATABASE_NAME}') AS database_id`,
    );

    if (existing[0]?.database_id == null) {
      const permissions = await master.$queryRawUnsafe(
        "SELECT IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin, HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') AS can_create_database",
      );

      if (
        Number(permissions[0]?.is_sysadmin || 0) !== 1 &&
        Number(permissions[0]?.can_create_database || 0) !== 1
      ) {
        fail(
          `Database ${TEST_DATABASE_NAME} does not exist and the configured local SQL principal cannot create it.`,
        );
      }

      await master.$executeRawUnsafe(`CREATE DATABASE [${TEST_DATABASE_NAME}]`);
      console.log(`Created isolated test database ${TEST_DATABASE_NAME}.`);
    } else {
      console.log(
        `Using existing isolated test database ${TEST_DATABASE_NAME}.`,
      );
    }
  } finally {
    await master.$disconnect();
  }
}


async function enforceTestDatabaseOptions(testUrl) {
  const target = assertTestTarget(testUrl);
  if (target.database !== TEST_DATABASE_NAME) {
    fail(
      `Database option check is restricted to ${TEST_DATABASE_NAME}; received ${target.database}.`,
    );
  }

  // Read-only safety gate. The application/migration principal must not need
  // ALTER DATABASE permission just to execute E2E tests. Database-level
  // options are configured administratively outside the test harness.
  const master = createClient(testUrl, 'master');
  try {
    const rows = await master.$queryRawUnsafe(
      `SELECT state_desc, is_auto_close_on
       FROM sys.databases
       WHERE name = N'${TEST_DATABASE_NAME}'`,
    );
    if (rows.length !== 1) {
      fail(`${TEST_DATABASE_NAME} was not visible in sys.databases.`);
    }

    const state = String(rows[0]?.state_desc || '').toUpperCase();
    const autoClose = Number(rows[0]?.is_auto_close_on ?? 1);
    if (state !== 'ONLINE' || autoClose !== 0) {
      fail(
        `${TEST_DATABASE_NAME} must be ONLINE with AUTO_CLOSE OFF before E2E execution. ` +
          `Current state=${state || '<unknown>'}, AUTO_CLOSE=${autoClose}. ` +
          `Configure this database option with an administrative SQL login; ` +
          `the E2E runner will not mutate database-level settings.`,
      );
    }

    console.log(
      `Test database option contract: ${TEST_DATABASE_NAME} ONLINE, AUTO_CLOSE OFF (read-only check).`,
    );
  } finally {
    await master.$disconnect();
  }
}

function runCommand(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited with ${result.status}.`);
  }
}

function runNpm(args, env) {
  const npmCli = String(process.env.npm_execpath || '').trim();
  if (npmCli) {
    runCommand(process.execPath, [npmCli, ...args], env);
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runCommand(npmCommand, args, env);
}

async function recoverKnownFailedTestMigration(testUrl, childEnv) {
  const client = createClient(testUrl);
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT id, migration_name, finished_at, rolled_back_at, applied_steps_count
       FROM dbo._prisma_migrations
       WHERE migration_name = N'${FAILED_MIGRATION}'
       ORDER BY started_at DESC`,
    );
    const failed = rows.filter(
      (row) => row.finished_at == null && row.rolled_back_at == null,
    );

    if (failed.length === 0) return;
    if (failed.length !== 1 || rows.some((row) => row.finished_at != null)) {
      fail(
        `Unexpected migration history for ${FAILED_MIGRATION}; refusing automatic test recovery.`,
      );
    }
    if (
      process.env.P09_RECOVER_FAILED_MIGRATION !==
      FAILED_MIGRATION_RECOVERY_CONFIRMATION
    ) {
      fail(
        `The known failed test migration requires P09_RECOVER_FAILED_MIGRATION=${FAILED_MIGRATION_RECOVERY_CONFIRMATION}.`,
      );
    }

    const partialArtifacts = await client.$queryRawUnsafe(`
      SELECT artifact
      FROM (
        SELECT N'table:certification_application_sites' AS artifact
        WHERE OBJECT_ID(N'dbo.certification_application_sites', N'U') IS NOT NULL
        UNION ALL SELECT N'table:application_review_actions'
        WHERE OBJECT_ID(N'dbo.application_review_actions', N'U') IS NOT NULL
        UNION ALL SELECT N'table:expert_work_experiences'
        WHERE OBJECT_ID(N'dbo.expert_work_experiences', N'U') IS NOT NULL
        UNION ALL SELECT N'table:expert_certificates'
        WHERE OBJECT_ID(N'dbo.expert_certificates', N'U') IS NOT NULL
        UNION ALL SELECT N'column:application_reviews.workflow_status'
        WHERE COL_LENGTH(N'dbo.application_reviews', N'workflow_status') IS NOT NULL
        UNION ALL SELECT N'column:application_reviews.proposed_auditor_id'
        WHERE COL_LENGTH(N'dbo.application_reviews', N'proposed_auditor_id') IS NOT NULL
        UNION ALL SELECT N'column:experts.user_id'
        WHERE COL_LENGTH(N'dbo.experts', N'user_id') IS NOT NULL
        UNION ALL SELECT N'column:experts.profile_status'
        WHERE COL_LENGTH(N'dbo.experts', N'profile_status') IS NOT NULL
      ) AS partial;
    `);
    if (partialArtifacts.length > 0) {
      fail(
        `Failed migration left unexpected physical artifacts: ${partialArtifacts
          .map((row) => String(row.artifact))
          .join(', ')}.`,
      );
    }

    console.log(
      `Confirmed ${FAILED_MIGRATION} failed without committed partial artifacts.`,
    );
  } finally {
    await client.$disconnect();
  }

  runNpm(
    [
      'exec',
      'prisma',
      '--',
      'migrate',
      'resolve',
      '--rolled-back',
      FAILED_MIGRATION,
    ],
    childEnv,
  );

  const verification = createClient(testUrl);
  try {
    const rows = await verification.$queryRawUnsafe(
      `SELECT rolled_back_at
       FROM dbo._prisma_migrations
       WHERE migration_name = N'${FAILED_MIGRATION}'
       ORDER BY started_at DESC`,
    );
    if (rows[0]?.rolled_back_at == null) {
      fail(`Prisma did not mark ${FAILED_MIGRATION} as rolled back.`);
    }
    console.log('Failed test migration recovery: PASS.');
  } finally {
    await verification.$disconnect();
  }
}

async function verifyMigratedDatabase(testUrl) {
  const client = createClient(testUrl);
  try {
    const current = await client.$queryRawUnsafe(
      'SELECT DB_NAME() AS database_name',
    );
    const actualName = String(current[0]?.database_name || '');
    if (actualName !== TEST_DATABASE_NAME) {
      fail(`Connected to unexpected database ${actualName}.`);
    }

    const rows = await client.$queryRawUnsafe(
      'SELECT migration_name FROM dbo._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at',
    );
    const migrations = rows.map((row) => String(row.migration_name));
    if (
      migrations.length !== EXPECTED_MIGRATIONS.length ||
      migrations.some((name, index) => name !== EXPECTED_MIGRATIONS[index])
    ) {
      fail(
        `Expected canonical ${EXPECTED_MIGRATIONS.length} migrations, found ${migrations.join(', ') || 'none'}.`,
      );
    }

    const table = await client.$queryRawUnsafe(
      "SELECT OBJECT_ID(N'dbo.customer_user_access', N'U') AS object_id",
    );
    if (table[0]?.object_id == null) {
      fail('dbo.customer_user_access is missing after migrate deploy.');
    }

    console.log(`Test database migration contract: ${EXPECTED_MIGRATIONS.length}/${EXPECTED_MIGRATIONS.length} PASS.`);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const testUrl = resolveTestDatabaseUrl();
  const target = assertTestTarget(testUrl);
  console.log(
    `P09 E2E target: ${target.server}:${target.port}/${target.database}`,
  );

  await ensureTestDatabase(testUrl);
  await enforceTestDatabaseOptions(testUrl);

  const childEnv = {
    ...process.env,
    DATABASE_URL: testUrl,
    MIGRATION_DATABASE_URL: testUrl,
    TEST_DATABASE_URL: testUrl,
    NODE_ENV: 'test',
    CMP_DATABASE_CONNECTION_ROLE: 'migration',
  };
  await recoverKnownFailedTestMigration(testUrl, childEnv);
  if (!process.argv.includes('--e2e-only')) {
    runNpm(['exec', 'prisma', '--', 'migrate', 'deploy'], childEnv);
  }
  await verifyMigratedDatabase(testUrl);

  for (let run = 1; run <= 2; run += 1) {
    console.log(`P09 real E2E run ${run}/2...`);
    runNpm(
      [
        'run',
        'test:e2e',
        '--',
        'customer-cap-access.e2e-spec.ts',
        '--runInBand',
      ],
      childEnv,
    );
  }

  console.log('P09 real E2E repeatability: 2/2 PASS.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  TEST_DATABASE_NAME,
  EXPECTED_MIGRATIONS,
  createClient,
  enforceTestDatabaseOptions,
  parseSqlServerUrl,
  replaceDatabase,
};
