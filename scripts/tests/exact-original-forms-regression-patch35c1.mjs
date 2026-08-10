import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFile), '..', '..');
const require = createRequire(import.meta.url);
const engine = require(path.join(
  backendRoot,
  'src',
  'reports',
  'runtime',
  'ooxml-template-engine.cjs',
));

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

const templateDir = path.join(backendRoot, 'src', 'reports', 'templates');
const servicePath = path.join(
  backendRoot,
  'src',
  'audit-documents',
  'audit-documents.service.ts',
);
const service = fs.readFileSync(servicePath, 'utf8');

const templates = {
  f07: path.join(templateDir, 'F.07-P.09.attendance-record.template.docx'),
  f15: path.join(templateDir, 'F.15-P.09.audit-log.template.docx'),
  f17: path.join(templateDir, 'F.17-P.09.audit-monitoring.template.docx'),
};

for (const [key, file] of Object.entries(templates)) {
  check(fs.existsSync(file), `${key.toUpperCase()} tồn tại`);
  const entries = engine.readZipEntries(file);
  check(
    entries.some((item) => /^word\/media\//.test(item.name)),
    `${key.toUpperCase()} giữ hình/logo từ biểu mẫu gốc`,
  );
  check(
    entries.some((item) => /^word\/header\d+\.xml$/.test(item.name)),
    `${key.toUpperCase()} giữ header gốc`,
  );
  check(
    entries.some((item) => /^word\/footer\d+\.xml$/.test(item.name)),
    `${key.toUpperCase()} giữ footer gốc`,
  );
}

const xml = (file) => engine
  .readZipEntries(file)
  .find((item) => item.name === 'word/document.xml')
  .data.toString('utf8');

const f07Xml = xml(templates.f07);
check(f07Xml.includes('Danh sách tham dự'), 'F07 giữ nguyên tiêu đề biểu mẫu gốc');
check(f07Xml.includes('Attendance Record'), 'F07 giữ nguyên tiêu đề tiếng Anh');
check((f07Xml.match(/<w:tr\b/g) ?? []).length === 14, 'F07 giữ đúng 13 dòng bảng chính và 1 dòng ký');
check(f07Xml.includes('{{attendance_9_full_name}}'), 'F07 có đủ 9 dòng người tham dự');
check(f07Xml.includes('{{opening_date}}'), 'F07 tự điền ngày họp khai mạc');
check(f07Xml.includes('{{closing_date}}'), 'F07 tự điền ngày họp kết thúc');
check(f07Xml.includes('{{audit_location}}'), 'F07 tự điền địa điểm đúng ô gốc');
check(!f07Xml.includes('Ký xác nhận/Signature'), 'F07 không tự thêm cột ngoài biểu mẫu gốc');

const f15Xml = xml(templates.f15);
check(f15Xml.includes('XÁC NHẬN ĐÁNH GIÁ'), 'F15 giữ nguyên tiêu đề biểu mẫu gốc');
check(f15Xml.includes('AUDIT LOG'), 'F15 giữ nguyên tiêu đề tiếng Anh');
check((f15Xml.match(/<w:tc\b/g) ?? []).length === 6, 'F15 giữ đúng ma trận 6 cột gốc');
check(f15Xml.includes('{{auditor_name}}'), 'F15 tự điền tên chuyên gia đúng vị trí');
check(f15Xml.includes('{{role_team_leader_mark}}'), 'F15 đánh dấu vai trò tại ô gốc');
check(f15Xml.includes('{{standard_iso9001_mark}}'), 'F15 đánh dấu tiêu chuẩn tại ô gốc');
check(f15Xml.includes('{{audit_type_stage1_mark}}'), 'F15 đánh dấu loại đánh giá tại ô gốc');
check(!f15Xml.includes('CHUYÊN GIA/ AUDITOR'), 'F15 không tự thêm bảng ký khác biểu mẫu gốc');

const f17Xml = xml(templates.f17);
check(f17Xml.includes('PHIẾU THEO DÕI QUÁ TRÌNH ĐÁNH GIÁ'), 'F17 giữ nguyên tiêu đề biểu mẫu gốc');
check(f17Xml.includes('AUDIT MONITORING SHEET'), 'F17 giữ nguyên tiêu đề tiếng Anh');
check((f17Xml.match(/<w:tr\b/g) ?? []).length === 19, 'F17 giữ đúng 19 dòng bảng gốc');
check(f17Xml.includes('{{monitoring_17_no_mark}}'), 'F17 giữ đủ dòng số 17');
check(f17Xml.includes('HỒ SƠ IN'), 'F17 giữ nguyên ghi chú HỒ SƠ IN');
check(f17Xml.includes('BẢN MỀM'), 'F17 giữ nguyên ghi chú BẢN MỀM');
check(!f17Xml.includes('NGƯỜI THEO DÕI/ MONITORED BY'), 'F17 không tự thêm khối ký ngoài biểu mẫu gốc');

check(service.includes('attendanceTemplateSlots'), 'Backend cấp dữ liệu cho 9 dòng F07 cố định');
check(service.includes('auditLogExactFormMarks'), 'Backend cấp dấu chọn đúng cấu trúc F15 gốc');
check(service.includes('index < 17') && service.includes('monitoring_${no}_yes_mark'), 'Backend cấp trạng thái đủ 17 dòng F17');
check(service.includes("role_technical_expert_mark"), 'Backend vẫn nhận diện chuyên gia kỹ thuật ở F15');
check(service.includes("contact_email: this.displayText"), 'Backend tự điền email bên được đánh giá vào F15');
check(service.includes('Mẫu F.07 gốc có tối đa 9 người'), 'Backend không âm thầm làm mất người tham dự vượt quá 9 dòng form gốc');

const sample = {
  organization_name_vi: 'CÔNG TY TNHH MẪU',
  audit_location: 'Nhà máy mẫu',
  opening_date: '01/09/2026',
  opening_time: '08:00',
  closing_date: '02/09/2026',
  closing_time: '16:30',
  issue_date: '28/08/2026',
  prepared_by: 'Nguyễn Văn A',
  auditor_name: 'Nguyễn Văn A',
  auditor_code: 'A.001',
  certification_scope: 'Sản xuất sản phẩm mẫu',
  audit_dates: '01/09/2026 - 02/09/2026',
  auditor_mandays: '2,0',
  organization_address: 'Địa chỉ mẫu',
  contact_phone: '0900000000',
  contact_email: 'qa@example.com',
  certification_body_name: 'CÔNG TY TNHH CTIC VIETNAM',
  certification_body_address: 'Hải Phòng, Việt Nam',
  certification_body_phone: '0225 3880588',
  certification_body_email: 'info@cticlab.com',
  customer_code: 'C0001',
  standard_name: 'ISO 9001:2015',
  certification_type_label: 'Đánh giá chứng nhận lần đầu',
  role_team_leader_mark: '☑',
  role_auditor_mark: '☐',
  role_technical_expert_mark: '☐',
  role_other_mark: '☐',
  standard_iso9001_mark: '☑',
  standard_iso14001_mark: '☐',
  standard_iso45001_mark: '☐',
  standard_iso22000_mark: '☐',
  standard_haccp_mark: '☐',
  standard_gmp_mark: '☐',
  standard_other_mark: '☐',
  audit_type_stage1_mark: '☑',
  audit_type_stage2_mark: '☐',
  audit_type_surveillance_mark: '☐',
  audit_type_recertification_mark: '☐',
  audit_type_transfer_mark: '☐',
  audit_type_expansion_mark: '☐',
  audit_type_other_mark: '☐',
};
for (let no = 1; no <= 9; no += 1) {
  sample[`attendance_${no}_no`] = no;
  sample[`attendance_${no}_full_name`] = no === 1 ? 'Nguyễn Văn A' : '\u200B';
  sample[`attendance_${no}_department_title`] = no === 1 ? 'Trưởng đoàn' : '\u200B';
  sample[`attendance_${no}_opening_mark`] = no === 1 ? 'X' : '\u200B';
  sample[`attendance_${no}_closing_mark`] = no === 1 ? 'X' : '\u200B';
}
for (let no = 1; no <= 17; no += 1) {
  sample[`monitoring_${no}_yes_mark`] = no <= 5 ? 'X' : '\u200B';
  sample[`monitoring_${no}_no_mark`] = no <= 5 ? '\u200B' : 'X';
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35c1-'));
for (const [key, templatePath] of Object.entries(templates)) {
  const outputPath = path.join(tempDir, `${key}.docx`);
  engine.renderDocxTemplate({ templatePath, outputPath, data: sample });
  check(fs.statSync(outputPath).size > 20000, `${key.toUpperCase()} sinh được DOCX thực tế`);
  const outputXml = xml(outputPath);
  check(!/{{\s*[#/A-Za-z0-9_.]+\s*}}/.test(outputXml), `${key.toUpperCase()} không còn placeholder sau khi sinh`);
}
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
