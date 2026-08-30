import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${message}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

function quotedStrings(value) {
  return [...value.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function extractSeedRoleDefinitions(seed) {
  const definitionsStart = seed.indexOf('const roleDefinitions = {');
  const definitionsEnd = seed.indexOf('\n};\n\nasync function main', definitionsStart);
  if (definitionsStart < 0 || definitionsEnd < 0) return new Map();

  const chunk = seed.slice(definitionsStart, definitionsEnd);
  const roleHeader = /^    ([a-z_]+): \{$/gm;
  const headers = [...chunk.matchAll(roleHeader)];
  const result = new Map();

  for (let index = 0; index < headers.length; index += 1) {
    const current = headers[index];
    const role = current[1].toUpperCase();
    const start = current.index;
    const end = index + 1 < headers.length ? headers[index + 1].index : chunk.length;
    const block = chunk.slice(start, end);

    if (/\n\s*permissions,\s*\n/.test(block)) {
      result.set(role, null);
      continue;
    }

    const permissionsMatch = block.match(/permissions:\s*\[([\s\S]*?)\]/);
    result.set(role, new Set(permissionsMatch ? quotedStrings(permissionsMatch[1]) : []));
  }

  return result;
}

const seed = read('prisma/seed.js');
const seedPermissionMatch = seed.match(/const permissions = \[([\s\S]*?)\];/);
const seedPermissions = new Set(seedPermissionMatch ? quotedStrings(seedPermissionMatch[1]) : []);
const roleDefinitions = extractSeedRoleDefinitions(seed);

const controllerFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name.endsWith('.controller.ts')) controllerFiles.push(absolute);
  }
}
walk(path.join(root, 'src'));

const runtimePermissions = new Set();
const guardedPairs = [];
for (const file of controllerFiles) {
  const source = fs.readFileSync(file, 'utf8');

  for (const match of source.matchAll(/@Permissions\(([\s\S]*?)\)/g)) {
    for (const permission of quotedStrings(match[1])) runtimePermissions.add(permission);
  }

  const lines = source.split(/\r?\n/);
  let decoratorBuffer = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@') && decoratorBuffer.length === 0) {
      decoratorBuffer.push(line);
      continue;
    }
    if (decoratorBuffer.length > 0) {
      decoratorBuffer.push(line);
      if (!trimmed.startsWith('@') && /^(?:async\s+)?[A-Za-z_$][\w$]*\s*\(/.test(trimmed)) {
        const block = decoratorBuffer.join('\n');
        const roles = [];
        const permissions = [];
        for (const match of block.matchAll(/@Roles\(([\s\S]*?)\)/g)) {
          roles.push(...quotedStrings(match[1]).map((role) => role.toUpperCase()));
        }
        for (const match of block.matchAll(/@Permissions\(([\s\S]*?)\)/g)) {
          permissions.push(...quotedStrings(match[1]));
        }
        if (roles.length > 0 && permissions.length > 0) {
          guardedPairs.push({ file: path.relative(root, file), roles, permissions });
        }
        decoratorBuffer = [];
      } else if (decoratorBuffer.length > 120) {
        decoratorBuffer = [];
      }
    }
  }
}

const codeNotSeed = [...runtimePermissions].filter((permission) => !seedPermissions.has(permission));
const seedNotCode = [...seedPermissions].filter((permission) => !runtimePermissions.has(permission));
check(codeNotSeed.length === 0, `Mọi permission dùng bởi controller đều có trong seed (${codeNotSeed.join(', ') || 'không thiếu'})`);
check(seedNotCode.length === 0, `Seed không quảng bá permission không có runtime consumer (${seedNotCode.join(', ') || 'không dư'})`);

const usersService = read('src/users/users.service.ts');
const supportedBlock = usersService.match(/supportedInternalRoles = new Set\(\[([\s\S]*?)\]\);/);
const supportedRoles = new Set((supportedBlock ? quotedStrings(supportedBlock[1]) : []).map((role) => role.toUpperCase()));
const seedInternalRoles = new Set([...roleDefinitions.keys()].filter((role) => role !== 'CUSTOMER'));

check(
  [...supportedRoles].every((role) => seedInternalRoles.has(role)) && [...seedInternalRoles].every((role) => supportedRoles.has(role)),
  'Danh sách role nội bộ assignable khớp role hệ thống trong seed',
);
check(supportedRoles.has('TECHNICAL_EXPERT'), 'TECHNICAL_EXPERT là role nội bộ assignable');
check(!supportedRoles.has('CUSTOMER'), 'CUSTOMER vẫn chỉ được cấp qua customer access, không assign nội bộ');

