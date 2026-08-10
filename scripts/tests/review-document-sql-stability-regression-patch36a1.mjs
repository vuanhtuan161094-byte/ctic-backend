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
  fs.existsSync(path.join(candidate, 'app', 'components', 'TechnicalReviewWorkspaceModal.tsx')),
);
if (!frontend) throw new Error('Không tìm thấy ctic-frontend để chạy regression Patch 36A.1.');

const read = (file) => fs.readFileSync(file, 'utf8');
const reports = read(path.join(backend, 'src', 'reports', 'reports.service.ts'));
const findings = read(path.join(backend, 'src', 'audit-findings', 'audit-findings.service.ts'));
const prisma = read(path.join(backend, 'src', 'prisma', 'prisma.service.ts'));
const main = read(path.join(backend, 'src', 'main.ts'));
const reviewService = read(path.join(backend, 'src', 'technical-reviews', 'technical-reviews.service.ts'));
const reviewController = read(path.join(backend, 'src', 'technical-reviews', 'technical-reviews.controller.ts'));
const dossierService = read(path.join(backend, 'src', 'certification-projects', 'certification-projects.service.ts'));
const api = read(path.join(frontend, 'app', 'lib', 'api.ts'));
const auditUi = read(path.join(frontend, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx'));
const reviewUi = read(path.join(frontend, 'app', 'components', 'TechnicalReviewWorkspaceModal.tsx'));
const dossierUi = read(path.join(frontend, 'app', 'components', 'CertificationProjectDetailScreen.tsx'));
const certUi = read(path.join(frontend, 'app', 'components', 'CertificateIssuanceWorkspaceModal.tsx'));

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

console.log('=== PATCH 36A.1 — BÁO CÁO/CAP + THẨM XÉT TÀI LIỆU + SQL + UPLOAD ===');

check('Báo cáo GĐ2 backend mặc định ngày báo cáo theo ngày cuối PLAN', reports.includes("this.reportStageForPlan(plan) === 'stage2' && auditEndDate"));
check('Frontend gửi report_date của GĐ2 bằng planned_end_date', auditUi.includes('report_date: normalizedAuditStage(plan.audit_type) === "stage2"') && auditUi.includes('? plan.planned_end_date'));
check('Frontend có quy tắc hạn HĐKP 30 ngày cho giám sát', auditUi.includes('key.includes("surveillance") || key.includes("giamsat") ? 30 : 45'));
check('Frontend mặc định 45 ngày cho chứng nhận lần đầu', auditUi.includes('return key.includes("surveillance") || key.includes("giamsat") ? 30 : 45'));
check('Frontend tự tính lại hạn HĐKP khi đổi ngày phát hiện', auditUi.includes('value.add(correctiveActionDefaultDays(plan?.audit_type), "day")'));
check('Backend tự áp dụng hạn HĐKP 30/45 ngày khi không truyền due_date', findings.includes("? 30\n                : 45") && findings.includes('suppliedDueDate ??'));
check('Backend lấy loại đánh giá từ PLAN/event để tính hạn HĐKP', findings.includes('report.audit_plans?.audit_type') && findings.includes('report.audit_plans?.audit_event?.event_type'));

check('Prisma SQL Server có cấu hình pool riêng', prisma.includes('idleTimeoutMillis') && prisma.includes('DB_POOL_MAX'));
check('Pool SQL giữ kết nối nhàn rỗi 5 phút mặc định', prisma.includes("'DB_POOL_IDLE_TIMEOUT_MS'") && prisma.includes('300_000'));
check('SQL Server dùng packetSize 32768 mặc định', prisma.includes("'DB_PACKET_SIZE'") && prisma.includes('32_768'));
check('Có health check SQL Server định kỳ', prisma.includes("'SELECT 1 AS connection_ok'") && prisma.includes('120_000'));
check('Có nhận diện lỗi EINVALIDSTATE', prisma.includes("'EINVALIDSTATE'"));
check('Có cơ chế recoverConnection', prisma.includes('async recoverConnection()'));
check('Backend xử lý riêng lỗi LoggedIn/Final state thay vì chết ngay', main.includes("process.on(\n        'uncaughtException'") && main.includes('prisma.isRecoverableDriverError'));
check('Lỗi không liên quan SQL vẫn kết thúc process', main.includes('process.exitCode = 1'));

check('Technical review có API preview từng hạng mục', reviewController.includes("'/:id/items/:documentKey/preview'") || reviewController.includes("':id/items/:documentKey/preview'"));
check('Technical review service có getReviewItemPreview', reviewService.includes('async getReviewItemPreview('));
check('Preview trả dữ liệu hệ thống của đơn đăng ký', reviewService.includes("case 'certification_application'"));
check('Preview trả dữ liệu kế hoạch', reviewService.includes("case 'audit_plan'"));
check('Preview trả dữ liệu báo cáo', reviewService.includes("case 'audit_report'"));
check('Preview trả dữ liệu NC/CAP', reviewService.includes("case 'nc_cap'"));
check('Technical review tự gắn file hiện hành vào hạng mục', reviewService.includes('attachCurrentDocumentFiles'));
check('Technical review nhận file F.15', reviewService.includes("type === 'audit_log_f15'") || reviewService.includes("'audit_log_f15'"));
check('Technical review nhận file F.07', reviewService.includes("'audit_attendance_f07'"));
check('Frontend có nút Xem cho từng hạng mục', reviewUi.includes('openReviewItemPreview(item)'));
check('Frontend mở file thẩm xét ngay trong tab mới', reviewUi.includes('openDocumentInBrowser') && reviewUi.includes('window.open("about:blank", "_blank")'));
check('Chỉ dòng đang thao tác mới hiển thị loading', reviewUi.includes('itemMutation.variables?.documentKey === item.document_key'));
check('Có nút Tất cả đạt cho thẩm xét sơ bộ', (reviewUi.match(/Tất cả đạt/g) ?? []).length >= 2);
check('Tất cả đạt vẫn chỉ là dữ liệu form và có thể chỉnh lại', reviewUi.includes('result: "yes"'));

check('Dossier backend nạp file gắn với hợp đồng', dossierService.includes('project.contract_id ? [project.contract_id]'));
check('Dossier backend nạp file gắn với thỏa thuận', dossierService.includes('project.agreement_id ? [project.agreement_id]'));
check('Dossier backend nạp file gắn với chương trình đánh giá', dossierService.includes('...programs.map((item) => item.id)'));
check('Dossier backend nạp file gắn với phát hiện/NC', dossierService.includes('...findings.map((item) => item.id)'));
check('Mỗi thành phần hồ sơ frontend có nút Xem tệp', dossierUi.includes('Xem tệp'));
check('Mỗi thành phần hồ sơ frontend có nút Tải tệp', dossierUi.includes('Tải tệp'));
check('Tệp tải lên dùng document_key của đúng thành phần hồ sơ', dossierUi.includes('documentType: item.document_key') && dossierUi.includes('formData.append("document_type", uploadTarget.documentType)'));
check('Dossier ưu tiên PDF khi chọn tệp hiện hành', dossierUi.includes('leftPdf') && dossierUi.includes('rightPdf'));

check('Axios không còn ép Content-Type application/json toàn cục', !api.includes('"Content-Type": "application/json"') && !api.includes("'Content-Type': 'application/json'"));
check('Chứng chỉ gửi file bằng FormData', certUi.includes('const data = new FormData()'));
check('Chứng chỉ append đúng field file', certUi.includes('data.append("file", uploadFile)'));
check('Bộ chọn chứng chỉ chỉ nhận PDF', certUi.includes('accept="application/pdf,.pdf"'));

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail) process.exit(1);
