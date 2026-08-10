import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  ts = require(path.join(globalRoot, 'typescript'));
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..', '..');
const projectRoot = path.resolve(backendRoot, '..');
const frontendRoot = path.join(projectRoot, 'ctic-frontend');
const engine = require(path.join(backendRoot, 'src', 'reports', 'runtime', 'ooxml-template-engine.cjs'));

let pass = 0;
let fail = 0;
function check(condition, label, detail = '') {
  if (condition) { pass += 1; console.log(`✓ ${label}`); }
  else { fail += 1; console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function read(relative, root = backendRoot) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function exists(relative, root = backendRoot) { return fs.existsSync(path.join(root, relative)); }
function syntaxCheck(relative, root = backendRoot, jsx = false) {
  const full = path.join(root, relative);
  const out = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    fileName: full,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  });
  return (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
}

console.log('=== PATCH 35C — HỒ SƠ TRONG ĐÁNH GIÁ F.07/F.15/F.17 ===');

const service = read('src/audit-documents/audit-documents.service.ts');
const controller = read('src/audit-documents/audit-documents.controller.ts');
const dto = read('src/audit-documents/dto/save-audit-document-data.dto.ts');
const modal = read('app/components/AuditDocumentCenterModal.tsx', frontendRoot);

for (const file of [
  'src/audit-documents/audit-documents.service.ts',
  'src/audit-documents/audit-documents.controller.ts',
  'src/audit-documents/dto/save-audit-document-data.dto.ts',
]) {
  check(exists(file), `Có file backend ${file}`);
  const diagnostics = syntaxCheck(file);
  check(diagnostics.length === 0, `${file} không lỗi cú pháp TypeScript`, diagnostics.map((d) => d.messageText).join('; '));
}
check(exists('app/components/AuditDocumentCenterModal.tsx', frontendRoot), 'Có modal hồ sơ Word/PDF');
const frontDiagnostics = syntaxCheck('app/components/AuditDocumentCenterModal.tsx', frontendRoot, true);
check(frontDiagnostics.length === 0, 'AuditDocumentCenterModal không lỗi cú pháp TSX', frontDiagnostics.map((d) => d.messageText).join('; '));

check(controller.includes("'audit_attendance_f07'"), 'API hỗ trợ F.07-P.09');
check(controller.includes("'audit_log_f15'"), 'API hỗ trợ F.15-P.09');
check(controller.includes("'audit_monitoring_f17'"), 'API hỗ trợ F.17-P.09');
check(controller.includes("@Query('memberId')"), 'API F.15 nhận đúng thành viên đoàn');
check(service.includes('buildAttendanceDocument'), 'Backend có bộ dựng danh sách tham dự F.07');
check(service.includes('buildAuditLogDocuments'), 'Backend tạo Audit log riêng cho từng thành viên');
check(service.includes('buildMonitoringDocument'), 'Backend tự tổng hợp phiếu theo dõi F.17');
check(service.includes("entityType: 'audit_team_member'"), 'Lịch sử F.15 được lưu theo thành viên đoàn');
check(service.includes("entityType: 'certification_project'"), 'Lịch sử F.17 được lưu theo hồ sơ chứng nhận');
check(service.includes('actual_mandays ?? member.planned_mandays'), 'F.15 ưu tiên ngày công thực tế, dự phòng bằng kế hoạch');
check(service.includes('assignedPrograms'), 'F.15 lấy chương trình chuyên gia phụ trách');
check(service.includes("technicalexpert") && service.includes("observer") && service.includes("trainee"), 'F.15 hiển thị đầy đủ vai trò đoàn');
check(service.includes('application_reviews.findMany'), 'F.17 kiểm tra trạng thái xem xét đơn');
check(service.includes("audit_checklist_f06"), 'F.17 sẵn sàng nhận trạng thái checklist F.06 ở patch sau');
check(service.includes("audit_attendance_f07"), 'F.17 tự nhận biết F.07 đã được sinh');
check(service.includes('audit_result_notification'), 'F.17 theo dõi thông báo kết quả');
check(service.includes('certification_decision'), 'F.17 theo dõi quyết định chứng nhận');
check(service.includes('certificates'), 'F.17 theo dõi giấy chứng nhận');
check(dto.includes('class AuditAttendanceRowDto'), 'DTO có cấu trúc người tham dự');
check(dto.includes('opening_attended') && dto.includes('closing_attended'), 'DTO lưu trạng thái họp khai mạc/kết thúc');
check(dto.includes('opening_date') && dto.includes('closing_date'), 'DTO lưu ngày họp khai mạc/kết thúc');
check(service.includes('Danh sách tham dự không được vượt quá 100 người'), 'Backend giới hạn danh sách tham dự');
check(service.includes("action: 'SAVE_AUDIT_DOCUMENT_DATA'"), 'Lưu dữ liệu bổ sung có audit log');

check(modal.includes('Danh sách tham dự F.07-P.09'), 'Frontend có vùng nhập danh sách tham dự');
check(modal.includes('Họp khai mạc') && modal.includes('Họp kết thúc'), 'Frontend cho xác nhận tham dự hai cuộc họp');
check(modal.includes('opening_date') && modal.includes('closing_date'), 'Frontend có ngày khai mạc/kết thúc');
check(modal.includes('memberId: document.member_id'), 'Frontend xuất F.15 đúng từng thành viên');
check(modal.includes('document.card_key'), 'Các thẻ F.15 có key riêng, không đè nhau');
check(modal.includes('F.03, F.04, F.05, F.06, F.07, F.15 và F.17') || modal.includes('F.03, F.04, F.05, F.07, F.15 và F.17'), 'Giao diện mô tả đúng bộ hồ sơ hiện có');

const templates = [
  {
    file: 'F.07-P.09.attendance-record.template.docx',
    tokens: ['attendance_9_full_name', 'opening_date', 'closing_date', 'audit_location'],
  },
  {
    file: 'F.15-P.09.audit-log.template.docx',
    tokens: ['auditor_name', 'auditor_code', 'auditor_mandays', 'role_team_leader_mark', 'standard_iso9001_mark', 'audit_type_stage1_mark'],
  },
  {
    file: 'F.17-P.09.audit-monitoring.template.docx',
    tokens: ['monitoring_1_yes_mark', 'monitoring_17_no_mark', 'standard_name', 'certification_scope'],
  },
];
const templateDir = path.join(backendRoot, 'src', 'reports', 'templates');
for (const item of templates) {
  const full = path.join(templateDir, item.file);
  check(fs.existsSync(full), `Có mẫu Word ${item.file}`);
  const tokens = engine.listTemplateTokens(full);
  check(item.tokens.every((token) => tokens.includes(token)), `${item.file} có đủ placeholder theo form gốc`);
  const entries = engine.readZipEntries(full);
  const xml = entries.filter((e) => e.name.endsWith('.xml')).map((e) => e.data.toString('utf8')).join('\n');
  check(/cticlab\.com|CTIC VIETNAM/i.test(xml), `${item.file} giữ đúng header biểu mẫu gốc đã gửi`);
  check(entries.some((e) => /^word\/media\//.test(e.name)), `${item.file} giữ logo/hình ảnh biểu mẫu gốc`);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35c-'));
const branding = {
  certification_body_short_name: 'CTIC', certification_body_name: 'CÔNG TY TNHH CTIC VIETNAM',
  certification_body_address: 'Hải Phòng, Việt Nam', certification_body_phone: '0225 3880588',
  certification_body_email: 'info@cticlab.com', certification_body_website: 'cticlab.com',
};
const common = {
  ...branding, organization_name_vi: 'CÔNG TY TNHH MẪU', organization_address: 'Hải Phòng',
  audit_location: 'Nhà máy 1', issue_date: '06/09/2026', customer_code: 'C001',
  standard_name: 'ISO 9001:2015', certification_scope: 'Sản xuất sản phẩm mẫu',
  certification_type_label: 'Đánh giá chứng nhận lần đầu', prepared_by: 'ĐIỀU PHỐI VIÊN',
  contact_phone: '0900000000', contact_email: 'qa@example.com',
};
const attendanceSlots = {};
for (let no = 1; no <= 9; no += 1) {
  attendanceSlots[`attendance_${no}_no`] = no;
  attendanceSlots[`attendance_${no}_full_name`] = no === 1 ? 'NGUYỄN VĂN A' : '\u200B';
  attendanceSlots[`attendance_${no}_department_title`] = no === 1 ? 'TRƯỞNG ĐOÀN' : '\u200B';
  attendanceSlots[`attendance_${no}_opening_mark`] = no === 1 ? 'X' : '\u200B';
  attendanceSlots[`attendance_${no}_closing_mark`] = no === 1 ? 'X' : '\u200B';
}
const monitoringSlots = {};
for (let no = 1; no <= 17; no += 1) {
  monitoringSlots[`monitoring_${no}_yes_mark`] = no <= 5 ? 'X' : '\u200B';
  monitoringSlots[`monitoring_${no}_no_mark`] = no <= 5 ? '\u200B' : 'X';
}
const fixtures = [
  ['F.07-P.09.attendance-record.template.docx', { ...common, ...attendanceSlots, opening_date: '04/09/2026', opening_time: '08:00', closing_date: '06/09/2026', closing_time: '16:30' }],
  ['F.15-P.09.audit-log.template.docx', { ...common, auditor_name: 'NGUYỄN VĂN A', auditor_code: 'AUD-001', audit_dates: '04/09/2026 - 06/09/2026', auditor_mandays: '3,0', role_team_leader_mark: '☑', role_auditor_mark: '☐', role_technical_expert_mark: '☐', role_other_mark: '☐', standard_iso9001_mark: '☑', standard_iso14001_mark: '☐', standard_iso45001_mark: '☐', standard_iso22000_mark: '☐', standard_haccp_mark: '☐', standard_gmp_mark: '☐', standard_other_mark: '☐', audit_type_stage1_mark: '☑', audit_type_stage2_mark: '☐', audit_type_surveillance_mark: '☐', audit_type_recertification_mark: '☐', audit_type_transfer_mark: '☐', audit_type_expansion_mark: '☐', audit_type_other_mark: '☐' }],
  ['F.17-P.09.audit-monitoring.template.docx', { ...common, ...monitoringSlots }],
];

for (const [file, data] of fixtures) {
  const output = path.join(temp, file.replace('.template', '.rendered'));
  engine.renderDocxTemplate({ templatePath: path.join(templateDir, file), outputPath: output, data });
  check(fs.existsSync(output) && fs.statSync(output).size > 10000, `${file} sinh được DOCX thực tế`);
  const xml = engine.readZipEntries(output).filter((e) => e.name.endsWith('.xml')).map((e) => e.data.toString('utf8')).join('\n');
  check(!/{{[^}]+}}/.test(xml), `${file} không còn placeholder sau khi sinh`);
}
fs.rmSync(temp, { recursive: true, force: true });

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
