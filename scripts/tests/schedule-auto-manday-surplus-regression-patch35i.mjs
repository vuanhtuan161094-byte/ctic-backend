import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');
const frontendCandidates = [
  path.resolve(backendRoot, '../ctic-frontend'),
  path.resolve(backendRoot, '../frontend'),
  path.resolve(backendRoot, '../../ctic-frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app', 'components', 'ScheduleResourcesScreen.tsx')),
);

let pass = 0;
let fail = 0;
function check(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`✓ ${message}`);
  } else {
    fail += 1;
    console.error(`✗ ${message}`);
  }
}
function read(base, relative) {
  return fs.readFileSync(path.join(base, relative), 'utf8');
}

console.log('=== PATCH 35I — TỰ TÍNH MD THEO NGÀY, TỰ PHÂN BỔ & CÂN ĐÚNG KẾ HOẠCH ===');

check(Boolean(frontendRoot), 'Tìm được thư mục frontend trên Windows');
if (!frontendRoot) process.exit(1);

const allocationService = read(backendRoot, 'src/audit-team-appointments/audit-manday-allocation.service.ts');
const appointmentService = read(backendRoot, 'src/audit-team-appointments/audit-team-appointments.service.ts');
const schedulingPolicy = read(backendRoot, 'src/audit-team-appointments/audit-team-scheduling.policy.ts');
const ts = createRequire(import.meta.url)('typescript');
const serviceAst = ts.createSourceFile('appointments.ts', appointmentService, ts.ScriptTarget.Latest, true);
const serviceClass = serviceAst.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'AuditTeamAppointmentsService');
function productionMethod(name) {
  const method = serviceClass?.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(serviceAst) === name);
  return method ? ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, method, serviceAst).replace(/\s+/g, '') : '';
}
const schedule = read(frontendRoot, 'app/components/ScheduleResourcesScreen.tsx');
const panel = read(frontendRoot, 'app/components/IntegratedMandayAllocationPanel.tsx');

check(allocationService.includes("IMS_ALLOCATION_V2"), 'Nâng phiên bản thuật toán phân bổ IMS lên V2');
check(allocationService.includes('assignedStage2Units('), 'Backend tính tổng MD thực tế đã bố trí cho thành viên');
check(allocationService.includes('allocationTargetStage2Units('), 'Backend dùng tổng MD bố trí làm mục tiêu ma trận');
check(allocationService.includes('plannedMandays / MANDAY_UNIT'), 'Hạn mức ma trận từng người lấy từ MD đã bố trí');
check(allocationService.includes('allocation_target_stage2_mandays'), 'API trả riêng tổng MD bố trí cho ma trận');
check(allocationService.includes('plan_difference_mandays'), 'API trả phần chênh so với kế hoạch tối thiểu');
check(allocationService.includes('Math.abs(allocatedMandays - requiredMandays) > 0.001'), 'GĐ1 bắt buộc tổng MD bằng đúng kế hoạch');
check(
  schedulingPolicy.includes('Math.abs(allocatedMandays - requiredMandays) > 0.001')
    && schedulingPolicy.includes('allocatedMandays < requiredMandays')
    && schedulingPolicy.includes('nhưng đang bố trí vượt'),
  'Kiểm tra ban hành chung chặn cả thiếu và vượt MD',
);
check(/import\s*\{[^}]*validateAuditMandayAllocation[^}]*\}\s*from '\.\/audit-team-scheduling.policy'/.test(appointmentService)
  && productionMethod('validateMandayAllocation').includes('returnvalidateAuditMandayAllocation(members,plan,strictTotal)'), 'Service import và delegate đúng members/plan/strictTotal tới scheduling policy');
check(productionMethod('validateMembers').includes('this.validateMandayAllocation(members,plan,strictMandays)'), 'Validation pipeline thực sự sử dụng manday policy');
check(productionMethod('issue').includes('appointment.audit_plans,id,true,userId)')
  && productionMethod('issue').includes('awaitthis.validateMembers('), 'Issue gọi validation với strict total trước ban hành');
