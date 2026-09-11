import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..', '..');
const projectRoot = path.resolve(backendRoot, '..');
const frontendRoot = path.join(projectRoot, 'ctic-frontend');
const enginePath = path.join(
  backendRoot,
  'src',
  'reports',
  'runtime',
  'ooxml-template-engine.cjs',
);
const engine = require(enginePath);

let pass = 0;
let fail = 0;

function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`✓ ${label}`);
  } else {
    fail += 1;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(relativePath, root = backendRoot) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath, root = backendRoot) {
  return fs.existsSync(path.join(root, relativePath));
}

function syntaxCheck(relativePath, root = backendRoot, jsx = false) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    esModuleInterop: true,
    ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
  };
  const output = ts.transpileModule(source, {
    compilerOptions,
    fileName: fullPath,
    reportDiagnostics: true,
  });
  return (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
}

console.log('=== PATCH 35B — HỒ SƠ WORD/PDF TRƯỚC ĐÁNH GIÁ ===');

const backendFiles = [
  'src/audit-documents/audit-documents.controller.ts',
  'src/audit-documents/audit-documents.module.ts',
  'src/audit-documents/audit-documents.service.ts',
  'src/audit-documents/dto/save-audit-document-data.dto.ts',
];
for (const file of backendFiles) {
  check(exists(file), `Có file backend ${file}`);
}

const controller = read('src/audit-documents/audit-documents.controller.ts');
const service = read('src/audit-documents/audit-documents.service.ts');
const queryContext = read('src/audit-documents/audit-document-query-context.service.ts');
const conversion = read('src/common/document-conversion.ts');
const moduleSource = read('src/audit-documents/audit-documents.module.ts');
const appModule = read('src/app.module.ts');
const copyAssets = read('scripts/copy-report-assets.cjs');

check(controller.includes("@Get('plan/:planId')"), 'Backend có API xem trước F.03/F.04/F.05');
check(controller.includes("@Patch('plan/:planId/data')"), 'Backend có API lưu ngôn ngữ, ngày lập và lịch trình');
check(controller.includes("@Post('plan/:planId/generate')"), 'Backend có API sinh Word/PDF');
check(controller.includes("'audit_program_f03'"), 'API hỗ trợ F.03-P.09');
check(controller.includes("'audit_team_assignment_f04'"), 'API hỗ trợ F.04-P.09');
check(controller.includes("'audit_plan_f05'"), 'API hỗ trợ F.05-P.09');
check(service.includes('document_generation'), 'Dữ liệu bổ sung F.05 được lưu trong audit_plans.form_data');
check(service.includes('registerGenerated'), 'Tài liệu sinh ra được đăng ký phiên bản trong document_files');
check(service.includes('generated_docx') && service.includes('generated_pdf'), 'Backend lưu riêng phiên bản Word và PDF');
check(service.includes('convertDocxToPdf') && conversion.includes('tryLibreOffice') && conversion.includes('tryMicrosoftWord'), 'PDF được chuyển từ chính DOCX bằng bộ chuyển đổi chung LibreOffice/Word');
check(service.includes("new Set([\n    'teamleader',\n    'leadauditor',\n    'auditor',"), 'Chỉ trưởng đoàn và đánh giá viên được tính man-day trong tài liệu');
check(!service.match(/COUNTED_MANDAY_ROLES[\s\S]{0,200}technicalexpert/), 'Chuyên gia kỹ thuật không bị tính man-day');
check(service.includes('cert_initial_mark') && service.includes('cert_recert_mark'), 'F.03 có dấu chọn loại chứng nhận động');
check(queryContext.includes("audit_type: 'project_team'"), 'F.04 lấy quyết định chỉ định đoàn ở cấp hồ sơ');
check(service.includes('this.projectTeamAppointment(plan)'), 'F.04 không phụ thuộc phân công riêng của từng PLAN');
check(moduleSource.includes('DocumentFilesModule'), 'Module hồ sơ dùng chung kho tài liệu');
check(appModule.includes('AuditDocumentsModule'), 'AuditDocumentsModule đã nối vào AppModule');
check(copyAssets.includes("assetDirectories = ['runtime', 'templates']"), 'Build tự copy toàn bộ mẫu Word mới sang dist');

for (const file of backendFiles) {
  const diagnostics = syntaxCheck(file);
  check(diagnostics.length === 0, `${file} không lỗi cú pháp TypeScript`, diagnostics.map((item) => item.messageText).join('; '));
}

const frontendFiles = [
  'app/components/AuditDocumentCenterModal.tsx',
  'app/components/AuditPlanWorkspaceDrawer.tsx',
  'app/components/CertificationProjectDetailScreen.tsx',
];
for (const file of frontendFiles) {
  check(exists(file, frontendRoot), `Có file frontend ${file}`);
  const diagnostics = syntaxCheck(file, frontendRoot, true);
  check(diagnostics.length === 0, `${file} không lỗi cú pháp TSX`, diagnostics.map((item) => item.messageText).join('; '));
}

