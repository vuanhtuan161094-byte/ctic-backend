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
assert.match(reviewService, /if \(missingOfficialPdfs\.length > 0\)[\s\S]*throw new BadRequestException/);

if (frontendRoot && fs.existsSync(frontendRoot)) {
  const projectDetail = read(path.join(frontendRoot, 'app/components/CertificationProjectDetailScreen.tsx'));
  const reviewModal = read(path.join(frontendRoot, 'app/components/TechnicalReviewWorkspaceModal.tsx'));

  assert.doesNotMatch(
    projectDetail,
    /entityType: item\.entity_type \|\| "certification_project"[\s\S]*entityId: item\.entity_id \|\| projectId/,
    'Official PDFs must not silently fall back to the project entity.',
  );
  assert.match(
    projectDetail,
    /if \(!item\.entity_type \|\| !item\.entity_id\) \{[\s\S]{0,500}hoàn thành nghiệp vụ[\s\S]{0,120}PDF chính thức[\s\S]{0,200}return;/i,
    'Official PDF upload must remain gated until its business entity exists.',
  );
  assert.match(projectDetail, /PDF đã ký\/xác nhận/);
  assert.match(
    projectDetail,
    /const canUploadOfficialPdf =[\s\S]{0,200}!\[[^\]]*"certificate"[^\]]*\]\.includes\(key\)/,
    'Certificate PDFs must remain outside the generic official-PDF upload flow.',
  );
  assert.match(reviewModal, /const officialPdfCount =/);
  assert.match(reviewModal, /const allOfficialPdfsReady =/);
  assert.match(reviewModal, /disabled=\{!allItemsAccepted \|\| !allCriteriaAnswered \|\| !allOfficialPdfsReady\}/);
  assert.match(reviewModal, /PDF chính thức cho \$\{requiredReviewItems\.length\} hạng mục bắt buộc/);
}

console.log('Patch 36A.3 official PDF entity/review regression: PASS');
