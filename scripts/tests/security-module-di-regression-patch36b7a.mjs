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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const securityModule = read('src/security/security.module.ts');
const authModule = read('src/auth/auth.module.ts');
const certificatesModule = read('src/certificates/certificates.module.ts');
const authController = read('src/auth/auth.controller.ts');
const publicCertificates = read('src/certificates/public-certificates.controller.ts');
const rateGuard = read('src/security/security-rate-limit.guard.ts');
const registrationGuard = read('src/security/public-registration.guard.ts');

check(
  securityModule.includes('@Global()'),
  'SecurityModule vẫn là global module',
);
check(
  securityModule.includes('SecurityRateLimitService,\n        SecurityRateLimitGuard,') ||
    /exports:\s*\[[\s\S]*SecurityRateLimitService[\s\S]*SecurityRateLimitGuard/.test(securityModule),
  'SecurityRateLimitService được export cùng SecurityRateLimitGuard',
);
check(
  /exports:\s*\[[\s\S]*SecurityAuditService/.test(securityModule),
  'SecurityAuditService được export cho PublicRegistrationGuard/AuthController',
);
check(
  /providers:\s*\[[\s\S]*SecurityRateLimitService[\s\S]*SecurityRateLimitGuard/.test(securityModule),
  'SecurityModule đăng ký đầy đủ rate-limit service và guard',
);
check(
  rateGuard.includes('private readonly rateLimiter:') &&
    rateGuard.includes('SecurityRateLimitService'),
  'Regression nhận diện dependency thật của SecurityRateLimitGuard',
);
check(
  registrationGuard.includes('private readonly securityAudit:') &&
    registrationGuard.includes('SecurityAuditService'),
  'Regression nhận diện dependency thật của PublicRegistrationGuard',
);
check(
  authModule.includes("import { SecurityModule } from '../security/security.module';") &&
    /imports:\s*\[[\s\S]*SecurityModule/.test(authModule),
  'AuthModule import SecurityModule tường minh',
);
check(
  certificatesModule.includes("import { SecurityModule } from '../security/security.module';") &&
    /imports:\s*\[[\s\S]*SecurityModule/.test(certificatesModule),
  'CertificatesModule import SecurityModule tường minh',
);
check(
  authController.includes('@UseGuards(\n        SecurityRateLimitGuard,') ||
    authController.includes('SecurityRateLimitGuard'),
  'AuthController vẫn dùng SecurityRateLimitGuard',
);
check(
  publicCertificates.includes('@UseGuards(SecurityRateLimitGuard)'),
  'PublicCertificatesController vẫn dùng rate-limit guard',
);
check(
  !/providers:\s*\[[\s\S]*SecurityRateLimitGuard/.test(authModule),
  'AuthModule không tạo bản guard cục bộ gây lệch dependency scope',
);
check(
  !/providers:\s*\[[\s\S]*SecurityRateLimitGuard/.test(certificatesModule),
  'CertificatesModule không tạo bản guard cục bộ gây lệch dependency scope',
);

for (const rel of [
  'src/security/security.module.ts',
  'src/auth/auth.module.ts',
  'src/certificates/certificates.module.ts',
]) {
  const source = read(rel);
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      isolatedModules: true,
    },
    fileName: rel,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diag) => diag.category === ts.DiagnosticCategory.Error,
  );
  check(errors.length === 0, `${rel} transpile syntax PASS`);
}

console.log(`\nPatch 36B.7a Security module DI regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