const contradictions = [];
for (const pair of guardedPairs) {
  for (const role of pair.roles) {
    if (role === 'ADMIN' || !supportedRoles.has(role)) continue;
    const grants = roleDefinitions.get(role);
    if (!grants) continue;
    const missing = pair.permissions.filter((permission) => !grants.has(permission));
    if (missing.length > 0) contradictions.push(`${role} @ ${pair.file}: ${missing.join(', ')}`);
  }
}
check(contradictions.length === 0, `Role được khai báo trên endpoint không bị chặn ngược bởi permission (${contradictions.join(' | ') || 'không có mâu thuẫn'})`);

// Parse method decorators structurally so formatting changes do not weaken this policy lock.
const customerController = ts.createSourceFile(
  'customers.controller.ts',
  read('src/customers/customers.controller.ts'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const customerEndpoints = [];
function collectCustomerEndpoints(node) {
  if (ts.isMethodDeclaration(node)) {
    const metadata = new Map();
    for (const decorator of ts.getDecorators(node) ?? []) {
      const call = decorator.expression;
      if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) continue;
      metadata.set(call.expression.text, call.arguments.filter(ts.isStringLiteral).map((argument) => argument.text));
    }
    if (metadata.has('Post')) customerEndpoints.push(metadata);
  }
  ts.forEachChild(node, collectCustomerEndpoints);
}
collectCustomerEndpoints(customerController);
for (const route of [':id/portal-users', ':id/portal-users/:userId/reset-password']) {
  const endpoints = customerEndpoints.filter((metadata) => metadata.get('Post')?.[0] === route);
  const roles = endpoints[0]?.get('Roles') ?? [];
  const permissions = endpoints[0]?.get('Permissions') ?? [];
  check(endpoints.length === 1, `POST /customers/${route}: endpoint tồn tại duy nhất`);
  check(roles.length === 1 && roles[0] === 'ADMIN', `POST /customers/${route}: ADMIN-only`);
  check(!['STAFF', 'SALES', 'COORDINATOR'].some((role) => roles.includes(role)), `POST /customers/${route}: không mở STAFF/SALES/COORDINATOR`);
  check(permissions.includes('customer_user_requests.review'), `POST /customers/${route}: giữ permission customer_user_requests.review`);
}

const staffPermissions = roleDefinitions.get('STAFF') ?? new Set();
check(!staffPermissions.has('reports.manage'), 'STAFF không còn hiển thị reports.manage khi runtime không cho STAFF sửa báo cáo');
check(!seedPermissions.has('findings.read'), 'Loại findings.read khỏi active authority catalog vì runtime không sử dụng');

const technicalExpertPermissions = roleDefinitions.get('TECHNICAL_EXPERT') ?? new Set();
for (const permission of ['projects.read', 'documents.read', 'audit_plans.read', 'notifications.read']) {
  check(technicalExpertPermissions.has(permission), `TECHNICAL_EXPERT có least-privilege ${permission}`);
}

const projectsController = read('src/certification-projects/certification-projects.controller.ts');
const documentsController = read('src/document-files/document-files.controller.ts');
const auditDocumentsController = read('src/audit-documents/audit-documents.controller.ts');
const workItemsController = read('src/work-items/work-items.controller.ts');

check(/TECHNICAL_EXPERT/.test(projectsController), 'TECHNICAL_EXPERT được phép đọc dự án trong resource scope được phân công');
check(/TECHNICAL_EXPERT/.test(documentsController), 'TECHNICAL_EXPERT được phép đọc tài liệu trong resource scope được phân công');
check(/TECHNICAL_EXPERT/.test(auditDocumentsController), 'TECHNICAL_EXPERT được phép preview hồ sơ đánh giá trong resource scope được phân công');
check(/WORK_ITEM_ROLES[\s\S]*?'SALES'/.test(workItemsController), 'SALES có thể mở My Work đúng với personal workspace persona');

const migration = read('prisma/migrations/20260825094500_internal_authority_matrix_alignment/migration.sql');
for (const fragment of [
  "N'COORDINATOR', N'applications.manage'",
  "N'COORDINATOR', N'certificates.read'",
  "N'COORDINATOR', N'findings.manage'",
  "N'STAFF', N'findings.manage'",
  "N'AUDITOR', N'applications.read'",
  "N'LEAD_AUDITOR', N'applications.read'",
  "N'DECISION_MAKER', N'audit_plans.read'",
  "N'TECHNICAL_EXPERT', N'projects.read'",
]) {
  check(migration.includes(fragment), `Migration authority có grant ${fragment.replaceAll("N'", '').replaceAll("'", '')}`);
}
check(/permission\.\[permission_name\] = N'findings\.read'/.test(migration), 'Migration loại grant findings.read legacy');
check(/role\.\[role_name\].*STAFF[\s\S]*reports\.manage/i.test(migration), 'Migration loại grant STAFF reports.manage gây hiểu nhầm');

console.log(`\nINTERNAL AUTHORITY MATRIX REGRESSION: ${failed === 0 ? 'PASS' : 'FAIL'} (${passed} pass, ${failed} fail)`);
if (failed > 0) process.exitCode = 1;
