import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const siblingFrontend = path.resolve(root, '../ctic-frontend');
const frontendRoot = process.env.CTIC_FRONTEND_ROOT || (fs.existsSync(siblingFrontend) ? siblingFrontend : null);
const read = (file) => fs.readFileSync(file, 'utf8');

const projectService = read(path.join(root, 'src/certification-projects/certification-projects.service.ts'));
const reviewService = read(path.join(root, 'src/technical-reviews/technical-reviews.service.ts'));

assert.match(projectService, /document_key: 'audit_team_assignment'[\s\S]*entity_type: issuedAppointment \? 'audit_team_appointment'/);
assert.match(projectService, /document_key: 'audit_program'[\s\S]*entity_type: programs\[0\] \? 'audit_program'/);
assert.match(projectService, /document_key: 'stage2_audit_plan'[\s\S]*entity_type: stage2Plan \? 'audit_plan'/);
assert.match(projectService, /document_key: 'stage2_audit_report'[\s\S]*entity_type: stage2Report \? 'report'/);
assert.match(projectService, /document_key: 'technical_review_report'[\s\S]*entity_type: context\.reviews\[0\] \? 'technical_review'/);
assert.match(projectService, /document_key: 'audit_monitoring'[\s\S]*entity_type: 'certification_project'[\s\S]*entity_id: project\.id/);

assert.match(reviewService, /const \[memberIds, findingIds\][\s\S]*audit_findings\.findMany/);
assert.match(reviewService, /documentKey ===[\s\S]*'audit_program'[\s\S]*'audit_program_f03'/);
assert.match(reviewService, /documentKey ===[\s\S]*'audit_plan'[\s\S]*'stage2_audit_plan'[\s\S]*'audit_plan_f05'/);
assert.match(reviewService, /documentKey ===[\s\S]*'nc_cap'[\s\S]*'corrective_action_request_f10'/);
assert.match(reviewService, /const missingOfficialPdfs =[\s\S]*file\.file_kind === 'signed_scan'/);
assert.match(reviewService, /Chưa có PDF đã ký\/chốt cho các hồ sơ/);

if (frontendRoot && fs.existsSync(frontendRoot)) {
  const projectDetail = read(path.join(frontendRoot, 'app/components/CertificationProjectDetailScreen.tsx'));
  const reviewModal = read(path.join(frontendRoot, 'app/components/TechnicalReviewWorkspaceModal.tsx'));

  assert.doesNotMatch(
    projectDetail,
    /entityType: item\.entity_type \|\| "certification_project"[\s\S]*entityId: item\.entity_id \|\| projectId/,
    'Official PDFs must not silently fall back to the project entity.',
  );
  assert.match(projectDetail, /Hãy hoàn thành nghiệp vụ này trước khi tải PDF đã ký\/chốt/);
  assert.match(projectDetail, /key !== "certificate"/);
  assert.match(reviewModal, /const officialPdfCount =/);
  assert.match(reviewModal, /const allOfficialPdfsReady =/);
  assert.match(reviewModal, /disabled=\{!allItemsAccepted \|\| !allCriteriaAnswered \|\| !allOfficialPdfsReady\}/);
  assert.match(reviewModal, /PDF đã ký\/chốt cho \$\{requiredReviewItems\.length\} hạng mục bắt buộc/);
}

console.log('Patch 36A.3 official PDF entity/review regression: PASS');
