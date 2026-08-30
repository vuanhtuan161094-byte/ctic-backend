import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const lifecycle = read('src/certificates/certificate-lifecycle.ts');
const decisionService = read('src/certification-decisions/certification-decisions.service.ts');
const decisionDto = read('src/certification-decisions/dto/create-certification-decision.dto.ts');
const resultService = read('src/certification-results/certification-results.service.ts');
const certificateService = read('src/certificates/certificates.service.ts');
const certificateController = read('src/certificates/certificates.controller.ts');
const decisionController = read('src/certification-decisions/certification-decisions.controller.ts');
const decisionUi = read('../ctic-frontend/app/components/CertificationResultWorkspaceModal.tsx');
const certificateUi = read('../ctic-frontend/app/components/CertificateIssuanceWorkspaceModal.tsx');

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

check(/PHASE_12_WORKSPACE_DECISION_TYPES/.test(lifecycle), 'Workspace dùng projection lifecycle tập trung thay vì rule engine React');
check(/allowed_decision_types:\s*allowedDecisionTypes/.test(resultService), 'API trả allowed_decision_types');
check(/certificate_series:[\s\S]*current_certificate:[\s\S]*versions:/.test(resultService), 'Decision workspace trả series và các version');
check(/requires_certificate_issuance:[\s\S]*maintains_current_certificate:/.test(certificateService), 'Issuance workspace phân biệt tái phát hành và MAINTAIN');
check(/version_timeline:[\s\S]*documents:[\s\S]*official_pdf_available:/.test(certificateService), 'Timeline giữ tài liệu PDF theo từng certificate version');
check(/decisionRequiresChangeReason/.test(decisionService) && /change_reason\?: string/.test(decisionDto), 'AMEND EXTEND REDUCE có field và validation lý do thay đổi');
check(/decisionChangesCertifiedScope/.test(decisionService) && /Phạm vi chứng nhận đề xuất phải khác phạm vi hiện hành/.test(decisionService), 'EXTEND REDUCE bắt buộc xác nhận phạm vi mới');
check(/decisionRequiresChangeReason\(decisionType\)[\s\S]*!changeReason/.test(certificateService), 'Backend chặn phát hành version thay đổi thiếu lý do');
check(/PRESERVE_CURRENT_VERSION[\s\S]*không tạo phiên bản mới/.test(certificateService), 'Backend MAINTAIN không tạo certificate');
check(/certificate_series_id:[\s\S]*version_no:[\s\S]*supersedes_certificate_id/.test(certificateService), 'Version mới giữ đúng series và supersession');
check(/selectedVersion\.organization_name/.test(certificateUi) && /selectedVersion\.site_snapshot_json/.test(certificateUi), 'Historical UI dùng snapshot certificate bất biến');
check(/version\.documents\[0\]/.test(certificateUi), 'Historical PDF mở theo đúng version');
check(/MAINTAIN:[\s\S]*Không phát hành phiên bản mới/.test(decisionUi), 'Frontend giải thích MAINTAIN không tái phát hành');
check(/@Permissions\('certificates\.manage'\)/.test(certificateController) && /@Permissions\('certification_decisions\.issue'\)/.test(decisionController), 'Backend mutation permissions vẫn được giữ');
check(/!canDecision/.test(decisionUi) && /!workspace\.can_issue_certificate \|\| !canIssue/.test(certificateUi), 'Frontend mutation controls vẫn role-aware');

console.log(`\nPatch 37B certificate lifecycle workspace regression: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
