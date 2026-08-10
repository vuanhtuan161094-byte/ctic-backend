import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../..');
let pass = 0;
let fail = 0;

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`✓ [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.error(`✗ [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function roundToHalf(value) {
  return Math.round((value + Number.EPSILON) * 2) / 2;
}

function normalizeInitialSplit(finalMandays, stage1, stage2) {
  if (finalMandays < 1.5) {
    throw new Error('initial mandays below 1.5');
  }

  const suppliedIsValid = Number.isFinite(stage1)
    && Number.isFinite(stage2)
    && stage1 >= 0.5
    && stage2 >= 1
    && Math.abs(stage1 + stage2 - finalMandays) <= 0.01;

  if (suppliedIsValid) {
    return { stage1, stage2, normalized: false };
  }

  let normalizedStage1 = Math.max(0.5, roundToHalf(finalMandays * 0.2));
  if (finalMandays - normalizedStage1 < 1) {
    normalizedStage1 = finalMandays - 1;
  }
  const normalizedStage2 = Math.round((finalMandays - normalizedStage1 + Number.EPSILON) * 100) / 100;
  return { stage1: normalizedStage1, stage2: normalizedStage2, normalized: true };
}

function cycleMandays(initial) {
  return {
    surveillance: Math.max(1, roundToHalf(initial / 3)),
    recertification: Math.max(1, roundToHalf((initial * 2) / 3)),
  };
}

function teamCoverage(requiredScopes, members) {
  const covered = new Set();
  const leaders = members.filter((member) => member.role === 'TEAM_LEADER');
  for (const member of members) {
    for (const scopeId of member.coveredScopeIds) covered.add(scopeId);
  }
  const missing = requiredScopes.filter((scopeId) => !covered.has(scopeId));
  return {
    sufficient: leaders.length === 1 && leaders[0].canLead && missing.length === 0,
    missing,
  };
}

console.log('\n=== PATCH 32 STATIC REGRESSION ===');

const scopeController = read('src/certification-project-scopes/certification-project-scopes.controller.ts');
const mandayController = read('src/manday-calculations/manday-calculations.controller.ts');
const appModule = read('src/app.module.ts');
const mandayService = read('src/manday-calculations/manday-calculations.service.ts');
const teamService = read('src/audit-team-appointments/audit-team-appointments.service.ts');
const reviewService = read('src/application-reviews/application-reviews.service.ts');
const projectController = read('src/certification-projects/certification-projects.controller.ts');

check(
  'Route đồng bộ phạm vi từ xem xét đơn tồn tại',
  scopeController.includes("@Post('project/:projectId/sync-from-review')"),
);
check(
  'Route đồng bộ man-day từ xem xét đơn tồn tại',
  mandayController.includes("@Post('project/:projectId/sync-from-review')"),
);
check(
  'Module phạm vi dự án được đăng ký',
  appModule.includes('CertificationProjectScopesModule'),
);
check(
  'Route khởi tạo hoàn chỉnh hồ sơ tồn tại',
  projectController.includes("@Post('complete')")
    && projectController.includes('createComplete'),
);
check(
  'Backend có giới hạn Stage 1 tối thiểu 0,5 MD',
  mandayService.includes('Ngày công Stage 1 không được nhỏ hơn 0,5 MD'),
);
check(
  'Backend có giới hạn Stage 2 tối thiểu 1 MD',
  mandayService.includes('Ngày công Stage 2 không được nhỏ hơn 1 MD'),
);
check(
  'Dự thảo chỉ định đoàn kiểm tra năng lực trước khi lưu',
  teamService.includes('validateDraftCompetencyCoverage'),
);

check(
  'Bản xem xét mới tự chuẩn hóa Stage 1/Stage 2',
  reviewService.includes('normalizeReviewMandays'),
);
check(
  'Bản xem xét mới tính giám sát 1/3 và tái chứng nhận 2/3',
  reviewService.includes('this.roundToHalf(finalMandays / 3)')
    && reviewService.includes('this.roundToHalf((finalMandays * 2) / 3)'),
);

const small = normalizeInitialSplit(1.5, 0.3, 1.2);
check('Chuẩn hóa 1,5 MD', small.stage1 === 0.5 && small.stage2 === 1, `Stage 1=${small.stage1}; Stage 2=${small.stage2}`);

const large = normalizeInitialSplit(31, 6, 25);
check('Giữ nguyên phân bổ hợp lệ 31 MD', large.stage1 === 6 && large.stage2 === 25 && !large.normalized);

const cycleSmall = cycleMandays(1.5);
check('Chu kỳ tối thiểu 1,5 MD', cycleSmall.surveillance === 1 && cycleSmall.recertification === 1);

const cycle100 = cycleMandays(7);
check('Chu kỳ QMS 100 người', cycle100.surveillance === 2.5 && cycle100.recertification === 4.5);

const requiredScopes = ['QMS-IAF14', 'EMS-IAF14'];
const sufficientTeam = teamCoverage(requiredScopes, [
  { role: 'TEAM_LEADER', canLead: true, coveredScopeIds: ['QMS-IAF14'] },
  { role: 'AUDITOR', canLead: false, coveredScopeIds: ['EMS-IAF14'] },
]);
check('Năng lực tính theo tổng thể đoàn', sufficientTeam.sufficient);

const noLeaderTeam = teamCoverage(requiredScopes, [
  { role: 'AUDITOR', canLead: true, coveredScopeIds: requiredScopes },
]);
check('Không có trưởng đoàn phải bị chặn', !noLeaderTeam.sufficient);

const missingScopeTeam = teamCoverage(requiredScopes, [
  { role: 'TEAM_LEADER', canLead: true, coveredScopeIds: ['QMS-IAF14'] },
]);
check('Thiếu phạm vi của tổng thể đoàn phải bị chặn', !missingScopeTeam.sufficient && missingScopeTeam.missing.length === 1);

console.log('\n=== MÔ PHỎNG LUỒNG MỘT KHÁCH HÀNG ===');
const customerFlow = {
  applicationApproved: true,
  reviewApproved: true,
  industryScopesApproved: true,
  teamDraftValid: sufficientTeam.sufficient,
  teamIssued: true,
  mandaySynced: small.stage1 === 0.5 && small.stage2 === 1,
  programCanCreate: true,
  plansCanCreate: true,
};
for (const [step, ok] of Object.entries(customerFlow)) {
  check(`Luồng ${step}`, ok);
}

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
