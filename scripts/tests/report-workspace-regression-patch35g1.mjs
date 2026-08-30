import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..', '..');
const frontendCandidates = [
  path.resolve(backendRoot, '..', 'ctic-frontend'),
  path.resolve(backendRoot, '..', 'frontend'),
  path.resolve('/mnt/data/work35g1/frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'app', 'components')));

if (!frontendRoot) {
  throw new Error('Không tìm thấy thư mục frontend để chạy regression Patch 35G.1.');
}

const read = (file) => fs.readFileSync(file, 'utf8');
const reportsService = read(path.join(backendRoot, 'src', 'reports', 'reports.service.ts'));
const execution = read(path.join(frontendRoot, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx'));
const drawer = read(path.join(frontendRoot, 'app', 'components', 'AuditPlanWorkspaceDrawer.tsx'));
const detail = read(path.join(frontendRoot, 'app', 'components', 'CertificationProjectDetailScreen.tsx'));
const schedule = read(path.join(frontendRoot, 'app', 'components', 'ScheduleResourcesScreen.tsx'));
const auditPlans = read(path.join(backendRoot, 'src', 'audit-plans', 'audit-plans.service.ts'));

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) {
    console.log(`✓ ${name}`);
    pass += 1;
  } else {
    console.log(`✗ ${name}`);
    fail += 1;
  }
}

console.log('=== PATCH 35G.1 — TÁCH KHÔNG GIAN BÁO CÁO ĐÁNH GIÁ ===');
check('Có chế độ workspace riêng cho báo cáo', execution.includes('AuditExecutionWorkspaceMode = "full" | "report" | "findings" | "complete"'));
check('Chế độ báo cáo ẩn thanh tab của workspace tổng', execution.includes('tabBarStyle={focusedTab ? { display: "none", margin: 0 } : undefined}'));
check('Tiêu đề riêng là KHÔNG GIAN BÁO CÁO ĐÁNH GIÁ', execution.includes('KHÔNG GIAN BÁO CÁO ĐÁNH GIÁ'));
check('Workspace báo cáo vẫn có lưu dự thảo', execution.includes('Lưu dự thảo'));
check('Workspace báo cáo vẫn có nút nộp báo cáo', execution.includes('Nộp báo cáo'));
check('Workspace báo cáo vẫn có xuất Word', execution.includes('Xuất Word'));
check('Workspace báo cáo vẫn có xuất PDF', execution.includes('Xuất PDF'));
check('Có thể bắt đầu đánh giá ngay từ workspace báo cáo nếu chưa bắt đầu', execution.includes('Bắt đầu đánh giá'));
check('Dữ liệu cũ completed nhưng thiếu báo cáo có nút khôi phục', execution.includes('Khôi phục và tạo báo cáo'));
check('Backend cho phép khôi phục completed chỉ khi chưa có báo cáo', reportsService.includes("if (plan.status === 'completed')") && reportsService.includes('existingReport'));
check('Backend đưa PLAN thiếu báo cáo về in_progress trước khi tạo', reportsService.includes("status: 'in_progress'") && reportsService.includes("plan.status = 'in_progress'"));
check('Backend không cho tạo báo cáo mới nếu PLAN completed đã có báo cáo', reportsService.includes('hãy mở báo cáo hiện có thay vì tạo báo cáo mới'));
check('Luồng hoàn thành vẫn bắt buộc phải có báo cáo', auditPlans.includes("'Chưa có báo cáo đánh giá'"));
check('Luồng hoàn thành vẫn bắt buộc báo cáo phải được nộp', auditPlans.includes('Báo cáo phải được nộp trước khi hoàn thành cuộc đánh giá'));
check('Drawer mở workspace thực hiện thống nhất', drawer.includes('setExecutionMode("full")') && drawer.includes('<AuditExecutionWorkspaceModal'));
check('Drawer không tách nút báo cáo/phát hiện khỏi workspace thống nhất', !drawer.includes('setExecutionMode("report")') && !drawer.includes('setExecutionMode("findings")'));
check('Hành động báo cáo vẫn truy cập được từ dossier/workspace', detail.includes('Mở báo cáo') && detail.includes('mode: "report"'));
check('Drawer không còn yêu cầu phạm vi IAF/NACE cho từng thành viên PLAN', !drawer.includes('Có thành viên chưa được phân công phạm vi IAF/NACE.'));
check(
  'Điều phối không phân công chi tiết quá trình/phòng ban/điều khoản',
  schedule.includes('Điều phối viên không phân công phòng ban/quá trình')
    && schedule.includes('Chương trình/tiêu chuẩn hệ thống đối chiếu'),
);
check('Hồ sơ GĐ1 hiển thị mã F.09-P.09-01', detail.includes('F.09-P.09-01'));
check('Hồ sơ GĐ2 hiển thị mã F.09-P.09-02', detail.includes('F.09-P.09-02'));
check('Dòng báo cáo có nút Mở báo cáo riêng', detail.includes('Mở báo cáo'));
check('Dòng báo cáo mở thẳng workspace report', detail.includes('setFocusedExecutionWorkspace({ planId: plan.id, mode: "report" })'));
check('Workspace report được render độc lập ngoài PLAN drawer', detail.includes('<AuditExecutionWorkspaceModal') && detail.includes('focusedExecutionWorkspace?.planId'));

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
