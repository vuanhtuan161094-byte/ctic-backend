require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');
const SCALAR_TYPES = new Set([
  'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean',
  'DateTime', 'Json', 'Bytes',
]);
const OPTIONAL_RUNTIME_TABLES = new Set(['sysdiagrams']);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function fail(message, details) {
  console.error(`DATABASE CONTRACT: FAIL - ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function splitConnectionParts(value) {
  const parts = [];
  let current = '';
  let braceDepth = 0;

  for (const character of String(value || '')) {
    if (character === '{') braceDepth += 1;
    if (character === '}' && braceDepth > 0) braceDepth -= 1;

    if (character === ';' && braceDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function unwrap(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function parseSqlServerUrl(url) {
  if (!url || !/^sqlserver:\/\//i.test(url)) {
    fail('DATABASE_URL phải dùng định dạng sqlserver://...');
  }

  const parts = splitConnectionParts(url.replace(/^sqlserver:\/\//i, ''));
  const hostPart = String(parts.shift() || '').trim();
  const lastColon = hostPart.lastIndexOf(':');
  const server = (lastColon > 0 ? hostPart.slice(0, lastColon) : hostPart).trim();
  const port = lastColon > 0 ? Number(hostPart.slice(lastColon + 1)) : 1433;
  const params = new Map();

  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    params.set(
      part.slice(0, separator).trim().toLowerCase(),
      unwrap(part.slice(separator + 1)),
    );
  }

  return {
    server,
    port: Number.isFinite(port) && port > 0 ? port : 1433,
    database: params.get('database') || params.get('initial catalog') || '',
    user: params.get('user') || params.get('username') || params.get('uid') || '',
    password: params.get('password') || params.get('pwd') || '',
    encrypt: ['1', 'true', 'yes', 'on'].includes(
      String(params.get('encrypt') || '').toLowerCase(),
    ),
    trustServerCertificate: ['1', 'true', 'yes', 'on'].includes(
      String(params.get('trustservercertificate') || '').toLowerCase(),
    ),
  };
}

function adapterConfig(url) {
  const parsed = parseSqlServerUrl(url);
  return {
    server: parsed.server,
    port: parsed.port,
    database: parsed.database,
    ...(parsed.user ? { user: parsed.user } : {}),
    ...(parsed.password ? { password: parsed.password } : {}),
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
    pool: {
      max: 2,
      min: 0,
      idleTimeoutMillis: 5_000,
    },
    options: {
      encrypt: parsed.encrypt,
      trustServerCertificate: parsed.trustServerCertificate,
      packetSize: 4096,
      enableArithAbort: true,
    },
  };
}

function parseNativeType(rest) {
  const match = rest.match(/@db\.([A-Za-z0-9_]+)(?:\(([^)]*)\))?/);
  if (!match) return null;
  return {
    name: match[1],
    args: (match[2] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function parsePrismaSchema(text) {
  const contract = new Map();
  const modelRegex = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let modelMatch;

  while ((modelMatch = modelRegex.exec(text))) {
    const modelName = modelMatch[1];
    const body = modelMatch[2];
    const tableMap = body.match(/@@map\("([^"]+)"\)/);
    const table = normalize(tableMap ? tableMap[1] : modelName);
    const columns = new Map();

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const fieldMatch = line.match(/^(\w+)\s+([A-Za-z_]\w*)([?\[\]]*)\s*(.*)$/);
      if (!fieldMatch) continue;

      const [, fieldName, fieldType, suffix, rest] = fieldMatch;
      if (!SCALAR_TYPES.has(fieldType)) continue;
      const fieldMap = rest.match(/@map\("([^"]+)"\)/);
      const column = normalize(fieldMap ? fieldMap[1] : fieldName);
      columns.set(column, {
        fieldType,
        nullable: suffix.includes('?'),
        nativeType: parseNativeType(rest),
      });
    }

    contract.set(table, columns);
  }

  return contract;
}

function expectedMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(MIGRATIONS_DIR, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort();
}

function nativeTypeMismatch(spec, actual) {
  const native = spec.nativeType;
  if (!native) return null;
  const name = normalize(native.name);
  const actualType = normalize(actual.data_type);

  if (name === 'uniqueidentifier' && actualType !== 'uniqueidentifier') {
    return `expected uniqueidentifier, actual ${actualType}`;
  }
  if (name === 'date' && actualType !== 'date') {
    return `expected date, actual ${actualType}`;
  }
  if (name === 'datetime2' && actualType !== 'datetime2') {
    return `expected datetime2, actual ${actualType}`;
  }
  if (name === 'nvarchar') {
    if (actualType !== 'nvarchar') return `expected nvarchar, actual ${actualType}`;
    const arg = native.args[0];
    const expectedLength = normalize(arg) === 'max' ? -1 : Number(arg) * 2;
    if (Number(actual.max_length) !== expectedLength) {
      return `expected nvarchar(${arg}), actual max_length=${String(actual.max_length)}`;
    }
  }
  if (name === 'decimal') {
    if (!['decimal', 'numeric'].includes(actualType)) {
      return `expected decimal, actual ${actualType}`;
    }
    const expectedPrecision = Number(native.args[0]);
    const expectedScale = Number(native.args[1]);
    if (
      Number(actual.precision) !== expectedPrecision ||
      Number(actual.scale) !== expectedScale
    ) {
      return `expected decimal(${expectedPrecision},${expectedScale}), actual ${actualType}(${String(actual.precision)},${String(actual.scale)})`;
    }
  }
  return null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail('Thiếu DATABASE_URL trong .env.');
  if (!fs.existsSync(SCHEMA_FILE)) fail(`Không tìm thấy ${SCHEMA_FILE}`);

  const contract = parsePrismaSchema(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  if (contract.size < 20) fail('Không đọc được Prisma schema contract; dừng để tránh kết luận sai.');

  const prisma = new PrismaClient({ adapter: new PrismaMssql(adapterConfig(databaseUrl)) });

  try {
    await prisma.$connect();

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        LOWER(t.name) AS table_name,
        LOWER(c.name) AS column_name,
        LOWER(TYPE_NAME(c.user_type_id)) AS data_type,
        c.max_length,
        c.precision,
        c.scale,
        c.is_nullable
      FROM sys.tables t
      INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
      INNER JOIN sys.columns c ON c.object_id = t.object_id
      WHERE s.name = N'dbo'
        AND t.is_ms_shipped = 0
      ORDER BY t.name, c.column_id;
    `);

    const physical = new Map();
    for (const row of rows) {
      const table = normalize(row.table_name);
      if (!physical.has(table)) physical.set(table, new Map());
      physical.get(table).set(normalize(row.column_name), row);
    }

    const missingTables = [];
    const missingColumns = [];
    const typeMismatches = [];
    const nullabilityMismatches = [];

    for (const [table, columns] of contract.entries()) {
      if (OPTIONAL_RUNTIME_TABLES.has(table)) continue;
      const actualColumns = physical.get(table);
      if (!actualColumns) {
        missingTables.push(`dbo.${table}`);
        continue;
      }
      for (const [column, spec] of columns.entries()) {
        const actual = actualColumns.get(column);
        if (!actual) {
          missingColumns.push(`dbo.${table}.${column}`);
          continue;
        }

        const nativeMismatch = nativeTypeMismatch(spec, actual);
        if (nativeMismatch) {
          typeMismatches.push(`dbo.${table}.${column}: ${nativeMismatch}`);
        }

        const actualNullable = Number(actual.is_nullable ?? 0) === 1;
        if (actualNullable !== spec.nullable) {
          nullabilityMismatches.push(
            `dbo.${table}.${column}: expected ${spec.nullable ? 'NULL' : 'NOT NULL'}, actual ${actualNullable ? 'NULL' : 'NOT NULL'}`,
          );
        }
      }
    }

    if (
      missingTables.length ||
      missingColumns.length ||
      typeMismatches.length ||
      nullabilityMismatches.length
    ) {
      fail(
        'Schema vật lý không khớp prisma/schema.prisma.',
        [
          missingTables.length
            ? `Missing tables (${missingTables.length}): ${missingTables.slice(0, 30).join(', ')}`
            : '',
          missingColumns.length
            ? `Missing columns (${missingColumns.length}): ${missingColumns.slice(0, 80).join(', ')}`
            : '',
          typeMismatches.length
            ? `Type mismatches (${typeMismatches.length}):\n${typeMismatches.slice(0, 50).map((x) => `- ${x}`).join('\n')}`
            : '',
          nullabilityMismatches.length
            ? `Nullability mismatches (${nullabilityMismatches.length}):\n${nullabilityMismatches.slice(0, 50).map((x) => `- ${x}`).join('\n')}`
            : '',
        ].filter(Boolean).join('\n'),
      );
    }

    const migrationTableRows = await prisma.$queryRawUnsafe(`
      SELECT CASE WHEN OBJECT_ID(N'dbo._prisma_migrations', N'U') IS NULL THEN 0 ELSE 1 END AS present;
    `);
    if (Number(migrationTableRows[0]?.present ?? 0) !== 1) {
      fail('Thiếu dbo._prisma_migrations sau bước migrate deploy.');
    }

    const migrations = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at, logs
      FROM dbo._prisma_migrations
      ORDER BY started_at ASC;
    `);

    const expected = expectedMigrations();
    const expectedSet = new Set(expected.map(normalize));
    const completedSet = new Set(
      migrations
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => normalize(row.migration_name)),
    );

    const unfinished = migrations.filter((row) => !row.finished_at && !row.rolled_back_at);
    if (unfinished.length) {
      fail('Có migration đang lỗi/dang dở.', unfinished.map((row) => `- ${row.migration_name}`).join('\n'));
    }

    const missingMigrationHistory = expected.filter(
      (migration) => !completedSet.has(normalize(migration)),
    );
    if (missingMigrationHistory.length) {
      fail('Migration history chưa theo kịp source.', missingMigrationHistory.map((name) => `- ${name}`).join('\n'));
    }

    const unknownApplied = migrations.filter(
      (row) => row.finished_at && !row.rolled_back_at && !expectedSet.has(normalize(row.migration_name)),
    );
    if (unknownApplied.length) {
      fail(
        'Database có migration đã áp dụng nhưng source hiện tại không còn migration tương ứng. Có nguy cơ chạy binary cũ trên database mới.',
        unknownApplied.map((row) => `- ${row.migration_name}`).join('\n'),
      );
    }

    const criticalIndexRows = await prisma.$queryRawUnsafe(`
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
            AND name = N'IX_audit_logs_request_id'
        ) THEN 1 ELSE 0 END AS audit_request_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
            AND name = N'IX_audit_logs_outcome_created'
        ) THEN 1 ELSE 0 END AS audit_outcome_created;
    `);
    const critical = criticalIndexRows[0] || {};
    if (Number(critical.audit_request_id ?? 0) !== 1) {
      fail('Thiếu critical index dbo.audit_logs.IX_audit_logs_request_id.');
    }
    if (Number(critical.audit_outcome_created ?? 0) !== 1) {
      fail('Thiếu critical index dbo.audit_logs.IX_audit_logs_outcome_created.');
    }

    console.log(`PASS: ${contract.size - OPTIONAL_RUNTIME_TABLES.size} Prisma models/tables được kiểm tra.`);
    console.log('PASS: Column existence + explicit native type + nullability contract khớp.');
    console.log(`PASS: ${expected.length}/${expected.length} migrations đã áp dụng và hoàn tất.`);
    console.log('PASS: Critical audit indexes hiện diện.');
    console.log('DATABASE CONTRACT: PASS');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  fail(error?.message || 'Database contract check lỗi.', error?.stack || String(error));
});
