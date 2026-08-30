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
const migration = read('prisma/migrations/20260822164000_expert_competency_governance/migration.sql');
const controller = read('src/expert-competencies/expert-competencies.controller.ts');
const service = read('src/expert-competencies/expert-competencies.service.ts');
const overview = read('src/experts/experts.service.ts');
const resourceAccess = read('src/security/resource-access.service.ts');
const documentFiles = read('src/document-files/document-files.service.ts');
const runner = read('scripts/tests/run-p09-real-e2e.cjs');
const ui = read('../ctic-frontend/app/components/ExpertsScreen.tsx');

console.log('=== PHASE 4A — EXPERT COMPETENCY GOVERNANCE & EVIDENCE ===');
check('Prisma có structured competency evidence', /model expert_competency_evidences/.test(schema));
check('Prisma có competency review history', /model expert_competency_reviews/.test(schema));
check('Prisma có immutable competency action history', /model expert_competency_actions/.test(schema));
check('User relations tách added/voided/reviewed/action actor', /ExpertCompetencyEvidenceAddedBy/.test(schema) && /ExpertCompetencyEvidenceVoidedBy/.test(schema) && /ExpertCompetencyReviewPerformedBy/.test(schema) && /ExpertCompetencyActionActor/.test(schema));
check('Migration 21 chỉ additive, không DROP dữ liệu', /CREATE TABLE \[dbo\]\.\[expert_competency_evidences\]/.test(migration) && /CREATE TABLE \[dbo\]\.\[expert_competency_reviews\]/.test(migration) && /CREATE TABLE \[dbo\]\.\[expert_competency_actions\]/.test(migration) && !/DROP\s+(TABLE|DATABASE)/i.test(migration));
check('Migration khóa evidence type/status bằng CHECK constraints', /CK_expert_competency_evidence_type/.test(migration) && /CK_expert_competency_evidence_status/.test(migration));
check('Migration khóa review type/result bằng CHECK constraints', /CK_expert_competency_review_type/.test(migration) && /CK_expert_competency_review_result/.test(migration));
check('Migration backfill BASELINE action cho năng lực lịch sử', /N'BASELINE'/.test(migration) && /FROM \[dbo\]\.\[expert_competencies\]/.test(migration));
check('API có evidence add + void, không có DELETE evidence', /@Post\(':id\/evidence'\)/.test(controller) && /@Post\(':id\/evidence\/:evidenceId\/void'\)/.test(controller) && !/@Delete\(':id\/evidence/.test(controller));
check('API có review, renewal và reactivation riêng', /@Post\(':id\/reviews'\)/.test(controller) && /@Post\(':id\/renew'\)/.test(controller) && /@Post\(':id\/reactivate'\)/.test(controller));
check('Mọi write governance chỉ ADMIN + competencies.manage', (controller.match(/@Permissions\('competencies\.manage'\)/g) ?? []).length >= 8 && /@Roles\('ADMIN'\)/.test(controller));
check('Approval bắt buộc evidence structured hoặc legacy evidence summary', /assertApprovalEvidence/.test(service) && /Cần có ít nhất một bằng chứng năng lực có cấu trúc/.test(service));
check('Evidence void chỉ đổi trạng thái, không delete record', /status: 'VOID'/.test(service) && /void_reason/.test(service) && !/expert_competency_evidences\.delete/.test(service));
check('Review mặc định chu kỳ đánh giá 12 tháng', /this\.addMonths\(reviewDate, 12\)/.test(service));
check('Renewal bắt buộc có review còn hiệu lực và chặn UNSATISFACTORY', /Cần có kết quả đánh giá năng lực trước khi gia hạn/.test(service) && /latestReview\.result === 'UNSATISFACTORY'/.test(service) && /Kết quả đánh giá năng lực đã quá hạn/.test(service));
check('Reactivation chặn khi latest review UNSATISFACTORY', /Không thể khôi phục khi lần đánh giá năng lực gần nhất có kết quả không đạt/.test(service));
check('Evidence hết hạn không được tính là active evidence', /item\.valid_until === null/.test(service) && /valid_until: \{ gte: this\.startOfUtcDay\(\) \}/.test(service));
check('Decision actions có APPROVE/SUSPEND/REACTIVATE/RENEW', /action_type: 'APPROVE'/.test(service) && /action_type: 'SUSPEND'/.test(service) && /action_type: 'REACTIVATE'/.test(service) && /action_type: 'RENEW'/.test(service));
check('Evidence/review cũng sinh action audit trail', /action_type: 'EVIDENCE_ADDED'/.test(service) && /action_type: 'EVIDENCE_VOIDED'/.test(service) && /action_type: 'REVIEW_RECORDED'/.test(service));
check('Detail competency gắn file evidence qua DocumentFile pipeline', /entity_type: 'expert_competency_evidence'/.test(service) && /download_url/.test(service));
check('Competency evidence file đọc được bởi role quản trị năng lực nhưng upload vẫn Admin-only', /expert_competency_evidence/.test(resourceAccess) && /LEAD_AUDITOR/.test(resourceAccess) && /TECHNICAL_REVIEWER/.test(resourceAccess) && /Chỉ Admin được tải tệp bằng chứng năng lực chuyên gia/.test(documentFiles));
check('Governance tính expiry/review overdue/evidence gap/management action', /validity_status/.test(service) && /review_status/.test(service) && /evidence_gap/.test(service) && /requires_management_action/.test(service));
check('Expert overview có KPI expired/evidence/review/action required', /expired:/.test(overview) && /evidence_gaps:/.test(overview) && /review_overdue:/.test(overview) && /management_action_required:/.test(overview));
check('Frontend có governance drawer và API detail', /expert-competency-governance/.test(ui) && /\/expert-competencies\/\$\{selectedCompetencyId\}/.test(ui));
check('Frontend upload evidence qua secure DocumentFile pipeline', /entity_type", "expert_competency_evidence"/.test(ui) && /document_type", "competency_evidence"/.test(ui) && /\/document-files\/upload/.test(ui));
check('Frontend có review, renew, reactivate và void-with-reason', /\/reviews`/.test(ui) && /\/renew`/.test(ui) && /\/reactivate`/.test(ui) && /competencyVoidEvidenceForm/.test(ui));
check('Frontend suspend bắt buộc nhập lý do thay vì reason hard-code', /competencySuspendForm/.test(ui) && /Lý do đình chỉ/.test(ui) && !/Tạm đình chỉ theo quyết định quản lý năng lực/.test(ui));
check('Frontend hiển thị KPI quá hạn đánh giá và thiếu evidence', /Đánh giá năng lực quá hạn/.test(ui) && /Thiếu bằng chứng năng lực/.test(ui));
check('Runner chốt migration 21 + real SQL E2E Phase 4A', /20260822164000_expert_competency_governance/.test(runner) && /expert-competency-governance\.e2e-spec\.ts/.test(runner));
check('Có real SQL Server E2E Phase 4A', exists('test/expert-competency-governance.e2e-spec.ts'));

console.log(`Phase 4A expert competency governance regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
