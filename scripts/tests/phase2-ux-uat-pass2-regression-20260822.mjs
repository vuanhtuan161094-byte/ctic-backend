import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..');
const projectRoot = path.resolve(backend, '..');
const frontendCandidates = [
  path.join(projectRoot, 'ctic-frontend'),
  path.join(projectRoot, 'frontend'),
  path.join(path.dirname(projectRoot), 'ctic-frontend'),
];
const frontend = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app', 'components', 'CertificationProjectDetailScreen.tsx')),
);
if (!frontend) throw new Error('Không tìm thấy ctic-frontend để chạy Phase 2 UX/UAT Pass 2 regression.');

const read = (file) => fs.readFileSync(file, 'utf8');
const dossierService = read(path.join(backend, 'src', 'certification-projects', 'certification-projects.service.ts'));
const notificationService = read(path.join(backend, 'src', 'audit-result-notifications', 'audit-result-notifications.service.ts'));
const decisionService = read(path.join(backend, 'src', 'certification-decisions', 'certification-decisions.service.ts'));
const actionAuth = read(path.join(backend, 'src', 'work-items', 'action-authorization.service.ts'));
const projectUi = read(path.join(frontend, 'app', 'components', 'CertificationProjectDetailScreen.tsx'));
const resultUi = read(path.join(frontend, 'app', 'components', 'CertificationResultWorkspaceModal.tsx'));
const certificateUi = read(path.join(frontend, 'app', 'components', 'CertificateIssuanceWorkspaceModal.tsx'));
const executionUi = read(path.join(frontend, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx'));
const documentUi = read(path.join(frontend, 'app', 'components', 'AuditDocumentCenterModal.tsx'));
const capUi = read(path.join(frontend, 'app', 'components', 'CorrectiveActionWorkspaceModal.tsx'));

let pass = 0;
let fail = 0;
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL: ${name}`);
  }
};

console.log('=== PHASE 2 UX/UAT PASS 2 — WORKFLOW CONSISTENCY ===');
check('F.12 luôn yêu cầu quyết định F.13 đã ban hành', notificationService.includes('const requiresDecision = true;'));
check('F.12 bị ràng buộc kết quả với decision', notificationService.includes('Kết quả thông báo phải phù hợp với quyết định chứng nhận đã ban hành'));
check('Dossier tách MAKE_DECISION và NOTIFY_RESULT', dossierService.includes("{ code: 'MAKE_DECISION'") && dossierService.includes("{ code: 'NOTIFY_RESULT'"));
check('Certificate N/A dùng lifecycle helper thay vì hard-code MAINTAIN', dossierService.includes('certificateNotApplicable') && dossierService.includes('decisionRequiresCertificateVersion'));
check('Application Review delegation trước project dùng assignment của delegator', actionAuth.includes('const expectedReviewerId = resolvedInput.effectiveDelegation') && actionAuth.includes('resolvedInput.effectiveDelegation.delegatorUserId'));
check('Frontend hỗ trợ REFUSE như lifecycle decision', resultUi.includes('| "REFUSE";') && resultUi.includes('REFUSE: "Từ chối cấp chứng nhận"'));
check('REFUSE bị khóa về kết quả Không chấp thuận ở cả backend và UI', decisionService.includes("decisionType === 'REFUSE'") && decisionService.includes('Quyết định REFUSE phải có kết quả Không chấp thuận') && resultUi.includes('selectedDecisionType !== "REFUSE"') && resultUi.includes('disabled={selectedDecisionType === "REFUSE"}'));
check('REFUSE không yêu cầu Certificate Series và F.12 luôn là không cấp', resultUi.includes('["GRANT", "REFUSE"].includes(values.decision_type)') && notificationService.includes("decisionType === 'REFUSE' ||"));
check('Chỉ Decision Maker thấy mutation ban hành quyết định', resultUi.includes('const canDecision = normalizedRoles.includes("decisionmaker")'));
check('Chỉ Decision Maker thấy mutation phát hành/upload chứng chỉ', certificateUi.includes('const canIssue = normalizedRoles.includes("decisionmaker")') && certificateUi.includes('const canUpload = normalizedRoles.includes("decisionmaker")'));
check('Audit execution chỉ mở mutation cho Auditor/Lead Auditor', executionUi.includes('["auditor", "lead_auditor"].includes(role)') && !executionUi.includes('["admin", "staff", "auditor", "lead_auditor"]'));
check('Trung tâm F.03/F.04/F.05 có chế độ read-only', documentUi.includes('readOnly?: boolean;') && documentUi.includes('disabled={readOnly}') && projectUi.includes('readOnly={!roles.some'));
check('Người không phải Admin/Coordinator không auto-create PLAN', projectUi.includes('const canCreatePlan = roles.some((role) => ["admin", "coordinator"].includes(normalize(role)))') && projectUi.includes('Vui lòng chờ Điều phối viên tạo PLAN'));
check('CAP deep-link giữ finding_id và focus đúng NC', projectUi.includes('const findingId = url.searchParams.get("finding_id")') && projectUi.includes('initialFindingId={correctiveActionFindingId}') && capUi.includes('initialFindingId?: string | null;') && capUi.includes('Công việc đang mở'));
check('UI fallback workflow đi Quyết định trước Thông báo', projectUi.includes('["MAKE_DECISION", ["certification_decision"]]') && projectUi.includes('["NOTIFY_RESULT", ["audit_result_notification"]]'));
check('Dossier role projection không quảng bá Admin bypass review/decision/certificate', dossierService.includes("responsibleRoles: ['TECHNICAL_REVIEWER']") && dossierService.includes("responsibleRoles: ['DECISION_MAKER']"));

console.log(`\nPhase 2 UX/UAT Pass 2 regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
