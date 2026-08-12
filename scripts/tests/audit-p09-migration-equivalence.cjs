const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');

const {
  TEST_DATABASE_NAME,
  createClient,
  parseSqlServerUrl,
  replaceDatabase,
} = require('./run-p09-real-e2e.cjs');

const MIGRATION_NAME = '20260810120000_patch36c1_legacy_schema_consolidation';
const MIGRATION_PATH =
  'prisma/migrations/20260810120000_patch36c1_legacy_schema_consolidation/migration.sql';
const TARGET_TABLES = [
  'application_review_actions',
  'application_reviews',
  'certification_application_sites',
  'certification_applications',
  'expert_certificates',
  'expert_competencies',
  'expert_work_experiences',
  'experts',
];
const NEW_TABLES = [
  'application_review_actions',
  'certification_application_sites',
  'expert_certificates',
  'expert_work_experiences',
];
const ADDED_COLUMNS = {
  application_reviews: [
    'approved_at',
    'approved_by_name',
    'approver_comment',
    'approver_id',
    'audit_field',
    'base_mandays',
    'checked_at',
    'checked_by_name',
    'checker_comment',
    'checker_id',
    'client_code',
    'combined_audit_capability_percent',
    'conclusion',
    'effective_personnel',
    'final_mandays',
    'iaf_code',
    'ims_integration_criteria_json',
    'ims_integration_percent',
    'increase_factors',
    'increase_percent',
    'industry_scopes_json',
    'integration_reduction_percent',
    'isic_code',
    'manday_method',
    'prepared_by_id',
    'proposed_auditor_id',
    'proposed_auditors_json',
    'recertification_date',
    'recertification_mandays',
    'reduction_factors',
    'reduction_percent',
    'returned_at',
    'review_items_json',
    'risk_level',
    'stage1_mandays',
    'stage1_proposed_date',
    'stage2_mandays',
    'stage2_proposed_date',
    'submitted_at',
    'surveillance1_date',
    'surveillance2_date',
    'surveillance_mandays',
    'workflow_status',
  ],
  certification_applications: [
    'associated_documents',
    'certificate_languages',
    'company_name_en',
    'consultant_name',
    'consultant_organization',
    'contact_email',
    'contact_fax',
    'contact_name',
    'contact_phone',
    'contact_position',
    'declaration_accepted',
    'excluded_clauses',
    'external_provider_used',
    'headquarters_address',
    'management_system_details',
    'other_certification_type',
    'other_management_systems',
    'other_requests',
    'outsourced_processes',
    'representative_email',
    'representative_fax',
    'representative_name',
    'representative_phone',
    'representative_position',
    'shift1_count',
    'shift2_count',
    'shift3_count',
    'stage1_requested_date',
    'stage2_requested_date',
    'standard_name',
    'total_employee_count',
  ],
  expert_competencies: ['scope_description'],
  experts: [
    'address',
    'approved_at',
    'approved_by',
    'created_at',
    'date_of_birth',
    'education_level',
    'education_summary',
    'employee_code',
    'employment_type',
    'experience_summary',
    'gender',
    'job_title',
    'organization',
    'profile_status',
    'specialization',
    'suspension_reason',
    'updated_at',
    'user_id',
  ],
};
const MIGRATION_INDEXES = [
  'IX_application_review_actions_actor_id',
  'IX_application_review_actions_review_created',
  'IX_application_reviews_approver_id',
  'IX_application_reviews_checker_id',
  'IX_application_reviews_proposed_auditor_id',
  'IX_application_reviews_workflow_status',
  'IX_certification_application_sites_application_id',
  'IX_expert_certificates_expiry_date',
  'IX_expert_certificates_expert_id',
  'IX_expert_certificates_type',
  'IX_expert_work_experiences_expert_id',
  'IX_expert_work_experiences_start_date',
  'IX_experts_approved_by',
  'IX_experts_profile_status',
  'IX_experts_status',
  'UX_experts_employee_code',
  'UX_experts_user_id',
];
const MIGRATION_FOREIGN_KEYS = [
  'FK_application_review_actions_actor',
  'FK_application_review_actions_review',
  'FK_application_reviews_approver',
  'FK_application_reviews_checker',
  'FK_application_reviews_prepared_by',
  'FK_application_reviews_proposed_auditor',
  'FK_experts_approved_by',
  'FK_experts_user_account',
];

