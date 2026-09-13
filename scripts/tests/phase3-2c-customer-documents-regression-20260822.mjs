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
const migration = read('prisma/migrations/20260822100000_customer_document_requests/migration.sql');
const moduleSource = read('src/customer-documents/customer-documents.module.ts');
const portalController = read('src/customer-documents/customer-documents.portal.controller.ts');
const internalController = read('src/customer-documents/customer-document-requests.controller.ts');
const service = read('src/customer-documents/customer-documents.service.ts');
const workConstants = read('src/work-items/work-item.constants.ts');
const portalService = read('src/customer-portal/customer-portal.service.ts');
const appModule = read('src/app.module.ts');
const runner = read('scripts/tests/run-p09-real-e2e.cjs');
const portalUi = read('../ctic-frontend/app/components/CustomerDocumentsScreen.tsx');
const internalUi = read('../ctic-frontend/app/components/CustomerDocumentRequestsScreen.tsx');
const shell = read('../ctic-frontend/app/components/DashboardShell.tsx');

console.log('=== PHASE 3.2C — APPLICATION DOCUMENTS / EVIDENCE REQUEST INBOX ===');
check('Prisma có domain yêu cầu tài liệu khách hàng', /model customer_document_requests/.test(schema));
check('Yêu cầu tài liệu liên kết customer + application + requester/reviewer', /customer_id/.test(schema) && /application_id/.test(schema) && /CustomerDocumentRequestRequestedBy/.test(schema) && /CustomerDocumentRequestReviewedBy/.test(schema));
check('Migration 20 additive và không DROP dữ liệu', /CREATE TABLE \[dbo\]\.\[customer_document_requests\]/.test(migration) && !/DROP\s+(TABLE|DATABASE)/i.test(migration));
check('Migration khóa category và lifecycle status', /CK_customer_document_requests_category/.test(migration) && /REVISION_REQUIRED/.test(migration) && /ACCEPTED/.test(migration));
check('Migration tạo permission customer_documents.manage cho Admin/Coordinator', /customer_documents\.manage/.test(migration) && /ADMIN/.test(migration) && /COORDINATOR/.test(migration));
check('CustomerDocumentsModule được nạp vào AppModule', /CustomerDocumentsModule/.test(appModule) && /CustomerDocumentsPortalController/.test(moduleSource));
check('Portal controller bắt buộc CUSTOMER + customer_portal.access', /@Roles\('CUSTOMER'\)/.test(portalController) && /@Permissions\('customer_portal\.access'\)/.test(portalController));
check('Internal document request controller bắt buộc Admin/Coordinator + permission riêng', /@Roles\('ADMIN', 'COORDINATOR'\)/.test(internalController) && /@Permissions\('customer_documents\.manage'\)/.test(internalController));
check('Application document upload khóa entity/document type phía server', /entityType: 'certification_application'/.test(service) && /customer_application_/.test(service));
check('Application document upload dùng secure file validation + SHA-256', /validateUploadedFile/.test(service) && /sha256: validated\.sha256/.test(service));
check('Application documents có versioning và current marker', /_max: \{ version_no: true \}/.test(service) && /is_current: false/.test(service) && /is_current: true/.test(service));
check('Customer ownership được kiểm qua active customer mapping', /getAccessibleCustomerIds/.test(service) && /customer_id: \{ in: customerIds \}/.test(service));
check('Cross-customer application không dùng client-supplied customer_id', /assertCustomerApplication/.test(service) && !/dto\.customer_id/.test(service));
check('Evidence request response chỉ nhận REQUESTED/REVISION_REQUIRED', /\['REQUESTED', 'REVISION_REQUIRED'\]/.test(service));
check('Submit response bắt buộc có tài liệu current', /Cần tải ít nhất một tài liệu phản hồi/.test(service) && /is_current: true/.test(service));
check('Submit response tạo durable Work Item cho Coordinator', /CUSTOMER_DOCUMENT_RESPONSE_REVIEW/.test(service) && /assignedRole: 'COORDINATOR'/.test(service));
check('Work Item action customer.document_response.review chỉ Coordinator eligible', /customer\.document_response\.review/.test(workConstants) && /CUSTOMER_DOCUMENT_RESPONSE_REVIEW, new Set\(\['COORDINATOR'\]\)/.test(workConstants));
check('Review chỉ xử lý SUBMITTED và hoàn tất Work Item', /current\.status !== 'SUBMITTED'/.test(service) && /completeWorkItem/.test(service));
check('Revision yêu cầu comment bắt buộc', /Cần nhập nội dung yêu cầu bổ sung\/chỉnh sửa/.test(service));
check('Customer nhận notification yêu cầu và kết quả review', /CUSTOMER_DOCUMENT_REQUESTED/.test(service) && /CUSTOMER_DOCUMENT_ACCEPTED/.test(service) && /CUSTOMER_DOCUMENT_REVISION_REQUIRED/.test(service));
check('Notification document được map về portal documents', /notificationType\.includes\('DOCUMENT'\)/.test(portalService) && /customer-portal\/documents/.test(portalService));
check('Customer file download kiểm ownership và file integrity', /getPortalDownload/.test(service) && /verifyStoredFileIntegrity/.test(service));
check('Portal projection không expose reviewer nội bộ/password', !/password_hash/.test(portalUi) && !/reviewed_by/.test(portalUi));
check('Portal UI có upload application document + evidence response', /applications\/\$\{applicationModal\.id\}\/upload/.test(portalUi) && /requests\/\$\{requestModal\.id\}\/submit/.test(portalUi));
check('Internal UI có tạo request + accept/revision review', /Tạo yêu cầu bổ sung tài liệu/.test(internalUi) && /REVISION_REQUIRED/.test(internalUi) && /ACCEPT/.test(internalUi));
check('DashboardShell tách portal documents và internal document request queue', /customer-documents/.test(shell) && /customer-document-requests/.test(shell));
check('Runner derives repository migration contract and includes suite E2E Phase 3.2C', /readCanonicalMigrationNames/.test(runner) && /customer-document-requests\.e2e-spec\.ts/.test(runner));
check('Có real SQL Server E2E Phase 3.2C', exists('test/customer-document-requests.e2e-spec.ts'));
const e2e = read('test/customer-document-requests.e2e-spec.ts');
check('E2E chứng minh version 1 -> version 2 cho application document', /version_no\)\.toBe\(1\)/.test(e2e) && /version_no\)\.toBe\(2\)/.test(e2e));
check('E2E chứng minh cross-customer application upload bị 403', /applicationB[\s\S]*expect\(403\)/.test(e2e));
check('E2E chứng minh Work Item chỉ mở sau customer submit', /toBeNull\(\)[\s\S]*customer-document-request:\$\{requestId\}:review/.test(e2e));
check('E2E chứng minh revision -> resubmit -> accept', /REVISION_REQUIRED/.test(e2e) && /qms-manual-v2/.test(e2e) && /decision: 'ACCEPT'/.test(e2e));
check('E2E cleanup xóa Work Item/request/document trước application/customer/user', /work_items\.deleteMany[\s\S]*customer_document_requests\.deleteMany[\s\S]*documentFile\.deleteMany[\s\S]*certification_applications\.deleteMany[\s\S]*customers\.deleteMany[\s\S]*users\.deleteMany/.test(e2e));

console.log(`Phase 3.2C customer documents regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
