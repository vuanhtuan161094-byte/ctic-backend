import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

function resolveFrontendRoot() {
  const candidates = [
    path.resolve(backendRoot, '../ctic-frontend'),
    path.resolve(backendRoot, '../frontend'),
    path.resolve(process.cwd(), '../ctic-frontend'),
    path.resolve(process.cwd(), '../frontend'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'app', 'components', 'CertificationResultWorkspaceModal.tsx'))) {
      return candidate;
    }
  }

  const parent = path.dirname(backendRoot);
  if (fs.existsSync(parent)) {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(parent, entry.name);
      if (fs.existsSync(path.join(candidate, 'app', 'components', 'CertificationResultWorkspaceModal.tsx'))) {
        return candidate;
      }
    }
  }

  throw new Error(
    `Không tìm thấy thư mục frontend. Đã kiểm tra các thư mục cạnh backend: ${candidates.join(', ')}`,
  );
}

const frontendRoot = resolveFrontendRoot();
let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    console.log(`✓ ${label}`);
    pass += 1;
  } else {
    console.log(`✗ ${label}`);
    fail += 1;
  }
}

function read(relative) {
  return fs.readFileSync(path.join(backendRoot, relative), 'utf8');
}
function readFront(relative) {
  return fs.readFileSync(path.join(frontendRoot, relative), 'utf8');
}
function loadTypeScript() {
  try {
    const typescriptPath = require.resolve('typescript', { paths: [backendRoot] });
    return require(typescriptPath);
  } catch (error) {
    throw new Error(
      'Không tìm thấy package TypeScript cục bộ của backend. Hãy chạy npm install (hoặc npm ci) trong ctic-backend rồi chạy lại regression.',
      { cause: error },
    );
  }
}
const ts = loadTypeScript();

function syntax(relative, frontend=false) {
  const full = path.join(frontend ? frontendRoot : backendRoot, relative);
  const source = fs.readFileSync(full, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: full,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      experimentalDecorators: true,
    },
  });
  return !(result.diagnostics ?? []).some((item) => item.category === ts.DiagnosticCategory.Error);
}

console.log('=== PATCH 35H — KẾT QUẢ CHỨNG NHẬN F.12/F.13 ===');

const service = read('src/certification-results/certification-results.service.ts');
const controller = read('src/certification-results/certification-results.controller.ts');
const moduleText = read('src/certification-results/certification-results.module.ts');
const appModule = read('src/app.module.ts');
const decisionService = read('src/certification-decisions/certification-decisions.service.ts');
const projectService = read('src/certification-projects/certification-projects.service.ts');
const modal = readFront('app/components/CertificationResultWorkspaceModal.tsx');
const detail = readFront('app/components/CertificationProjectDetailScreen.tsx');
const css = readFront('app/globals.css');

check(syntax('src/certification-results/certification-results.service.ts'), 'Service kết quả chứng nhận không lỗi cú pháp');
check(syntax('src/certification-results/certification-results.controller.ts'), 'Controller kết quả chứng nhận không lỗi cú pháp');
check(syntax('src/certification-results/certification-results.module.ts'), 'Module kết quả chứng nhận không lỗi cú pháp');
check(syntax('src/certification-decisions/certification-decisions.service.ts'), 'Service quyết định không lỗi cú pháp');
check(syntax('src/certification-projects/certification-projects.service.ts'), 'Service hồ sơ dự án không lỗi cú pháp');
check(syntax('app/components/CertificationResultWorkspaceModal.tsx', true), 'Workspace kết quả frontend không lỗi cú pháp');
check(syntax('app/components/CertificationProjectDetailScreen.tsx', true), 'Màn hình hồ sơ frontend không lỗi cú pháp');