function fail(message) {
  throw new Error(`[P09 MIGRATION AUDIT] ${message}`);
}

function assertTargets(runtimeUrl, testUrl) {
  const runtime = parseSqlServerUrl(runtimeUrl);
  const test = parseSqlServerUrl(testUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (
    !localHosts.has(runtime.server.toLowerCase()) ||
    runtime.database.toLowerCase() !== 'ctic_certification'
  ) {
    fail('Runtime target must be local CTIC_Certification.');
  }
  if (
    test.database !== TEST_DATABASE_NAME ||
    !test.database.toLowerCase().endsWith('_test')
  ) {
    fail('Test target must be CTIC_Certification_P09_test.');
  }
  if (runtime.database.toLowerCase() === test.database.toLowerCase()) {
    fail('Runtime and test targets must differ.');
  }

  return { runtime, test };
}

function normalizeRows(rows) {
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'bigint' ? value.toString() : value,
        ]),
      ),
    )
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

async function readMigrationRecord(client) {
  const rows = await client.$queryRawUnsafe(
    `SELECT checksum, finished_at, rolled_back_at
     FROM dbo._prisma_migrations
     WHERE migration_name = N'${MIGRATION_NAME}'
       AND finished_at IS NOT NULL
       AND rolled_back_at IS NULL
     ORDER BY finished_at DESC`,
  );
  if (rows.length !== 1) {
    fail(`Expected one successful ${MIGRATION_NAME} record.`);
  }
  return rows[0];
}

async function readSchemaMetadata(client) {
  const tableList = TARGET_TABLES.map((name) => `N'${name}'`).join(', ');
  const newTableList = NEW_TABLES.map((name) => `N'${name}'`).join(', ');
  const addedColumnFilter = Object.entries(ADDED_COLUMNS)
    .map(
      ([table, columns]) =>
        `(t.name = N'${table}' AND c.name IN (${columns
          .map((column) => `N'${column}'`)
          .join(', ')}))`,
    )
    .join(' OR ');
  const indexList = MIGRATION_INDEXES.map((name) => `N'${name}'`).join(', ');
  const foreignKeyList = MIGRATION_FOREIGN_KEYS.map(
    (name) => `N'${name}'`,
  ).join(', ');
  const [columns, indexes, foreignKeys] = await Promise.all([
    client.$queryRawUnsafe(`
      SELECT
        t.name AS table_name,
        c.name AS column_name,
        ty.name AS type_name,
        c.max_length,
        c.precision,
        c.scale,
        c.is_nullable,
        CAST(CASE WHEN dc.object_id IS NULL THEN 0 ELSE 1 END AS bit) AS has_default
      FROM sys.tables t
      INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
      INNER JOIN sys.columns c ON c.object_id = t.object_id
      INNER JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
      WHERE s.name = N'dbo'
        AND t.name IN (${tableList})
        AND (t.name IN (${newTableList}) OR ${addedColumnFilter});
    `),
    client.$queryRawUnsafe(`
      SELECT
        t.name AS table_name,
        i.name AS index_name,
        i.type_desc,
        i.is_unique,
        i.has_filter,
        ic.key_ordinal,
        ic.is_descending_key,
        ic.is_included_column,
        c.name AS column_name
      FROM sys.tables t
      INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
      INNER JOIN sys.indexes i ON i.object_id = t.object_id
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE s.name = N'dbo'
        AND t.name IN (${tableList})
        AND (t.name IN (${newTableList}) OR i.name IN (${indexList}))
        AND i.is_hypothetical = 0;
    `),
    client.$queryRawUnsafe(`
      SELECT
        parent_table.name AS parent_table,
        fk.name AS foreign_key_name,
        fkc.constraint_column_id,
        parent_column.name AS parent_column,
        referenced_table.name AS referenced_table,
        referenced_column.name AS referenced_column,
        fk.delete_referential_action_desc,
        fk.update_referential_action_desc
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      INNER JOIN sys.tables parent_table ON parent_table.object_id = fk.parent_object_id
      INNER JOIN sys.schemas parent_schema ON parent_schema.schema_id = parent_table.schema_id
      INNER JOIN sys.columns parent_column
        ON parent_column.object_id = fkc.parent_object_id
       AND parent_column.column_id = fkc.parent_column_id
      INNER JOIN sys.tables referenced_table ON referenced_table.object_id = fk.referenced_object_id
      INNER JOIN sys.columns referenced_column
        ON referenced_column.object_id = fkc.referenced_object_id
       AND referenced_column.column_id = fkc.referenced_column_id
      WHERE parent_schema.name = N'dbo'
        AND parent_table.name IN (${tableList})
        AND (
          parent_table.name IN (${newTableList})
          OR fk.name IN (${foreignKeyList})
        );
    `),
  ]);

  return {
    columns: normalizeRows(columns),
    indexes: normalizeRows(indexes),
    foreignKeys: normalizeRows(foreignKeys),
  };
}