const modal = read('app/components/AuditDocumentCenterModal.tsx', frontendRoot);
const drawer = read('app/components/AuditPlanWorkspaceDrawer.tsx', frontendRoot);
const projectDetail = read('app/components/CertificationProjectDetailScreen.tsx', frontendRoot);
check(modal.includes('Lịch trình chi tiết'), 'Frontend có trình soạn lịch trình chi tiết F.05');
check(modal.includes('Xuất Word') && modal.includes('Xuất PDF'), 'Frontend có nút xuất Word và PDF');
check(modal.includes('Phiên bản đã sinh'), 'Frontend hiển thị lịch sử phiên bản tài liệu');
check(modal.includes('timeout: documentType === \"audit_checklist_f06\" ? 600_000 : 150_000') || modal.includes('timeout: 150_000'), 'Xuất PDF có thời gian chờ phù hợp cho bộ chuyển đổi');
check(drawer.includes('Hồ sơ Word/PDF'), 'Không gian kế hoạch có nút mở trung tâm hồ sơ');
check(
  drawer.includes('Hồ sơ Word/PDF chính thức được quản lý ở danh sách thành phần hồ sơ theo kỳ')
    && projectDetail.includes('<AuditDocumentCenterModal')
    && projectDetail.includes('dossierDocumentSummaryQuery.refetch()'),
  'Hồ sơ chính thức thuộc danh mục dossier và workspace đồng bộ lại sau khi cập nhật',
);
check(drawer.includes('new Set(["team_leader", "lead_auditor", "auditor"])'), 'Frontend không tính MD cho chuyên gia kỹ thuật, quan sát viên và tập sự');

const templateDefinitions = [
  {
    filename: 'F.03-P.09.audit-program.template.docx',
    required: ['#events', '/events', 'event.type_dates_mandays', 'cert_initial_mark'],
  },
  {
    filename: 'F.04-P.09.audit-team-assignment.template.docx',
    required: ['#team', '/team', 'appointment_number', 'assignment_article'],
  },
  {
    filename: 'F.05-P.09.audit-plan-stage1.template.docx',
    required: ['#team', '/team', '#schedule', '/schedule', 'audit_dates'],
  },
  {
    filename: 'F.05-P.09.audit-plan-stage2.template.docx',
    required: ['#team', '/team', '#schedule', '/schedule', 'audit_dates'],
  },
];

const templateDir = path.join(backendRoot, 'src', 'reports', 'templates');
for (const definition of templateDefinitions) {
  const templatePath = path.join(templateDir, definition.filename);
  check(fs.existsSync(templatePath), `Có mẫu Word ${definition.filename}`);
  const tokens = engine.listTemplateTokens(templatePath);
  check(
    definition.required.every((token) => tokens.includes(token)),
    `${definition.filename} có đủ placeholder và vòng lặp`,
  );
  const allXml = engine.readZipEntries(templatePath)
    .filter((entry) => entry.name.endsWith('.xml'))
    .map((entry) => entry.data.toString('utf8'))
    .join('\n');
  check(!/cticlab\.com|CTIC VIETNAM/i.test(allXml), `${definition.filename} không gắn cứng CTIC/cticlab.com`);
}