check(appModule.includes('CertificationResultsModule'), 'AppModule đã nạp CertificationResultsModule');
check(moduleText.includes('DocumentFilesModule'), 'Module kết quả dùng DocumentFilesModule để lưu phiên bản');
check(controller.includes("@Get('plan/:planId/workspace')"), 'Có API workspace kết quả theo PLAN');
check(controller.includes("decision/:id/generate"), 'Có API sinh F.13 Word/PDF');
check(controller.includes("notification/:id/generate"), 'Có API sinh F.12 Word/PDF');
check(service.includes('certification_decision_f13'), 'F.13 lưu document_type riêng');
check(service.includes('audit_result_notification_f12'), 'F.12 lưu document_type riêng');
check(service.includes('F.13-P.09.certification-decision.template.docx'), 'Service dùng mẫu F.13');
check(service.includes('F.12-P.09.audit-result-notification.template.docx'), 'Service dùng mẫu F.12');
check(service.includes('registerGenerated'), 'Word/PDF được quản lý phiên bản trong document_files');
check(service.includes('convertToPdf'), 'PDF được chuyển từ chính Word snapshot');
check(service.includes('decision_history'), 'Workspace trả lịch sử F.13');
check(service.includes('notification_history'), 'Workspace trả lịch sử F.12');
check(service.includes('can_issue_decision'), 'Workspace trả điều kiện ban hành quyết định');
check(service.includes('can_issue_notification'), 'Workspace trả điều kiện lập thông báo');
check(service.includes('technical_review'), 'Workspace hiển thị kết quả thẩm xét');
check(service.includes('recommendation'), 'Workspace sử dụng kiến nghị thẩm xét');
check(service.includes('next_audit_due_date'), 'F.12 có dữ liệu kỳ đánh giá tiếp theo');
check(service.includes('surveillance_interval_months'), 'F.13 có chu kỳ giám sát');

check(decisionService.includes("report.status === 'stage1_completed'"), 'Quyết định chấp nhận Stage 1 đã nộp, không bắt F.11 cho GĐ1');
check(decisionService.includes('Stage 1 chưa có báo cáo đã nộp và hoàn thành'), 'Thông báo lỗi Stage 1 đúng workflow mới');
check(!decisionService.includes('Stage 1 chưa có báo cáo thẩm xét hoàn thành'), 'Đã bỏ yêu cầu thẩm xét kỹ thuật Stage 1 cũ');

check(projectService.includes('...decisions.map((item) => item.id)'), 'Hồ sơ dự án nạp file F.13 theo entity quyết định');
check(projectService.includes('...notifications.map((item) => item.id)'), 'Hồ sơ dự án nạp file F.12 theo entity thông báo');

check(modal.includes('Quyết định F.13'), 'Frontend có tab Quyết định F.13');
check(modal.includes('Thông báo F.12'), 'Frontend có tab Thông báo F.12');
check(modal.includes('/certification-decisions'), 'Frontend ban hành quyết định qua API nghiệp vụ');
check(modal.includes('/audit-result-notifications'), 'Frontend lập thông báo qua API nghiệp vụ');
check(modal.includes('mark-sent'), 'Frontend có thao tác ghi nhận đã gửi khách hàng');
check(modal.includes('Xuất Word'), 'Frontend có nút xuất Word');
check(modal.includes('Xuất PDF'), 'Frontend có nút xuất PDF');
check(modal.includes('Phiên bản F.13 đã sinh'), 'Frontend hiển thị lịch sử F.13');
check(modal.includes('Phiên bản F.12 đã sinh'), 'Frontend hiển thị lịch sử F.12');
check(modal.includes('Chỉ người ra quyết định'), 'Frontend giải thích quyền ban hành quyết định');
check(css.includes('.certification-result-form-grid'), 'Có layout riêng cho form kết quả chứng nhận');

check(detail.includes('CertificationResultWorkspaceModal'), 'Hồ sơ chứng nhận đã gắn workspace kết quả');
check(detail.includes('setCertificationResultWorkspace'), 'Dòng hồ sơ mở trực tiếp workspace kết quả');
check(detail.includes('"certification_decision"') && detail.includes('"audit_result_notification"') && detail.includes('return stage2 ?? null;'), 'Quyết định và thông báo khóa về PLAN GĐ2');
check(detail.includes('Mở kết quả'), 'Thành phần hồ sơ có nút Mở kết quả');
check(detail.includes('certification_decision_f13'), 'Bảng thành phần nhận lịch sử F.13');
check(detail.includes('audit_result_notification_f12'), 'Bảng thành phần nhận lịch sử F.12');

const f12 = path.join(backendRoot, 'src/reports/templates/F.12-P.09.audit-result-notification.template.docx');
const f13 = path.join(backendRoot, 'src/reports/templates/F.13-P.09.certification-decision.template.docx');
check(fs.existsSync(f12), 'Có mẫu F.12 đúng form gốc');
check(fs.existsSync(f13), 'Có mẫu F.13 đúng form gốc');

