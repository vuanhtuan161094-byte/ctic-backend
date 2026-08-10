import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const ts = require(require.resolve('typescript', { paths: [root] }));

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${message}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${message}`);
  }
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

const prismaService = read('src/prisma/prisma.service.ts');
const schemaService = read('src/prisma/database-schema.service.ts');
const main = read('src/main.ts');
const filter = read('src/common/filters/global-exception.filter.ts');
const health = read('src/health/health.service.ts');
const pkg = JSON.parse(read('package.json'));
const envExample = read('.env.example');
const stabilizeCmd = read('STABILIZE_36C0.cmd');
const preflightSource = read('scripts/database-preflight-patch36c0a.cjs');
const dbStabilizer36c1 = fs.existsSync(path.join(root, 'scripts/database-stabilize-patch36c1.cjs')) ? read('scripts/database-stabilize-patch36c1.cjs') : '';
const preflight = require(path.join(root, 'scripts/database-preflight-patch36c0a.cjs'));

check(
  prismaService.includes('waitForDatabaseReady') &&
    prismaService.includes('DB_STARTUP_MAX_ATTEMPTS'),
  'PrismaService có startup retry có cấu hình',
);

check(
  prismaService.includes("'P1001'") &&
    prismaService.includes("'ECONNREFUSED'") &&
    prismaService.includes("'failed to connect'") &&
    prismaService.includes("'EINVALIDSTATE'"),
  'Nhận diện cả Prisma/network/final-state database errors',
);

check(
  prismaService.includes('DB_AUTHENTICATION_FAILED') &&
    prismaService.includes("message.includes('login failed')"),
  'Sai user/password fail-fast thay vì retry vô nghĩa',
);

check(
  prismaService.includes('reconnectMaxAttempts') &&
    prismaService.includes('recoverConnection') &&
    prismaService.includes('reconnectPromise'),
  'Runtime reconnect có retry và single-flight',
);

check(
  prismaService.includes('getDatabaseEndpointLabel') &&
    !prismaService.includes('this.databasePassword'),
  'Log database chỉ dùng endpoint an toàn, không giữ password để log',
);

const preflightPos = main.indexOf('.waitForDatabaseReady()');
const schemaPos = main.indexOf('.assertCompatible()');
check(
  preflightPos >= 0 && schemaPos > preflightPos,
  'Startup chờ database reachable trước khi kiểm schema',
);

check(
  main.includes('DB_UNAVAILABLE') &&
    main.includes('npm run db:preflight'),
  'Fatal startup database có thông báo vận hành rõ ràng',
);

check(
  schemaService.includes('isDatabaseUnavailableError') &&
    schemaService.includes('maxAttempts: 2'),
  'Schema check tự retry nếu SQL rớt đúng lúc kiểm tra',
);

check(
  health.includes('isDatabaseUnavailableError') &&
    health.includes('Cơ sở dữ liệu hiện không sẵn sàng'),
  'Readiness phân biệt database down với schema drift',
);

check(
  filter.includes('DB_UNAVAILABLE') &&
    filter.includes('DB_AUTHENTICATION_FAILED'),
  'HTTP exception filter map database outage thành 503',
);

check(
  pkg.scripts['db:preflight']?.includes('database-preflight-patch36c0a.cjs') &&
    pkg.scripts['db:recover:local']?.includes('--auto-start-local-sql'),
  'Có lệnh preflight và local SQL recovery riêng',
);

check(
  pkg.scripts['db:stabilize']?.startsWith('npm run db:preflight') ||
    (pkg.scripts['db:stabilize']?.includes('database-stabilize-patch36c1') && dbStabilizer36c1.indexOf('database-preflight-patch36c0a') < dbStabilizer36c1.indexOf('migrate-with-retry-patch36c1')),
  'Migration/repair không chạy trước khi database preflight PASS',
);

check(
  pkg.scripts['prestart:dev']?.includes('npm run db:preflight') &&
    pkg.scripts['prestart:prod']?.includes('npm run db:preflight'),
  'Dev và production đều kiểm database trước startup',
);

check(
  envExample.includes('DB_STARTUP_MAX_ATTEMPTS=5') &&
    envExample.includes('DB_RECONNECT_MAX_ATTEMPTS=4') &&
    envExample.includes('DB_PREFLIGHT_TCP_TIMEOUT_MS=2500'),
  '.env.example có đầy đủ tham số database resilience',
);

check(
  preflightSource.includes("require('node:net')") &&
    preflightSource.includes('tcpProbe') &&
    preflightSource.includes('Test-NetConnection'),
  'Database preflight kiểm tra TCP và đưa chẩn đoán Windows cụ thể',
);

check(
  preflightSource.includes("Get-Service -Name 'MSSQL*'") &&
    preflightSource.includes('Start-Service') &&
    preflightSource.includes('services.length !== 1'),
  'Local recovery chỉ auto-start khi xác định duy nhất một SQL engine service',
);

check(
  (stabilizeCmd.includes('npm run db:recover:local') &&
    stabilizeCmd.includes('npm run db:stabilize') &&
    stabilizeCmd.includes('npm run test:regression')) ||
    stabilizeCmd.includes('npm run stabilize:commercial') ||
    stabilizeCmd.includes('STABILIZE_36C1A.cmd'),
  'One-click stabilization có recovery, schema sync, build và regression',
);

const endpoint = preflight.parseSqlServerEndpoint(
  'sqlserver://localhost:1433;database=CMP;user=sa;password={abc;123};trustServerCertificate=true',
);
check(
  endpoint.server === 'localhost' &&
    endpoint.port === 1433 &&
    endpoint.database === 'CMP',
  'Parser DATABASE_URL xử lý password có dấu chấm phẩy trong braces',
);

const safeLabel = preflight.safeDatabaseLabel(endpoint);
check(
  safeLabel === 'localhost:1433/CMP' &&
    !safeLabel.includes('abc') &&
    !safeLabel.includes('sa'),
  'Database label không lộ username/password',
);

check(
  preflight.isLocalHost('localhost') &&
    preflight.isLocalHost('127.0.0.1') &&
    !preflight.isLocalHost('192.168.1.10'),
  'Auto-start SQL chỉ áp dụng cho database local',
);


for (const rel of [
  'src/prisma/prisma.service.ts',
  'src/prisma/database-schema.service.ts',
  'src/health/health.service.ts',
  'src/common/filters/global-exception.filter.ts',
  'src/main.ts',
]) {
  const result = ts.transpileModule(read(rel), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  check(errors.length === 0, `${rel} transpile syntax PASS`);
}

console.log(`\nPatch 36C.0a database resilience regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
