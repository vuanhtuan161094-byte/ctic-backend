import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];
function check(name, condition) { checks.push({ name, condition: Boolean(condition) }); }
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

const ps1 = read('scripts/apply-patch35a45.ps1');
const cmd = read('scripts/apply-patch35a45.cmd');
const safePs1 = read('scripts/stabilize-windows-patch36c1a.ps1');

check('Legacy CMD vẫn tồn tại để tương thích shortcut cũ', fs.existsSync(path.join(root, 'scripts/apply-patch35a45.cmd')));
check('Legacy PowerShell vẫn tồn tại để tương thích shortcut cũ', fs.existsSync(path.join(root, 'scripts/apply-patch35a45.ps1')));
check('Legacy CMD chuyển hướng sang STABILIZE_36C1A', cmd.includes('STABILIZE_36C1A.cmd'));
check('Legacy PowerShell chuyển hướng sang stabilizer 36C.1a', ps1.includes('stabilize-windows-patch36c1a.ps1'));
check('Legacy installer không còn cấp db_owner', !/ALTER ROLE \[db_owner\] ADD MEMBER/i.test(ps1));
check('Current Windows stabilizer dùng Windows Authentication cho development fallback', safePs1.includes('Integrated Security') && safePs1.includes('$true'));
check('Current Windows stabilizer chỉ cấp db_ddladmin/datareader/datawriter', safePs1.includes('db_ddladmin') && safePs1.includes('db_datareader') && safePs1.includes('db_datawriter'));
check('Current Windows stabilizer không cấp db_owner', !/ALTER ROLE \[db_owner\] ADD MEMBER/i.test(safePs1));
check('Current Windows stabilizer thu hồi role trong finally', safePs1.includes('finally') && safePs1.includes('DROP MEMBER'));
check('Có migration baseline', fs.existsSync(path.join(root, 'prisma/migrations/00000000000000_baseline/migration.sql')));
check('Có migration man-day IMS', fs.existsSync(path.join(root, 'prisma/migrations/20260805230000_patch35a3_integrated_manday_allocation/migration.sql')));
check('Migration man-day không xóa bảng', !read('prisma/migrations/20260805230000_patch35a3_integrated_manday_allocation/migration.sql').toUpperCase().includes('DROP TABLE'));

let pass = 0;
for (const item of checks) {
  if (item.condition) { pass += 1; console.log(`✓ ${item.name}`); }
  else console.log(`✗ ${item.name}`);
}
const fail = checks.length - pass;
console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