const branding = {
  certification_body_short_name: 'CB',
  certification_body_name: 'TỔ CHỨC CHỨNG NHẬN MẪU / SAMPLE CERTIFICATION BODY',
  certification_body_website: 'https://example.org',
  certification_body_email: 'contact@example.org',
  certification_body_phone: '+84 225 123 456',
  certification_body_address: 'Hải Phòng, Việt Nam',
};
const team = [
  { team: { no: 1, full_name: 'NGUYỄN VĂN A', code: 'AUD-001', role: 'Trưởng đoàn đánh giá', contact: '0901000001' } },
  { team: { no: 2, full_name: 'TRẦN VĂN B', code: 'AUD-002', role: 'Chuyên gia đánh giá', contact: '0901000002' } },
];
const schedule = [
  { schedule: { time: '08:00-08:30', content: 'Họp khai mạc', auditor: 'Đoàn đánh giá', auditee: 'Ban lãnh đạo' } },
  { schedule: { time: '08:30-17:00', content: 'Đánh giá các quá trình và hiện trường', auditor: 'NGUYỄN VĂN A', auditee: 'Các bộ phận liên quan' } },
];
const common = {
  ...branding,
  customer_code: 'CUST001',
  organization_name_vi: 'CÔNG TY TNHH MẪU',
  organization_name_en: 'SAMPLE COMPANY LIMITED',
  organization_address: 'Hải Phòng, Việt Nam',
  organization_address_vi: 'Hải Phòng, Việt Nam',
  organization_address_en: 'Hai Phong, Vietnam',
  representative_name: 'NGUYỄN VĂN A',
  representative_position: 'Tổng giám đốc',
  representative_phone: '0901234567',
  representative_email: 'director@example.org',
  contact_name: 'TRẦN THỊ B',
  contact_position: 'Phụ trách hệ thống',
  contact_phone: '0912345678',
  contact_email: 'qa@example.org',
  effective_personnel: 100,
  shift_1: 40,
  shift_2: 35,
  shift_3: 25,
  cert_initial_mark: '☑',
  cert_extension_mark: '☐',
  cert_transfer_mark: '☐',
  cert_recert_mark: '☐',
  cert_other_mark: '☐',
  cycle_label: 'Chu kỳ 1',
  other_certification_type: '—',
  standard_list: 'ISO 9001:2015 + ISO 14001:2015',
  standard_name: 'ISO 9001:2015 + ISO 14001:2015',
  excluded_clauses: 'Không áp dụng',
  audit_criteria: 'Tiêu chuẩn, yêu cầu pháp luật và yêu cầu nội bộ',
  certification_scope: 'Sản xuất sản phẩm mẫu',
  site_1: 'Nhà máy 1, Hải Phòng',
  site_2: '—',
  site_3: '—',
  audit_location: 'Nhà máy 1, Hải Phòng',
  audit_objectives: 'Đánh giá sự phù hợp và hiệu lực của hệ thống quản lý',
  audit_type_label: 'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
  audit_dates: '04/09/2026 - 06/09/2026',
  audit_mandays: '5,5 MD',
  audit_language: 'Tiếng Việt',
  issue_date: '20/08/2026',
  team,
  schedule,
  team_leader_name: 'NGUYỄN VĂN A',
  confirmation_text: 'Tổ chức được chứng nhận xác nhận kế hoạch đánh giá.',
};

const fixtureData = {
  'F.03-P.09.audit-program.template.docx': {
    ...common,
    factor_1_status: '☑ Không/ No',
    factor_2_status: '☑ Không/ No',
    factor_3_status: '☑ Không/ No',
    factor_4_status: '☑ Có/ Yes',
    prepared_date: '20/08/2026',
    prepared_by: 'ĐIỀU PHỐI VIÊN',
    events: [
      { event: { no: 1, type_dates_mandays: 'Giai đoạn 1 - 5,5 MD', team: 'NGUYỄN VĂN A', contents: 'Đánh giá mức độ sẵn sàng', findings: 'Chưa thực hiện', corrective_actions: '—' } },
      { event: { no: 2, type_dates_mandays: 'Giai đoạn 2 - 20,0 MD', team: 'Chưa phân công', contents: 'Đánh giá chứng nhận', findings: 'Chưa thực hiện', corrective_actions: '—' } },
    ],
  },
  'F.04-P.09.audit-team-assignment.template.docx': {
    ...common,
    appointment_number: 'F04-2026-001',
    appointment_date: '20/08/2026',
    assignment_article: 'Chỉ định đoàn đánh giá cho Công ty TNHH Mẫu.',
    signer_title_vi: 'NGƯỜI CÓ THẨM QUYỀN',
    signer_title_en: 'Authorised Signatory',
    signer_name: 'TRẦN VĂN C',
  },
  'F.05-P.09.audit-plan-stage1.template.docx': {
    ...common,
    plan_title: 'KẾ HOẠCH ĐÁNH GIÁ GIAI ĐOẠN 1/ AUDIT PLAN STAGE 1',
    audit_type_label: 'Đánh giá chứng nhận lần đầu - Giai đoạn 1',
  },
  'F.05-P.09.audit-plan-stage2.template.docx': {
    ...common,
    plan_title: 'KẾ HOẠCH ĐÁNH GIÁ GIAI ĐOẠN 2/ AUDIT PLAN STAGE 2',
  },
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35b-'));
try {
  for (const definition of templateDefinitions) {
    const templatePath = path.join(templateDir, definition.filename);
    const outputPath = path.join(tempDir, definition.filename.replace('.template', '.rendered'));
    engine.renderDocxTemplate({
      templatePath,
      outputPath,
      data: fixtureData[definition.filename],
    });
    check(fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10_000, `${definition.filename} sinh được DOCX thực tế`);
    const renderedXml = engine.readZipEntries(outputPath)
      .filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry.name))
      .map((entry) => entry.data.toString('utf8'))
      .join('\n');
    check(!renderedXml.includes('{{'), `${definition.filename} không còn placeholder sau khi sinh`);
    check(renderedXml.includes('example.org'), `${definition.filename} dùng thương hiệu cấu hình động`);
    check(!/cticlab\.com|CTIC VIETNAM/i.test(renderedXml), `${definition.filename} không khôi phục nội dung thương hiệu cũ`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
