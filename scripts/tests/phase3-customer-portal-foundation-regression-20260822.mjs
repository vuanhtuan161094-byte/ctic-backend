import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (label, condition) => {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
    return;
  }
  checks.push(label);
  console.log(`PASS: ${label}`);
};

const controller = read('src/customer-portal/customer-portal.controller.ts');
const service = read('src/customer-portal/customer-portal.service.ts');
const appModule = read('src/app.module.ts');
const constants = read('src/work-items/work-item.constants.ts');
const runner = read('scripts/tests/run-p09-real-e2e.cjs');
const portalE2e = read('test/customer-portal-foundation.e2e-spec.ts');
const capE2e = read('test/customer-cap-access.e2e-spec.ts');
const fullRoleE2e = read('test/phase-2-full-role.e2e-spec.ts');

console.log('=== PHASE 3.1 — CUSTOMER PORTAL FOUNDATION ===');
check('Customer Portal là module riêng và được nạp vào AppModule', /CustomerPortalModule/.test(appModule));
check('Toàn bộ Customer Portal bắt buộc role CUSTOMER', /@Roles\('CUSTOMER'\)/.test(controller));
check('Toàn bộ Customer Portal bắt buộc customer_portal.access', /@Permissions\('customer_portal\.access'\)/.test(controller));
check('Dashboard dùng customer mapping active thay vì dashboard toàn hệ thống', /getAccessibleCustomerIds/.test(service) && /getDashboard/.test(service));
check('Profile chỉ lấy customer thuộc mapping active', /getProfile/.test(service) && /customerIds/.test(service));
check('Application customer bị ép về customer mapping hợp lệ', /resolveCustomerId/.test(service) && /Không thể chuyển đơn đăng ký sang tổ chức khách hàng khác/.test(service));
check('Customer chỉ sửa đơn ở DRAFT hoặc REVISION_REQUIRED', /\['DRAFT', 'REVISION_REQUIRED'\]/.test(service));
check('Submit customer application tạo Work Item tiếp nhận cho Coordinator', /CUSTOMER_APPLICATION_INTAKE/.test(service) && /assignedRole:\s*'COORDINATOR'/.test(service));
check('Work Item Engine có action application.intake được giới hạn Coordinator', /application\.intake/.test(constants) && /APPLICATION_INTAKE, new Set\(\['COORDINATOR'\]\)/.test(constants));
check('Lịch customer loại PLAN draft và không trả phân công đoàn', /NOT:\s*\{\s*status:\s*'draft'/.test(service) && !/audit_team_appointment/.test(service));
check('Kết quả customer chỉ hiển thị F.12 đã sent', /sent_at:\s*\{\s*not:\s*null/.test(service));
check('Certificate customer đi theo customer -> project -> certificate series', /certificate_series:[\s\S]*certification_project:[\s\S]*certification_applications:[\s\S]*customer_id/.test(service));
check('Certificate projection chỉ bật PDF công khai khi có certificate_pdf current', /document_type:\s*'certificate_pdf'/.test(service) && /official_pdf_available/.test(service));
check('Notification portal dùng whitelist customer-safe thay vì trả toàn bộ notification', /CUSTOMER_SAFE_NOTIFICATION_CATEGORIES/.test(service) && /startsWith\('CUSTOMER_'\)/.test(service));
check('Portal không expose technical reviewer comment hoặc certification decision note', !/general_comment/.test(service) && !/approver_comment/.test(service));
check('Bản nháp customer không bắt buộc declaration trước khi lưu nhưng submit vẫn bắt buộc', /requireDeclaration:\s*false/.test(service) && /!application\.declaration_accepted/.test(service));
check('Customer notification dùng endpoint read riêng, không tác động notification nội bộ ẩn', /me\/notifications\/read-all/.test(controller) && /me\/notifications\/:id\/read/.test(controller) && /markAllNotificationsRead/.test(service));
check('Customer notification chỉ điều hướng tới route portal an toàn', /customerNotificationDestination/.test(service) && /\/customer-portal\/certificates/.test(service) && /\/customer-portal\/corrective-actions/.test(service));
check('P09 real SQL Server runner có Customer Portal E2E', /customer-portal-foundation\.e2e-spec\.ts/.test(runner));
check('Customer Portal E2E tái sử dụng role/permission chuẩn theo natural key, không tạo trùng seed', /ensureRole/.test(portalE2e) && /role_name:\s*roleName/.test(portalE2e) && /permission_name:\s*'customer_portal\.access'/.test(portalE2e) && !/prisma\.roles\.createMany/.test(portalE2e));
check('Customer Portal E2E gửi site_no hợp lệ theo cùng contract với frontend', /sites:\s*\[[\s\S]*?site_no:\s*1[\s\S]*?address:\s*'Customer A address'/.test(portalE2e));
check('Customer Portal E2E cleanup xóa notification theo work_item trước khi xóa Work Item', /workItemIds[\s\S]*notifications\.deleteMany\([\s\S]*work_item_id:[\s\S]*work_items\.deleteMany/.test(portalE2e));
check('P.09 CAP E2E tái sử dụng role/permission chuẩn theo natural key', /ensureRole\(/.test(capE2e) && /ensurePermission\(/.test(capE2e) && /role_name:\s*roleName/.test(capE2e) && /permission_name:\s*permissionName/.test(capE2e) && !/prisma\.roles\.createMany/.test(capE2e));
check('P.09 CAP E2E cleanup xóa notification tham chiếu Work Item trước khi xóa Work Item', /workItemIds[\s\S]*notifications\.deleteMany\([\s\S]*work_item_id:[\s\S]*work_items\.deleteMany/.test(capE2e));
check('Phase 2 full-role E2E cleanup xóa notification tham chiếu Work Item trước khi xóa Work Item', /workItemIds[\s\S]*notifications\.deleteMany\([\s\S]*work_item_id:[\s\S]*work_items\.deleteMany/.test(fullRoleE2e));
check('Phase 2 full-role E2E không xóa role/permission chuẩn dùng chung của test DB', !/prisma\.role_permissions\.deleteMany/.test(fullRoleE2e) && !/prisma\.roles\.deleteMany/.test(fullRoleE2e));

console.log(`Phase 3.1 customer portal regression: ${checks.length} PASS / ${process.exitCode ? 1 : 0} FAIL`);
