'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const runner = require('./cmp-workflow-runner.cjs');

const scriptPath = path.join(__dirname, 'cmp-workflow-runner.cjs');
const legacySeedPath = path.join(__dirname, 'cmp-demo-seed.cjs');

test('workflow dry run is ordered, names business APIs, and performs no I/O', () => {
  const plan = runner.buildWorkflowPlan('CMP-UX-TEST');
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.runId, 'CMP-UX-TEST');
  assert.equal(plan.apiCallsMade, 0);
  assert.equal(plan.databaseWrites, 0);
  assert.deepEqual(plan.steps.map((step) => step.id), [
    'sandbox-gate', 'organization', 'internal-accounts', 'customers', 'portal-access', 'first-application',
  ]);
  assert.equal(plan.steps.find((step) => step.id === 'customers').path, '/customers');
  assert.deepEqual(plan.steps.find((step) => step.id === 'customers').checkpoints, [1, 5, 20]);
  assert.equal(plan.steps.find((step) => step.id === 'first-application').path, '/customer-portal/me/applications');
});

test('CLI dry run prints its plan and does not connect to the API or database', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--dry-run', '--run-id', 'CMP-UX-CLI'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.runId, 'CMP-UX-CLI');
  assert.equal(output.apiCallsMade, 0);
  assert.equal(output.databaseWrites, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /password=|DATABASE_URL=|Bearer\s/i);
});

test('apply mode fails closed and legacy SQL seed no longer applies records', () => {
  const blocked = spawnSync(process.execPath, [scriptPath, '--apply'], { encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Apply mode is disabled/);

  const legacy = spawnSync(process.execPath, [legacySeedPath, '--apply'], { encoding: 'utf8' });
  assert.equal(legacy.status, 2);
  assert.match(legacy.stderr, /UI\/API workflow runner/i);
  assert.doesNotMatch(legacy.stdout + legacy.stderr, /DATABASE_URL=|password=/i);
});

test('cleanup dry run reports record lineage and never deletes', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-ux-manifest-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const manifestPath = path.join(folder, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    runId: 'CMP-UX-TEST',
    status: 'blocked_before_write',
    database: { name: 'CTIC_Certification', allowlisted: false },
    createdRecords: [],
  }));
  const report = runner.buildCleanupDryRun(manifestPath);
  assert.equal(report.runId, 'CMP-UX-TEST');
  assert.equal(report.createdRecordCount, 0);
  assert.equal(report.dependencyCount, 0);
  assert.equal(report.cleanupPerformed, false);
  assert.equal(report.deleteCount, 0);
});

test('cleanup dry run rejects invalid manifests', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-ux-bad-manifest-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const manifestPath = path.join(folder, 'manifest.json');
  fs.writeFileSync(manifestPath, '{"createdRecords":[]}');
  assert.throws(() => runner.buildCleanupDryRun(manifestPath), /runId/);
});
