import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function parseSchemaContract(text) {
  const scalar = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);
  const contract = new Map();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(text))) {
    const body = m[2];
    const table = (body.match(/@@map\("([^"]+)"\)/)?.[1] || m[1]).toLowerCase();
    const columns = new Set();
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const fm = line.match(/^(\w+)\s+([A-Za-z_]\w*)([?\[\]]*)\s*(.*)$/);
      if (!fm || !scalar.has(fm[2])) continue;
      columns.add((fm[4].match(/@map\("([^"]+)"\)/)?.[1] || fm[1]).toLowerCase());
    }
    contract.set(table, columns);
  }
  return contract;
}

function parseSqlContract(text) {
  const result = new Map();
  const add = (table, col) => {
    table = table.toLowerCase();
    col = col.toLowerCase();
    if (!result.has(table)) result.set(table, new Set());
    result.get(table).add(col);
  };
  const create = /CREATE\s+TABLE\s+(?:\[?dbo\]?\.)?\[?([A-Za-z0-9_]+)\]?\s*\(/gi;
  let m;
  while ((m = create.exec(text))) {
    const table = m[1];
    let i = create.lastIndex;
    let depth = 1;
    let body = '';
    while (i < text.length && depth > 0) {
      const ch = text[i++];
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth > 0) body += ch;
    }
    let inner = 0;
    let current = '';
    const clauses = [];
    for (const ch of body) {
      if (ch === '(') inner += 1;
      if (ch === ')') inner -= 1;
      if (ch === ',' && inner === 0) {
        clauses.push(current);
        current = '';
      } else current += ch;
    }
    clauses.push(current);
    for (const clause of clauses) {
      const cm = clause.trim().match(/^\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+/);
      if (!cm) continue;
      if (['constraint', 'primary', 'unique', 'foreign', 'check', 'index'].includes(cm[1].toLowerCase())) continue;
      add(table, cm[1]);
    }
    create.lastIndex = i;
  }
  const alter = /ALTER\s+TABLE\s+(?:\[?dbo\]?\.)?\[?([A-Za-z0-9_]+)\]?\s+ADD\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?/gi;
  while ((m = alter.exec(text))) add(m[1], m[2]);
  const alterBlock = /ALTER\s+TABLE\s+(?:\[?dbo\]?\.)?\[?([A-Za-z0-9_]+)\]?\s+ADD\s+([\s\S]*?);/gi;
  while ((m = alterBlock.exec(text))) {
    const table = m[1];
    let depth = 0;
    let current = '';
    const clauses = [];
    for (const ch of m[2]) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        clauses.push(current);
        current = '';
      } else current += ch;
    }
    clauses.push(current);
    for (const clause of clauses) {
      const cm = clause.trim().match(/^\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+/);
      if (!cm || ['constraint', 'foreign', 'check'].includes(cm[1].toLowerCase())) continue;
      add(table, cm[1]);
    }
  }
  return result;
}

const migrationRel = 'prisma/migrations/20260810120000_patch36c1_legacy_schema_consolidation/migration.sql';
const migration = read(migrationRel);
const adopt = read('scripts/adopt-existing-database-patch36c1.cjs');
const retry = read('scripts/migrate-with-retry-patch36c1.cjs');
const preflight = read('scripts/database-preflight-patch36c0a.cjs');
const contractScript = read('scripts/database-schema-contract-patch36c1.cjs');
const stabilizer = read('scripts/commercial-stabilize-patch36c1.cjs');
const dbStabilizer = read('scripts/database-stabilize-patch36c1.cjs');
const dbService = read('src/prisma/database-schema.service.ts');
const pkg = JSON.parse(read('package.json'));
const schema = read('prisma/schema.prisma');

check(/SET XACT_ABORT ON/i.test(migration) && /BEGIN TRANSACTION/i.test(migration), 'Migration consolidation dùng transaction + XACT_ABORT');
check(!/USE\s+\[?CTIC_Certification\]?/i.test(migration), 'Migration mới không hard-code database CTIC');
check(!/@ctic\.vn/i.test(migration) && !/20260728153342/i.test(migration), 'Migration mới không chứa dữ liệu demo/customer-specific');
check(/COL_LENGTH/i.test(migration) && /OBJECT_ID/i.test(migration), 'Migration legacy consolidation là additive/idempotent');

