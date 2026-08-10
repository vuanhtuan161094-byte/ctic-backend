import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..', '..');
const documentServicePath = path.join(
  backendRoot,
  'src',
  'audit-documents',
  'audit-documents.service.ts',
);
const findingServicePath = path.join(
  backendRoot,
  'src',
  'audit-findings',
  'audit-findings.service.ts',
);

const documentService = fs.readFileSync(documentServicePath, 'utf8');
const findingService = fs.readFileSync(findingServicePath, 'utf8');

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    pass += 1;
  } else {
    console.error(`✗ ${message}`);
    fail += 1;
  }
}

console.log('\n=== PATCH 35F.1 — SỬA 6 LỖI TYPESCRIPT ===');

check(
  documentService.includes('const reviewerById = new Map<'),
  'Map người xem xét có khai báo kiểu khóa và giá trị rõ ràng',
);
check(
  documentService.includes('reviewers.map((reviewer) => [') &&
    documentService.includes('] as const),'),
  'Tuple người xem xét được cố định thành cặp [id, reviewer]',
);
check(
  documentService.includes('reviewer?.full_name ?? reviewer?.username'),
  'Tên người xem xét truy cập được sau khi Map có kiểu',
);
check(
  documentService.includes("card_key: 'audit_program_f03:'") &&
    /program_key:\s*null,\s*finding_id:\s*null,\s*card_key:\s*'audit_program_f03:'/.test(documentService),
  'Thẻ F.03 dự phòng có finding_id = null',
);
check(
  documentService.includes("card_key: 'audit_team_assignment_f04:'") &&
    /program_key:\s*null,\s*finding_id:\s*null,\s*card_key:\s*'audit_team_assignment_f04:'/.test(documentService),
  'Thẻ F.04 dự phòng có finding_id = null',
);
check(
  findingService.includes('const usersById = new Map<'),
  'Map người dùng có khai báo kiểu khóa và giá trị rõ ràng',
);
check(
  findingService.includes('users.map((user) => [user.id, user] as const)'),
  'Tuple người dùng được cố định thành cặp [id, user]',
);
check(
  !documentService.includes('new Map(reviewers.map((reviewer) => ['),
  'Không còn cách tạo Map reviewer khiến TypeScript suy luận any[][]',
);
check(
  !findingService.includes('new Map(users.map((user) => [user.id, user]))'),
  'Không còn cách tạo Map user khiến TypeScript suy luận any[][]',
);

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);

if (fail > 0) process.exit(1);
