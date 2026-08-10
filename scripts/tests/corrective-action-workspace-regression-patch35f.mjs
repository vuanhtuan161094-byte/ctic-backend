import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const frontendCandidates = [
  path.resolve(backendRoot, '..', 'ctic-frontend'),
  path.resolve(backendRoot, '..', 'frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app', 'components', 'CertificationProjectDetailScreen.tsx')) &&
  fs.existsSync(path.join(candidate, 'app', 'components', 'CorrectiveActionWorkspaceModal.tsx')),
) ?? frontendCandidates[0];
const require = createRequire(import.meta.url);

let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    console.log(`✓ ${label}`);
    pass += 1;
  } else {
    console.error(`✗ ${label}`);
    fail += 1;
  }
}

function read(relative, root = backendRoot) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function exists(relative, root = backendRoot) {
  return fs.existsSync(path.join(root, relative));
}

console.log('\n=== PATCH 35F — NC/CAP & F.10-P.09 ===');

const findingsService = read('src/audit-findings/audit-findings.service.ts');
const findingsController = read('src/audit-findings/audit-findings.controller.ts');
const documentsService = read('src/audit-documents/audit-documents.service.ts');
const documentsController = read('src/audit-documents/audit-documents.controller.ts');
const projectsService = read('src/certification-projects/certification-projects.service.ts');
const projectScreen = read('app/components/CertificationProjectDetailScreen.tsx', frontendRoot);
const documentModal = read('app/components/AuditDocumentCenterModal.tsx', frontendRoot);
const correctiveWorkspace = read('app/components/CorrectiveActionWorkspaceModal.tsx', frontendRoot);
const executionWorkspace = read('app/components/AuditExecutionWorkspaceModal.tsx', frontendRoot);

check(findingsController.includes("@Get('plan/:auditPlanId')"), 'Backend có API lấy NC/CAP theo PLAN');
check(findingsService.includes('async findByPlan(auditPlanId: string)'), 'Service truy vấn phát hiện theo kế hoạch');
check(findingsController.includes("@Post(':id/corrective-actions/internal')"), 'Có API nhập phản hồi khách hàng từ nội bộ');
check(findingsController.includes("@Permissions('findings.manage')"), 'API nội bộ được khóa bằng quyền findings.manage');
check(findingsService.includes('normalizeFindingsWithEvidence'), 'Kết quả NC/CAP được bổ sung bằng chứng và người xử lý');
check(findingsService.includes("document_type: 'corrective_action_evidence'"), 'Backend lấy đúng tệp bằng chứng CAP');
check(findingsService.includes('submitted_by_user'), 'Backend trả thông tin người gửi phản hồi');
check(findingsService.includes('reviewed_by_user'), 'Backend trả thông tin người xem xét');
check(findingsService.includes('evidence_files'), 'Backend trả danh sách bằng chứng theo từng phiên bản CAP');
check(findingsService.includes("status:\n                                'response_submitted'"), 'Gửi CAP chuyển NC sang trạng thái đã phản hồi');
check(findingsService.includes("'revision_required'"), 'Backend hỗ trợ yêu cầu bổ sung CAP');
check(findingsService.includes("'action_accepted'"), 'Backend hỗ trợ chấp nhận hành động khắc phục');
check(findingsService.includes("'corrective_action_evidence'"), 'Chấp nhận CAP bắt buộc có bằng chứng');
check(findingsService.includes("status: submittedAt\n                                    ? 'ready_for_technical_review'\n                                    : 'draft'"), 'Đóng NC chỉ chuyển thẩm xét khi báo cáo đã nộp');

check(documentsService.includes("'corrective_action_request_f10'"), 'Engine tài liệu hỗ trợ F.10-P.09');
check(documentsController.includes("'corrective_action_request_f10'"), 'API sinh tài liệu công bố loại F.10-P.09');
check(documentsController.includes("name: 'findingId'"), 'API sinh F.10 yêu cầu findingId');
check(documentsService.includes('buildCorrectiveActionDocuments'), 'Backend tạo một biểu F.10 cho từng NC');
check(documentsService.includes("entityType: 'audit_finding'"), 'Lịch sử F.10 được lưu riêng theo từng NC');
check(documentsService.includes("templateFile: 'F.10-P.09.corrective-action-request.template.docx'"), 'F.10 dùng đúng mẫu Word riêng');
check(documentsService.includes('evidence_summary'), 'F.10 lấy danh sách tệp bằng chứng');
check(documentsService.includes('accepted_mark'), 'F.10 thể hiện kết quả chấp nhận');
check(documentsService.includes('not_accepted_mark'), 'F.10 thể hiện kết quả không chấp nhận');
check(documentsService.includes('reviewer_name'), 'F.10 lấy tên chuyên gia xem xét');
check(documentsService.includes('documents.push(...await this.buildCorrectiveActionDocuments(plan))'), 'F.10 được đưa vào trung tâm tài liệu của PLAN');

