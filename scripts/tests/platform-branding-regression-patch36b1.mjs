import fs from 'node:fs';
import path from 'node:path';

const backendRoot = path.resolve(import.meta.dirname, '../..');
const parent = path.dirname(backendRoot);
const frontendCandidates = [
  path.join(parent, 'ctic-frontend'),
  path.join(parent, 'frontend'),
  path.resolve(backendRoot, '../ctic-frontend'),
  path.resolve(backendRoot, '../frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app')),
);

if (!frontendRoot) {
  throw new Error('Không tìm thấy source frontend để chạy regression Patch 36B.1.');
}

let pass = 0;
let fail = 0;
const check = (condition, label) => {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
};

const read = (file) => fs.readFileSync(file, 'utf8');
const brandingFrontend = read(path.join(frontendRoot, 'app/lib/platform-branding.ts'));
const login = read(path.join(frontendRoot, 'app/components/LoginScreen.tsx'));
const shell = read(path.join(frontendRoot, 'app/components/DashboardShell.tsx'));
const app = read(path.join(frontendRoot, 'app/components/CticApplication.tsx'));
const projects = read(path.join(frontendRoot, 'app/components/CertificationProjectsScreen.tsx'));
const indexHtml = read(path.join(frontendRoot, 'index.html'));
const layout = read(path.join(frontendRoot, 'app/layout.tsx'));
const frontendEnv = read(path.join(frontendRoot, '.env.example'));

check(brandingFrontend.includes('VITE_BRAND_SHORT_NAME'), 'Frontend có cấu hình tên viết tắt thương hiệu');
check(brandingFrontend.includes('VITE_BRAND_ORGANIZATION_NAME'), 'Frontend có cấu hình tên tổ chức');
check(brandingFrontend.includes('VITE_DOCUMENT_CODE_PREFIX'), 'Frontend có cấu hình prefix số tài liệu');
check(brandingFrontend.includes('VITE_BRAND_PRIMARY_COLOR'), 'Frontend có cấu hình màu thương hiệu');
check(login.includes('PLATFORM_BRANDING.organizationName') && !/CTIC VIETNAM/.test(login), 'Màn hình đăng nhập dùng branding cấu hình');
check(shell.includes('PLATFORM_BRANDING.shortName') && !/CTIC VIETNAM/.test(shell), 'Sidebar dùng branding cấu hình');
check(app.includes('applyPlatformBrandingToDocument') && app.includes('PLATFORM_BRANDING.primaryColor'), 'Application áp dụng title/meta/màu thương hiệu');
check(projects.includes('generateNextCode(PLATFORM_BRANDING.documentCodePrefix'), 'Số hợp đồng mới không gắn cứng CTIC');
check(!/CTIC VIETNAM/.test(indexHtml) && !/CTIC Certification/.test(indexHtml), 'index.html dùng metadata trung tính');
check(!/CTIC VIETNAM/.test(layout) && !/CTIC Certification/.test(layout), 'Next metadata dùng nội dung trung tính');
check(frontendEnv.includes('VITE_BRAND_SHORT_NAME=CB'), '.env.example frontend có mẫu branding trung tính');

const brandingBackend = read(path.join(backendRoot, 'src/common/platform-branding.ts'));
const main = read(path.join(backendRoot, 'src/main.ts'));
const auditDocuments = read(path.join(backendRoot, 'src/audit-documents/audit-documents.service.ts'));
const certificationResults = read(path.join(backendRoot, 'src/certification-results/certification-results.service.ts'));
const reviewCriteria = read(path.join(backendRoot, 'src/technical-reviews/technical-review-criteria.ts'));
const backendEnv = read(path.join(backendRoot, '.env.example'));

check(brandingBackend.includes("CERTIFICATION_BODY_SHORT_NAME") && brandingBackend.includes("'CB'"), 'Backend có branding helper trung tính');
check(main.includes('getPlatformBranding()') && main.includes('platformBranding.platformTitle'), 'Swagger lấy tên platform từ branding helper');
check(auditDocuments.includes('getPlatformBranding('), 'Tài liệu đánh giá dùng branding helper chung');
check(certificationResults.includes('getPlatformBranding('), 'F.12/F.13 dùng branding helper chung');
check(!/CTIC review application/.test(reviewCriteria), 'Tiêu chí F.11 không còn gắn tên CTIC');
check(backendEnv.includes('CERTIFICATION_BODY_NAME=') && backendEnv.includes('PLATFORM_TITLE='), '.env.example backend có cấu hình tổ chức/platform');

const runtimeFrontendFiles = [
  'app/components/LoginScreen.tsx',
  'app/components/DashboardShell.tsx',
  'app/components/CertificationProjectsScreen.tsx',
  'app/layout.tsx',
  'index.html',
];
const runtimeFrontendText = runtimeFrontendFiles
  .map((file) => read(path.join(frontendRoot, file)))
  .join('\n');
check(!/\bCTIC\b|cticlab\.com/i.test(runtimeFrontendText), 'Các vị trí branding runtime frontend không còn CTIC hard-code');

const runtimeBackendFiles = [
  'src/main.ts',
  'src/common/platform-branding.ts',
  'src/audit-documents/audit-documents.service.ts',
  'src/certification-results/certification-results.service.ts',
  'src/technical-reviews/technical-review-criteria.ts',
  'src/users/dto/create-user.dto.ts',
  'src/users/dto/update-user.dto.ts',
  'src/auth/dto/register.dto.ts',
  'src/customers/dto/create-customer.dto.ts',
  'src/certification-projects/dto/create-complete-certification-project.dto.ts',
  'src/contracts/dto/create-contract.dto.ts',
  'src/audit-result-notifications/dto/create-audit-result-notification.dto.ts',
  'src/certification-decisions/dto/create-certification-decision.dto.ts',
  'src/certificates/dto/create-certificate.dto.ts',
];
const runtimeBackendText = runtimeBackendFiles
  .map((file) => read(path.join(backendRoot, file)))
  .join('\n');
check(!/\bCTIC\b|cticlab\.com/i.test(runtimeBackendText), 'Các vị trí branding runtime backend không còn CTIC hard-code');

console.log(`\nPatch 36B.1 branding regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
