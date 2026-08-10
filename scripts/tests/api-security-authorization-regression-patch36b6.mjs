import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);

// Always resolve TypeScript from this backend project's own node_modules.
// This keeps the regression portable across Windows/Linux and Node versions.
let ts;
try {
  const typescriptPath = require.resolve('typescript', { paths: [root] });
  ts = require(typescriptPath);
} catch (error) {
  throw new Error(
    'Không tìm thấy package TypeScript cục bộ của backend. Hãy chạy npm install (hoặc npm ci) trong ctic-backend rồi chạy lại regression.',
    { cause: error },
  );
}

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

function loadPureTs(relative, transform = (value) => value) {
  let source = transform(read(relative));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: relative,
  });

  const diagnostics = (output.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length > 0) {
    throw new Error(
      diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'),
    );
  }

  const module = { exports: {} };
  vm.runInNewContext(output.outputText, {
    module,
    exports: module.exports,
    require,
    process,
    console,
    Date,
    Map,
    Set,
    Math,
    Number,
    Array,
    String,
    Boolean,
    RegExp,
    Error,
  });
  return module.exports;
}

const securityConfigSource = read('src/security/security-config.ts');
const mainSource = read('src/main.ts');
const authController = read('src/auth/auth.controller.ts');
const authModule = read('src/auth/auth.module.ts');
const publicCertificates = read('src/certificates/public-certificates.controller.ts');
const auditInterceptor = read('src/audit-logs/audit-logging.interceptor.ts');
const auditService = read('src/audit-logs/audit-logs.service.ts');
const auditDto = read('src/audit-logs/dto/audit-log-query.dto.ts');
const prismaSchema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260810013000_patch36b6_security_audit/migration.sql');
const resourceAccess = read('src/security/resource-access.service.ts');
const documentService = read('src/document-files/document-files.service.ts');
const documentController = read('src/document-files/document-files.controller.ts');
const projectController = read('src/certification-projects/certification-projects.controller.ts');
const projectService = read('src/certification-projects/certification-projects.service.ts');
const envExample = read('.env.example');
const appModule = read('src/app.module.ts');
const errorFilter = read('src/common/filters/global-exception.filter.ts');

check('SecurityModule được nạp ở AppModule', appModule.includes('SecurityModule') && appModule.includes('        SecurityModule,'));
check('Public registration mặc định tắt', securityConfigSource.includes('publicRegistrationEnabled') && securityConfigSource.includes('false,'));
check('Login có rate-limit guard riêng', authController.includes("@SecurityRateLimit('login')") && authController.includes('SecurityRateLimitGuard'));
check('Đăng ký công khai có guard bật/tắt', authController.includes('PublicRegistrationGuard'));
check('Tra cứu chứng chỉ công khai có rate limit', publicCertificates.includes("@SecurityRateLimit('public_certificate')") && publicCertificates.includes('@UseGuards(SecurityRateLimitGuard)'));
check('Có bucket login theo IP + username', read('src/security/security-rate-limit.guard.ts').includes('login:principal:${ip}:${username}'));
check('Có bucket login toàn IP chống quét nhiều username', read('src/security/security-rate-limit.guard.ts').includes('login:ip:${ip}'));
check('Rate limit trả Retry-After khi bị chặn', read('src/security/security-rate-limit.guard.ts').includes("'Retry-After'"));
check('Rate limit có giới hạn số bucket trong RAM', securityConfigSource.includes('rateLimitMaxEntries') && read('src/security/security-rate-limit.service.ts').includes('enforceCapacity'));
check('API sinh X-Request-Id', mainSource.includes("'X-Request-Id'") && mainSource.includes('randomUUID'));
check('API tắt X-Powered-By', mainSource.includes("expressApp.disable(") && mainSource.includes("'x-powered-by'"));
check('Có security headers nosniff/referrer/permissions', mainSource.includes("'X-Content-Type-Options'") && mainSource.includes("'Referrer-Policy'") && mainSource.includes("'Permissions-Policy'"));
check('Production HTTPS bật HSTS', mainSource.includes("'Strict-Transport-Security'") && mainSource.includes("startsWith('https://')"));
check('Production kiểm JWT secret tối thiểu', securityConfigSource.includes('secret.length < 32') && mainSource.includes('validateSecurityEnvironment'));
check('JWT TTL chuyển sang cấu hình môi trường', authModule.includes('JWT_ACCESS_TTL_SECONDS') && envExample.includes('JWT_ACCESS_TTL_SECONDS=28800'));
check('Không ghi password vào security audit service', !read('src/security/security-audit.service.ts').toLowerCase().includes('password'));
check('Login success/failure đều được audit', authController.includes("outcome:\n                    'success'") && authController.includes("outcome:\n                    'failure'"));
check('User-management write không còn bị bỏ khỏi audit interceptor', !auditInterceptor.includes("path.startsWith(\n                '/users'"));
check('Audit interceptor ghi cả lỗi nghiệp vụ', auditInterceptor.includes('catchError(') && auditInterceptor.includes("outcome:\n                                'failure'"));
check('Audit log có request_id/outcome/status/duration', ['request_id', 'outcome', 'status_code', 'duration_ms'].every((value) => prismaSchema.includes(value)));
check('Migration audit an toàn với COL_LENGTH', migration.includes("COL_LENGTH('dbo.audit_logs', 'request_id')") && migration.includes('IX_audit_logs_outcome_created'));
check('Audit API lọc được outcome/status/request-id', auditDto.includes('outcome?: string') && auditDto.includes('status_code?: number') && auditDto.includes('request_id?: string'));
check('Audit response trả correlation fields', auditService.includes('request_id:') && auditService.includes('duration_ms:') && auditService.includes('by_outcome:'));
check('Global error response trả request_id để đối chiếu log', errorFilter.includes('request_id:') && errorFilter.includes('request.requestId'));
check('Resource policy phân biệt role toàn tổ chức và role theo phân công', resourceAccess.includes('ORGANIZATION_WIDE_ROLES') && resourceAccess.includes("roles.has('AUDITOR')") && resourceAccess.includes("'TECHNICAL_REVIEWER'"));
check('Approver/certification manager giữ quyền phạm vi tổ chức', resourceAccess.includes("'APPROVER'") && resourceAccess.includes("'CERTIFICATION_MANAGER'"));
check('Reviewer thấy hồ sơ chưa nhận nhưng đã ready_for_technical_review', resourceAccess.includes("status:\n                            'ready_for_technical_review'") && resourceAccess.includes('technical_reviews: {') && resourceAccess.includes('none: {}'));
check('Auditor scope lấy từ audit_team_members', resourceAccess.includes('audit_team_members.findMany') && resourceAccess.includes('expert_id'));
check('Technical reviewer scope lấy từ reviewer_id', resourceAccess.includes('technical_reviews.findMany') && resourceAccess.includes('reviewer_id'));
check('Document access map bao phủ contract/agreement', resourceAccess.includes("'contract'") && resourceAccess.includes("'certification_agreement'"));
check('Document access map bao phủ plan/report/finding/CAP/review/certificate', ['audit_plan', 'report', 'audit_finding', 'corrective_action', 'technical_review', 'certificate'].every((value) => resourceAccess.includes(`'${value}'`)));
const uploadMethodSource = documentService.slice(documentService.indexOf('    async upload('), documentService.indexOf('    async registerGenerated('));
check('Upload kiểm quyền hồ sơ trước khi promote file', uploadMethodSource.indexOf('assertDocumentEntityAccess') >= 0 && uploadMethodSource.indexOf('assertDocumentEntityAccess') < uploadMethodSource.indexOf('promoteValidatedUpload'));
check('Download có actor-based authorization', documentService.includes('async getDownload(\n        id: string,\n        actor?: ResourceActor') && documentController.includes('this.actor(request)'));
check('Danh mục tài liệu được filter theo resource scope', documentService.includes('filterDocumentEntities') && documentController.includes('findAll(\n            this.actor(request)'));
check('Danh sách project của auditor/reviewer được scope', projectController.includes('getAccessibleProjectIds') && projectService.includes('allowedProjectIds'));
check('Dossier/alerts/project detail đều assert project access', (projectController.match(/assertProjectAccess/g) ?? []).length >= 3);
check('.env.example có toàn bộ security knobs chính', ['PUBLIC_REGISTRATION_ENABLED=false', 'LOGIN_RATE_LIMIT_MAX_ATTEMPTS=10', 'PUBLIC_CERT_RATE_LIMIT_MAX_REQUESTS=120', 'SECURITY_HEADERS_ENABLED=true'].every((value) => envExample.includes(value)));

