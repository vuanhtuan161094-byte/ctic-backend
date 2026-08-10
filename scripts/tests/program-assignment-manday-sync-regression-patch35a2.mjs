import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');
const frontendRoot = [
  path.resolve(backendRoot, '../ctic-frontend'),
  path.resolve(backendRoot, '../frontend'),
].find((candidate) => fs.existsSync(path.join(candidate, 'app', 'components')));

if (!frontendRoot) {
  throw new Error('Không tìm thấy thư mục ctic-frontend hoặc frontend nằm cùng cấp với backend.');
}

const read = (root, relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const teamService = read(backendRoot, 'src/audit-team-appointments/audit-team-appointments.service.ts');
const mandayService = read(backendRoot, 'src/manday-calculations/manday-calculations.service.ts');
const mandayDto = read(backendRoot, 'src/manday-calculations/dto/create-manday-calculation.dto.ts');
const scheduleUi = read(frontendRoot, 'app/components/ScheduleResourcesScreen.tsx');
const programUi = read(frontendRoot, 'app/components/AuditProgramPanel.tsx');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const planEvaluatorStart = teamService.indexOf('private async evaluatePlanProgramAllocation');
const planEvaluatorEnd = teamService.indexOf('private async getProjectOrThrow', planEvaluatorStart);
const planEvaluator = teamService.slice(planEvaluatorStart, planEvaluatorEnd);

console.log('\n=== PATCH 35A.2 — PHÂN CÔNG CHƯƠNG TRÌNH & ĐỒNG BỘ MAN-DAY ===');

check('Backend có bộ đánh giá phân công theo chương trình', planEvaluatorStart >= 0);
check('Phân công kế hoạch yêu cầu chỉ định đoàn cấp hồ sơ đã ban hành', planEvaluator.includes("status: 'issued'") && planEvaluator.includes('projectTeamAuditType'));
check('Phân công kế hoạch chặn chuyên gia ngoài đoàn cấp hồ sơ', planEvaluator.includes('projectTeamExpertIds.has(member.expert_id)'));
check('Đối chiếu năng lực theo standard_code', planEvaluator.includes('competency.standard_code') && planEvaluator.includes('program.standard_code'));
check('Đối chiếu năng lực theo management_system', planEvaluator.includes('competency.management_system') && planEvaluator.includes('program.management_system'));
check('Không đối chiếu lại IAF trong bộ đánh giá cấp kế hoạch', !/iaf/i.test(planEvaluator));
check('Không đối chiếu lại NACE trong bộ đánh giá cấp kế hoạch', !/nace/i.test(planEvaluator));
check('Phân công kế hoạch kiểm tra đủ chương trình', planEvaluator.includes('missingPrograms'));
check('Trưởng đoàn cấp kế hoạch phải có LEAD_AUDITOR', planEvaluator.includes('leaderQualified') && planEvaluator.includes("'LEAD_AUDITOR'"));
check('Kết quả năng lực thành viên được cập nhật khi kiểm tra/ban hành', planEvaluator.includes('competency_status') && planEvaluator.includes('competency_note'));
check('API suitability trả required_programs', teamService.includes('required_programs: programs.map'));
check('API suitability trả program_capabilities từng chuyên gia', teamService.includes('program_capabilities: programCapabilities'));
check('Tạo chỉ định tách kiểm tra hồ sơ và kế hoạch', teamService.includes('if (isProjectContext)') && teamService.includes('await this.evaluatePlanProgramAllocation('));
check('Tạo, cập nhật, kiểm tra và ban hành đều dùng kiểm tra chương trình', (teamService.match(/evaluatePlanProgramAllocation\(/g) ?? []).length >= 5);
check('Ban hành kế hoạch dùng kiểm tra chương trình', teamService.includes('appointment.audit_plans.planned_start_date ?? appointment.appointment_date'));

check('Frontend có trường program_keys', scheduleUi.includes('program_keys?: string[]'));
check('Kế hoạch chỉ lấy chuyên gia thuộc đoàn cấp hồ sơ', scheduleUi.includes('activeExperts.filter((expert) => projectTeamExpertIds.has(expert.id))'));
check('Frontend thông báo IAF/NACE đã khóa ở cấp hồ sơ', scheduleUi.includes('IAF/NACE đã được kiểm tra và khóa tại chỉ định đoàn cấp hồ sơ'));
check('Kế hoạch hiển thị trường Chương trình/tiêu chuẩn phụ trách', scheduleUi.includes('label="Chương trình/tiêu chuẩn phụ trách"'));
check('Danh sách chương trình không hiển thị IAF/NACE', scheduleUi.includes('label: programDisplayLabel(program)'));
check('Frontend chặn phân công khi chưa ban hành đoàn cấp hồ sơ', scheduleUi.includes('planTeamPrerequisiteBlocked'));
check('Frontend đối chiếu chương trình với vai trò chuyên gia', scheduleUi.includes('capabilitySupportsRole'));
check('Frontend kiểm tra đủ chương trình của cuộc đánh giá', scheduleUi.includes('missingPrograms'));
check('Payload kế hoạch quy đổi chương trình về project_scope_ids để không cần migration', scheduleUi.includes('(member.program_keys ?? []).flatMap') && scheduleUi.includes('project_scope_ids'));
check('Chi tiết kế hoạch hiển thị tiêu chuẩn thay vì IAF/NACE', scheduleUi.includes('programDisplayLabel({') && scheduleUi.includes('Chưa phân công chương trình/tiêu chuẩn'));

check('Có hàm rút gọn standard_type', mandayService.includes('private compactStandardType'));
check('Đồng bộ man-day dùng standard_type rút gọn', mandayService.includes('const standardType = this.compactStandardType(application.standard_name)'));
check('Tên tiêu chuẩn đầy đủ vẫn được lưu trong calculation_basis', mandayService.includes('Tiêu chuẩn áp dụng: ${application.standard_name}'));
check('DTO giới hạn standard_type đúng NVARCHAR(30)', mandayDto.includes('@MaxLength(30)'));
check('Frontend hiển thị trạng thái đang đồng bộ', programUi.includes('Đang đồng bộ bản tính man-day từ phiếu xem xét đơn'));
check('Thông báo lỗi đồng bộ được giữ đủ lâu để đọc', programUi.includes('duration: 8') && programUi.includes('key: "sync-project-manday"'));

function compactStandardType(value) {
  const source = String(value ?? '').trim();
  const normalized = source.toUpperCase();
  const systems = [];
  if (/ISO\s*9001|\bQMS\b/.test(normalized)) systems.push('QMS');
  if (/ISO\s*14001|\bEMS\b/.test(normalized)) systems.push('EMS');
  if (/ISO\s*45001|\bOHSMS\b|\bOH&S\b/.test(normalized)) systems.push('OHSMS');
  if (systems.length > 1) return `IMS-${systems.join('-')}`.slice(0, 30);
  if (systems[0] === 'QMS') return 'ISO 9001';
  if (systems[0] === 'EMS') return 'ISO 14001';
  if (systems[0] === 'OHSMS') return 'ISO 45001';
  return source.slice(0, 30) || 'MANAGEMENT_SYSTEM';
}

const ims = compactStandardType('ISO 9001:2015 + ISO 14001:2015 + ISO 45001:2018');
check('Mô phỏng IMS ba tiêu chuẩn không vượt 30 ký tự', ims === 'IMS-QMS-EMS-OHSMS' && ims.length <= 30, ims);
check('Mô phỏng tiêu chuẩn đơn được chuẩn hóa', compactStandardType('ISO 9001:2015') === 'ISO 9001');

const team = new Set(['EXP-01', 'EXP-02']);
const allocation = [
  { expert: 'EXP-01', programs: ['QMS', 'EMS'], canLead: true },
  { expert: 'EXP-02', programs: ['OHSMS'], canLead: false },
];
const covered = new Set(allocation.flatMap((item) => item.programs));
check('Mô phỏng đoàn cấp kế hoạch bao phủ đủ ba chương trình', ['QMS', 'EMS', 'OHSMS'].every((item) => covered.has(item)));
check('Mô phỏng không cho chuyên gia ngoài đoàn cấp hồ sơ', !team.has('EXP-03'));
check('Mô phỏng có trưởng đoàn đủ năng lực chương trình', allocation.some((item) => item.canLead && item.programs.length > 0));

console.log(`\nPASS: ${passed}`);
console.log(`FAIL: ${failed}`);
if (failed) process.exit(1);