function compareSection(name, runtimeRows, testRows) {
  const runtimeJson = JSON.stringify(runtimeRows);
  const testJson = JSON.stringify(testRows);
  if (runtimeJson !== testJson) {
    console.error(
      `${name}: DIFFERENT (development=${runtimeRows.length}, test=${testRows.length})`,
    );
    const runtimeSet = new Set(runtimeRows.map((row) => JSON.stringify(row)));
    const testSet = new Set(testRows.map((row) => JSON.stringify(row)));
    const onlyDevelopment = runtimeRows
      .filter((row) => !testSet.has(JSON.stringify(row)))
      .slice(0, 10);
    const onlyTest = testRows
      .filter((row) => !runtimeSet.has(JSON.stringify(row)))
      .slice(0, 10);
    console.error(`Only development: ${JSON.stringify(onlyDevelopment)}`);
    console.error(`Only test: ${JSON.stringify(onlyTest)}`);
    return false;
  }
  console.log(`${name}: PASS (${runtimeRows.length} metadata rows)`);
  return true;
}

async function main() {
  const runtimeUrl = String(process.env.DATABASE_URL || '').trim();
  const testUrl = replaceDatabase(runtimeUrl, TEST_DATABASE_NAME);
  const targets = assertTargets(runtimeUrl, testUrl);
  const runtimeClient = createClient(runtimeUrl);
  const testClient = createClient(testUrl);

  try {
    const [runtimeRecord, testRecord, runtimeSchema, testSchema] =
      await Promise.all([
        readMigrationRecord(runtimeClient),
        readMigrationRecord(testClient),
        readSchemaMetadata(runtimeClient),
        readSchemaMetadata(testClient),
      ]);
    const sourceChecksum = createHash('sha256')
      .update(readFileSync(MIGRATION_PATH))
      .digest('hex');

    console.log(`Development target: ${targets.runtime.database}`);
    console.log(`Test target: ${targets.test.database}`);
    console.log(`Development stored checksum: ${runtimeRecord.checksum}`);
    console.log(`Repaired source checksum: ${sourceChecksum}`);
    console.log(`Test stored checksum: ${testRecord.checksum}`);
    console.log(
      `Old vs repaired checksum: ${runtimeRecord.checksum === sourceChecksum ? 'SAME' : 'DIFFERENT'}`,
    );
    console.log(
      `Repaired source vs test checksum: ${testRecord.checksum === sourceChecksum ? 'SAME' : 'DIFFERENT'}`,
    );

    const equivalent = [
      compareSection(
        'Column contract',
        runtimeSchema.columns,
        testSchema.columns,
      ),
      compareSection(
        'Index contract',
        runtimeSchema.indexes,
        testSchema.indexes,
      ),
      compareSection(
        'Foreign-key contract',
        runtimeSchema.foreignKeys,
        testSchema.foreignKeys,
      ),
    ].every(Boolean);

    if (!equivalent) fail('Physical schema metadata differs.');
    console.log('MIGRATION 5 PHYSICAL SCHEMA EQUIVALENCE: PASS');
  } finally {
    await Promise.allSettled([
      runtimeClient.$disconnect(),
      testClient.$disconnect(),
    ]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
