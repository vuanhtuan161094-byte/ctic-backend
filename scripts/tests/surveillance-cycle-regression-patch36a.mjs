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
check('Backend kiểm tra chứng chỉ hiện hành trước khi kết luận giám sát', resultService.includes('Giám sát chỉ được kết luận duy trì khi dự án đang có giấy chứng nhận còn hiệu lực.'));
check('Backend trả chứng chỉ hiện hành cho workspace', resultService.includes('active_certificate: activeCertificate ?'));
check('Giám sát không thay đổi có thể lập F.12 mà không cần F.13', resultService.includes('&& (isSurveillance || Boolean(context.decision))'));
check('Backend mặc định kết quả giám sát là duy trì chứng nhận', resultService.includes("? 'certification_maintained'"));
check('Backend giữ ngày hết hạn chứng chỉ cũ khi giám sát', resultService.includes('isSurveillance && activeCertificate?.expire_date'));
check('Frontend gửi đúng audit_type theo kỳ thay vì hardcode initial', resultUi.includes('audit_type: workspace.lifecycle_type'));
check('Frontend cho chọn giám sát có/không có thay đổi chứng nhận', resultUi.includes('Có thay đổi thông tin/phạm vi chứng nhận?'));
check('Giám sát không thay đổi mặc định Duy trì chứng nhận', resultUi.includes('notificationForm.setFieldValue("notification_result", "certification_maintained")'));
check('Frontend giải thích giám sát bình thường không cần F.13', resultUi.includes('Giám sát thông thường không cần F.13'));
check('Frontend hiển thị chứng chỉ đang được giám sát', resultUi.includes('Chứng chỉ đang được giám sát'));
check('Nếu có thay đổi mà chưa có F.13 thì frontend chặn phát hành F.12', resultUi.includes('notificationHasChanges && !workspace.decision'));
check('PLAN giám sát không còn bị ép tìm PLAN Giai đoạn 2', projectUi.includes('if (!isInitialDossier && candidates.length)'));
check('NC/CAP và thẩm xét giám sát dùng đúng PLAN của kỳ', projectUi.includes('return candidates[0];'));
check('Tạo PLAN giám sát lấy ngày kỳ trước làm gợi ý +1 năm', programUi.includes('previousPlanDate.add(1, "year")'));
check('PLAN mới kế thừa địa điểm từ kỳ trước', programUi.includes('location: previousPlan?.location || undefined'));
check('PLAN mới kế thừa phạm vi từ kỳ trước', programUi.includes('audit_scope: previousPlan?.audit_scope || undefined'));
check('PLAN mới kế thừa tiêu chí từ kỳ trước', programUi.includes('audit_criteria: previousPlan?.audit_criteria || undefined'));
check('PLAN lưu dấu vết nguồn kế thừa', programUi.includes('copied_from_previous_plan_id'));
check('Hồ sơ giám sát đã có F.12', dossierService.includes("document_key: 'audit_result_notification'"));
check('Hồ sơ giám sát cho phép F.13 không áp dụng khi không thay đổi', dossierService.includes("status: noCertificationChanges\n                        ? 'not_applicable'"));
check('Hồ sơ giám sát không yêu cầu chứng chỉ mới khi không thay đổi', dossierService.includes("document_name: 'Giấy chứng nhận sửa đổi (nếu có)'"));

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail) process.exit(1);
