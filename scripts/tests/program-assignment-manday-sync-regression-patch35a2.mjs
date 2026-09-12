import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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
const programService = read(backendRoot, 'src/audit-team-appointments/audit-team-program-competency.service.ts');
const teamModule = read(backendRoot, 'src/audit-team-appointments/audit-team-appointments.module.ts');
const ts = createRequire(import.meta.url)('typescript');
function methodText(source, className, name) {
  const file = ts.createSourceFile('authority.ts', source, ts.ScriptTarget.Latest, true);
  const owner = file.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === className);
  const method = owner?.members.find((node) => name === 'constructor'
    ? ts.isConstructorDeclaration(node) : ts.isMethodDeclaration(node) && node.name?.getText(file) === name);
  return method ? ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, method, file) : '';
}
const teamMethod = (name, source = teamService) => methodText(source, 'AuditTeamAppointmentsService', name).replace(/\s+/g, '');
const callsProgramPolicy = (name, source = teamService) => teamMethod(name, source).includes('this.programCompetencyService.evaluatePlanProgramAllocation(');
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

// Preserve the old 11 contracts; authority moved, production flows did not disappear.
const planEvaluator = methodText(programService, 'AuditTeamProgramCompetencyService', 'evaluatePlanProgramAllocation');

console.log('\n=== PATCH 35A.2 — PHÂN CÔNG CHƯƠNG TRÌNH & ĐỒNG BỘ MAN-DAY ===');

check('Backend có bộ đánh giá phân công theo chương trình', planEvaluator.length > 0 && planEvaluator.includes('this.getApprovedProjectPrograms(projectId)'));
check('Phân công kế hoạch yêu cầu chỉ định đoàn cấp hồ sơ đã ban hành', planEvaluator.includes("status: 'issued'") && planEvaluator.includes('projectTeamAuditType'));
check(
  'Phân công kế hoạch chặn chuyên gia ngoài F.04 áp dụng',
  planEvaluator.includes('projectTeamRoleByExpertId.get(member.expert_id)')
    && planEvaluator.includes('Có chuyên gia không thuộc đoàn đã được chỉ định ở cấp hồ sơ'),
);
check(
  'Vai trò GĐ1/GĐ2 kế thừa nguyên trạng từ F.04',
  planEvaluator.includes('inheritedRole !== normalizeCompetencyValue(member.team_role)')
    && planEvaluator.includes('phải giữ nguyên theo quyết định chỉ định đoàn cấp hồ sơ'),
);
check('Đối chiếu năng lực theo standard_code', planEvaluator.includes('competency.standard_code') && planEvaluator.includes('program.standard_code'));
check('Đối chiếu năng lực theo management_system', planEvaluator.includes('competency.management_system') && planEvaluator.includes('program.management_system'));
check('Không đối chiếu lại IAF trong bộ đánh giá cấp kế hoạch', !/iaf/i.test(planEvaluator));
check('Không đối chiếu lại NACE trong bộ đánh giá cấp kế hoạch', !/nace/i.test(planEvaluator));
check('Phân công kế hoạch kiểm tra đủ chương trình', planEvaluator.includes('missingPrograms'));
check('Trưởng đoàn cấp kế hoạch phải có LEAD_AUDITOR', planEvaluator.includes('leaderQualified') && planEvaluator.includes("'LEAD_AUDITOR'"));
check('Kết quả năng lực thành viên được cập nhật khi kiểm tra/ban hành', planEvaluator.includes('competency_status') && planEvaluator.includes('competency_note'));
check('API suitability trả required_programs', teamService.includes('required_programs: programs.map'));
check('API suitability trả program_capabilities từng chuyên gia', teamService.includes('program_capabilities: programCapabilities'));
check('Tạo chỉ định tách kiểm tra hồ sơ và kế hoạch', teamMethod('create').includes('if(isProjectContext)')
  && teamMethod('create').includes('awaitthis.validateDraftCompetencyCoverage(') && callsProgramPolicy('create'));
