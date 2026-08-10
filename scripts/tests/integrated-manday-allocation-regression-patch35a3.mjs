import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../..');
const frontendRoot = [
  path.resolve(root, '../ctic-frontend'),
  path.resolve(root, '../frontend'),
].find((candidate) => fs.existsSync(path.join(candidate, 'app'))) ?? path.resolve(root, '../ctic-frontend');
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

function read(relativePath, base = root) {
  return fs.readFileSync(path.join(base, relativePath), 'utf8');
}

function loadEngine() {
  const ts = require('typescript');
  const file = path.join(root, 'src/audit-team-appointments/integrated-manday-allocation.engine.ts');
  const source = fs.readFileSync(file, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
    fileName: file,
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  check(errors.length === 0, 'Engine phân bổ biên dịch TypeScript không có lỗi cú pháp');
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require,
    console,
    process,
    __dirname: path.dirname(file),
    __filename: file,
  });
  vm.runInContext(transpiled.outputText, context, { filename: file });
  return module.exports;
}

const engine = loadEngine();
const { allocateIntegratedMandays, allocateProgramRequirementUnits } = engine;

function program(key, code, weight = 0) {
  return { programKey: key, programCode: code, managementSystem: key, preImsMandays: weight };
}

function member(id, role, competencies, maxUnits, must = true) {
  return {
    memberId: id,
    expertId: id,
    expertName: id,
    teamRole: role,
    competentProgramKeys: competencies,
    maxStage2Units: maxUnits,
    mustReceiveMandays: must,
  };
}

function assertSuccess(result, expectedUnits) {
  check(result.success === true, 'Thuật toán tạo kết quả khi tồn tại phương án hợp lệ');
  if (!result.success) return;
  const total = result.members.reduce((sum, item) => sum + item.totalAllocatedUnits, 0);
  check(total === expectedUnits, 'Tổng phân bổ GĐ2 không thay đổi');
  for (const requirement of result.programRequirements) {
    const actual = result.members.reduce(
      (sum, item) => sum + (item.programAllocatedUnits[requirement.programKey] ?? 0),
      0,
    );
    check(actual === requirement.requiredUnits, `Tổng ${requirement.programCode} khớp hạn mức chương trình`);
  }
  for (const item of result.members) {
    const row = Object.values(item.programAllocatedUnits).reduce((sum, units) => sum + units, 0);
    check(row === item.totalAllocatedUnits, `Tổng theo người ${item.expertName} khớp các ô chương trình`);
    check(row <= item.maxStage2Units, `Không vượt giới hạn lịch của ${item.expertName}`);
    check(!item.mustReceiveMandays || row >= 1, `${item.expertName} nhận tối thiểu 0,5 MD khi là thành viên chính thức`);
  }
}

const sample = allocateIntegratedMandays({
  stage2Units: 24,
  leadMemberId: 'A',
  programs: [program('QMS', 'ISO 9001', 7), program('EMS', 'ISO 14001', 8), program('OHS', 'ISO 45001', 9)],
  members: [
    member('A', 'TEAM_LEADER', ['QMS', 'EMS', 'OHS'], 24),
    member('B', 'AUDITOR', ['QMS', 'EMS'], 24),
    member('C', 'AUDITOR', ['OHS'], 24),
    member('D', 'TECHNICAL_EXPERT', ['OHS'], 24, false),
    member('E', 'OBSERVER', ['QMS'], 24, false),
    member('F', 'TRAINEE', ['EMS'], 24, false),
  ],
});
assertSuccess(sample, 24);
if (sample.success) {
  check(sample.programRequirements.map((item) => item.requiredUnits).join(',') === '7,8,9', 'Trọng số 7/8/9 tạo hạn mức 3,5/4,0/4,5 MD');
  check(sample.members.every((item) => ['TEAM_LEADER', 'AUDITOR'].includes(item.teamRole)), 'Chuyên gia kỹ thuật, quan sát viên và tập sự không được đưa vào phân bổ MD');
}

const oneExpert = allocateIntegratedMandays({
  stage2Units: 12,
  leadMemberId: 'A',
  programs: [program('Q', 'ISO 9001', 7), program('E', 'ISO 14001', 8)],
  members: [member('A', 'TEAM_LEADER', ['Q', 'E'], 12)],
});
assertSuccess(oneExpert, 12);

