import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const readiness = read('src/audit-team-appointments/audit-team-readiness.service.ts');
const appointments = read('src/audit-team-appointments/audit-team-appointments.service.ts');
const controller = read('src/audit-team-appointments/audit-team-appointments.controller.ts');
const experts = read('src/experts/experts.service.ts');
const expertsController = read('src/experts/experts.controller.ts');
const p09 = read('scripts/tests/run-p09-real-e2e.cjs');

assert.match(readiness, /buildCollectiveCoverage/);
assert.match(readiness, /competencyCoversScope/);
assert.match(readiness, /COVERED/);
assert.match(readiness, /PARTIAL/);
assert.match(readiness, /MISSING/);
assert.match(readiness, /ROLE_COMPETENCY_MISSING/);
assert.match(readiness, /LEADER_NOT_QUALIFIED/);
assert.match(readiness, /MANDAY_NOT_BALANCED/);
assert.match(readiness, /INDEPENDENCE_CONFLICT/);
assert.match(readiness, /OTHER_COMMITMENT/);
assert.match(readiness, /REMOTE_WORKLOAD/);
assert.match(readiness, /Promise\.all\(\[/);
assert.match(readiness, /assertReadyForIssue/);

assert.match(appointments, /teamReadiness\.assertReadyForIssue\(id\)/);
assert.match(appointments, /AUDIT_TEAM_READINESS_BLOCKED/);
assert.match(appointments, /AUDIT_TEAM_MEMBERS_CHANGED/);
assert.match(appointments, /AUDIT_TEAM_ISSUED/);
assert.match(appointments, /mandayAllocationService\.validateForIssue\(id\)/);

assert.match(controller, /@Get\(':id\/readiness'\)/);
assert.doesNotMatch(controller, /@Roles\([^)]*'CUSTOMER'[^)]*\)[\s\S]{0,300}getReadiness/);
assert.match(experts, /resourceGovernance\.evaluateMany/);
assert.match(experts, /missing_coverage_contribution/);
assert.match(experts, /score_components: scoreComponents/);
assert.match(experts, /NO_TEAM_COVERAGE_CONTRIBUTION/);
assert.match(expertsController, /@Get\('recommendations'\)[\s\S]{0,100}@Roles\('ADMIN', 'COORDINATOR'\)/);
assert.match(p09, /audit-team-intelligence\.e2e-spec\.ts/);

console.log('Phase 4D audit-team intelligence regression: PASS');