check(exists('src/reports/templates/F.10-P.09.corrective-action-request.template.docx'), 'Có mẫu Word F.10-P.09');
const engine = require(path.join(backendRoot, 'src', 'reports', 'runtime', 'ooxml-template-engine.cjs'));
const templatePath = path.join(backendRoot, 'src', 'reports', 'templates', 'F.10-P.09.corrective-action-request.template.docx');
const tokens = engine.listTemplateTokens(templatePath);
for (const token of [
  'organization_name_vi', 'organization_address', 'audit_dates', 'standard_name',
  'audit_type_label', 'finding_code', 'finding_grade', 'finding_description',
  'finding_clause', 'finding_requirement', 'finding_evidence', 'root_cause',
  'correction', 'corrective_action_plan', 'evidence_summary', 'completion_date',
  'responsible_person', 'accepted_mark', 'not_accepted_mark', 'review_comment',
  'checked_date', 'reviewer_name',
]) {
  check(tokens.includes(token), `Mẫu F.10 có trường ${token}`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35f-'));
const renderedPath = path.join(tempDir, 'F10-rendered.docx');
engine.renderDocxTemplate({
  templatePath,
  outputPath: renderedPath,
  data: Object.fromEntries(tokens.map((token) => [token.replace(/^#|^\//, ''), `TEST_${token}`])),
});
check(fs.existsSync(renderedPath) && fs.statSync(renderedPath).size > 20_000, 'Engine sinh được DOCX F.10 thực tế');
const renderedXml = engine.readZipEntries(renderedPath)
  .filter((entry) => entry.name.endsWith('.xml'))
  .map((entry) => entry.data.toString('utf8'))
  .join('\n');
check(!renderedXml.includes('{{'), 'DOCX F.10 sau sinh không còn placeholder');
check(renderedXml.includes('F.10-P.09') || renderedXml.includes('F10-P.09'), 'Mẫu giữ mã biểu F.10-P.09');
check(renderedXml.includes('CORRECTIVE ACTION REQUEST'), 'Mẫu giữ tiêu đề gốc song ngữ');

check(exists('app/components/CorrectiveActionWorkspaceModal.tsx', frontendRoot), 'Frontend có không gian NC/CAP riêng');
check(correctiveWorkspace.includes('Tiến độ xử lý NC/CAP'), 'Giao diện có tổng quan tiến độ NC/CAP');
check(correctiveWorkspace.includes('Đang xử lý'), 'Giao diện lọc NC đang xử lý');
check(correctiveWorkspace.includes('Đã đóng'), 'Giao diện lọc NC đã đóng');
check(correctiveWorkspace.includes('Nhập phản hồi khắc phục'), 'Giao diện cho nhập phản hồi khách hàng');
check(correctiveWorkspace.includes('Gửi phiên bản CAP mới'), 'Giao diện hỗ trợ nhiều phiên bản CAP');
check(correctiveWorkspace.includes('Tải bằng chứng'), 'Giao diện cho tải bằng chứng khắc phục');
check(correctiveWorkspace.includes('Xem xét CAP'), 'Giao diện có bước xem xét CAP');
check(correctiveWorkspace.includes('Yêu cầu bổ sung/chỉnh sửa'), 'Giao diện hỗ trợ trả CAP để bổ sung');
check(correctiveWorkspace.includes('Đóng NC'), 'Giao diện có thao tác đóng NC');
check(correctiveWorkspace.includes('Xuất F.10 Word'), 'Giao diện xuất F.10 Word theo từng NC');
check(correctiveWorkspace.includes('Xuất PDF'), 'Giao diện xuất F.10 PDF');
check(correctiveWorkspace.includes('Lịch sử CAP và bằng chứng'), 'Giao diện hiển thị lịch sử phiên bản và bằng chứng');
check(correctiveWorkspace.includes('/audit-findings/plan/${planId}'), 'Frontend dùng API NC/CAP theo PLAN');
check(correctiveWorkspace.includes('corrective_action_evidence'), 'Frontend tải đúng loại tệp bằng chứng');
check(correctiveWorkspace.includes('corrective_action_request_f10'), 'Frontend sinh đúng loại tài liệu F.10');

check(projectScreen.includes('CorrectiveActionWorkspaceModal'), 'Thành phần hồ sơ mở được workspace NC/CAP');
check(projectScreen.includes('Mở NC/CAP'), 'Dòng F.10 có nút Mở NC/CAP riêng');
check(projectScreen.includes('formCode: "F.10-P.09"'), 'Bảng thành phần hồ sơ hiển thị mã F.10-P.09');
check(projectScreen.includes('documentType: "corrective_action_request_f10"'), 'Bảng hồ sơ nhận diện lịch sử F.10');
check(documentModal.includes('"corrective_action_request_f10"'), 'Trung tâm tài liệu hiểu biểu F.10');
check(documentModal.includes('findingId?: string | null'), 'Thẻ tài liệu phân biệt từng NC bằng findingId');
check(documentModal.includes('...(findingId ? { findingId } : {})'), 'Frontend gửi findingId khi sinh F.10');

check(projectsService.includes('const ncFindings = context.findings.filter'), 'Hồ sơ chỉ tính NC nhẹ/nặng cho F.10');
check(projectsService.includes("status: ncFindings.length === 0"), 'OFI/quan sát không làm F.10 chuyển trạng thái thiếu');
check(!executionWorkspace.match(/const countedRoles[\s\S]{0,160}technical_expert/), 'Chuyên gia kỹ thuật không bị tính man-day tại xác nhận thực tế');

try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {}

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exitCode = fail ? 1 : 0;