const onePerProgram = allocateIntegratedMandays({
  stage2Units: 12,
  leadMemberId: 'A',
  programs: [program('Q', 'ISO 9001'), program('E', 'ISO 14001'), program('O', 'ISO 45001')],
  members: [
    member('A', 'TEAM_LEADER', ['Q'], 12),
    member('B', 'AUDITOR', ['E'], 12),
    member('C', 'AUDITOR', ['O'], 12),
  ],
});
assertSuccess(onePerProgram, 12);

const missingProgram = allocateIntegratedMandays({
  stage2Units: 4,
  leadMemberId: 'A',
  programs: [program('Q', 'ISO 9001'), program('O', 'ISO 45001')],
  members: [member('A', 'TEAM_LEADER', ['Q'], 4)],
});
check(!missingProgram.success && missingProgram.errorCode === 'PROGRAM_NOT_COVERED', 'Thiếu năng lực chương trình trả lỗi PROGRAM_NOT_COVERED');

const insufficientCapacity = allocateIntegratedMandays({
  stage2Units: 8,
  leadMemberId: 'A',
  programs: [program('Q', 'ISO 9001')],
  members: [member('A', 'TEAM_LEADER', ['Q'], 4)],
});
check(!insufficientCapacity.success && insufficientCapacity.errorCode === 'INSUFFICIENT_MEMBER_CAPACITY', 'Thiếu số ngày tham gia trả lỗi INSUFFICIENT_MEMBER_CAPACITY');

const tooManyMembers = allocateIntegratedMandays({
  stage2Units: 2,
  leadMemberId: 'A',
  programs: [program('Q', 'ISO 9001')],
  members: [
    member('A', 'TEAM_LEADER', ['Q'], 2),
    member('B', 'AUDITOR', ['Q'], 2),
    member('C', 'AUDITOR', ['Q'], 2),
  ],
});
check(!tooManyMembers.success && tooManyMembers.errorCode === 'TOO_MANY_TEAM_MEMBERS', 'Nhiều thành viên hơn unit khả dụng trả lỗi TOO_MANY_TEAM_MEMBERS');

const hallFailure = allocateIntegratedMandays({
  stage2Units: 6,
  leadMemberId: 'A',
  programs: [program('P1', 'P1'), program('P2', 'P2'), program('P3', 'P3')],
  members: [
    member('A', 'TEAM_LEADER', ['P1', 'P2'], 2),
    member('B', 'AUDITOR', ['P1', 'P2'], 1),
    member('C', 'AUDITOR', ['P3'], 3),
  ],
});
check(!hallFailure.success && hallFailure.errorCode === 'NO_FEASIBLE_ALLOCATION', 'Kiểm tra luồng phát hiện cấu hình giao nhau không có nghiệm');

const deterministicInput = {
  stage2Units: 18,
  leadMemberId: 'A',
  programs: [program('Q', 'ISO 9001', 7), program('E', 'ISO 14001', 8), program('O', 'ISO 45001', 9)],
  members: [
    member('A', 'TEAM_LEADER', ['Q', 'E', 'O'], 18),
    member('B', 'AUDITOR', ['Q', 'E'], 18),
    member('C', 'AUDITOR', ['O'], 18),
  ],
};
const deterministic1 = allocateIntegratedMandays(deterministicInput);
const deterministic2 = allocateIntegratedMandays(deterministicInput);
check(JSON.stringify(deterministic1) === JSON.stringify(deterministic2), 'Kết quả ổn định, không dùng lựa chọn ngẫu nhiên');


