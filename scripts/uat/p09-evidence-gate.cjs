'use strict';

const fs = require('node:fs');

const REQUIRED_SCENARIOS = Array.from({ length: 16 }, (_, index) =>
  `UAT-${String(index + 1).padStart(2, '0')}`);
const SQL_SCENARIOS = new Set(['UAT-02', 'UAT-03', 'UAT-04', 'UAT-05',
  'UAT-06', 'UAT-07', 'UAT-08', 'UAT-09', 'UAT-10', 'UAT-11', 'UAT-12', 'UAT-14']);
const ROLE_NEGATIVE_SCENARIOS = new Set(['UAT-02', 'UAT-03', 'UAT-05', 'UAT-06',
  'UAT-07', 'UAT-08', 'UAT-11', 'UAT-12', 'UAT-16']);
const UNCERTIFIED = /fixture|mock|dummy|synthetic|not.run|placeholder|todo/i;
function isEvidence(value) {
  return typeof value === 'string' && value.trim().length >= 12 &&
    !UNCERTIFIED.test(value) && !/\s(?:bearer|token|password|secret)\s*[:=]/i.test(value);
}
function isSha(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value); }

function validateP09AcceptanceReport(report) {
  const failures = [];
  const reject = (condition, key) => { if (!condition) failures.push(key); };
  const env = report?.environment ?? {};
  reject(report?.schema_version === 'CMP-P09-STAGE1-1', 'schema_version');
  reject(env.kind === 'SQL_STAGING', 'environment.kind');
  reject(env.isolated === true, 'environment.isolated');
  reject(env.database_name === 'CTIC_Certification_P09_test',
    'environment.database_name: dedicated P09 SQL test database required');
  reject(env.verified_database_name === env.database_name, 'environment.verified_database_name');
  reject(isSha(env.backend_sha), 'environment.backend_sha');
  reject(isSha(env.frontend_sha), 'environment.frontend_sha');
  reject(isEvidence(env.sql_identity_evidence), 'environment.sql_identity_evidence');
  reject(isEvidence(env.frontend_runtime_evidence), 'environment.frontend_runtime_evidence');
  reject(isEvidence(env.api_runtime_evidence), 'environment.api_runtime_evidence');
  reject(env.storage_isolated === true, 'environment.storage_isolated');

  for (const scenario of REQUIRED_SCENARIOS) {
    const item = report?.scenarios?.[scenario] ?? {};
    reject(item.status === 'PASS', `${scenario}.status`);
    reject(isEvidence(item.ui_api_evidence), `${scenario}.ui_api_evidence`);
    reject(isEvidence(item.actor_evidence), `${scenario}.actor_evidence`);
    if (SQL_SCENARIOS.has(scenario)) {
      reject(isEvidence(item.sql_readback_evidence), `${scenario}.sql_readback_evidence`);
    }
    if (ROLE_NEGATIVE_SCENARIOS.has(scenario)) {
      reject(isEvidence(item.denied_role_evidence), `${scenario}.denied_role_evidence`);
    }
  }

  const repeats = report?.sql_repeatability;
  reject(Array.isArray(repeats) && repeats.length === 2, 'sql_repeatability: 2 runs');
  if (Array.isArray(repeats)) {
    for (let i = 0; i < 2; i += 1) {
      const run = repeats[i] ?? {};
      reject(run.status === 'PASS', `sql_repeatability[${i}].status`);
      reject(run.database_name === env.database_name,
        `sql_repeatability[${i}].database_name`);
      reject(isEvidence(run.proof_ref), `sql_repeatability[${i}].proof_ref`);
    }
  }

  const perf = report?.performance ?? {};
  reject(perf.status === 'PASS', 'performance.status');
  reject(isEvidence(perf.report_ref), 'performance.report_ref');
  reject(Number.isFinite(perf.p95_ms) && perf.p95_ms >= 0, 'performance.p95_ms');
  reject(Number.isFinite(perf.approved_p95_limit_ms) && perf.approved_p95_limit_ms > 0,
    'performance.approved_p95_limit_ms');
  reject(Number.isFinite(perf.p95_ms) && Number.isFinite(perf.approved_p95_limit_ms) &&
    perf.p95_ms <= perf.approved_p95_limit_ms, 'performance.p95_within_limit');
  reject(Number.isInteger(perf.actual_work_item_count) &&
    perf.actual_work_item_count >= 1000, 'performance.actual_work_item_count');
  reject(isEvidence(perf.sql_count_evidence), 'performance.sql_count_evidence');
  const release = report?.release ?? {};
  for (const key of ['isolated_backup_restore', 'security_and_roles',
    'monitoring', 'rollback', 'release_manifest']) {
    reject(release[key]?.status === 'PASS', `release.${key}.status`);
    reject(isEvidence(release[key]?.proof_ref), `release.${key}.proof_ref`);
  }
  reject(report?.open_s1 === 0 && report?.open_s2 === 0, 'critical_defect_exit');
  return { status: failures.length ? 'BLOCKED' : 'PASS', failures };
}

if (require.main === module) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('P09 acceptance gate: supply an evidence JSON path.');
    process.exitCode = 2;
  } else {
    try {
      const report = JSON.parse(fs.readFileSync(filename, 'utf8'));
      const result = validateP09AcceptanceReport(report);
      console.log(JSON.stringify({ status: result.status, missing_or_invalid: result.failures }, null, 2));
      if (result.status !== 'PASS') process.exitCode = 1;
    } catch {
      console.error('P09 acceptance gate: evidence JSON could not be parsed safely.');
      process.exitCode = 2;
    }
  }
}
module.exports = { validateP09AcceptanceReport, REQUIRED_SCENARIOS };
