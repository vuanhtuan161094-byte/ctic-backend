import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../..');
const projectRoot = path.resolve(backend, '..');
const frontendCandidates = [
  path.join(projectRoot, 'ctic-frontend'),
  path.join(projectRoot, 'frontend'),
  path.join(path.dirname(projectRoot), 'ctic-frontend'),
];
const frontend = frontendCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'app/components/DashboardShell.tsx')));
if (!frontend) throw new Error('Không tìm thấy ctic-frontend để chạy Master UAT regression.');

const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
let pass = 0;
let fail = 0;
const check = (name, ok) => {
  if (ok) { pass += 1; console.log(`PASS: ${name}`); }
  else { fail += 1; console.log(`FAIL: ${name}`); }
};

const runner = read(backend, 'scripts/uat/run-master-uat.cjs');
const p09 = read(backend, 'scripts/tests/run-p09-real-e2e.cjs');
const regressions = read(backend, 'scripts/tests/run-current-regressions-patch36c0.mjs');
const shell = read(frontend, 'app/components/DashboardShell.tsx');
const dossier = read(backend, 'src/certification-projects/certification-projects.service.ts');
const notification = read(backend, 'src/audit-result-notifications/audit-result-notifications.service.ts');
const decision = read(backend, 'src/certification-decisions/certification-decisions.service.ts');
const readiness = read(backend, 'src/audit-team-appointments/audit-team-readiness.service.ts');
const portal = read(backend, 'src/customer-portal/customer-portal.controller.ts');
const casesPortal = read(backend, 'src/governance-cases/governance-cases.portal.controller.ts');
const commercial = read(backend, 'src/commercial-management-reporting/commercial-management-reporting.controller.ts');
const admin = read(backend, 'src/system-administration/system-administration.controller.ts');
const documents = read(backend, 'src/document-control/document-control.service.ts');
const phase9E2E = read(backend, 'test/system-administration-governance.e2e-spec.ts');
const prodEnv = read(backend, 'scripts/production/validate-production-env.cjs');
const portalMenu = shell.match(
  /const navigationItems[\s\S]*?if \(customerPortalMode\) \{([\s\S]*?)\n    \}\n\n    const operations:/,
)?.[1] ?? '';

console.log('=== MASTER FULL-SYSTEM UAT STATIC CONTRACT ===');
check('UAT runner chạy backend regression/build/Jest', runner.includes("'test:regression'") && runner.includes("'build'") && runner.includes("'--runInBand'"));
check('UAT runner chạy frontend test/lint', runner.includes("runNpm(['test'], frontend)") && runner.includes("runNpm(['run', 'lint'], frontend)"));
check('UAT runner gọi P09 real SQL gate', runner.includes("'test:e2e:p09'"));
check('UAT runner từ chối production', runner.includes("NODE_ENV=production"));
check('P09 vẫn khóa canonical migration 28 và 18 suite baseline', p09.includes('20260825050000_system_administration_governance') && p09.includes('system-administration-governance.e2e-spec.ts'));
check('F.12 vẫn đứng sau quyết định F.13', notification.includes('const requiresDecision = true;'));
check('Dossier giữ Decision trước Notification', dossier.includes("{ code: 'MAKE_DECISION'") && dossier.includes("{ code: 'NOTIFY_RESULT'"));
check('Certificate lifecycle vẫn dùng decision type authority', decision.includes('normalizeDecisionType') && decision.includes('decisionRequiresCertificateVersion'));
check('Team readiness vẫn là authority derive-current', readiness.includes('class AuditTeamReadinessService') && !readiness.includes('readiness_cache'));
check('Customer Portal vẫn là controller tách riêng', portal.includes("@Controller('customer-portal')"));
check('Customer governance case vẫn dùng portal-safe controller riêng', casesPortal.includes("@Controller('customer-portal/me/cases')"));
check('Commercial/reporting vẫn có controller riêng, không nhập vào certificate authority', commercial.includes("@Controller('commercial-management-reporting')"));
check('System Administration vẫn là internal controller riêng', admin.includes("@Controller('system-administration')"));
check('Controlled document issue có service lifecycle riêng', documents.includes('async issueDocument'));
check('Controlled document ISSUE dùng bounded Serializable transaction', /async issueDocument[\s\S]*?return this\.serializable\(async \(tx\)/.test(documents) && documents.includes('attempt < 2'));
check('Document business transaction không retry P1001 connection outage', !/\['P1001'/.test(documents) && !documents.includes("errorCode(error) === 'P1001'"));
check('Phase 9 E2E safety reconnect chỉ bounded trong test harness', phase9E2E.includes('isTransientSqlConnectivityError') && phase9E2E.includes('attempt < 2') && phase9E2E.includes('await prisma.$disconnect()'));
check('Production env validation vẫn fail-closed', prodEnv.includes('NODE_ENV must be exactly production') && prodEnv.includes('validateRuntimeEnvironment'));
check('Frontend vẫn disable Product Certification', shell.includes('{ value: "products", label: "Chứng nhận sản phẩm", disabled: true }'));
check('Frontend vẫn disable Validation/Verification', shell.includes('{ value: "validation", label: "Thẩm tra & xác nhận", disabled: true }'));
check(
  'Customer portal menu không có System Admin',
  portalMenu.includes('CỔNG KHÁCH HÀNG')
    && !portalMenu.includes('system-admin')
    && !portalMenu.includes('Quản trị hệ thống'),
);
check('UAT plan tồn tại', fs.existsSync(path.join(backend, 'docs/uat/MASTER_UAT_PLAN.md')));
check('RC1 release gate tồn tại', fs.existsSync(path.join(backend, 'docs/uat/RC1_RELEASE_GATE.md')));

console.log(`\nMaster full-system UAT regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
