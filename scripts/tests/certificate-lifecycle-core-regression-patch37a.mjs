import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    pass += 1;
    console.log(`✓ ${label}`);
  } else {
    fail += 1;
    console.error(`✗ ${label}`);
  }
}

console.log('=== PHASE 1.1 — CERTIFICATE LIFECYCLE CORE ===');

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260821150000_certificate_lifecycle_core/migration.sql');
const lifecycle = read('src/certificates/certificate-lifecycle.ts');
const certificateService = read('src/certificates/certificates.service.ts');
const decisionService = read('src/certification-decisions/certification-decisions.service.ts');
const decisionDto = read('src/certification-decisions/dto/create-certification-decision.dto.ts');

check(schema.includes('model certificate_series {'), 'Prisma có Certificate Series');
check(schema.includes('@@unique([certificate_series_id, version_no]'), 'Series + version_no là duy nhất');
check(!/cert_number\s+String\s+@unique/.test(schema), 'Số chứng chỉ không còn unique toàn cục');
check(schema.includes('supersedes_certificate_id'), 'Certificate version có lineage self-reference');
check(schema.includes('site_snapshot_json'), 'Certificate lưu snapshot địa điểm');
check(schema.includes('decision_type') && schema.includes('decision_result'), 'Decision type và result tồn tại độc lập');

check(migration.includes('THROW 51001') && migration.includes('THROW 51003'), 'Migration fail-fast khi backfill không an toàn');
check(/audit_token\]\s+LIKE\s+''surveillance%''/.test(migration), 'Migration suy luận MAINTAIN cho surveillance');
check(/THEN\s+''RECERTIFY''/.test(migration), 'Migration suy luận RECERTIFY');
check(migration.includes('ROW_NUMBER() OVER') && migration.includes('LAG(certificate_row.[id]) OVER'), 'Legacy version được xếp thứ tự tất định');
check(!/DELETE\s+FROM\s+\[dbo\]\.\[certificates\]/i.test(migration), 'Migration không xóa certificate legacy');
check(migration.includes('DROP CONSTRAINT') && migration.includes('IX_certificates_cert_number'), 'Thay unique cert_number bằng index tra cứu');

for (const decisionType of [
  'GRANT', 'MAINTAIN', 'RECERTIFY', 'AMEND', 'EXTEND_SCOPE',
  'REDUCE_SCOPE', 'SUSPEND', 'RESTORE', 'WITHDRAW', 'REFUSE',
]) {
  check(lifecycle.includes(`'${decisionType}'`), `Lifecycle hỗ trợ ${decisionType}`);
}
check(lifecycle.includes("active: [") && lifecycle.includes("'replaced'"), 'Status transition được tập trung');

check(decisionDto.includes('decision_type?: string'), 'DTO tương thích client cũ khi decision_type chưa được gửi');
check(decisionDto.includes('certificate_series_id?: string'), 'DTO cho phép chọn series khi có nhiều family');
check(decisionService.includes('inferLegacyDecisionType'), 'Backend suy luận legacy decision type có kiểm soát');
check(decisionService.includes('isDecisionTypeAllowedForLifecycle'), 'Decision được kiểm tra với audit lifecycle');
check(decisionService.includes("'PRESERVE_CURRENT_VERSION'"), 'MAINTAIN bảo toàn certificate hiện hành');
check(decisionService.includes("'TRANSITION_STATUS'"), 'Status decision áp dụng transition có lịch sử');

check(certificateService.includes('TransactionIsolationLevel') && certificateService.includes('.Serializable'), 'Version allocation dùng SERIALIZABLE transaction');
check(certificateService.includes('WITH (UPDLOCK, HOLDLOCK)'), 'Version allocation khóa series');
check(certificateService.includes('certificate_series_id:'), 'Certificate create gắn đúng series');
check(certificateService.includes('supersedes_certificate_id:'), 'Version mới trỏ version trước');
check(!certificateService.includes('technical_reviews: {\n                                reports: {\n                                    audit_plans: {\n                                        project_id:'), 'Không còn replace mọi active certificate theo project');
check(certificateService.includes('organization_name:\n                                decision.organization_name'), 'Create chụp snapshot từ decision');
check(certificateService.includes('certificate.organization_name'), 'Public verification đọc snapshot certificate');
check(certificateService.includes('verification_code:\n                            verificationCode'), 'Public verification vẫn resolve exact verification_code');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exitCode = 1;
