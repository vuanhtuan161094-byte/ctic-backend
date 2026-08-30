import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let failed = 0;
const check = (label, condition) => {
  if (condition) console.log(`PASS: ${label}`);
  else { failed += 1; console.error(`FAIL: ${label}`); }
};

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260824230000_master_data_configuration_import/migration.sql');
const service = read('src/master-data-configuration/master-data-configuration.service.ts');
const controller = read('src/master-data-configuration/master-data-configuration.controller.ts');
const numbering = read('src/document-control/document-control.service.ts');
const projects = read('src/certification-projects/certification-projects.service.ts');
const branding = read('src/common/platform-branding.ts');
const p09 = read('scripts/tests/run-p09-real-e2e.cjs');

check('Migration 26 is additive and creates typed Phase 7 tables', ['certification_schemes', 'standard_editions', 'scheme_configuration_versions', 'organization_profiles', 'numbering_series_configs', 'import_jobs', 'import_job_rows'].every((table) => migration.includes(`CREATE TABLE [dbo].[${table}]`)) && !/DROP TABLE|DROP COLUMN/.test(migration));
check('No competing IAF NACE ISIC taxonomy tables are created', !/CREATE TABLE \[dbo\]\.\[(iaf_scopes|industry_classifications|nace_iaf_mappings)\]/.test(migration));
check('Scheme and standard masters use typed fields and unique codes editions', /model certification_schemes/.test(schema) && /UQ_standard_editions_code_edition/.test(schema));
check('Substantive config is versioned and future-effective', /model scheme_configuration_versions/.test(schema) && /effective_from/.test(service) && /activateConfiguration/.test(service) && /resolveConfiguration/.test(service));
check('New projects retain exact resolved scheme config snapshot', /scheme_config_snapshot/.test(schema) && /schemeConfigurationSnapshot/.test(projects));
check('Security and SoD are not editable config fields', !/(authorization|separation_of_duties|sod_enabled|customer_self_approve)/i.test(schema));
check('Manday algorithm is not moved into configuration', !/manday_(formula|algorithm|table)_json/.test(schema));
check('Numbering configuration reuses Phase 5 MERGE HOLDLOCK allocator', /numbering_series_configs\.findFirst/.test(numbering) && /MERGE \[dbo\]\.\[controlled_number_sequences\] WITH \(HOLDLOCK\)/.test(numbering));
check('Import is validate preview then CREATE_ONLY commit with repeat guard', /validateImport/.test(service) && /commitImport/.test(service) && /CREATE_ONLY/.test(service) && /Import job đã commit/.test(service));
check('Import blocks formulas, unsupported files and oversized payloads', /spreadsheet không được phép/.test(service) && /Chỉ chấp nhận file CSV/.test(service) && /2 MB/.test(service));
check('Customer never appears in Phase 7 admin controller roles', !/CUSTOMER/.test(controller) && /@Roles\('ADMIN'\)/.test(controller));
check('Organization profile overrides neutral environment fallback for future document snapshots', /PlatformBrandingProfile/.test(branding) && /profile\?\.display_name/.test(branding));
check('P09 contract includes migration 26 and Phase 7 real SQL suite', /20260824230000_master_data_configuration_import/.test(p09) && /master-data-configuration-import\.e2e-spec\.ts/.test(p09));

console.log(`\nPhase 7 master/config/import regression: ${13 - failed}/13 PASS`);
if (failed) process.exitCode = 1;