for (const flow of ['create', 'update']) {
  check(productionMethod(flow).includes('awaitthis.validateMembers('), `${flow} vẫn gọi validation pipeline`);
}
// Execute the actual pure policy, not a copied simulation, at the old boundaries.
const policyModule = { exports: {} };
const require = createRequire(path.join(backendRoot, 'src/audit-team-appointments/audit-team-scheduling.policy.ts'));
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const engineModule = { exports: {} };
new Function('require', 'module', 'exports', compile(read(backendRoot, 'src/audit-team-appointments/integrated-manday-allocation.engine.ts')))(require, engineModule, engineModule.exports);
new Function('require', 'module', 'exports', compile(schedulingPolicy))((name) => name === './integrated-manday-allocation.engine' ? engineModule.exports : require(name), policyModule, policyModule.exports);
const plan = { id: 'plan', project_id: 'project', plan_code: 'PLAN', audit_type: 'stage2', audit_event: { planned_mandays: 2 } };
const member = { expert_id: 'expert', team_role: 'AUDITOR', planned_start_date: '2026-09-01', planned_end_date: '2026-09-02', planned_mandays: 2 };
function policyOutcome(members, currentPlan = plan, strict = true) {
  try { policyModule.exports.validateAuditMandayAllocation(members, currentPlan, strict); return ''; }
  catch (error) { return error.message; }
}
check(policyOutcome([member]) === '', 'Actual policy chấp nhận tổng đúng 2 MD');
check(policyOutcome([{ ...member, planned_mandays: 1.5 }]).includes('mới bố trí'), 'Actual policy chặn thiếu MD');
check(policyOutcome([{ ...member, planned_end_date: '2026-09-03', planned_mandays: 2.5 }]).includes('bố trí vượt'), 'Actual policy chặn surplus MD dù lịch đủ ngày');
check(policyOutcome([member], { ...plan, audit_event: { planned_mandays: null } }).includes('chưa có man-day'), 'Actual policy chặn strict issue khi chưa có planned MD');
check(policyOutcome([{ ...member, planned_mandays: 1.25 }]).includes('0,5'), 'Actual policy giữ bước nửa ngày');
check(policyOutcome([{ ...member, planned_mandays: 2.5 }]).includes('ngày tham gia'), 'Actual policy chặn MD vượt số ngày stage2');
check(policyOutcome([{ ...member, team_role: 'TECHNICAL_EXPERT' }]).includes('không được tính man-day'), 'Actual policy không tính MD cho vai trò hỗ trợ');
check(policyOutcome([{ ...member, planned_mandays: 1.5 }], plan, false) === '', 'Draft không ép strict total trước issue');
check(allocationService.includes('ensureAllocationForIssue('), 'Có cơ chế tự khôi phục ma trận trước khi ban hành');
check(appointmentService.includes('ensureAllocationForIssue(id, userId)'), 'Ban hành GĐ2 tự bảo đảm ma trận tồn tại và hợp lệ');
check(allocationService.includes('Mọi man-day đã bố trí phải được gắn trực tiếp với chương trình'), 'Mọi MD bố trí vẫn bắt buộc gắn Thành viên + Chương trình');

check(schedule.includes('onSuggestedMandaysChange?.(inclusiveDayCount(normalized))'), 'Chọn ngày tự động tính số MD theo số ngày đã chọn');
check(schedule.includes('Có thể điều chỉnh lại theo bước 0,5 MD'), 'Frontend giải thích MD tự tính vẫn được điều chỉnh');
check(schedule.includes('/manday-allocation/auto'), 'Lưu dự thảo GĐ2 tự gọi lại thuật toán phân bổ ma trận');
check(schedule.includes('preservedProgramWeights'), 'Tự phân bổ lại vẫn giữ trọng số chương trình trước đó');
check(panel.includes('Đã tự động phân bổ man-day theo chương trình'), 'Người dùng nhận thông báo rõ sau khi tự phân bổ lại');
check(schedule.includes('Math.abs(selectedAppointmentAllocatedMandays - selectedRequiredMandays) < 0.001'), 'Nút ban hành chỉ hợp lệ khi tổng MD bằng đúng kế hoạch');
check(schedule.includes('Đang vượt') && schedule.includes('Hãy giảm'), 'Giao diện yêu cầu giảm phần MD vượt kế hoạch');
check(schedule.includes('Yêu cầu chính xác'), 'Giao diện thể hiện MD là yêu cầu chính xác');
check(schedule.includes('tổng phải đúng'), 'Khung ngày PLAN yêu cầu tổng MD bằng đúng kế hoạch');
check(schedule.includes('Lưu & xác nhận điều phối'), 'GĐ2 giữ luồng một bước Lưu & xác nhận điều phối');

check(panel.includes('allocation_target_stage2_mandays'), 'Ma trận hiển thị riêng tổng MD bố trí');
check(panel.includes('MD bố trí:'), 'Ma trận hiển thị MD bố trí theo lịch');
check(panel.includes('Chênh lệch ma trận:'), 'Ma trận vẫn bắt buộc cân đúng tổng MD đã bố trí');
check(
  allocationService.includes('allocatedUnits === allocationTargetStage2Units')
    && panel.includes('data.balanced ? "Đã cân bằng" : "Chưa cân bằng"'),
  'Ma trận chỉ cân khi tổng phân bổ bằng đúng tổng MD mục tiêu',
);

// Các điều kiện cũ vẫn phải còn.
check(schedule.includes('Ngày công phải theo bước 0,5 MD'), 'MD vẫn theo bước 0,5');
check(schedule.includes('Không vượt quá ${maximumMandays} MD theo thời gian đã chọn'), 'MD từng người vẫn không vượt số ngày đã chọn');
check(schedule.includes('Chuyên gia kỹ thuật, quan sát viên và chuyên gia tập sự không được tính man-day'), 'Vai trò hỗ trợ vẫn không tính MD');
check(allocationService.includes('program.requiredUnits'), 'Tổng từng chương trình vẫn được kiểm tra');
check(allocationService.includes('Trưởng đoàn phải nhận tối thiểu 0,5 MD Giai đoạn 2'), 'Trưởng đoàn vẫn phải có MD GĐ2');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
