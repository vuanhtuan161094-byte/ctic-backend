const fs = require('node:fs');

const schedulePath = 'scripts/tests/schedule-manday-regression-patch33.mjs';
const documentsPath = 'scripts/tests/pre-audit-documents-regression-patch35b.mjs';

let schedule = fs.readFileSync(schedulePath, 'utf8');
let documents = fs.readFileSync(documentsPath, 'utf8');

const scheduleReadAnchor = `const service = fs.readFileSync(servicePath, 'utf8');`;
const scheduleReadReplacement = `${scheduleReadAnchor}\nconst schedulingPolicyPath = path.join(root, 'src', 'audit-team-appointments', 'audit-team-scheduling.policy.ts');\nconst schedulingPolicy = fs.readFileSync(schedulingPolicyPath, 'utf8');`;
if (!schedule.includes(scheduleReadAnchor) || schedule.includes('const schedulingPolicyPath')) {
  throw new Error('Unexpected schedule regression source shape');
}
schedule = schedule.replace(scheduleReadAnchor, scheduleReadReplacement);

const halfDayOld = `check('Backend có kiểm tra man-day theo nửa ngày', service.includes('isHalfDayIncrement'));`;
const halfDayNew = `check('Backend có kiểm tra man-day theo nửa ngày', schedulingPolicy.includes('isHalfDayIncrement'));`;
if (!schedule.includes(halfDayOld)) throw new Error('Half-day assertion anchor not found');
schedule = schedule.replace(halfDayOld, halfDayNew);

const totalOld = `  service.includes('Math.abs(allocatedMandays - requiredMandays) > 0.001')\n    && service.includes('allocatedMandays < requiredMandays')\n    && service.includes('nhưng đang bố trí vượt'),`;
const totalNew = `  schedulingPolicy.includes('Math.abs(allocatedMandays - requiredMandays) > 0.001')\n    && schedulingPolicy.includes('allocatedMandays < requiredMandays')\n    && schedulingPolicy.includes('nhưng đang bố trí vượt'),`;
if (!schedule.includes(totalOld)) throw new Error('Total manday assertion anchor not found');
schedule = schedule.replace(totalOld, totalNew);

const documentReadAnchor = `const service = read('src/audit-documents/audit-documents.service.ts');`;
const documentReadReplacement = `${documentReadAnchor}\nconst queryContext = read('src/audit-documents/audit-document-query-context.service.ts');`;
if (!documents.includes(documentReadAnchor) || documents.includes('const queryContext =')) {
  throw new Error('Unexpected pre-audit regression source shape');
}
documents = documents.replace(documentReadAnchor, documentReadReplacement);

const f04Old = `check(service.includes("audit_type: 'project_team'"), 'F.04 lấy quyết định chỉ định đoàn ở cấp hồ sơ');`;
const f04New = `check(queryContext.includes("audit_type: 'project_team'"), 'F.04 lấy quyết định chỉ định đoàn ở cấp hồ sơ');`;
if (!documents.includes(f04Old)) throw new Error('F.04 assertion anchor not found');
documents = documents.replace(f04Old, f04New);

fs.writeFileSync(schedulePath, schedule);
fs.writeFileSync(documentsPath, documents);
