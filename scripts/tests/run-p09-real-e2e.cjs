const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');
const { config: loadDotEnv } = require('dotenv');

const TEST_DATABASE_NAME = 'CTIC_Certification_P09_test';
const LOCAL_DERIVATION_CONFIRMATION =
  'I_UNDERSTAND_THIS_IS_A_LOCAL_TEST_DATABASE';
const FAILED_MIGRATION = '20260810120000_patch36c1_legacy_schema_consolidation';
const FAILED_MIGRATION_RECOVERY_CONFIRMATION =
  'I_UNDERSTAND_THIS_RECOVERS_ONLY_THE_P09_TEST_DATABASE';
const CERTIFICATE_LIFECYCLE_MIGRATION =
  '20260821150000_certificate_lifecycle_core';
const CERTIFICATE_LIFECYCLE_RECOVERY_CONFIRMATION =
  'I_UNDERSTAND_THIS_RECOVERS_ONLY_THE_FAILED_PHASE11_TEST_MIGRATION';
const MIGRATIONS_ROOT = path.resolve(__dirname, '../../prisma/migrations');

function readCanonicalMigrationNames(migrationsRoot = MIGRATIONS_ROOT) {
  const directories = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const missingMigrationSql = directories
    .filter(
      (entry) =>
        !existsSync(path.join(migrationsRoot, entry.name, 'migration.sql')),
    )
    .map((entry) => entry.name);

  if (missingMigrationSql.length > 0) {
    fail(
      `Migration directories missing migration.sql: ${missingMigrationSql.join(', ')}.`,
    );
  }
  if (directories.length === 0) {
    fail('Repository canonical migration set is empty.');
  }

  return directories.map((entry) => entry.name);
}

const EXPECTED_MIGRATIONS = Object.freeze(readCanonicalMigrationNames());

loadDotEnv({
  path: '.env',
  override: false,
  quiet: true,
});

if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
  fail('P09 E2E runner is test-only and refuses NODE_ENV=production.');
}

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

