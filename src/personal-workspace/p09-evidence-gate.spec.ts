/* eslint-disable @typescript-eslint/no-var-requires */
const gate = require('../../scripts/uat/p09-evidence-gate.cjs');

function completeEvidence() {
  const file = (name: string) => `evidence/staging/${name}.json`;
  return {
    schema_version: 'CMP-P09-STAGE1-1',
    environment: {
      kind: 'SQL_STAGING',
      isolated: true,
      database_name: 'CTIC_Certification_P09_test',
      verified_database_name: 'CTIC_Certification_P09_test',
      backend_sha: 'a'.repeat(40), frontend_sha: 'b'.repeat(40),
      sql_identity_evidence: file('sql-identity'),
      frontend_runtime_evidence: file('frontend'),
      api_runtime_evidence: file('api'),
      storage_isolated: true,
    },
    scenarios: Object.fromEntries(gate.REQUIRED_SCENARIOS.map((name: string) => [
      name, {
        status: 'PASS', ui_api_evidence: file(name + '-api'),
        actor_evidence: file(name + '-role'),
        sql_readback_evidence: file(name + '-sql'),
        denied_role_evidence: file(name + '-403'),
      },
    ])),
    sql_repeatability: [1, 2].map((i) => ({
      status: 'PASS', database_name: 'CTIC_Certification_P09_test',
      proof_ref: file(`sql-e2e-run-${i}`),
    })),
    performance: {
      status: 'PASS', report_ref: file('performance'),
      p95_ms: 250, approved_p95_limit_ms: 500,
      actual_work_item_count: 10000, sql_count_evidence: file('work-count'),
    },
    release: Object.fromEntries(['isolated_backup_restore', 'security_and_roles',
      'monitoring', 'rollback', 'release_manifest'].map((key) =>
      [key, { status: 'PASS', proof_ref: file(key) }])),
    open_s1: 0, open_s2: 0,
  };
}

describe('P09 staging acceptance evidence gate contract', () => {
  it('rejects absent or fixture-only evidence', () => {
    expect(gate.validateP09AcceptanceReport({}).status).toBe('BLOCKED');
    const report = completeEvidence();
    report.scenarios['UAT-08'].sql_readback_evidence = 'fixture/demo-uat.json';
    expect(gate.validateP09AcceptanceReport(report).failures)
      .toContain('UAT-08.sql_readback_evidence');
  });

  it('rejects DEMO, production and unsigned SHA placeholders', () => {
    const report = completeEvidence();
    report.environment.database_name = 'CTIC_CMP_DEMO_2026';
    report.environment.backend_sha = 'latest';
    expect(gate.validateP09AcceptanceReport(report).failures).toEqual(expect.arrayContaining([
      'environment.database_name: dedicated P09 SQL test database required',
      'environment.backend_sha',
    ]));
  });

  it('rejects release if latency exceeds approved limit, S2 remains or 2/2 SQL run missing', () => {
    const report = completeEvidence();
    report.performance.p95_ms = 900;
    report.open_s2 = 1;
    report.sql_repeatability = [report.sql_repeatability[0]];
    const failures = gate.validateP09AcceptanceReport(report).failures;
    expect(failures).toEqual(expect.arrayContaining([
      'performance.p95_within_limit', 'critical_defect_exit',
      'sql_repeatability: 2 runs',
    ]));
  });

  it('accepts a fully evidenced, isolated staging report schema', () => {
    expect(gate.validateP09AcceptanceReport(completeEvidence()))
      .toEqual({ status: 'PASS', failures: [] });
  });
});
