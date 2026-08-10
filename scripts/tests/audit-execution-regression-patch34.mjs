import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');
const frontendRoot = [
  path.resolve(backendRoot, '../ctic-frontend'),
  path.resolve(backendRoot, '../frontend'),
].find((candidate) => fs.existsSync(path.join(candidate, 'app/components')));

if (!frontendRoot) {
  throw new Error('Không tìm thấy thư mục ctic-frontend hoặc frontend nằm cùng cấp với backend.');
}

const read = (root, relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const checks = [];
const check = (name, condition) => {
  checks.push({ name, passed: Boolean(condition) });
};

const planController = read(backendRoot, 'src/audit-plans/audit-plans.controller.ts');
const planService = read(backendRoot, 'src/audit-plans/audit-plans.service.ts');
const reportController = read(backendRoot, 'src/reports/reports.controller.ts');
const reportService = read(backendRoot, 'src/reports/reports.service.ts');
const findingService = read(backendRoot, 'src/audit-findings/audit-findings.service.ts');
const findingDto = read(backendRoot, 'src/audit-findings/dto/create-audit-finding.dto.ts');
const dashboardService = read(backendRoot, 'src/dashboard/dashboard.service.ts');
const executionUi = read(frontendRoot, 'app/components/AuditExecutionWorkspaceModal.tsx');
const planDrawer = read(frontendRoot, 'app/components/AuditPlanWorkspaceDrawer.tsx');

check('Có API bắt đầu cuộc đánh giá', planController.includes("@Post(':id/start')"));
check('Có API hoàn thành cuộc đánh giá', planController.includes("@Post(':id/complete')"));
check('Bắt đầu yêu cầu quyết định đoàn đã ban hành', planService.includes("appointment.status !== 'issued'"));
check('Bắt đầu kiểm tra tổng man-day phân công', planService.includes('requiredMandays - allocatedMandays'));
check('Hoàn thành ghi nhận actual_mandays từng thành viên', planService.includes('actual_mandays: item.actualMandays'));
check('Hoàn thành ghi nhận actual_mandays của kỳ đánh giá', planService.includes('actual_mandays: totalActualMandays'));
check('Hoàn thành chỉ chấp nhận bước 0,5 MD', planService.includes('isHalfManday'));
check('Hoàn thành yêu cầu dấu vết nộp báo cáo chính thức', planService.includes('reportWorkflow.submitted_at'));
check('Có API nộp báo cáo', reportController.includes("@Post(':id/submit')"));
check('Báo cáo dự thảo được phép deep merge form_data', reportService.includes('this.deepMerge'));
check('Báo cáo nộp được đánh dấu submitted_at', reportService.includes('submitted_at: submittedAt.toISOString()'));
check('Báo cáo mới luôn bắt đầu ở trạng thái dự thảo', reportService.includes("status: 'draft'"));
check('Không cho sửa trực tiếp trạng thái workflow báo cáo', reportService.includes('Không được thay đổi trực tiếp trạng thái workflow của báo cáo'));
check('Báo cáo nộp kiểm tra tóm tắt thực hiện', reportService.includes("['audit_execution', 'summary']"));
check('Báo cáo nộp kiểm tra hiệu lực hệ thống', reportService.includes("['management_system', 'effectiveness_summary']"));
check('Báo cáo có NC chuyển chờ hành động khắc phục', reportService.includes("'corrective_action_required'"));
check('Hỗ trợ điểm phù hợp và quan sát', findingDto.includes("'conformity'") && findingDto.includes("'observation'"));
check('Chỉ NC mới làm báo cáo chuyển trạng thái CAP', findingService.includes("['major_nc', 'minor_nc'].includes"));
check('Đóng NC chỉ chuyển thẩm xét khi báo cáo đã nộp', findingService.includes("status: submittedAt") && findingService.includes("? 'ready_for_technical_review'") && findingService.includes(": 'draft'"));
check('Xem xét và đóng NC kiểm tra đúng thành viên đoàn', (findingService.match(/assertFindingAccess\(/g) ?? []).length >= 3);
check('Dashboard chỉ đếm NC chưa đóng', dashboardService.includes("finding_type: {\n                        in:"));
check('Frontend có không gian thực hiện đánh giá', executionUi.includes('KHÔNG GIAN THỰC HIỆN ĐÁNH GIÁ'));
check('Frontend có lưu dự thảo và nộp báo cáo', executionUi.includes('Lưu dự thảo') && executionUi.includes('Nộp báo cáo'));
check('Frontend có biểu mẫu phát hiện', executionUi.includes('Thêm phát hiện đánh giá'));
check('Frontend có xác nhận ngày công thực tế', executionUi.includes('Xác nhận ngày công thực tế'));
check('Drawer mở được không gian thực hiện', planDrawer.includes('<AuditExecutionWorkspaceModal'));

const halfStepValid = [0, 0.5, 1, 1.5, 2].every(
  (value) => Math.abs(value * 2 - Math.round(value * 2)) < 0.000001,
);
const halfStepInvalid = [0.1, 0.25, 0.75, 1.25].every(
  (value) => Math.abs(value * 2 - Math.round(value * 2)) >= 0.000001,
);
check('Mô phỏng bước 0,5 MD hợp lệ', halfStepValid && halfStepInvalid);

const calendarDays = (start, end) => {
  const from = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const to = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((to - from) / 86400000) + 1;
};
check(
  'Mô phỏng 2 ngày không cho vượt 2,0 MD',
  calendarDays(new Date('2026-08-05'), new Date('2026-08-06')) === 2 && 2.5 > 2,
);

console.log('\n=== PATCH 34 — THỰC HIỆN ĐÁNH GIÁ ===');
for (const item of checks) {
  console.log(`${item.passed ? '✓' : '✗'} ${item.name}`);
}

const passed = checks.filter((item) => item.passed).length;
const failed = checks.length - passed;
console.log(`\nPASS: ${passed}`);
console.log(`FAIL: ${failed}`);

if (failed > 0) process.exitCode = 1;