const schemaContract = parseSchemaContract(schema);
const migrationUnion = new Map();
for (const dir of fs.readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const file = path.join(root, 'prisma/migrations', dir.name, 'migration.sql');
  if (!fs.existsSync(file)) continue;
  const parsed = parseSqlContract(fs.readFileSync(file, 'utf8'));
  for (const [table, cols] of parsed) {
    if (!migrationUnion.has(table)) migrationUnion.set(table, new Set());
    for (const col of cols) migrationUnion.get(table).add(col);
  }
}
const gaps = [];
for (const [table, cols] of schemaContract) {
  if (table === 'sysdiagrams') continue;
  if (!migrationUnion.has(table)) {
    gaps.push(`${table}::<TABLE>`);
    continue;
  }
  for (const col of cols) if (!migrationUnion.get(table).has(col)) gaps.push(`${table}.${col}`);
}
check(gaps.length === 0, `Toàn bộ Prisma scalar schema có DDL migration tương ứng${gaps.length ? `; gaps=${gaps.slice(0, 10).join(', ')}` : ''}`);

check(/parseCreateTableContract/.test(adopt) && /missingTables/.test(adopt) && /missingColumns/.test(adopt), 'Baseline adoption xác minh bảng/cột baseline trước khi resolve');
const appliedArgs = [...adopt.matchAll(/--applied['"\s,]+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
check(!/20260810001500_patch36b5/.test(adopt) && !/20260810013000_patch36b6/.test(adopt), 'Adoption chỉ được phép baseline migration gốc, không đánh dấu B5/B6 giả');
check(/BASELINE_MIGRATION\s*=\s*['"]00000000000000_baseline['"]/.test(adopt), 'Baseline adoption cố định đúng migration gốc');

check(/P1001/.test(retry) && /P1002/.test(retry) && /ECONNRESET/.test(retry), 'Migration retry nhận diện lỗi kết nối tạm thời');
check(/P3005/.test(retry) && /db:adopt-existing/.test(retry), 'P3005 được hướng về baseline adoption thay vì reset database');
check(/DB_MIGRATION_MAX_ATTEMPTS/.test(retry) && /2 \*\* \(attempt - 1\)/.test(retry), 'Migration deploy có retry/backoff giới hạn');

check(/DB_PREFLIGHT_STABLE_SUCCESSES/.test(preflight), 'Preflight yêu cầu nhiều query ổn định liên tiếp');
check(/consecutiveQuerySuccesses = 0/.test(preflight) && /DATABASE STABILITY GATE: PASS/.test(preflight), 'Preflight reset chuỗi khi lỗi và chỉ PASS sau stability gate');

check(/parsePrismaSchema/.test(contractScript) && /sys\.tables/.test(contractScript) && /sys\.columns/.test(contractScript), 'Database contract so schema.prisma với schema vật lý');
check(/max_length/.test(contractScript) && /precision/.test(contractScript) && /scale/.test(contractScript) && /is_nullable/.test(contractScript), 'Database contract kiểm native type/length/precision/nullability, không chỉ tên cột');
check(/expectedMigrations/.test(contractScript) && /unknownApplied/.test(contractScript) && /unfinished/.test(contractScript), 'Database contract kiểm migration thiếu/dang dở/source cũ');
check(/IX_audit_logs_request_id/.test(contractScript) && /IX_audit_logs_outcome_created/.test(contractScript), 'Database contract kiểm critical indexes');

check(/portIsOpen/.test(stabilizer) && /Dừng backend/.test(stabilizer), 'Commercial stabilizer chặn migrate khi backend còn chạy');
check(/database-stabilize-patch36c1/.test(stabilizer) && /test:regression/.test(stabilizer), 'Commercial stabilizer chạy database + build + regression');
check(/adopt-existing-database-patch36c1/.test(dbStabilizer) && /migrate-with-retry-patch36c1/.test(dbStabilizer), 'DB stabilizer thực hiện baseline adoption trước migrate retry');
check(/database-schema-contract-patch36c1/.test(dbStabilizer), 'DB stabilizer kết thúc bằng full schema contract');

check(pkg.scripts['db:adopt-existing']?.includes('patch36c1'), 'package.json có db:adopt-existing');
check(pkg.scripts['db:migrate:retry']?.includes('patch36c1'), 'package.json có db:migrate:retry');
check(pkg.scripts['db:contract']?.includes('patch36c1'), 'package.json có db:contract');
check(pkg.scripts['stabilize:commercial']?.includes('patch36c1'), 'package.json có stabilize:commercial');
check(pkg.dependencies?.dotenv, 'dotenv là dependency trực tiếp, không dựa transitive dependency');

check(/certification_application_sites/.test(dbService) && /expert_work_experiences/.test(dbService) && /audit_program_manday_requirements/.test(dbService), 'Startup schema guard phủ legacy extension + integrated manday tables');
check(/application_reviews_workflow_status/.test(dbService) && /experts_profile_status/.test(dbService), 'Startup schema guard phủ workflow/reviewer/expert profile');

console.log(`\nPatch 36C.1 commercial baseline regression: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
