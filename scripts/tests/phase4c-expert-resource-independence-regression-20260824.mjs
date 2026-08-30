import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('prisma/migrations/20260824120000_expert_resource_independence/migration.sql');
const schema = read('prisma/schema.prisma');
const governance = read('src/experts/expert-resource-governance.service.ts');
const experts = read('src/experts/experts.service.ts');
const expertsController = read('src/experts/experts.controller.ts');
const appointments = read('src/audit-team-appointments/audit-team-appointments.service.ts');
const p09 = read('scripts/tests/run-p09-real-e2e.cjs');

assert.match(migration, /CREATE TABLE \[dbo\]\.\[expert_availability_periods\]/);
assert.match(migration, /CREATE TABLE \[dbo\]\.\[expert_customer_conflicts\]/);
assert.match(migration, /CREATE TABLE \[dbo\]\.\[expert_resource_actions\]/);
assert.match(migration, /end_datetime\] >= \[start_datetime/);
assert.match(migration, /valid_to\] IS NULL OR \[valid_to\] >= \[valid_from/);
assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|CONSTRAINT)\b/i);
assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);

assert.match(schema, /model expert_availability_periods/);
assert.match(schema, /model expert_customer_conflicts/);
assert.match(schema, /model expert_resource_actions/);

assert.match(governance, /start_datetime: \{ lte: endDate \}/);
assert.match(governance, /end_datetime: \{ gte: startDate \}/);
assert.match(governance, /valid_from: \{ lte: endDate \}/);
assert.match(governance, /\{ valid_to: null \}/);
assert.match(governance, /\{ valid_to: \{ gte: startDate \} \}/);
assert.match(governance, /customer_id: options\.customerId/);
assert.match(governance, /INDEPENDENCE_CONFLICT/);
assert.match(governance, /OTHER_COMMITMENT/);
assert.match(governance, /code: 'OTHER_COMMITMENT',[\s\S]{0,180}severity: 'BLOCK'/);
assert.match(governance, /capacity_threshold_mandays: null/);
assert.match(governance, /capacity_exceeded: false/);
assert.match(governance, /includeSensitiveDetails/);
assert.match(governance, /action_history: includeSensitiveDetails/);

assert.match(experts, /eligibility_reasons: eligibilityReasons/);
assert.match(experts, /COMPETENCY_NOT_ELIGIBLE/);
assert.match(experts, /resourceGovernance\.evaluate/);
assert.doesNotMatch(experts, /independence_conflicts: resource\.independence_conflicts/);
assert.match(appointments, /private async validateMembers/);
assert.match(appointments, /resourceGovernance\.recordAssignmentBlock/);
assert.match(appointments, /'OTHER_COMMITMENT',[\s\S]{0,120}'INDEPENDENCE_CONFLICT'/);
assert.match(appointments, /async issue\(/);
assert.match(appointments, /await this\.validateMembers\(/);

assert.match(expertsController, /@Roles\('ADMIN'\)[\s\S]*createAvailability/);
assert.match(expertsController, /@Roles\('ADMIN'\)[\s\S]*reviewConflict/);
assert.doesNotMatch(expertsController, /@Roles\([^)]*'CUSTOMER'[^)]*\)[\s\S]{0,300}resource-governance/);

assert.match(p09, /20260824120000_expert_resource_independence/);
assert.match(p09, /expert-resource-independence\.e2e-spec\.ts/);

console.log('Phase 4C expert resource and independence regression: PASS');