check(
  'Tạo, cập nhật và kiểm tra dùng kiểm tra chương trình; ban hành dùng authority readiness chung',
  ['create', 'update', 'checkCompetency'].every((flow) => callsProgramPolicy(flow))
    && teamMethod('issue').includes('awaitthis.teamReadiness.assertReadyForIssue(id)'),
);
check('Program authority được inject và đăng ký provider',
  teamMethod('constructor').includes('this.programCompetencyService=programCompetencyService??newAuditTeamProgramCompetencyService(prisma)')
  && /providers:\s*\[[^\]]*AuditTeamProgramCompetencyService/.test(teamModule));
for (const flow of ['create', 'update', 'checkCompetency']) {
  check(`${flow} delegate tới đúng program authority`, callsProgramPolicy(flow));
  // In-memory mutation: an orphaned method must fail even if other methods still call it.
  const originalMethod = methodText(teamService, 'AuditTeamAppointmentsService', flow);
  const ast = ts.createSourceFile('team.ts', teamService, ts.ScriptTarget.Latest, true);
  const owner = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'AuditTeamAppointmentsService');
  const node = owner.members.find((item) => ts.isMethodDeclaration(item) && item.name.getText(ast) === flow);
  const orphan = teamService.slice(0, node.getStart(ast))
    + originalMethod.replaceAll('this.programCompetencyService.evaluatePlanProgramAllocation', 'this.orphanedPolicy.evaluatePlanProgramAllocation')
    + teamService.slice(node.end);
  check(`${flow} guard từ chối authority bị orphan (mutation trong memory)`, !callsProgramPolicy(flow, orphan));
}
check('Create/update truyền resolved expert, role, scopes và không ghi competency status ở draft',
  ['create', 'update'].every((flow) => ['resolvedMembers.map(', 'expert_id:member.expert_id', 'team_role:member.team_role', 'project_scope_id:scope.project_scope_id??null', 'false,this.isStage1Plan(']
    .every((part) => teamMethod(flow).includes(part))));
check('Check competency truyền member identity và bật cập nhật status',
  teamMethod('checkCompetency').includes('member_id:member.id')
  && teamMethod('checkCompetency').includes('true,this.isInitialStage2Plan(appointment.audit_plans)'));
check('Issue vẫn giữ manday allocation và readiness trước ghi issued',
  teamMethod('issue').includes('awaitthis.mandayAllocationService.validateForIssue(id)')
  && teamMethod('issue').indexOf('awaitthis.teamReadiness.assertReadyForIssue(id)') >= 0
  && teamMethod('issue').indexOf('awaitthis.teamReadiness.assertReadyForIssue(id)') < teamMethod('issue').indexOf('status:\'issued\''));
check('Ban hành kế hoạch dùng kiểm tra chương trình', teamService.includes('appointment.audit_plans.planned_start_date ?? appointment.appointment_date'));

check('Frontend có trường program_keys', scheduleUi.includes('program_keys?: string[]'));
check('Kế hoạch chỉ lấy chuyên gia thuộc đoàn cấp hồ sơ', scheduleUi.includes('activeExperts.filter((expert) => projectTeamExpertIds.has(expert.id))'));
check('Frontend thông báo IAF/NACE đã khóa ở cấp hồ sơ', scheduleUi.includes('IAF/NACE đã được kiểm tra và khóa tại chỉ định đoàn cấp hồ sơ'));
check(
  'Hệ thống đối chiếu chương trình và điều phối viên không gán chi tiết quá trình',
  scheduleUi.includes('label="Chương trình/tiêu chuẩn hệ thống đối chiếu"')
    && scheduleUi.includes('Điều phối viên không phân công phòng ban/quá trình'),
);
check(
  'Frontend phân biệt F.04 kế thừa với F.04 riêng của giám sát/tái chứng nhận',
  scheduleUi.includes('const selectedInheritsProjectTeam = selectedIsStage1 || selectedIsInitialStage2')
    && scheduleUi.includes('const selectedIsFormalEventAppointment = !selectedIsProjectContext && !selectedInheritsProjectTeam')
    && scheduleUi.includes('Giám sát/tái chứng nhận có quyết định chỉ định đoàn riêng cho từng đợt'),
);
check('Vai trò thành viên kế thừa không thể bị điều phối viên sửa', scheduleUi.includes('disabled={selectedInheritsProjectTeam}'));
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
