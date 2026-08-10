import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const verifier = fs.readFileSync(path.join(root, 'scripts/verify-prisma-client-patch35a4.cjs'), 'utf8');

let pass = 0;
let fail = 0;
const check = (condition, message) => {
  if (condition) { console.log(`PASS: ${message}`); pass += 1; }
  else { console.error(`FAIL: ${message}`); fail += 1; }
};

const scripts = packageJson.scripts || {};
check(((scripts['db:migrate:deploy'] || '').includes('prisma migrate deploy') || (scripts['db:migrate:deploy'] || '').includes('db:migrate:retry')) && (scripts['db:migrate:deploy'] || '').includes('prisma generate'), 'Deploy migration/retry tự generate Prisma Client');
check((scripts['db:migrate:deploy'] || '').includes('verify-prisma-client-patch35a4.cjs'), 'Deploy migration tự verify Prisma Client sau generate');
check((scripts.prebuild || '').includes('prisma generate') && (scripts.prebuild || '').includes('verify-prisma-client-patch35a4.cjs'), 'Build luôn generate + verify Prisma Client');
check((scripts['prestart:dev'] || '').includes('prisma generate') && (scripts['prestart:dev'] || '').includes('verify-prisma-client-patch35a4.cjs'), 'Khởi động dev luôn generate + verify Prisma Client');
check((scripts['prisma:generate'] || '').includes('verify-prisma-client-patch35a4.cjs'), 'Lệnh prisma:generate có kiểm tra client sau generate');
check(scripts['prisma:verify'] === 'node scripts/verify-prisma-client-patch35a4.cjs', 'Có lệnh prisma:verify độc lập');
check(verifier.includes("'sha256'"), 'Verifier bắt buộc client có trường sha256 của Patch 36B.5');
check(verifier.includes("'request_id'") && verifier.includes("'outcome'") && verifier.includes("'status_code'") && verifier.includes("'duration_ms'"), 'Verifier bắt buộc client có metadata audit của Patch 36B.6');
check(verifier.includes('DUNG backend dang chay') && verifier.includes('npm run prisma:generate'), 'Thông báo lỗi hướng dẫn dừng backend và generate lại client');

console.log(`\nPatch 36B.6a Prisma client sync regression: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
