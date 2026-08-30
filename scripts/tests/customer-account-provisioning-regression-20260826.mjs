import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const controller = read('src/customers/customers.controller.ts');
const service = read('src/customers/customers.service.ts');
const dto = read('src/customers/dto/create-customer-portal-user.dto.ts');
const governance = read('src/system-administration/system-administration.service.ts');

const checks = [
  ['Có API tạo trực tiếp tài khoản Portal theo khách hàng', /@Post\(':id\/portal-users'\)/.test(controller)],
  ['API provisioning dùng permission kiểm soát customer user', /@Permissions\('customer_user_requests\.review'\)[\s\S]{0,700}provisionPortalUser/.test(controller)],
  ['Có API tạo mật khẩu mới cho tài khoản Portal', /portal-users\/:userId\/reset-password/.test(controller)],
  ['DTO bắt buộc họ tên và email hợp lệ', /full_name!:\s*string/.test(dto) && /@IsEmail\(\)/.test(dto)],
  ['Tài khoản mới luôn lấy CUSTOMER role từ DB', /role_name:\s*'CUSTOMER'/.test(service)],
  ['Tài khoản mới chỉ được gắn customer_user_access của khách hàng', /customer_id:\s*customerId[\s\S]{0,160}user_id:\s*user\.id[\s\S]{0,160}status:\s*'active'/.test(service)],
  ['Email trùng tài khoản nội bộ bị fail-closed', /Email đã thuộc tài khoản nội bộ/.test(service)],
  ['Tài khoản CUSTOMER hiện có được liên kết/khôi phục thay vì tạo trùng', /CUSTOMER_PORTAL_ACCESS_LINKED/.test(service) && /REACTIVATED/.test(service)],
  ['Mật khẩu chỉ lưu hash bcrypt', /bcrypt\.hash\(generatedPassword/.test(service) && !/password_hash:\s*generatedPassword/.test(service)],
  ['Audit provisioning không ghi mật khẩu rõ', /CUSTOMER_PORTAL_USER_PROVISIONED/.test(service) && !/details_json:[\s\S]{0,500}temporary_password/.test(service)],
  ['Reset mật khẩu xóa failed login/locked_until', /failed_login_count:\s*0/.test(service) && /locked_until:\s*null/.test(service)],
  ['System Administration nhận diện direct + request workflow', /CONTROLLED_DIRECT_OR_REQUEST_WORKFLOW/.test(governance)],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS: ${label}`);
  else { failed += 1; console.error(`FAIL: ${label}`); }
}
console.log(`\nCUSTOMER ACCOUNT PROVISIONING REGRESSION: ${failed ? 'FAIL' : 'PASS'} (${checks.length - failed} pass, ${failed} fail)`);
process.exit(failed ? 1 : 0);
