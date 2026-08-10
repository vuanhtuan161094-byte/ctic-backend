import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

const tests = [
  'full-cycle-static-regression-patch32.mjs',
  'schedule-manday-regression-patch33.mjs',
  'pre-audit-documents-regression-patch35b.mjs',
  'exact-original-forms-regression-patch35c1.mjs',
  'dynamic-checklist-regression-patch35d.mjs',
  'dossier-form-workspace-regression-patch35e.mjs',
  'corrective-action-workspace-regression-patch35f.mjs',
  'typescript-fixes-regression-patch35f1.mjs',
  'technical-review-f11-regression-patch35g.mjs',
  'report-workspace-regression-patch35g1.mjs',
  'report-stage-separation-regression-patch35g2.mjs',
  'certification-results-regression-patch35h.mjs',
  'schedule-auto-manday-surplus-regression-patch35i.mjs',
  'certificate-issuance-regression-patch35j.mjs',
  'integrated-manday-allocation-regression-patch35a3.mjs',
  'program-assignment-manday-sync-regression-patch35a2.mjs',
  'program-month-manual-manday-regression-patch35a4.mjs',
  'stage1-team-plan-regression-patch35a5.mjs',
  'report-document-regression-patch35a.mjs',
  'report-document-runtime-regression-patch35a1.mjs',
  'prisma-provider-regression-patch35a42.mjs',
  'prisma-baseline-regression-patch35a43.mjs',
  'prisma-baseline-cli-regression-patch35a44.mjs',
  'prisma-temporary-permission-regression-patch35a45.mjs',
  'surveillance-cycle-regression-patch36a.mjs',
  'official-pdf-review-regression-patch36a2.mjs',
  'official-pdf-entity-review-regression-patch36a3.mjs',
  'platform-branding-regression-patch36b1.mjs',
  'document-file-client-regression-patch36b2.mjs',
  'deployment-config-regression-patch36b3.mjs',
  'storage-safety-regression-patch36b4.mjs',
  'upload-file-integrity-regression-patch36b5.mjs',
  'api-security-authorization-regression-patch36b6.mjs',
  'prisma-client-sync-regression-patch36b6a.mjs',
  'typescript-portability-regression-patch36b6b.mjs',
  'resource-scope-enforcement-regression-patch36b7.mjs',
  'security-module-di-regression-patch36b7a.mjs',
  'commercial-stabilization-regression-patch36c0.mjs',
  'database-resilience-regression-patch36c0a.mjs',
  'commercial-baseline-hardening-regression-patch36c1.mjs',
  'commercial-database-credentials-regression-patch36c1a.mjs',
  'windows-powershell-portability-regression-patch36c1b.mjs',
  'windows-powershell-parse-regression-patch36c1c.mjs',
];

let failed = 0;

for (const test of tests) {
  console.log(`\n===== ${test} =====`);
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/tests', test)],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${test}`);
  }
}

console.log(`\n===== CURRENT REGRESSION SUMMARY =====`);
console.log(`PASS: ${tests.length - failed}/${tests.length}`);
console.log(`FAIL: ${failed}/${tests.length}`);

if (failed > 0) {
  process.exitCode = 1;
}
