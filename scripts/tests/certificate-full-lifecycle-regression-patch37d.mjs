import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const lifecycle = read('src/certificates/certificate-lifecycle.ts');
const decisionService = read('src/certification-decisions/certification-decisions.service.ts');
const certificateService = read('src/certificates/certificates.service.ts');
const resultService = read('src/certification-results/certification-results.service.ts');
const fullLifecycleSpec = read('src/certificates/certificate-full-lifecycle.spec.ts');
const recertificationSpec = read('src/certification-decisions/certification-decisions-recertification.spec.ts');
const publicSpec = read('src/certificates/certificates-public-status.spec.ts');
const decisionUi = read('../ctic-frontend/app/components/CertificationResultWorkspaceModal.tsx');
const certificateUi = read('../ctic-frontend/app/components/CertificateIssuanceWorkspaceModal.tsx');
const listUi = read('../ctic-frontend/app/components/CertificatesScreen.tsx');

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

const actions = {
  GRANT: 'CREATE_FIRST_VERSION',
  MAINTAIN: 'PRESERVE_CURRENT_VERSION',
  AMEND: 'CREATE_NEXT_VERSION',
  EXTEND_SCOPE: 'CREATE_NEXT_VERSION',
  REDUCE_SCOPE: 'CREATE_NEXT_VERSION',
  SUSPEND: 'TRANSITION_STATUS',
  RESTORE: 'TRANSITION_STATUS',
  WITHDRAW: 'TRANSITION_STATUS',
  RECERTIFY: 'CREATE_NEXT_VERSION',
  REFUSE: 'NO_CERTIFICATE',
};
for (const [decisionType, action] of Object.entries(actions)) {
  check(
    new RegExp(`${decisionType}:\\s*'${action}'`).test(lifecycle),
    `${decisionType} được phân loại ${action}`,
  );
}

check(/RECERTIFICATION:\s*\['RECERTIFY',\s*'REFUSE'\]/.test(lifecycle), 'RECERTIFICATION chỉ dùng RECERTIFY hoặc REFUSE');
check(/phase14WorkspaceDecisionTypes[\s\S]*RECERTIFICATION[\s\S]*'active'[\s\S]*\['RECERTIFY'\]/.test(lifecycle), 'Workspace chỉ chiếu RECERTIFY cho lineage ACTIVE');
check(/decisionType === 'RECERTIFY'[\s\S]*canReplaceCertificateStatus/.test(decisionService), 'Decision service chặn tái chứng nhận trạng thái terminal');
check(/approved_site_snapshot_json/.test(decisionService) && /decisionSiteSnapshot/.test(certificateService), 'Snapshot địa điểm được đóng băng từ quyết định đã duyệt');
check(/isSurveillance && currentCertificate\?\.issue_date/.test(resultService) && /auditLifecycle === 'RECERTIFICATION'[\s\S]*application\.certification_scope/.test(resultService), 'Recertification dùng ngày chu kỳ mới và phạm vi hồ sơ hiện tại thay vì snapshot cũ');
check(/UPDLOCK, HOLDLOCK/.test(certificateService) && /TransactionIsolationLevel[\s\S]*Serializable/.test(certificateService), 'Cấp version dùng series lock và SERIALIZABLE');
check(/previousCertificate\?\.id/.test(certificateService) && /supersedes_certificate_id/.test(certificateService), 'RECERTIFY giữ same-series supersession');
check(/GRANT[\s\S]*MAINTAIN[\s\S]*AMEND[\s\S]*SUSPEND[\s\S]*RESTORE[\s\S]*RECERTIFY/.test(fullLifecycleSpec), 'Có scenario lifecycle tuần tự đầy đủ');
check(/WITHDRAW terminal/.test(fullLifecycleSpec), 'WITHDRAW được kiểm tra ở nhánh terminal riêng');
check(/stage2[\s\S]*surveillance1/.test(recertificationSpec), 'RECERTIFY bị chặn ở initial và surveillance');
check(/verification-v1[\s\S]*verification-v2[\s\S]*verification-v3/.test(publicSpec), 'Public verification kiểm tra chính xác ba version');
check(/RECERTIFY:\s*"Tái chứng nhận"/.test(decisionUi), 'Frontend hiển thị nhãn Tái chứng nhận');
check(/allowed_decision_types\.map/.test(decisionUi), 'Frontend tiếp tục tiêu thụ allowed_decision_types từ backend');
check(/issuance_preview\.previous_version/.test(certificateUi) && /issuance_preview\.proposed_version/.test(certificateUi), 'Issuance preview đối chiếu version trước và dữ liệu mới');
check(/Phát hành chứng chỉ tái chứng nhận/.test(certificateUi), 'Approved RECERTIFY có hành động phát hành rõ ràng');
check(/Vai trò phiên bản/.test(listUi) && /Hiện hành/.test(listUi) && /Lịch sử/.test(listUi), 'Danh sách phân biệt version hiện hành và lịch sử');

console.log(`\nPatch 37D full certificate lifecycle regression: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
