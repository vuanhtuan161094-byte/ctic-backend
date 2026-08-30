import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260825113000_user_permission_overrides/migration.sql');
const controller = read('src/users/users.controller.ts');
const service = read('src/users/users.service.ts');
const jwt = read('src/auth/jwt.strategy/jwt.strategy.ts');
const resolver = read('src/auth/effective-permissions.ts');
const runner = read('scripts/tests/run-current-regressions-patch36c0.mjs');

const checks = [
  ['Schema có user_permission_overrides', /model\s+user_permission_overrides\s*\{/.test(schema)],
  ['Override unique theo user + permission', /@@id\(\[user_id, permission_id\]/.test(schema)],
  ['Migration khóa effect ALLOW/DENY', /CHECK \(\[effect\] IN \(N'ALLOW', N'DENY'\)\)/.test(migration)],
  ['Migration có FK user', /FK_user_permission_overrides_user/.test(migration)],
  ['Migration có FK permission', /FK_user_permission_overrides_permission/.test(migration)],
  ['API đọc permission profile tồn tại', /@Get\(':id\/permission-profile'\)/.test(controller)],
  ['API cập nhật permission override tồn tại', /@Patch\(':id\/permission-overrides'\)/.test(controller)],
  ['API override vẫn ADMIN-only', /@Roles\('ADMIN'\)[\s\S]{0,180}@Permissions\('users\.manage'\)[\s\S]{0,260}replacePermissionOverrides/.test(controller)],
  ['JWT nạp permission overrides trực tiếp từ DB', /permission_overrides:[\s\S]{0,180}permission:\s*true/.test(jwt)],
  ['JWT dùng resolver quyền hiệu lực', /resolveEffectivePermissionProfile\(/.test(jwt)],
  ['Resolver áp dụng ALLOW trước DENY', /\.\.\.allow[\s\S]{0,180}for \(const permission of deny\)/.test(resolver)],
  ['Service không cho override ADMIN', /Không áp dụng quyền riêng cho vai trò Quản trị viên/.test(service)],
  ['Service chặn ALLOW trùng quyền role', /Quyền đã có sẵn từ vai trò, không cần cấp riêng/.test(service)],
  ['Service chặn DENY ngoài quyền role', /Chỉ có thể thu hồi quyền đang được cấp từ vai trò/.test(service)],
  ['Service audit before/after override', /USER_PERMISSION_OVERRIDES_UPDATED/.test(service) && /effective_permissions/.test(service)],
  ['Đổi role tự dọn override dư thừa', /removed_permission_overrides/.test(service) && /redundantOverrides/.test(service)],
  ['Regression mới được gắn vào full regression', /user-permission-overrides-regression-20260825\.mjs/.test(runner)],
];

let pass = 0;
let fail = 0;
for (const [label, ok] of checks) {
  if (ok) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
}

console.log(`\nUSER PERMISSION OVERRIDES REGRESSION: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} pass, ${fail} fail)`);
if (fail > 0) process.exitCode = 1;
