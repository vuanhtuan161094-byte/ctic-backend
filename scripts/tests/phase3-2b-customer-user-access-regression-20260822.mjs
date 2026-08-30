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
const migration = read('prisma/migrations/20260822090000_customer_user_access_requests/migration.sql');
const service = read('src/customer-portal/customer-portal.service.ts');
const portalController = read('src/customer-portal/customer-portal.controller.ts');
const reviewController = read('src/customer-portal/customer-user-access-review.controller.ts');
const workConstants = read('src/work-items/work-item.constants.ts');
const customersService = read('src/customers/customers.service.ts');
const runner = read('scripts/tests/run-p09-real-e2e.cjs');
const portalUi = read('../ctic-frontend/app/components/CustomerPortalUsersScreen.tsx');
const reviewUi = read('../ctic-frontend/app/components/CustomerUserRequestsScreen.tsx');
const shell = read('../ctic-frontend/app/components/DashboardShell.tsx');

console.log('=== PHASE 3.2B — CUSTOMER USER ACCESS ADMINISTRATION ===');
check('Prisma có domain request quản trị user Portal', /model customer_user_access_requests/.test(schema));
check('Prisma có lịch sử mapping riêng', /model customer_user_access_history/.test(schema));
check('Request hỗ trợ ADD/REVOKE/REACTIVATE ở migration', /ADD_USER/.test(migration) && /REVOKE_ACCESS/.test(migration) && /REACTIVATE_ACCESS/.test(migration));
check('Migration additive và không DROP dữ liệu', /CREATE TABLE \[dbo\]\.\[customer_user_access_requests\]/.test(migration) && !/DROP\s+(TABLE|DATABASE)/i.test(migration));
check('Migration backfill lịch sử mapping hiện hữu', /MIGRATION_BASELINE/.test(migration) && /INSERT INTO \[dbo\]\.\[customer_user_access_history\]/.test(migration));
check('Migration tạo permission review chỉ cho ADMIN', /customer_user_requests\.review/.test(migration) && /UPPER\(r\.\[role_name\]\) = N'ADMIN'/.test(migration));
check('Portal có API xem user, lịch sử request và gửi request', /me\/user-access/.test(portalController) && /me\/user-access-requests/.test(portalController));
check('Customer không có endpoint tự cấp mapping trực tiếp', !/customer_user_access\.(create|upsert|update)/.test(portalController));
check('Submit request khóa customer theo active mapping', /resolveCustomerId\(actor, dto\.customer_id\)/.test(service));
check('ADD_USER không tạo account khi customer gửi request', /createCustomerUserAccessRequest[\s\S]*customer_user_access_requests\.create/.test(service) && !/createCustomerUserAccessRequest[\s\S]{0,5000}tx\.users\.create/.test(service));
check('Submit tạo Work Item riêng cho ADMIN', /CUSTOMER_USER_ACCESS_REVIEW/.test(workConstants) && /assignedRole: 'ADMIN'/.test(service));
check('Work Item action customer.user_access.review chỉ ADMIN eligible', /customer\.user_access\.review/.test(workConstants) && /CUSTOMER_USER_ACCESS_REVIEW, new Set\(\['ADMIN'\]\)/.test(workConstants));
check('Internal review bắt buộc ADMIN + permission riêng', /@Roles\('ADMIN'\)/.test(reviewController) && /@Permissions\('customer_user_requests\.review'\)/.test(reviewController));
check('Tạo user mới chỉ tại bước Admin APPROVE', /reviewCustomerUserAccessRequest[\s\S]*tx\.users\.create/.test(service));
check('Password tạm chỉ hash và không lưu vào request', /bcrypt\.hash\(dto\.temporary_password/.test(service) && !/temporary_password\s*:/.test(schema) && !/temporary_password/.test(migration));
check('User mới chỉ nhận role CUSTOMER', /tx\.roles\.findFirst\([\s\S]*role_name: 'CUSTOMER'/.test(service) && /tx\.user_roles\.create/.test(service));
check('Không tự gán Portal cho account có role nội bộ', /customerRoleOnly/.test(service) && /Tài khoản trùng email không đủ điều kiện/.test(service));
check('REVOKE chỉ thay mapping, không khóa users.status', /REVOKE_ACCESS[\s\S]*customer_user_access\.update/.test(service) && !/REVOKE_ACCESS[\s\S]{0,2500}users\.update/.test(service));
check('Không cho revoke user Portal cuối cùng', /activeCount <= 1/.test(service) && /người dùng Portal cuối cùng/.test(service));
check('REACTIVATE kiểm account active + CUSTOMER-only', /Tài khoản không đủ điều kiện để khôi phục quyền Portal/.test(service));
check('Approve ghi access history với source CUSTOMER_REQUEST', /customer_user_access_history\.create/.test(service) && /source_type: 'CUSTOMER_REQUEST'/.test(service));
check('Direct Admin assign/revoke cũng ghi access history', /source_type: 'ADMIN_DIRECT'/.test(customersService) && /customer_user_access_history\.create/.test(customersService));
check('Direct Admin revoke cũng bảo vệ user cuối cùng', /Cannot revoke the last active customer portal user/.test(customersService));
check('Request terminal không được review lại', /Yêu cầu tài khoản đã được xử lý/.test(service));
check('Customer nhận notification customer-safe', /CUSTOMER_USER_ACCESS_APPROVED/.test(service) && /CUSTOMER_USER_ACCESS_REJECTED/.test(service));
check('Notification user access điều hướng vào portal users', /customer-portal\/users/.test(service));
check('Portal projection không trả password_hash', !/password_hash/.test(portalUi));
check('Portal UI chỉ gửi request, không gọi customers/:id/user-access', /user-access-requests/.test(portalUi) && !/customers\/.*user-access/.test(portalUi));
check('Portal UI có add/revoke/reactivate và chặn revoke cuối cùng', /ADD_USER/.test(portalUi) && /REVOKE_ACCESS/.test(portalUi) && /REACTIVATE_ACCESS/.test(portalUi) && /activeCount <= 1/.test(portalUi));
check('Admin UI chỉ yêu cầu credentials khi tạo user mới', /CREATE_NEW_USER/.test(reviewUi) && /temporary_password/.test(reviewUi) && /Input\.Password/.test(reviewUi));
check('Admin UI hiển thị conflict account thay vì auto nâng quyền', /CONFLICT/.test(reviewUi) && /không phù hợp để cấp Portal tự động/.test(reviewUi));
check('DashboardShell tách menu customer users và Admin review queue', /customer-portal-users/.test(shell) && /customer-user-requests/.test(shell));
check('Runner chốt migration 19 và suite E2E 3.2B', /20260822090000_customer_user_access_requests/.test(runner) && /customer-user-access-request\.e2e-spec\.ts/.test(runner));
check('Có real SQL Server E2E Phase 3.2B', exists('test/customer-user-access-request.e2e-spec.ts'));
const e2e = read('test/customer-user-access-request.e2e-spec.ts');
check('E2E chứng minh customer request không tự tạo user', /findUnique\(\{ where: \{ email: newUserEmail \} \}\)\)\.toBeNull/.test(e2e));
check('E2E chứng minh revoke mapping không khóa account', /mapping\?\.status\)\.toBe\('revoked'\)/.test(e2e) && /user\?\.status\)\.toBe\('active'\)/.test(e2e));
check('E2E cleanup xóa history/request trước mapping/user', /customer_user_access_history\.deleteMany[\s\S]*customer_user_access_requests\.deleteMany[\s\S]*customer_user_access\.deleteMany[\s\S]*users\.deleteMany/.test(e2e));

const legacyCustomerAccessSuites = [
  'test/customer-cap-access.e2e-spec.ts',
  'test/customer-portal-foundation.e2e-spec.ts',
  'test/customer-organization-change.e2e-spec.ts',
  'test/phase-2-full-role.e2e-spec.ts',
  'test/work-items.e2e-spec.ts',
  'test/application-review-cb-capability.e2e-spec.ts',
];
for (const relative of legacyCustomerAccessSuites) {
  const source = read(relative);
  check(
    `${relative} cleanup xóa customer_user_access_history trước customer_user_access`,
    /customer_user_access_history\.deleteMany[\s\S]*customer_user_access\.deleteMany/.test(source),
  );
}

console.log(`Phase 3.2B customer user access regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
