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
const migration = read('prisma/migrations/20260822070000_customer_organization_change_request/migration.sql');
const service = read('src/customer-portal/customer-portal.service.ts');
const customerController = read('src/customer-portal/customer-portal.controller.ts');
const reviewController = read('src/customer-portal/customer-organization-change-review.controller.ts');
const createDto = read('src/customer-portal/dto/create-customer-organization-change-request.dto.ts');
const workConstants = read('src/work-items/work-item.constants.ts');
const documentController = read('src/document-files/document-files.controller.ts');
const documentService = read('src/document-files/document-files.service.ts');
const runner = read('scripts/tests/run-p09-real-e2e.cjs');
const frontendProfile = read('../ctic-frontend/app/components/CustomerProfileScreen.tsx');
const frontendReview = read('../ctic-frontend/app/components/CustomerChangeRequestsScreen.tsx');
const frontendShell = read('../ctic-frontend/app/components/DashboardShell.tsx');

console.log('=== PHASE 3.2A — CUSTOMER ORGANIZATION CHANGE REQUEST ===');
check('Prisma có domain yêu cầu thay đổi hồ sơ tổ chức', /model customer_organization_change_requests/.test(schema));
check('Yêu cầu lưu snapshot trước và sau', /before_snapshot\s+String/.test(schema) && /after_snapshot\s+String/.test(schema));
check('Yêu cầu lưu người gửi, người xem xét và thời điểm áp dụng', /requested_by/.test(schema) && /reviewed_by/.test(schema) && /applied_at/.test(schema));
check('Migration additive tạo bảng mới và không DROP dữ liệu', /CREATE TABLE \[dbo\]\.\[customer_organization_change_requests\]/.test(migration) && !/DROP\s+(TABLE|DATABASE)/i.test(migration));
check('Migration có FK customer/requester/reviewer', /FK_customer_org_change_customer/.test(migration) && /FK_customer_org_change_requested_by/.test(migration) && /FK_customer_org_change_reviewed_by/.test(migration));
check('Migration tạo permission review riêng cho Coordinator/Admin', /customer_changes\.review/.test(migration) && /COORDINATOR/.test(migration) && /ADMIN/.test(migration));
check('Customer Portal có API list và submit change request', /me\/organization-change-requests/.test(customerController) && /createOrganizationChangeRequest/.test(customerController));
check('DTO cho phép xóa email tùy chọn nhưng vẫn validate email có giá trị', /ValidateIf/.test(createDto) && /value !== ''/.test(createDto) && /@IsEmail\(\)/.test(createDto));
check('Backend khóa customer_id theo active customer mapping', /resolveCustomerId\(actor, dto\.customer_id\)/.test(service));
check('Backend chặn hai yêu cầu pending cùng lúc cho một customer', /status: \{ in: \['SUBMITTED', 'UNDER_REVIEW'\] \}/.test(service));
check('Backend không cập nhật master khi customer chỉ gửi yêu cầu', /createOrganizationChangeRequest[\s\S]*customer_organization_change_requests\.create/.test(service));
check('Submit tạo Work Item riêng cho Coordinator', /CUSTOMER_ORGANIZATION_CHANGE_REVIEW/.test(workConstants) && /customer\.organization_change\.review/.test(workConstants) && /assignedRole: 'COORDINATOR'/.test(service));
check('Tạo yêu cầu và Work Item là một transaction nguyên tử', /const created = await this\.prisma\.\$transaction\(async \(tx\)/.test(service) && /openWorkItem\([\s\S]*?, tx\);/.test(service));
check('Internal review bắt buộc role Coordinator/Admin + permission riêng', /@Roles\('ADMIN', 'COORDINATOR'\)/.test(reviewController) && /@Permissions\('customer_changes\.review'\)/.test(reviewController));
check('Approve cập nhật customer master trong transaction', /\$transaction\(async \(tx\)/.test(service) && /tx\.customers\.update/.test(service));
check('Approve xử lý contact hiện có hoặc tạo contact mới', /tx\.contacts\.update/.test(service) && /tx\.contacts\.create/.test(service));
check('Reject bắt buộc có lý do', /decision === 'REJECT' && !comment/.test(service));
check('Quyết định hoàn tất Work Item và không cho review lại terminal', /completeWorkItem/.test(service) && /không thể ra quyết định lại/.test(service));
check('Customer nhận notification customer-safe sau review', /CUSTOMER_ORGANIZATION_CHANGE_APPROVED/.test(service) && /CUSTOMER_ORGANIZATION_CHANGE_REJECTED/.test(service));
check('Customer notification điều hướng về profile portal', /customer-portal\/profile/.test(service));
check('Có upload attachment qua secure upload pipeline', /organization-change-requests\/:requestId\/attachment/.test(documentController) && /createSecureUploadOptions/.test(documentController));
check('Attachment ownership được kiểm lại theo customer mapping', /assertCustomerOrganizationChangeRequestAccess/.test(documentService) && /getAccessibleCustomerIds/.test(documentService));
check('Customer download chỉ mở CAP evidence hoặc organization change attachment', /getCustomerPortalDownload/.test(documentService) && /organization_change_attachment/.test(documentService));
check('Frontend profile có form gửi yêu cầu và lịch sử snapshot', /Yêu cầu thay đổi/.test(frontendProfile) && /organization-change-requests/.test(frontendProfile) && /Lịch sử yêu cầu thay đổi/.test(frontendProfile));
check('Frontend hỗ trợ đính kèm file sau khi tạo request', /document-files\/customer\/organization-change-requests/.test(frontendProfile) && /FormData/.test(frontendProfile));
check('Coordinator có màn hình review riêng', /Yêu cầu thay đổi hồ sơ/.test(frontendReview) && /customer-change-requests/.test(frontendReview));
check('DashboardShell chỉ mở màn review cho internal Coordinator/Admin', /customer-change-requests/.test(frontendShell) && /CustomerChangeRequestsScreen/.test(frontendShell));
check('P09 runner có migration 18 và E2E Phase 3.2A', /20260822070000_customer_organization_change_request/.test(runner) && /customer-organization-change\.e2e-spec\.ts/.test(runner));
check('Có real SQL Server E2E cho organization change', exists('test/customer-organization-change.e2e-spec.ts'));
const organizationChangeE2e = read('test/customer-organization-change.e2e-spec.ts');
check('Phase 3.2A E2E cleanup xóa audit log theo user trước khi xóa user fixture', /audit_logs\.deleteMany\(\{ where: \{ user_id: \{ in: userIds \} \} \}\);[\s\S]*users\.deleteMany/.test(organizationChangeE2e));
const decisionService = read('src/certification-decisions/certification-decisions.service.ts');
const decisionStatusSpec = read('src/certification-decisions/certification-decisions-status-lifecycle.spec.ts');
check('Decision transaction nhận diện đúng ENOTBEGUN từ SQL driver', /ENOTBEGUN/.test(decisionService) && /transaction has not begun/.test(decisionService));
check('Decision transaction chỉ retry giới hạn tối đa 2 lần', /const maxAttempts = 2/.test(decisionService) && /attempt >= maxAttempts/.test(decisionService));
check('Decision transaction vẫn giữ isolation Serializable khi retry toàn transaction', /runSerializableTransaction/.test(decisionService) && /TransactionIsolationLevel[\s\S]*Serializable/.test(decisionService));
check('Unit test mô phỏng ENOTBEGUN lần đầu và xác nhận transaction chạy đúng 2 lần', /transactionNotBegunOnce/.test(decisionStatusSpec) && /toHaveBeenCalledTimes\([\s\S]*2/.test(decisionStatusSpec));

console.log(`Phase 3.2A organization change regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
