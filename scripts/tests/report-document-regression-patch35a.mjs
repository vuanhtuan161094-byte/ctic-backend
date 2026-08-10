import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..', '..');

function findFrontendRoot() {
  const parent = path.dirname(backendRoot);
  const candidates = [
    process.env.CTIC_FRONTEND_DIR,
    path.join(parent, 'ctic-frontend'),
    path.resolve(process.cwd(), '..', 'ctic-frontend'),
  ].filter(Boolean);

  try {
    for (const name of fs.readdirSync(parent)) {
      if (/frontend/i.test(name)) candidates.push(path.join(parent, name));
    }
  } catch {
    // Không ảnh hưởng kiểm tra backend.
  }

  return candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx')),
  );
}

const frontendRoot = findFrontendRoot();
const enginePath = path.join(backendRoot, 'src', 'reports', 'runtime', 'ooxml-template-engine.cjs');
const templatesDir = path.join(backendRoot, 'src', 'reports', 'templates');
const stage1Template = path.join(templatesDir, 'F.09-P.09-01.audit-report-stage-1.template.docx');
const stage2Template = path.join(templatesDir, 'F.09-P.09-02.audit-report-stage-2.template.docx');
const reportDocumentServicePath = path.join(backendRoot, 'src', 'reports', 'report-documents.service.ts');
const reportsControllerPath = path.join(backendRoot, 'src', 'reports', 'reports.controller.ts');
const reportsModulePath = path.join(backendRoot, 'src', 'reports', 'reports.module.ts');
const documentFilesServicePath = path.join(backendRoot, 'src', 'document-files', 'document-files.service.ts');
const nestCliPath = path.join(backendRoot, 'nest-cli.json');
const frontendWorkspacePath = frontendRoot
  ? path.join(frontendRoot, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx')
  : null;

let pass = 0;
let fail = 0;

function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`✓ ${label}`);
  } else {
    fail += 1;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function hasAll(text, values) {
  return values.every((value) => text.includes(value));
}

check(fs.existsSync(enginePath), 'Có engine sinh DOCX không cần dependency npm');
check(fs.existsSync(stage1Template), 'Có mẫu F.09-P.09-01 giai đoạn 1');
check(fs.existsSync(stage2Template), 'Có mẫu F.09-P.09-02 giai đoạn 2');
check(fs.existsSync(reportDocumentServicePath), 'Có ReportDocumentsService');
check(fs.existsSync(frontendWorkspacePath ?? ''), 'Tìm thấy frontend để kiểm tra giao diện', frontendRoot ?? 'Không tìm thấy thư mục frontend');

const serviceText = read(reportDocumentServicePath);
const conversionText = read(path.join(backendRoot, 'src', 'common', 'document-conversion.ts'));
const controllerText = read(reportsControllerPath);
const moduleText = read(reportsModulePath);
const documentFilesText = read(documentFilesServicePath);
const nestCliText = read(nestCliPath);
const frontendText = frontendWorkspacePath ? read(frontendWorkspacePath) : '';

check(hasAll(controllerText, ["@Get(':id/document-preview')", "@Post(':id/documents/generate')"]), 'Controller có API xem trước và sinh tài liệu');
check(controllerText.includes("enum: ['docx', 'pdf']"), 'API chỉ nhận định dạng Word hoặc PDF');
check(hasAll(moduleText, ['DocumentFilesModule', 'ReportDocumentsService']), 'ReportsModule đã nối module lưu trữ tài liệu');
check(hasAll(documentFilesText, ['registerGenerated(', 'version_no: nextVersion', 'is_current: false']), 'Tài liệu sinh tự động được quản lý phiên bản');
check(documentFilesText.includes('file_kind: input.file_kind'), 'Phân biệt lịch sử Word và PDF');
check(hasAll(serviceText, ['stage1_audit_report', 'stage2_audit_report']), 'Tự chọn đúng loại biểu mẫu theo giai đoạn');
check(serviceText.includes('buildSnapshot(report'), 'Dữ liệu xuất được snapshot từ báo cáo');
check(serviceText.includes('audit_team:'), 'Snapshot có đoàn đánh giá');
check(serviceText.includes('client_representatives:'), 'Snapshot có đại diện khách hàng');
check(serviceText.includes('findings:'), 'Snapshot có bảng phát hiện');
check(serviceText.includes('actual_mandays'), 'Man-day ưu tiên dữ liệu thực tế');
check(serviceText.includes('convertDocxToPdf') && conversionText.includes('tryLibreOffice'), 'Có bộ chuyển PDF bằng LibreOffice qua helper chung');
check(serviceText.includes('convertDocxToPdf') && conversionText.includes('tryMicrosoftWord'), 'Có fallback Microsoft Word trên Windows qua helper chung');
check(serviceText.includes('PDF sinh từ cùng snapshot Word'), 'Word và PDF dùng cùng snapshot nội dung');
check(hasAll(nestCliText, ['reports/templates/**/*', 'reports/runtime/**/*']), 'Nest build sao chép mẫu Word và engine runtime');
check(hasAll(frontendText, ['Xem trước', 'Xuất Word', 'Xuất PDF']), 'Frontend có đủ thao tác xem trước, Word và PDF');
check(frontendText.includes('/document-files/entity/report/'), 'Frontend hiển thị lịch sử tài liệu đã sinh');
check(frontendText.includes('saveCurrentDraftBeforeDocument'), 'Tự lưu dữ liệu đang nhập trước khi xuất');
check(
  frontendText.includes('downloadDocumentFile') || frontendText.includes('responseType: "blob"'),
  'Tải file có kiểm soát bằng JWT',
);

const engine = require(enginePath);
const stage1Tokens = engine.listTemplateTokens(stage1Template);
const stage2Tokens = engine.listTemplateTokens(stage2Template);
check(stage1Tokens.includes('customer_code'), 'Mẫu GĐ1 có mã khách hàng động');
check(stage2Tokens.includes('customer_code'), 'Mẫu GĐ2 có mã khách hàng động');
check(hasAll(stage1Tokens.join('|'), ['#audit_team', '#client_representatives', '#stage1_items']), 'Mẫu GĐ1 có các bảng lặp động');
check(hasAll(stage2Tokens.join('|'), ['#audit_team', '#client_representatives', '#findings']), 'Mẫu GĐ2 có các bảng lặp động');

const fixtureData = {
  customer_code: 'C0218',
  organization_name_vi: 'CÔNG TY TNHH CHÍNH XÁC MINSEN (VIỆT NAM)',
  organization_name_en: 'MINSEN (VIETNAM) PRECISION CO., LTD',
  organization_address: 'Số 8 VSIP II-A, đường số 15, KCN Việt Nam - Singapore II-A, Việt Nam',
  contact_name: 'ĐỖ THỊ THUỶ TIÊN',
  contact_position: 'Nhân viên nhân sự',
  contact_phone: '0334598526',
  contact_email: 'contact@example.com',
  audit_location: 'Nhà máy tại VSIP II-A, Việt Nam',
  certification_scope: 'Gia công cơ khí chính xác linh kiện ngũ kim.',
  audit_objectives: 'Xác định sự phù hợp và hiệu lực của hệ thống quản lý.',
  audit_type_label: 'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
  standard_name: 'ISO 9001:2015',
  audit_criteria: 'ISO 9001:2015 và các yêu cầu áp dụng.',
  audit_dates: '28/05/2026',
  audit_mandays: '2,0 man-day',
  audit_language: 'Tiếng Việt',
  audit_team: [
    { team: { no: 1, full_name: 'Lâm Hoàng Phúc', code: 'A.CTIC.10', role: 'Trưởng đoàn đánh giá', contact: '0938288415' } },
    { team: { no: 2, full_name: 'Nguyễn Duy Mạnh', code: 'A.CTIC.12', role: 'Chuyên gia đánh giá', contact: '0900000000' } },
  ],
  client_representatives: [
    { representative: { no: 1, full_name: 'WU HONG JUN', position: 'Tổng giám đốc' } },
    { representative: { no: 2, full_name: 'ĐỖ THỊ THUỶ TIÊN', position: 'Nhân viên nhân sự' } },
  ],
  findings: [
    { finding: { no: 1, content: 'Chưa kiểm soát đầy đủ hồ sơ thành phẩm.', clause: '8.6', grade: 'NC nhẹ', code: 'NC01' } },
    { finding: { no: 2, content: 'Xem xét tăng cường nhận dạng nguyên liệu.', clause: '8.5.2', grade: 'OFI', code: 'OFI01' } },
  ],
  stage1_items: [
    { item: { no: 1, topic: 'Hệ thống tài liệu', note: 'Đã xây dựng tài liệu hệ thống.', comment: 'Phù hợp' } },
    { item: { no: 2, topic: 'Mức độ sẵn sàng', note: 'Đủ điều kiện đánh giá giai đoạn 2.', comment: 'Sẵn sàng' } },
  ],
  execution_summary: 'Đoàn đánh giá đã thực hiện theo kế hoạch.',
  implementation_summary: 'Hệ thống đã được triển khai.',
  effectiveness_summary: 'Hệ thống nhìn chung có hiệu lực.',
  internal_audit_summary: 'Đã thực hiện đánh giá nội bộ.',
  management_review_summary: 'Đã thực hiện xem xét của lãnh đạo.',
  limitations: 'Không có/ None',
  significant_changes: 'Không có/ None',
  conclusion: 'Hệ thống phù hợp về cơ bản với tiêu chuẩn áp dụng.',
  recommendation_label: 'Đề nghị cấp chứng nhận sau khi đóng NC',
  recommendation_rationale: 'Khắc phục NC trong thời hạn quy định.',
  audit_team_recommendation: 'Kiến nghị cấp chứng nhận sau khi hoàn thành hành động khắc phục phù hợp.',
  client_recommendation: 'Khách hàng thống nhất với kết quả đánh giá.',
  auditee_representative_name: 'WU HONG JUN',
  auditee_representative_position: 'Tổng giám đốc',
  team_leader_name: 'Lâm Hoàng Phúc',
  team_leader_role: 'Trưởng đoàn đánh giá',
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35a-'));
try {
  const stage1Output = path.join(tempDir, 'stage1.docx');
  const stage2Output = path.join(tempDir, 'stage2.docx');
  engine.renderDocxTemplate({ templatePath: stage1Template, outputPath: stage1Output, data: fixtureData });
  engine.renderDocxTemplate({ templatePath: stage2Template, outputPath: stage2Output, data: fixtureData });

  check(fs.statSync(stage1Output).size > 20_000, 'Engine sinh được DOCX GĐ1 hợp lệ');
  check(fs.statSync(stage2Output).size > 20_000, 'Engine sinh được DOCX GĐ2 hợp lệ');

  const stage1Xml = engine.readZipEntries(stage1Output)
    .find((entry) => entry.name === 'word/document.xml')?.data.toString('utf8') ?? '';
  const stage2Xml = engine.readZipEntries(stage2Output)
    .find((entry) => entry.name === 'word/document.xml')?.data.toString('utf8') ?? '';

  check(!/{{\s*[#/A-Za-z0-9_.]+\s*}}/.test(stage1Xml), 'DOCX GĐ1 không còn placeholder chưa xử lý');
  check(!/{{\s*[#/A-Za-z0-9_.]+\s*}}/.test(stage2Xml), 'DOCX GĐ2 không còn placeholder chưa xử lý');
  check(hasAll(stage1Xml, ['Lâm Hoàng Phúc', 'Nguyễn Duy Mạnh', 'WU HONG JUN']), 'DOCX GĐ1 điền đủ dữ liệu và lặp thành viên');
  check(hasAll(stage2Xml, ['NC01', 'OFI01', 'Lâm Hoàng Phúc', 'Nguyễn Duy Mạnh']), 'DOCX GĐ2 điền đủ phát hiện và đoàn đánh giá');
  check((stage2Xml.match(/NC01/g) ?? []).length === 1, 'Không nhân đôi sai hàng phát hiện NC01');
} catch (error) {
  check(false, 'Render chức năng hai biểu mẫu', error instanceof Error ? error.message : String(error));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);

if (fail > 0) process.exit(1);
