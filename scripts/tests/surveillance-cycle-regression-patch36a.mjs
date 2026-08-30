import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..');
const projectRoot = path.resolve(backend, '..');
const frontendCandidates = [
  path.join(projectRoot, 'ctic-frontend'),
  path.join(path.dirname(projectRoot), 'ctic-frontend'),
  path.join(projectRoot, 'frontend'),
];
const frontend = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app', 'components', 'CertificationResultWorkspaceModal.tsx')),
);
if (!frontend) throw new Error('Không tìm thấy ctic-frontend để chạy regression Patch 36A.');

const read = (file) => fs.readFileSync(file, 'utf8');
const resultService = read(path.join(backend, 'src', 'certification-results', 'certification-results.service.ts'));
const notificationService = read(path.join(backend, 'src', 'audit-result-notifications', 'audit-result-notifications.service.ts'));
const dossierService = read(path.join(backend, 'src', 'certification-projects', 'certification-projects.service.ts'));
const resultUi = read(path.join(frontend, 'app', 'components', 'CertificationResultWorkspaceModal.tsx'));
const projectUi = read(path.join(frontend, 'app', 'components', 'CertificationProjectDetailScreen.tsx'));
const programUi = read(path.join(frontend, 'app', 'components', 'AuditProgramPanel.tsx'));

let pass = 0;
let fail = 0;
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`✓ ${name}`);
  } else {
    fail += 1;
    console.log(`✗ ${name}`);
  }
};

console.log('=== PATCH 36A — GIÁM SÁT NĂM 1 ===');
check('Backend nhận diện surveillance1/surveillance2 là loại giám sát', resultService.includes("normalized.includes('surveillance')"));
check('Backend kiểm tra chứng chỉ hiện hành trước khi kết luận giám sát', resultService.includes('Chưa có chứng chỉ hiện hành để lập quyết định lifecycle trong kỳ giám sát.'));
check('Backend trả chứng chỉ hiện hành cho workspace', resultService.includes('active_certificate: activeCertificate ?'));
check('Giám sát phải có quyết định trước thông báo F.12', resultService.includes('&& Boolean(context.decision)') && notificationService.includes('const requiresDecision = true;'));
check('F.12 không còn nhánh giám sát tự thông báo khi chưa có F.13', !notificationService.includes('Giám sát không có thay đổi không cần quyết định chứng nhận'));
check('Kết quả F.12 phải khớp quyết định đã ban hành', notificationService.includes('Kết quả thông báo phải phù hợp với quyết định chứng nhận đã ban hành'));
check('Backend mặc định kết quả giám sát là duy trì chứng nhận', resultService.includes("? 'certification_maintained'"));
check('Backend giữ ngày hết hạn chứng chỉ cũ khi giám sát', resultService.includes('isSurveillance && currentCertificate?.expire_date'));
check('Frontend gửi đúng audit_type theo kỳ thay vì hardcode initial', resultUi.includes('audit_type: workspace.lifecycle_type'));
check('Frontend cho chọn MAINTAIN và các loại thay đổi giám sát', resultUi.includes('MAINTAIN: "Duy trì chứng nhận"') && resultUi.includes('EXTEND_SCOPE:'));
check('Giám sát không thay đổi dùng kết quả Duy trì chứng nhận', resultUi.includes('certification_maintained'));
check('Frontend giải thích MAINTAIN không phát hành version mới', resultUi.includes('Không phát hành phiên bản mới'));
check('Frontend hiển thị chứng chỉ hiện hành đang được giám sát', resultUi.includes('Chứng chỉ hiện hành'));
check('Frontend chặn thông báo khi chưa có quyết định', resultUi.includes('!workspace.decision') && resultUi.includes('Phải ban hành quyết định chứng nhận'));
check('PLAN giám sát không còn bị ép tìm PLAN Giai đoạn 2', projectUi.includes('if (!isInitialDossier && candidates.length)'));
check('NC/CAP và thẩm xét giám sát dùng đúng PLAN của kỳ', projectUi.includes('return candidates[0];'));
check('Tạo PLAN giám sát lấy ngày kỳ trước làm gợi ý +1 năm', programUi.includes('previousPlanDate.add(1, "year")'));
check('PLAN giám sát/tái chứng nhận kế thừa địa điểm từ kỳ trước', programUi.includes('location: isStage1 ? "Từ xa" : previousPlan?.location || undefined'));
check('PLAN mới kế thừa phạm vi từ kỳ trước', programUi.includes('audit_scope: previousPlan?.audit_scope || undefined'));
check('PLAN mới kế thừa tiêu chí từ kỳ trước', programUi.includes('audit_criteria: previousPlan?.audit_criteria || undefined'));
check('PLAN lưu dấu vết nguồn kế thừa', programUi.includes('copied_from_previous_plan_id'));
check('Hồ sơ giám sát đã có F.12', dossierService.includes("document_key: 'audit_result_notification'"));
check('Hồ sơ giám sát luôn yêu cầu quyết định lifecycle', dossierService.includes("status: decisionIssued ? 'completed' : 'pending'"));
check('Hồ sơ giám sát không yêu cầu chứng chỉ mới cho decision không tạo version', dossierService.includes('certificateNotApplicable') && dossierService.includes('decisionRequiresCertificateVersion'));
check('Hồ sơ đi theo Thẩm xét -> Quyết định -> Thông báo', dossierService.includes("{ code: 'MAKE_DECISION'") && dossierService.includes("{ code: 'NOTIFY_RESULT'"));

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail) process.exit(1);
