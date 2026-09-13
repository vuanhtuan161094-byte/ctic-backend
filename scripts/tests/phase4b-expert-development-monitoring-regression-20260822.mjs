import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
}

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260822190000_expert_training_monitoring/migration.sql');
const controller = read('src/experts/experts.controller.ts');
const service = read('src/experts/experts.service.ts');
const resourceAccess = read('src/security/resource-access.service.ts');
const documentFiles = read('src/document-files/document-files.service.ts');
const runner = read('scripts/tests/run-p09-real-e2e.cjs');
const ui = read('../ctic-frontend/app/components/ExpertDevelopmentPanel.tsx');
const expertsUi = read('../ctic-frontend/app/components/ExpertsScreen.tsx');

console.log('=== PHASE 4B — TRAINING / WITNESS / PERFORMANCE MONITORING ===');
check('Prisma có hồ sơ đào tạo chuyên gia', /model expert_training_records/.test(schema));
check('Prisma có kế hoạch và kết quả giám sát năng lực', /model expert_monitoring_records/.test(schema));
check('Prisma có chi tiết tiêu chí witness F.09', /model expert_witness_assessment_items/.test(schema));
check('Training liên kết expert/competency và actor lifecycle', /ExpertTrainingCreatedBy/.test(schema) && /ExpertTrainingEvaluatedBy/.test(schema) && /ExpertTrainingCancelledBy/.test(schema));
check('Monitoring liên kết expert/competency/audit plan và actor lifecycle', /ExpertMonitoringSubject/.test(schema) && /ExpertMonitoringAssessor/.test(schema) && /ExpertMonitoringCompletedBy/.test(schema) && /ExpertMonitoringCancelledBy/.test(schema));
check('Migration 22 additive và không DROP dữ liệu', /CREATE TABLE \[dbo\]\.\[expert_training_records\]/.test(migration) && /CREATE TABLE \[dbo\]\.\[expert_monitoring_records\]/.test(migration) && /CREATE TABLE \[dbo\]\.\[expert_witness_assessment_items\]/.test(migration) && !/DROP\s+(TABLE|DATABASE)/i.test(migration));
check('Migration khóa training lifecycle/effectiveness bằng CHECK constraints', /CK_expert_training_status/.test(migration) && /CK_expert_training_effectiveness_method/.test(migration) && /CK_expert_training_effectiveness_result/.test(migration));
check('Migration khóa monitoring methods/result và witness rating 4-1-N', /CK_expert_monitoring_method/.test(migration) && /CK_expert_monitoring_result/.test(migration) && /CK_expert_witness_rating/.test(migration) && /N'N'/.test(migration));
check('Không cascade-delete hồ sơ nhân sự/giám sát', !/ON DELETE CASCADE/i.test(migration));
check('API đọc development cho các role nghiệp vụ có experts.read', /@Get\(':id\/development'\)/.test(controller) && /@Roles\('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER'\)/.test(controller));
check('API quản lý training chỉ ADMIN + experts.manage', /@Post\(':id\/trainings'\)/.test(controller) && /@Post\(':id\/trainings\/:trainingId\/evaluate'\)/.test(controller) && /@Post\(':id\/trainings\/:trainingId\/cancel'\)/.test(controller));
check('API quản lý monitoring/F.09 chỉ ADMIN + experts.manage', /@Post\(':id\/monitoring'\)/.test(controller) && /@Post\(':id\/monitoring\/:monitoringId\/complete'\)/.test(controller) && /@Post\(':id\/monitoring\/:monitoringId\/cancel'\)/.test(controller));
check('Training dùng lifecycle PLANNED/COMPLETED/CANCELLED và giữ row khi hủy', /status: 'CANCELLED'/.test(service) && /cancellation_reason/.test(service) && !/expert_training_records\.delete/.test(service));
check('Đánh giá hiệu quả đào tạo lưu method/result/score/evaluator', /effectiveness_method/.test(service) && /effectiveness_result/.test(service) && /effectiveness_score/.test(service) && /evaluated_by: actorId/.test(service));
check('Monitoring validate competency thuộc đúng chuyên gia', /assertCompetencyBelongsToExpert/.test(service));
check('Khi liên kết competency, management system/standard lấy từ competency thay vì cho client override', /competency\?\.management_system \?\? dto\.management_system/.test(service) && /competency\?\.standard_code \?\? dto\.standard_code/.test(service));
check('Assessor được kiểm tra là tài khoản tồn tại và active trước khi lập monitoring', /dto\.assessor_user_id[\s\S]{0,100}getAccountOrThrow\(dto\.assessor_user_id\)/.test(service));
check('Monitoring gắn audit plan chỉ khi chuyên gia thực sự được phân công', /assertAuditPlanAssignedToExpert/.test(service) && /assignment_status: \{ not: 'cancelled' \}/.test(service));
check('Witness bắt buộc có tiêu chí F.09', /Đánh giá chứng kiến phải có kết quả tiêu chí F\.09/.test(service));
check('Non-witness không được nhét tiêu chí F.09', /Tiêu chí F\.09 chỉ áp dụng cho phương pháp đánh giá chứng kiến/.test(service));
check('Witness chặn trùng criterion code', /Tiêu chí đánh giá chứng kiến không được trùng mã/.test(service));
check('Witness score tự tính từ rating số và loại N', /Number\.isFinite/.test(service) && /numericRatings\.reduce/.test(service) && /\/\s*4\s*\*\s*100/.test(service));
check('Kết quả không đạt/cần cải tiến bắt buộc required action', /Kết quả cần cải tiến\/không đạt phải có hành động yêu cầu/.test(service));
check('4B không tự đổi approval_status competency', !/expert_competencies\.update\([\s\S]{0,250}approval_status/.test(service.slice(service.indexOf('async getDevelopment'), service.indexOf('async recommendForPlan'))));
check('Chu kỳ witness được tính 3 năm cho Auditor/Lead Auditor', /\['AUDITOR', 'LEAD_AUDITOR'\]/.test(service) && /this\.addYears\(witnessBaseline, 3\)/.test(service) && /frequency_years: 3/.test(service));
check('P.08 follow-up coverage theo witness + report review + customer/market feedback', /AUDIT_REPORT_REVIEW/.test(service) && /CUSTOMER_FEEDBACK/.test(service) && /MARKET_FEEDBACK/.test(service) && /documented_follow_up_complete/.test(service));
check('EMS governance yêu cầu witness + feedback đúng bản ghi EMS, không lấy witness hệ khác', /completedEmsMonitoring/.test(service) && /emsWitnessCurrent/.test(service) && /hasEmsFeedback12m/.test(service) && /emsWitnessCurrent && hasEmsFeedback12m/.test(service));
check('Development projection gắn evidence file qua DocumentFile', /entity_type: 'expert_training_record'/.test(service) && /entity_type: 'expert_monitoring_record'/.test(service) && /download_url/.test(service));
check('Resource access cho phép role nội bộ đọc file 4B theo entity scope', /expert_training_record/.test(resourceAccess) && /expert_monitoring_record/.test(resourceAccess) && /LEAD_AUDITOR/.test(resourceAccess));
check('Upload file training/monitoring 4B bị khóa Admin-only phía server', /expertGovernanceAdminOnlyEntities/.test(documentFiles) && /expert_training_record/.test(documentFiles) && /expert_monitoring_record/.test(documentFiles) && /Chỉ Admin được tải tệp đào tạo\/giám sát năng lực chuyên gia/.test(documentFiles));
check('Frontend có tab Đào tạo & giám sát trong hồ sơ chuyên gia', /ExpertDevelopmentPanel/.test(expertsUi) && /Đào tạo & giám sát/.test(expertsUi));
check('Frontend có KPI training/monitoring/witness governance', /Đào tạo đang kế hoạch/.test(ui) && /Giám sát quá hạn/.test(ui) && /Chu kỳ witness/.test(ui));
check('Frontend có F.12 create/complete/cancel monitoring', /F\.12-P\.08/.test(ui) && /\/monitoring`/.test(ui) && /\/monitoring\/\$\{monitoringCompleteId\}\/complete/.test(ui) && /monitoring\/\$\{cancelTarget\.id\}\/cancel/.test(ui));
check('Frontend có F.09 rating 4-1-N', /F\.09/.test(ui) && /Rất tốt/.test(ui) && /Không áp dụng/.test(ui) && /witness_items/.test(ui));
check('Frontend upload evidence qua secure DocumentFile pipeline', /expert_training_record/.test(ui) && /expert_monitoring_record/.test(ui) && /\/document-files\/upload/.test(ui));
check('Frontend cảnh báo management action nhưng nói rõ không tự đình chỉ', /management_action_required/.test(ui) && /Hệ thống không tự đình chỉ competency/i.test(ui));
check('Runner derives repository migration contract + real SQL E2E Phase 4B', /readCanonicalMigrationNames/.test(runner) && /expert-development-monitoring\.e2e-spec\.ts/.test(runner));
check('P09 migration contract kiểm đủ 3 bảng 4B', /training_object_id/.test(runner) && /monitoring_object_id/.test(runner) && /witness_object_id/.test(runner));
check('Có real SQL Server E2E Phase 4B', exists('test/expert-development-monitoring.e2e-spec.ts'));
const e2e = read('test/expert-development-monitoring.e2e-spec.ts');
check('Real SQL E2E kiểm non-Admin không upload được hồ sơ governance 4B', /blocks non-Admin upload/.test(e2e) && /expert_training_record/.test(e2e) && /expect\(403\)/.test(e2e));

console.log(`Phase 4B expert development monitoring regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