const enginePath = path.join(backendRoot, 'src/reports/runtime/ooxml-template-engine.cjs');
const engine = await import(pathToFileURL(enginePath).href);
const render = engine.renderDocxTemplate ?? engine.default?.renderDocxTemplate;
check(typeof render === 'function', 'OOXML engine tải được để sinh tài liệu thật');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35h-'));
const sample = {
  certification_body_name: 'CTIC VIETNAM COMPANY LIMITED',
  certification_body_website: 'http://www.cticlab.com',
  certification_body_email: 'info@cticlab.com',
  certification_body_phone: '+84-225-3880.588',
  certification_body_address: 'Hai Phong, Vietnam',
  organization_display_name: 'CÔNG TY TNHH TEST/ TEST CO., LTD',
  organization_address: 'Hai Phong, Vietnam',
  decision_number: 'QD-TEST-2026', decision_date: '08/06/2026',
  decision_title: 'Chứng nhận Hệ thống quản lý Chất lượng/ Quality management system',
  legal_basis_paragraph: 'Căn cứ pháp lý.', agreement_basis_paragraph: 'Căn cứ hợp đồng.',
  review_basis_paragraph: 'Căn cứ hồ sơ thẩm xét.', proposal_paragraph: 'Xét đề nghị.',
  management_system_paragraph: 'Có Hệ thống quản lý Chất lượng – QMS.',
  standard_paragraph: 'Phù hợp ISO 9001:2015.', certification_scope: 'Sản xuất sản phẩm nhựa',
  article2_paragraph: 'Điều 2.', surveillance_paragraph: 'Giám sát 12 tháng/lần.',
  validity_paragraph: 'Hiệu lực 08/06/2026 - 07/06/2029.', article3_paragraph: 'Điều 3.',
  notification_number: 'TB-TEST-2026', notification_date: '08/06/2026',
  greeting_paragraph: 'Lời chào.', audit_paragraph: 'Đã đánh giá.', basis_paragraph: 'Căn cứ kết quả.',
  result_paragraph: 'Kết quả phù hợp.', certificate_use_paragraph: 'Quy định sử dụng chứng nhận.',
  next_audit_paragraph: 'Giám sát dự kiến tháng 6 năm 2027.', closing_paragraph: 'Trân trọng thông báo.',
  signatory_title_vi: 'Tổng Giám đốc', signatory_title_en: 'General Director', signatory_name: 'HE YONG',
};
const out12 = path.join(temp, 'f12.docx');
const out13 = path.join(temp, 'f13.docx');
render({ templatePath: f12, outputPath: out12, data: sample });
render({ templatePath: f13, outputPath: out13, data: sample });
check(fs.existsSync(out12) && fs.statSync(out12).size > 10000, 'Engine sinh được F.12 DOCX thực tế');
check(fs.existsSync(out13) && fs.statSync(out13).size > 10000, 'Engine sinh được F.13 DOCX thực tế');

// Đọc trực tiếp một entry trong ZIP/DOCX bằng Node thuần để regression chạy được cả Windows,
// không phụ thuộc lệnh `unzip` của hệ điều hành.
const { inflateRawSync } = await import('node:zlib');

function readZipEntry(zipPath, wantedName) {
  const buffer = fs.readFileSync(zipPath);
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;

  let eocd = -1;
  const minEocd = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minEocd; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error(`Không tìm thấy EOCD trong ${zipPath}`);

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error(`Central directory không hợp lệ trong ${zipPath}`);
    }

    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');

    if (name === wantedName) {
      if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        throw new Error(`Local header không hợp lệ cho ${wantedName}`);
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      if (compression === 0) return compressed;
      if (compression === 8) return inflateRawSync(compressed);
      throw new Error(`Kiểu nén ZIP ${compression} chưa được hỗ trợ cho ${wantedName}`);
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Không tìm thấy ${wantedName} trong ${zipPath}`);
}

const f12Xml = readZipEntry(out12, 'word/document.xml').toString('utf8');
const f13Xml = readZipEntry(out13, 'word/document.xml').toString('utf8');
check(!f12Xml.includes('{{'), 'F.12 sau render không còn placeholder');
check(!f13Xml.includes('{{'), 'F.13 sau render không còn placeholder');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exitCode = fail ? 1 : 0;