function runJestE2e(args, env) {
  const jestCli = require.resolve('jest/bin/jest');
  runCommand(
    process.execPath,
    [jestCli, '--config', './test/jest-e2e.json', ...args],
    env,
  );
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

async function recoverFailedCertificateLifecycleMigration(testUrl, childEnv) {
  const client = createClient(testUrl);
  try {
    const current = await client.$queryRawUnsafe('SELECT DB_NAME() AS database_name');
    if (String(current[0]?.database_name || '') !== TEST_DATABASE_NAME) {
      fail('Certificate lifecycle recovery refused outside the isolated P09 test database.');
    }

    const rows = await client.$queryRawUnsafe(
      `SELECT id, migration_name, finished_at, rolled_back_at, applied_steps_count
       FROM dbo._prisma_migrations
       WHERE migration_name = N'${CERTIFICATE_LIFECYCLE_MIGRATION}'
       ORDER BY started_at DESC`,
    );
    const failed = rows.filter(
      (row) => row.finished_at == null && row.rolled_back_at == null,
    );
    if (failed.length === 0) return;
    if (failed.length !== 1 || rows.some((row) => row.finished_at != null)) {
      fail('Unexpected certificate lifecycle migration history; refusing automatic recovery.');
    }
    if (
      process.env.P09_RECOVER_CERTIFICATE_LIFECYCLE_MIGRATION !==
      CERTIFICATE_LIFECYCLE_RECOVERY_CONFIRMATION
    ) {
      fail(
        `Set P09_RECOVER_CERTIFICATE_LIFECYCLE_MIGRATION=${CERTIFICATE_LIFECYCLE_RECOVERY_CONFIRMATION} after reviewing the failed isolated-test migration.`,
      );
    }

    const artifacts = await client.$queryRawUnsafe(`
      SELECT artifact
      FROM (
        SELECT N'table:certificate_series' AS artifact
        WHERE OBJECT_ID(N'dbo.certificate_series', N'U') IS NOT NULL
        UNION ALL SELECT N'column:certification_decisions.decision_type'
        WHERE COL_LENGTH(N'dbo.certification_decisions', N'decision_type') IS NOT NULL
        UNION ALL SELECT N'column:certificates.certificate_series_id'
        WHERE COL_LENGTH(N'dbo.certificates', N'certificate_series_id') IS NOT NULL
        UNION ALL SELECT N'column:certificates.version_no'
        WHERE COL_LENGTH(N'dbo.certificates', N'version_no') IS NOT NULL
      ) AS partial;
    `);
    if (artifacts.length > 0) {
      fail(
        `Failed Phase 1.1 migration left physical artifacts: ${artifacts
          .map((row) => String(row.artifact))
          .join(', ')}.`,
      );
    }
    console.log('Confirmed failed Phase 1.1 test migration rolled back without physical artifacts.');
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
      CERTIFICATE_LIFECYCLE_MIGRATION,
    ],
    childEnv,
  );
  console.log('Failed Phase 1.1 test migration marked rolled back: PASS.');
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
      "SELECT OBJECT_ID(N'dbo.customer_user_access', N'U') AS object_id, OBJECT_ID(N'dbo.customer_user_access_requests', N'U') AS request_object_id, OBJECT_ID(N'dbo.customer_user_access_history', N'U') AS history_object_id, OBJECT_ID(N'dbo.expert_competency_evidences', N'U') AS competency_evidence_object_id, OBJECT_ID(N'dbo.expert_competency_reviews', N'U') AS competency_review_object_id, OBJECT_ID(N'dbo.expert_competency_actions', N'U') AS competency_action_object_id, OBJECT_ID(N'dbo.expert_training_records', N'U') AS training_object_id, OBJECT_ID(N'dbo.expert_monitoring_records', N'U') AS monitoring_object_id, OBJECT_ID(N'dbo.expert_witness_assessment_items', N'U') AS witness_object_id, OBJECT_ID(N'dbo.expert_availability_periods', N'U') AS availability_object_id, OBJECT_ID(N'dbo.expert_customer_conflicts', N'U') AS independence_object_id, OBJECT_ID(N'dbo.expert_resource_actions', N'U') AS resource_action_object_id, OBJECT_ID(N'dbo.controlled_template_series', N'U') AS controlled_template_series_object_id, OBJECT_ID(N'dbo.controlled_documents', N'U') AS controlled_documents_object_id, OBJECT_ID(N'dbo.controlled_document_versions', N'U') AS controlled_document_versions_object_id, OBJECT_ID(N'dbo.certification_change_cases', N'U') AS change_cases_object_id, OBJECT_ID(N'dbo.special_audit_cases', N'U') AS special_audits_object_id, OBJECT_ID(N'dbo.complaint_cases', N'U') AS complaints_object_id, OBJECT_ID(N'dbo.appeal_cases', N'U') AS appeals_object_id, OBJECT_ID(N'dbo.certification_schemes', N'U') AS schemes_object_id, OBJECT_ID(N'dbo.standard_editions', N'U') AS standards_object_id, OBJECT_ID(N'dbo.import_jobs', N'U') AS import_jobs_object_id, OBJECT_ID(N'dbo.quotations', N'U') AS quotations_object_id, OBJECT_ID(N'dbo.billing_milestones', N'U') AS billing_milestones_object_id, COL_LENGTH(N'dbo.audit_logs', N'details_json') AS audit_details_column",
    );
    if (table[0]?.object_id == null) {
      fail('dbo.customer_user_access is missing after migrate deploy.');
    }
    if (table[0]?.request_object_id == null || table[0]?.history_object_id == null) {
      fail('Phase 3.2B customer user access request/history tables are missing after migrate deploy.');
    }
    if (
      table[0]?.competency_evidence_object_id == null ||
      table[0]?.competency_review_object_id == null ||
      table[0]?.competency_action_object_id == null
    ) {
      fail('Phase 4A expert competency governance tables are missing after migrate deploy.');
    }

    if (
      table[0]?.training_object_id == null ||
      table[0]?.monitoring_object_id == null ||
      table[0]?.witness_object_id == null
    ) {
      fail('Phase 4B expert training/monitoring tables are missing after migrate deploy.');
    }
    if (
      table[0]?.availability_object_id == null ||
      table[0]?.independence_object_id == null ||
      table[0]?.resource_action_object_id == null
    ) {
      fail('Phase 4C expert resource/independence tables are missing after migrate deploy.');
    }
    if (
      table[0]?.controlled_template_series_object_id == null ||
      table[0]?.controlled_documents_object_id == null ||
      table[0]?.controlled_document_versions_object_id == null
    ) {
      fail('Phase 5 controlled document lifecycle tables are missing after migrate deploy.');
    }
    if (
      table[0]?.change_cases_object_id == null ||
      table[0]?.special_audits_object_id == null ||
      table[0]?.complaints_object_id == null ||
      table[0]?.appeals_object_id == null
    ) {
      fail('Phase 6 governance case tables are missing after migrate deploy.');
    }
    if (table[0]?.schemes_object_id == null || table[0]?.standards_object_id == null || table[0]?.import_jobs_object_id == null) {
      fail('Phase 7 master data/configuration/import tables are missing after migrate deploy.');
    }
    if (table[0]?.quotations_object_id == null || table[0]?.billing_milestones_object_id == null) {
      fail('Phase 8 commercial/reporting tables are missing after migrate deploy.');
    }
    if (table[0]?.audit_details_column == null) {
      fail('Phase 9 audit_logs.details_json governance column is missing after migrate deploy.');
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
    P09_DISABLE_NOTIFICATION_SCHEDULER: '1',
  };
  await recoverKnownFailedTestMigration(testUrl, childEnv);
  await recoverFailedCertificateLifecycleMigration(testUrl, childEnv);
  if (!process.argv.includes('--e2e-only')) {
    runNpm(['exec', 'prisma', '--', 'migrate', 'deploy'], childEnv);
  }
  runNpm(['exec', 'prisma', '--', 'generate'], childEnv);
  await verifyMigratedDatabase(testUrl);

  for (let run = 1; run <= 2; run += 1) {
    console.log(`P09 real E2E run ${run}/2...`);
    runJestE2e(
      [
        'customer-cap-access.e2e-spec.ts',
        'certificate-full-lifecycle.e2e-spec.ts',
        'work-items.e2e-spec.ts',
        'notification-sla.e2e-spec.ts',
        'phase-2-full-role.e2e-spec.ts',
        'customer-portal-foundation.e2e-spec.ts',
        'customer-organization-change.e2e-spec.ts',
        'customer-user-access-request.e2e-spec.ts',
        'customer-document-requests.e2e-spec.ts',
        'expert-competency-governance.e2e-spec.ts',
        'expert-development-monitoring.e2e-spec.ts',
        'expert-resource-independence.e2e-spec.ts',
        'audit-team-intelligence.e2e-spec.ts',
        'document-control-lifecycle.e2e-spec.ts',
        'governance-cases.e2e-spec.ts',
        'master-data-configuration-import.e2e-spec.ts',
        'commercial-management-reporting.e2e-spec.ts',
        'system-administration-governance.e2e-spec.ts',
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
  readCanonicalMigrationNames,
  createClient,
  enforceTestDatabaseOptions,
  parseSqlServerUrl,
  replaceDatabase,
};
