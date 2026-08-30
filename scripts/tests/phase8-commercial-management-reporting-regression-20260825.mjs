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
const migration = read('prisma/migrations/20260825010000_commercial_management_reporting/migration.sql');
const service = read('src/commercial-management-reporting/commercial-management-reporting.service.ts');
const controller = read('src/commercial-management-reporting/commercial-management-reporting.controller.ts');
const contract = read('src/contracts/contracts.service.ts');
const frontend = read('../ctic-frontend/app/components/ManagementCockpitScreen.tsx');
const p09 = read('scripts/tests/run-p09-real-e2e.cjs');

check('Migration 27 is additive and creates only commercial v1 tables', ['quotations', 'quotation_line_items', 'billing_milestones', 'billing_milestone_actions'].every((table) => migration.includes(`CREATE TABLE [${table}]`)) && !/DROP TABLE|DROP COLUMN/.test(migration));
check('Financial storage uses SQL and Prisma Decimal, never Float', /@db\.Decimal\(19, 4\)/.test(schema) && !/model (quotations|billing_milestones)[\s\S]*?Float/.test(schema));
check('Quotation final records cannot be directly overwritten and revision retains parent', /current\.status !== 'DRAFT'/.test(service) && /previous_version_id: current\.id/.test(service));
check('Technical mandays are sourced from approved Application Review and absent from commercial DTO input', /workflow_status: 'APPROVED'/.test(service) && /technical_approved_mandays: approvedMandays/.test(service) && !/technical_approved_mandays\?:/.test(read('src/commercial-management-reporting/dto/commercial-management-reporting.dto.ts')));
check('Contract links only ACCEPTED same-customer quotation and exact value/currency', /quotation\.status !== 'ACCEPTED'/.test(contract) && /quotation\.customer_id !== dto\.customer_id/.test(contract) && /quotation\?\.total_amount/.test(contract));
check('Billing enforces invoice metadata, no overpayment and status from Decimal amounts', /paid\.gt\(current\.planned_amount\)/.test(service) && /Ghi nhận thanh toán cần đủ/.test(service) && /paid\.equals\(current\.planned_amount\)/.test(service));
check('Commercial code never mutates certificate status', !/certificates\.(update|updateMany|create|delete)/.test(service) && !/certificate_status/.test(service));
check('Mixed currency totals are intentionally null and values remain grouped', /by: \['currency'\]/.test(service) && /mixed_currency_total: null/.test(service));
check('Overdue uses Phase 2 Work Item OPEN IN_PROGRESS authority', /OPEN_WORK_STATUSES = \['OPEN', 'IN_PROGRESS'\]/.test(service) && /this\.prisma\.work_items\.count/.test(service));
check('Utilization percentage is unavailable without denominator', /utilization_percentage: null/.test(service) && /chưa có mẫu số/.test(service));
check('Commercial and cockpit APIs exclude CUSTOMER and technical-only roles server-side', /const MANAGEMENT_ROLES = \['ADMIN', 'STAFF', 'SALES', 'COORDINATOR'\]/.test(controller) && !/MANAGEMENT_ROLES.*CUSTOMER/.test(controller));
check('Frontend uses backend KPI definitions, Phase 7 schemes and same-filter server CSV', /cockpit\.executive\.map/.test(frontend) && /master-data-configuration\/schemes/.test(frontend) && /cockpit\/export\.csv\?\$\{filterQuery\}/.test(frontend));
check('P09 contract includes migration 27 and Phase 8 real SQL suite', /20260825010000_commercial_management_reporting/.test(p09) && /commercial-management-reporting\.e2e-spec\.ts/.test(p09));

console.log(`\nPhase 8 commercial/reporting regression: ${13 - failed}/13 PASS`);
if (failed) process.exitCode = 1;