function bruteForceFeasible(input) {
  const counting = input.members.filter((item) => ['TEAM_LEADER', 'AUDITOR'].includes(String(item.teamRole).toUpperCase()));
  const lead = counting.find((item) => item.memberId === input.leadMemberId && String(item.teamRole).toUpperCase() === 'TEAM_LEADER');
  if (!lead) return false;
  let requirements;
  try {
    requirements = allocateProgramRequirementUnits(input.programs, input.stage2Units);
  } catch {
    return false;
  }
  if (input.stage2Units < counting.filter((item) => item.mustReceiveMandays).length) return false;
  const capacities = Object.fromEntries(counting.map((item) => [item.memberId, item.maxStage2Units]));
  const received = Object.fromEntries(counting.map((item) => [item.memberId, 0]));
  const units = requirements.flatMap((program) => Array.from({ length: program.requiredUnits }, () => program.programKey));
  units.sort((left, right) => {
    const leftEligible = counting.filter((item) => item.competentProgramKeys.includes(left)).length;
    const rightEligible = counting.filter((item) => item.competentProgramKeys.includes(right)).length;
    return leftEligible - rightEligible || left.localeCompare(right);
  });

  function search(index) {
    if (index >= units.length) {
      return counting.every((item) => !item.mustReceiveMandays || received[item.memberId] >= 1)
        && received[input.leadMemberId] >= 1;
    }
    const programKey = units[index];
    for (const item of counting) {
      if (!item.competentProgramKeys.includes(programKey)) continue;
      if (received[item.memberId] >= capacities[item.memberId]) continue;
      received[item.memberId] += 1;
      if (search(index + 1)) return true;
      received[item.memberId] -= 1;
    }
    return false;
  }
  return search(0);
}

let randomState = 0x35a3;
function random() {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 0x100000000;
}

let exhaustiveAgreement = true;
for (let scenario = 0; scenario < 120; scenario += 1) {
  const programCount = 2 + Math.floor(random() * 2);
  const memberCount = 1 + Math.floor(random() * 4);
  const stage2Units = programCount + Math.floor(random() * 6);
  const programs = Array.from({ length: programCount }, (_, index) =>
    program(`P${index + 1}`, `P${index + 1}`, 1 + Math.floor(random() * 6)),
  );
  const members = Array.from({ length: memberCount }, (_, index) => {
    const competencies = programs
      .filter(() => random() > 0.45)
      .map((item) => item.programKey);
    return member(
      String.fromCharCode(65 + index),
      index === 0 ? 'TEAM_LEADER' : 'AUDITOR',
      competencies,
      1 + Math.floor(random() * Math.max(1, stage2Units)),
      true,
    );
  });
  const input = { stage2Units, leadMemberId: 'A', programs, members };
  const expected = bruteForceFeasible(input);
  const actual = allocateIntegratedMandays(input).success;
  if (expected !== actual) {
    exhaustiveAgreement = false;
    console.error('Sai khác với kiểm tra vét cạn:', JSON.stringify(input));
    break;
  }
}
check(exhaustiveAgreement, '120 cấu hình nhỏ khớp kiểm tra vét cạn: có nghiệm thì tạo được, vô nghiệm thì báo lỗi');

const minimumRequirements = allocateProgramRequirementUnits(
  [program('A', 'A'), program('B', 'B'), program('C', 'C')],
  3,
);
check(minimumRequirements.every((item) => item.requiredUnits === 1), 'Mỗi chương trình được cấp tối thiểu 0,5 MD');

let minimumError = false;
try {
  allocateProgramRequirementUnits(
    [program('A', 'A'), program('B', 'B'), program('C', 'C')],
    2,
  );
} catch {
  minimumError = true;
}
check(minimumError, 'Báo lỗi khi GĐ2 không đủ 0,5 MD cho mỗi chương trình');

const schema = read('prisma/schema.prisma');
check(schema.includes('model audit_program_manday_requirements'), 'Prisma có bảng hạn mức MD từng chương trình');
check(schema.includes('model audit_member_program_mandays'), 'Prisma có bảng ma trận thành viên + chương trình');
check(schema.includes('model audit_manday_allocation_versions'), 'Prisma có bảng phiên bản và audit log phân bổ');

const migration = read('prisma/migrations/20260805230000_patch35a3_integrated_manday_allocation/migration.sql');
check(migration.includes('audit_member_program_mandays'), 'Migration tạo bảng phân bổ man-day');
check(migration.includes('CK_audit_manday_allocation_versions_mode'), 'Migration khóa chế độ AUTO/MANUAL_OVERRIDE');

const controller = read('src/audit-team-appointments/audit-team-appointments.controller.ts');
check(controller.includes("@Post(':id/manday-allocation/auto')"), 'Backend có API tự động phân bổ');
check(controller.includes("@Patch(':id/manday-allocation/manual')"), 'Backend có API chỉnh sửa thủ công');
check(controller.includes("@Post(':id/manday-allocation/restore-auto')"), 'Backend có API khôi phục đề xuất');

