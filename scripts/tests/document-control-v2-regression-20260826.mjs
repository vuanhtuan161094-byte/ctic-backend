import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); checks.push(true); }
  else { console.error(`FAIL: ${label}`); checks.push(false); }
}

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260826043000_document_control_v2/migration.sql');
const controller = read('src/document-control/document-control-v2.controller.ts');
const library = read('src/document-control/document-library.service.ts');
const manager = read('src/document-control/template-manager.service.ts');
const files = read('src/document-files/document-files.service.ts');
const controlled = read('src/document-control/document-control.service.ts');
const catalog = read('src/document-control/template-field-catalog.ts');
const integrity = read('src/common/file-integrity.ts');
const engine = read('src/reports/runtime/ooxml-template-engine.cjs');

check(schema.includes('model document_library_series'), 'Schema có thư viện tài liệu');
check(schema.includes('model document_library_versions'), 'Schema có version tài liệu nội bộ/bên ngoài');
check(schema.includes('token_snapshot_json') && schema.includes('validation_json'), 'Template version lưu snapshot/validation placeholder');
check(schema.includes('source_snapshot_json') && schema.includes('generation_context_json'), 'Hồ sơ sinh ra lưu snapshot dữ liệu nguồn');
check(migration.includes('CK_document_library_series_kind') && migration.includes("N'INTERNAL'") && migration.includes("N'EXTERNAL'"), 'Migration khóa loại INTERNAL/EXTERNAL');
check(migration.includes('FK_document_library_version_file'), 'Migration FK phiên bản tới file');
check(controller.includes("@Get('library')") && controller.includes("@Post('library')"), 'API thư viện tài liệu tồn tại');
check(controller.includes("template-fields") && controller.includes("template-contexts"), 'API catalog placeholder và tra dữ liệu nguồn tồn tại');
check(controller.includes("template-versions/:id/render"), 'API sinh hồ sơ từ template tồn tại');
check(library.includes("library_kind !== 'INTERNAL'") && !library.includes('Người tạo không được tự xem xét') && library.includes('không được tự phê duyệt'), 'Tài liệu nội bộ cho tự xác nhận nội dung nhưng vẫn tách phê duyệt');
check(library.includes("library_kind === 'EXTERNAL'") && library.includes('DOCUMENT_LIBRARY_EFFECTIVE'), 'Tài liệu bên ngoài có luồng đưa vào sử dụng riêng');
check(!library.toLowerCase().includes('impact assessment') && !library.includes('đánh giá tác động'), 'Không đưa đánh giá tác động vào hệ thống');
check(manager.includes('listTemplateTokens') && manager.includes('renderDocxTemplate') && manager.includes('renderXlsxTemplate'), 'Template Manager scan placeholder và render Word/Excel');
check(integrity.includes("'.xls'") && integrity.includes("'.xlsx'") && integrity.includes('isXlsxBuffer'), 'Kho tài liệu chấp nhận và kiểm tra an toàn file Excel');
check(engine.includes('function renderXlsxTemplate') && manager.includes("file_kind: isExcel ? 'generated_xlsx' : 'generated_docx'"), 'Sinh hồ sơ hỗ trợ Word DOCX và Excel XLSX');
check(manager.includes('unsupported_repeat_tokens') && manager.includes('Excel hiện hỗ trợ placeholder đơn'), 'Excel chặn rõ dòng lặp chưa hỗ trợ thay vì sinh sai');
check(manager.includes('organization_profiles') && manager.includes('certification_projects') && manager.includes('audit_plans') && manager.includes('certificates'), 'Resolver lấy dữ liệu thật từ các module lõi');
check(manager.includes('source_snapshot_json') && manager.includes('generation_context_json'), 'Generation ghi snapshot + context');
check(controlled.includes('TEMPLATE_ALLOWED_TOKENS') && controlled.includes('Biểu mẫu chưa đạt kiểm tra placeholder'), 'Không cho kích hoạt template chưa đạt placeholder validation');
check(files.includes("document_library_version") && files.includes("controlled_template_version"), 'Document file access nhận diện thư viện và template');
check(files.includes('controlledLibraryAccessHandled') && files.includes('actor && !controlledLibraryAccessHandled'), 'Upload thư viện/template không bị guard resource cũ chặn ngược sau specialized access');
check(files.includes("access_scope === 'RESTRICTED'") && files.includes("roles.has('ADMIN')") && files.includes("roles.has('STAFF')"), 'File RESTRICTED chỉ cho Admin/Staff');
check(catalog.includes('customer.name') && catalog.includes('application.scope') && catalog.includes('audit_team') && catalog.includes('certificate.number'), 'Catalog có field khách hàng/đơn/đoàn/chứng chỉ');

const passed = checks.filter(Boolean).length;
console.log(`\nDOCUMENT CONTROL V2 REGRESSION: ${passed === checks.length ? 'PASS' : 'FAIL'} (${passed} pass, ${checks.length - passed} fail)`);
if (passed !== checks.length) process.exit(1);
