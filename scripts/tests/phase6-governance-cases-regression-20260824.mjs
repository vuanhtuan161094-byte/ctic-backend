import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let failed = 0;
const check = (label, condition) => {
  if (condition) console.log(`PASS: ${label}`);
  else { failed += 1; console.error(`FAIL: ${label}`); }
};

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260824190000_change_special_audit_complaints_appeals/migration.sql');
const service = read('src/governance-cases/governance-cases.service.ts');
const controller = read('src/governance-cases/governance-cases.controller.ts');
const portal = read('src/governance-cases/governance-cases.portal.controller.ts');
const workTypes = read('src/work-items/work-item.constants.ts');
const files = read('src/document-files/document-files.service.ts');
const resourceAccess = read('src/security/resource-access.service.ts');
const certificateLifecycle = read('src/certificates/certificate-lifecycle.ts');
const appointment = read('src/audit-team-appointments/audit-team-appointments.service.ts');
const documentControl = read('src/document-control/document-control.service.ts');
const customerPortal = read('src/customer-portal/customer-portal.service.ts');
const notificationScheduler = read('src/notifications/notification-scheduler.service.ts');
const p09Runner = read('scripts/tests/run-p09-real-e2e.cjs');

check('Bốn domain Phase 6 là model tách biệt', ['certification_change_cases', 'special_audit_cases', 'complaint_cases', 'appeal_cases'].every((name) => schema.includes(`model ${name}`)));
check('Migration 25 additive và không sửa migration cũ', ['certification_change_cases', 'special_audit_cases', 'complaint_cases', 'appeal_cases'].every((name) => migration.includes(`CREATE TABLE [dbo].[${name}]`)));
check('Không tạo generic case hoặc audit/history engine song song', !/model (generic_)?cases\b/.test(schema) && !/model case_(actions|histories)/.test(schema));
check('Phase 6 reuse numbering engine concurrency-safe của Phase 5', /allocateControlledNumber\(tx, 'CHG'/.test(service) && /allocateControlledNumber\(tx, 'SA'/.test(service) && /MERGE \[dbo\]\.\[controlled_number_sequences\] WITH \(HOLDLOCK\)/.test(documentControl));
check('Organization change Phase 3.2A được link, không bị dựng lại', /source_request_id/.test(schema) && /customer_organization_change_requests\.findUnique/.test(service) && /CUSTOMER_ORGANIZATION_CHANGE/.test(service));
check('Impact assessment không trực tiếp update customer/certificate', /assessment_outcome/.test(service) && !/certification_decisions\.update/.test(service) && !/certificates\.update/.test(service) && !/customers\.update/.test(service));
check('Impact assessment có đủ các nhánh kết quả nghiệp vụ', ['NO_CERTIFICATION_IMPACT', 'TECHNICAL_REVIEW_REQUIRED', 'SPECIAL_AUDIT_REQUIRED', 'CERTIFICATE_AMENDMENT_REQUIRED', 'EXTENSION_REQUIRED', 'REDUCTION_REQUIRED', 'SUSPENSION_REVIEW_REQUIRED'].every((value) => service.includes(value) || read('src/governance-cases/dto/governance-case.dto.ts').includes(value)));
check('Special audit link trigger/customer/project/PLAN', /trigger_entity_type/.test(schema) && /customer_id/.test(schema) && /project_id/.test(schema) && /audit_plan_id/.test(schema));
check('Special audit chỉ link PLAN hiện hữu, không có expert assignment song song', /audit_plans\.findUnique/.test(service) && !/assignExpert|audit_team_members\.create/.test(service));
check('Phase 4 appointment readiness vẫn là authority phân công', /assertTeamReady|readiness/.test(appointment) && !/expert_competenc/.test(service));
check('Special audit result chỉ mở controlled follow-up', /SPECIAL_AUDIT_FOLLOW_UP/.test(service) && !/certificates\.update/.test(service));
check('Complaint có lifecycle, owner, investigator, decision owner và due dates', /COMPLAINT_ACKNOWLEDGE/.test(service) && /investigator_id/.test(schema) && /decision_owner_id/.test(schema) && /response_due/.test(schema));
check('Complaint SoD chặn investigator tự quyết định', /dto\.investigator_id === dto\.decision_owner_id/.test(service) && /current\.investigator_id === actorId/.test(service));
check('Complaint đóng là immutable', /CLOSED_COMPLAINT/.test(service) && /Complaint đã đóng và bất biến/.test(service));
check('Complaint portal projection loại internal notes/SoD', /private complaintProjection/.test(service) && !/internal_notes: row\.internal_notes/.test(service) && !/independence_note: row\.independence_note/.test(service));
check('Appeal link exact challenged decision', /challenged_decision_id/.test(schema) && /certification_decisions\.findUnique/.test(service));
check('Appeal SoD chặn original decision maker', /challenged_decision\.created_by === actorId/.test(service) && /người ra quyết định gốc/.test(service));
check('Appeal thành công tạo subsequent action, không overwrite decision gốc', /appeal:\$\{id\}:subsequent-action/.test(service) && !/certification_decisions\.update/.test(service));
check('Portal appeal projection loại review/deliberation/SoD', /private appealProjection/.test(service) && !/review_notes: row\.review_notes/.test(service) && !/internal_deliberation: row\.internal_deliberation/.test(service));
check('Work Items Phase 6 có source_key ổn định và action role map', ['CHANGE_IMPACT_REVIEW', 'SPECIAL_AUDIT_PLAN', 'COMPLAINT_ACKNOWLEDGE', 'COMPLAINT_INVESTIGATE', 'COMPLAINT_RESPONSE', 'APPEAL_REVIEW', 'APPEAL_DECISION'].every((value) => workTypes.includes(value)) && /sourceKey: `complaint:\$\{created\.id\}:acknowledge`/.test(service));
check('Customer evidence dùng secure DocumentFile, không biến thành controlled output', /uploadCustomerCaseEvidence/.test(files) && /validateUploadedFile/.test(files) && /document_type: 'case_evidence'/.test(files));
check('Customer evidence upload ghi audit action trong cùng transaction', /action: 'CASE_EVIDENCE_UPLOAD'/.test(files) && /tx\.audit_logs\.create/.test(files));
check('Controlled output chỉ nhận document ISSUED đúng exact case', /document\.status !== 'ISSUED'/.test(service) && /document\.entity_id !== id/.test(service));
check('Audit trail reuse audit_logs', /tx\.audit_logs\.create/.test(service) && !/case_actions|case_histories/.test(schema));
check('Server authorization tách internal và CUSTOMER portal', !/CUSTOMER/.test(controller) && /@Roles\('CUSTOMER'\)/.test(portal) && /assertCustomerEntityAccess/.test(resourceAccess));
check('Phase 1-5 authorities vẫn được reuse', /AMEND/.test(certificateLifecycle) && /customer_organization_change_requests/.test(customerPortal) && /allocateControlledNumber/.test(documentControl));
check('Notification scheduler chặn callback mới và await work đang chạy khi shutdown', /implements OnModuleDestroy/.test(notificationScheduler) && /this\.shuttingDown = true/.test(notificationScheduler) && /Promise\.all\(Array\.from\(this\.inFlight\)\)/.test(notificationScheduler));
check('P09 tắt cron explicit và spawn trực tiếp một Jest process cho từng lượt', /P09_DISABLE_NOTIFICATION_SCHEDULER: '1'/.test(p09Runner) && /function runJestE2e/.test(p09Runner) && /process\.execPath/.test(p09Runner));

console.log(`\nPhase 6 governance cases regression: ${28 - failed}/28 PASS`);
if (failed) process.exitCode = 1;
