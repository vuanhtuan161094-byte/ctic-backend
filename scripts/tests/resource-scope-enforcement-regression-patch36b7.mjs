import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const ts = require(require.resolve('typescript', { paths: [root] }));

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${message}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${message}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const requestSource = read('src/security/security-request.ts');
const accessSource = read('src/security/resource-access.service.ts');

check(
  requestSource.includes('export function getResourceActor'),
  'Có helper actor dùng chung lấy userId + roles từ JWT request',
);
check(
  accessSource.includes('async assertEntityAccess(') &&
    accessSource.includes('async filterEntities<'),
  'ResourceAccessService có API chung để chặn và lọc tài nguyên theo hồ sơ',
);
check(
  accessSource.includes("'audit_program_event'") &&
    accessSource.includes('audit_program_events.findMany'),
  'Sự kiện chương trình đánh giá được resolve về đúng project',
);
check(
  accessSource.includes("'AUDITOR'") &&
    accessSource.includes("'LEAD_AUDITOR'") &&
    accessSource.includes("'TECHNICAL_REVIEWER'"),
  'Scope vẫn áp dụng cho auditor/lead/reviewer thay vì quyền toàn tổ chức',
);

const controllerChecks = [
  ['src/audit-programs/audit-programs.controller.ts', 'audit_program', true],
  ['src/audit-plans/audit-plans.controller.ts', 'audit_plan', true],
  ['src/audit-team-appointments/audit-team-appointments.controller.ts', 'audit_team_appointment', true],
  ['src/reports/reports.controller.ts', 'report', true],
  ['src/audit-findings/audit-findings.controller.ts', 'audit_finding', true],
  ['src/technical-reviews/technical-reviews.controller.ts', 'technical_review', true],
  ['src/certification-decisions/certification-decisions.controller.ts', 'certification_decision', true],
  ['src/audit-documents/audit-documents.controller.ts', 'audit_plan', false],
];

for (const [rel, entityType, requiresFilter] of controllerChecks) {
  const source = read(rel);
  check(
    source.includes('ResourceAccessService') &&
      source.includes('getResourceActor'),
    `${rel} dùng lớp kiểm soát scope chung`,
  );
  check(
    source.includes('assertEntityAccess(') ||
      source.includes('assertProjectAccess('),
    `${rel} chặn truy cập trực tiếp bằng UUID ngoài hồ sơ được phép`,
  );
  if (requiresFilter) {
    check(
      source.includes('filterEntities('),
      `${rel} lọc endpoint danh sách theo project được phân công`,
    );
  }
  check(
    source.includes(`entity_type: '${entityType}'`) ||
      source.includes(`entity_type: \"${entityType}\"`),
    `${rel} ánh xạ đúng loại tài nguyên ${entityType}`,
  );
}

const findingsSource = read('src/audit-findings/audit-findings.controller.ts');
const customerBlock = findingsSource.match(
  /@Post\(':id\/corrective-actions'\)[\s\S]*?@Post\(':id\/corrective-actions\/internal'\)/,
)?.[0] ?? '';
check(
  customerBlock.includes("'CUSTOMER'") &&
    !customerBlock.includes('assertEntityAccess('),
  'Không vô tình khóa luồng khách hàng gửi CAP bằng scope nội bộ auditor',
);

const technicalReviewSource = read('src/technical-reviews/technical-reviews.controller.ts');
check(
  technicalReviewSource.includes("entity_type: 'report', entity_id: dto.report_id") &&
    technicalReviewSource.includes("entity_type: 'technical_review', entity_id: id"),
  'Technical reviewer bị kiểm scope cả khi nhận hồ sơ và khi thao tác review',
);

const reportsSource = read('src/reports/reports.controller.ts');
check(
  reportsSource.includes("entity_type: 'audit_plan'") &&
    reportsSource.includes('dto.audit_plan_id'),
  'Auditor không thể tạo báo cáo cho PLAN ngoài project được phân công',
);

const changedFiles = [
  'src/security/security-request.ts',
  'src/security/resource-access.service.ts',
  ...controllerChecks.map(([rel]) => rel),
];

for (const rel of changedFiles) {
  const source = read(rel);
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      isolatedModules: true,
    },
    fileName: rel,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diag) => diag.category === ts.DiagnosticCategory.Error,
  );
  check(errors.length === 0, `${rel} transpile syntax PASS`);
}

const decoratedControllers = controllerChecks.map(([rel]) => rel);
for (const rel of decoratedControllers) {
  const source = read(rel);
  if (source.includes('SecurityRequest')) {
    check(
      source.includes("import type { SecurityRequest } from '../security/security-request';"),
      `${rel} import SecurityRequest bằng import type để tránh TS1272`,
    );
  }
}

const allTestSource = fs
  .readdirSync(path.join(root, 'scripts/tests'))
  .filter((name) => name.endsWith('.mjs') && name !== 'resource-scope-enforcement-regression-patch36b7.mjs')
  .map((name) => read(`scripts/tests/${name}`))
  .join('\n');
check(
  !allTestSource.includes('/opt/nvm/versions/node/'),
  'Regression hiện hành không hard-code đường dẫn TypeScript Linux/NVM',
);

console.log(`\nPatch 36B.7 resource scope regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