const allocationService = read('src/audit-team-appointments/audit-manday-allocation.service.ts');
check(allocationService.includes('Chuyên gia kỹ thuật, quan sát viên, chuyên gia tập sự'), 'Backend chặn vai trò hỗ trợ tính man-day');
check(allocationService.includes('validateForIssue'), 'Backend kiểm tra ma trận trước khi ban hành');
check(allocationService.includes('change_reason'), 'Backend lưu lý do chỉnh sửa thủ công');
check(allocationService.includes('audit_logs.create'), 'Backend ghi audit log cho mỗi lần phân bổ');

const appointmentService = read('src/audit-team-appointments/audit-team-appointments.service.ts');
check(appointmentService.includes('await this.mandayAllocationService.validateForIssue(id)'), 'Ban hành gọi kiểm tra ma trận man-day');
check(appointmentService.includes('planned_mandays: null'), 'Không sao chép tổng MD người vào từng scope IAF/NACE');

const mandayService = read('src/manday-calculations/manday-calculations.service.ts');
check(mandayService.includes('private roundToHalf'), 'Tính man-day dùng làm tròn 0,5 MD gần nhất');
check(mandayService.includes('preImsMandays * imsAdjustmentFactor'), 'Giảm IMS được áp dụng tuần tự sau điều chỉnh chung');
check(mandayService.includes('this.isHalfDay(stage1Mandays)'), 'GĐ1/GĐ2 bắt buộc theo bước 0,5 MD');

const mandayRulesService = read('src/manday-calculations/manday-rules.service.ts');
check(!mandayRulesService.includes('floorToHalf'), 'Bảng gợi ý man-day không còn làm tròn xuống');
check(mandayRulesService.includes('roundedStartingPoint * generalAdjustmentFactor * imsAdjustmentFactor'), 'Bảng gợi ý áp dụng giảm IMS tuần tự');
check(mandayRulesService.includes('sampled_site_reduction_percent ?? 0'), 'Multi-site không còn mặc định giảm 50% tại địa điểm lấy mẫu');
check(mandayRulesService.includes('recertification_requires_recalculation: true'), 'Tái chứng nhận 2/3 được đánh dấu là dự kiến và phải tính lại');

const reviewService = read('src/application-reviews/application-reviews.service.ts');
check(reviewService.includes('private roundToHalf'), 'Xem xét đơn dùng làm tròn 0,5 MD gần nhất');
check(reviewService.includes('this.isHalfDay(dto.stage1_mandays)'), 'Xem xét đơn chặn GĐ1/GĐ2 không theo bước 0,5 MD');

check(allocationService.includes('stage1UnitsForPlan'), 'GĐ1 chỉ cộng vào ma trận của đánh giá Giai đoạn 2 ban đầu');

const panel = read('app/components/IntegratedMandayAllocationPanel.tsx', frontendRoot);
check(panel.includes('Tự động phân bổ'), 'Frontend có nút Tự động phân bổ');
check(panel.includes('Chỉnh sửa thủ công'), 'Frontend có nút Chỉnh sửa thủ công');
check(panel.includes('Khôi phục đề xuất'), 'Frontend có nút Khôi phục đề xuất');
check(panel.includes('Vai trò không tính man-day'), 'Frontend hiển thị rõ vai trò không tính man-day');
check(panel.includes('difference_mandays'), 'Frontend hiển thị chênh lệch GĐ2');

const programPanel = read('app/components/AuditProgramPanel.tsx', frontendRoot);
check(!programPanel.includes('floorHalf('), 'Chương trình đánh giá không còn gọi hàm làm tròn xuống/không tồn tại');
const projectsScreen = read('app/components/CertificationProjectsScreen.tsx', frontendRoot);
check(projectsScreen.includes('(1 - integrationReductionPercent / 100)'), 'Frontend xem xét đơn áp dụng giảm IMS tuần tự');
check(!projectsScreen.includes('floorToHalf'), 'Frontend xem xét đơn dùng làm tròn 0,5 MD gần nhất');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
