import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

const projectController = read('src/certification-projects/certification-projects.controller.ts');
const documentController = read('src/document-files/document-files.controller.ts');
const auditInterceptor = read('src/audit-logs/audit-logging.interceptor.ts');
const apiSecurityRegression = read('scripts/tests/api-security-authorization-regression-patch36b6.mjs');
const resultsRegression = read('scripts/tests/certification-results-regression-patch35h.mjs');

check(
  'CertificationProjectsController import SecurityRequest bằng import type',
  /import\s+type\s*{\s*SecurityRequest\s*}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(projectController),
);
check(
  'CertificationProjectsController vẫn import getActorUserId như runtime value',
  /import\s*{\s*getActorUserId\s*}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(projectController),
);
check(
  'CertificationProjectsController không còn gộp SecurityRequest vào value import',
  !/import\s*{[^}]*getActorUserId[^}]*SecurityRequest[^}]*}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(projectController),
);

check(
  'DocumentFilesController import SecurityRequest bằng import type',
  /import\s+type\s*{\s*SecurityRequest\s*}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(documentController),
);
check(
  'DocumentFilesController vẫn import getActorUserId như runtime value',
  /import\s*{\s*getActorUserId\s*}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(documentController),
);
check(
  'DocumentFilesController không còn gộp SecurityRequest vào value import',
  !/import\s*{[^}]*getActorUserId[^}]*SecurityRequest[^}]*}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(documentController),
);

check(
  'AuditLoggingInterceptor cũng tách SecurityRequest thành type-only import',
  /import\s+type\s*{[\s\S]*?SecurityRequest[\s\S]*?}\s*from\s*['"]\.\.\/security\/security-request['"]/.test(auditInterceptor),
);

check(
  'Regression 36B.6 resolve TypeScript từ node_modules của project',
  /require\.resolve\(['"]typescript['"],\s*{\s*paths:\s*\[root\]\s*}\)/.test(apiSecurityRegression),
);
check(
  'Regression 36B.6 không hard-code đường dẫn TypeScript Linux/NVM',
  !/\/opt\/nvm\/|\/usr\/local\/lib\/node_modules\/typescript/.test(apiSecurityRegression),
);
check(
  'Regression kết quả chứng nhận cũng ưu tiên TypeScript local',
  /require\.resolve\(['"]typescript['"],\s*{\s*paths:\s*\[backendRoot\]\s*}\)/.test(resultsRegression),
);
check(
  'Regression kết quả chứng nhận không còn hard-code TypeScript Linux/NVM',
  !/\/opt\/nvm\/|\/usr\/local\/lib\/node_modules\/typescript/.test(resultsRegression),
);

const allSecurityRequestImports = [
  projectController,
  documentController,
  auditInterceptor,
].join('\n');
check(
  'Các file runtime sửa trong hotfix không còn value import SecurityRequest',
  !/import\s*{[^}]*SecurityRequest[^}]*}\s*from\s*['"][^'"]*security-request['"]/.test(
    allSecurityRequestImports.replace(/import\s+type\s*{[^}]*}\s*from\s*['"][^'"]*security-request['"];?/g, ''),
  ),
);

console.log(`\nPatch 36B.6b TypeScript portability regression: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exitCode = 1;
