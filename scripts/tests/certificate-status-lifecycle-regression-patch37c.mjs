import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const lifecycle = read('src/certificates/certificate-lifecycle.ts');
const decisionService = read('src/certification-decisions/certification-decisions.service.ts');
const certificateService = read('src/certificates/certificates.service.ts');
const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260821190000_certificate_status_decision_audit/migration.sql');
const decisionUi = read('../ctic-frontend/app/components/CertificationResultWorkspaceModal.tsx');
const certificateUi = read('../ctic-frontend/app/components/CertificateIssuanceWorkspaceModal.tsx');
const certificateListUi = read('../ctic-frontend/app/components/CertificatesScreen.tsx');

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

check(/allowedStatusDecisionTypesForCertificateStatus/.test(lifecycle), 'Action trạng thái được chiếu từ rule engine backend');
check(/active:[\s\S]*'SUSPEND',[\s\S]*'WITHDRAW'/.test(lifecycle), 'ACTIVE chỉ cho đình chỉ hoặc thu hồi');
check(/suspended:[\s\S]*'active',[\s\S]*'withdrawn'/.test(lifecycle), 'SUSPENDED chỉ cho khôi phục hoặc thu hồi');
check(/isStatusDecisionType[\s\S]*!changeReason/.test(decisionService), 'Quyết định trạng thái bắt buộc lý do hoặc căn cứ');
check(/isStatusDecisionType[\s\S]*!effectiveDate/.test(decisionService), 'Quyết định trạng thái bắt buộc ngày hiệu lực');
check(/effectiveDate!\.getTime\(\) >[\s\S]*expire_date/.test(decisionService), 'RESTORE kiểm tra ngày hiệu lực với ngày hết hạn');
check(/certificates\.updateMany[\s\S]*status:[\s\S]*currentStatus[\s\S]*guardedUpdate\.count !== 1/.test(decisionService), 'Chuyển trạng thái dùng guarded update chống stale state');
check(/TransactionIsolationLevel[\s\S]*Serializable/.test(decisionService), 'Transaction lifecycle dùng Serializable');
check(/certification_decision_id:[\s\S]*decision\.id/.test(decisionService), 'Lịch sử tham chiếu đúng quyết định');
check(/certification_decision_id\s+String\?/.test(schema) && /FK_certificate_status_histories_decision/.test(migration), 'Schema audit liên kết history với quyết định bằng migration mới');
check(/targetStatus !== 'expired'/.test(certificateService), 'Raw status endpoint không bypass đình chỉ khôi phục thu hồi');
check(/status_label:/.test(certificateService) && /Đã thu hồi/.test(certificateService), 'Public verification trả trạng thái nghiệp vụ thực');
check(/allowed_status_actions:\s*allowedStatusActions/.test(certificateService), 'Certificate workspace trả allowed_status_actions');
check(/modal\.confirm\(/.test(decisionUi) && /Sau khi thu hồi, chứng chỉ không thể khôi phục/.test(decisionUi), 'UI xác nhận hành động ảnh hưởng hiệu lực');
check(/Lịch sử trạng thái chứng chỉ/.test(certificateUi) && /decision_number/.test(certificateUi), 'Workspace hiển thị timeline trạng thái và quyết định');
check(!/api\.patch<CertificateRecord>/.test(certificateListUi), 'Màn Certificates chỉ đọc không còn raw status PATCH');

console.log(`\nPatch 37C certificate status lifecycle regression: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
