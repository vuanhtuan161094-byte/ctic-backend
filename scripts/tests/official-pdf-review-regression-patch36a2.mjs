import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const siblingFrontend = path.resolve(root, '../ctic-frontend');
const frontendRoot = process.env.CTIC_FRONTEND_ROOT || (fs.existsSync(siblingFrontend) ? siblingFrontend : null);

const read = (file) => fs.readFileSync(file, 'utf8');
const backendDocuments = read(path.join(root, 'src/document-files/document-files.service.ts'));
const backendReview = read(path.join(root, 'src/technical-reviews/technical-reviews.service.ts'));
const uploadSecurity = read(path.join(root, 'src/common/upload-security.ts'));

assert.match(
  uploadSecurity,
  /signed_scan:\s*\['\.pdf'\]/,
  'Backend must reject non-PDF signed/final dossier copies through the shared secure upload pipeline.',
);
assert.match(
  backendDocuments,
  /validateUploadedFile\([\s\S]*dto\.file_kind/,
  'Document upload must enforce file-kind validation before storage.',
);
assert.match(
  backendReview,
  /file\.file_kind === 'signed_scan'[\s\S]*return 0/,
  'Technical review must prioritize signed/final PDF files.',
);
assert.match(
  backendReview,
  /const primary =[\s\S]*files\[0\]/,
  'Technical review primary document must use the prioritized file list.',
);

if (frontendRoot && fs.existsSync(frontendRoot)) {
  const projectDetail = read(path.join(frontendRoot, 'app/components/CertificationProjectDetailScreen.tsx'));
  const technicalReview = read(path.join(frontendRoot, 'app/components/TechnicalReviewWorkspaceModal.tsx'));

  assert.match(projectDetail, /fileKind: "signed_scan"/);
  assert.match(projectDetail, /pdfOnly: true/);
  assert.match(projectDetail, /Tải lên PDF chính thức/);
  assert.match(projectDetail, /PDF đã ký\/xác nhận/);
  assert.match(projectDetail, /Xem PDF chính thức/);

  assert.match(technicalReview, /openPrimaryReviewDocument/);
  assert.match(technicalReview, /PDF chính thức/);
  assert.match(technicalReview, /Xem thông tin/);
  assert.match(
    technicalReview,
    /file\.file_kind === "signed_scan"[\s\S]*generated_pdf/,
    'Reviewer must prefer signed PDF, then generated PDF.',
  );
}

console.log('Patch 36A.2 official PDF/review regression: PASS');