try {
  const configModule = loadPureTs('src/security/security-config.ts');
  const defaultConfig = configModule.getSecurityConfig({});
  check('Runtime security config: registration default=false', defaultConfig.publicRegistrationEnabled === false);
  check('Runtime security config: login default=10/15 phút', defaultConfig.loginRateLimitMaxAttempts === 10 && defaultConfig.loginRateLimitWindowMs === 900000);

  let weakSecretRejected = false;
  try {
    configModule.validateSecurityEnvironment(true, {
      JWT_SECRET: 'weak',
      JWT_ACCESS_TTL_SECONDS: '3600',
    });
  } catch {
    weakSecretRejected = true;
  }
  check('Runtime security config: production reject JWT secret yếu', weakSecretRejected);

  let strongSecretAccepted = true;
  try {
    configModule.validateSecurityEnvironment(true, {
      JWT_SECRET: 'b7e83e6d1bb64f489e6711a0f30fe4b3b95da1c24f24451f',
      JWT_ACCESS_TTL_SECONDS: '3600',
    });
  } catch {
    strongSecretAccepted = false;
  }
  check('Runtime security config: production nhận JWT secret mạnh', strongSecretAccepted);
} catch (error) {
  check(`Không load được security-config runtime: ${error.message}`, false);
}

try {
  const rateModule = loadPureTs(
    'src/security/security-rate-limit.service.ts',
    (source) => source
      .replace(/import\s*\{[\s\S]*?\}\s*from\s*'@nestjs\/common';\s*/m, '')
      .replace(/@Injectable\(\)\s*/g, ''),
  );
  const limiter = new rateModule.SecurityRateLimitService();
  const first = limiter.consume('test:key', 2, 60000, 100);
  const second = limiter.consume('test:key', 2, 60000, 100);
  const third = limiter.consume('test:key', 2, 60000, 100);
  const other = limiter.consume('test:other', 2, 60000, 100);
  check('Runtime rate limiter cho phép đúng quota', first.allowed && second.allowed && !third.allowed);
  check('Runtime rate limiter trả retryAfter > 0 khi chặn', third.retryAfterSeconds > 0);
  check('Runtime rate limiter tách biệt key', other.allowed === true);
} catch (error) {
  check(`Không load được rate limiter runtime: ${error.message}`, false);
}

console.log(`\nPatch 36B.6 API security/authorization regression: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  process.exitCode = 1;
}
