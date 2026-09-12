import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFile), '..', '..');
const projectRoot = path.resolve(backendRoot, '..');
const frontendRoot = fs.existsSync(path.join(projectRoot, 'ctic-frontend'))
  ? path.join(projectRoot, 'ctic-frontend')
  : path.join(projectRoot, 'frontend');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const engine = require(path.join(
  backendRoot,
  'src',
  'reports',
  'runtime',
  'ooxml-template-engine.cjs',
));

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
  const output = ts.transpileModule(source, {
    fileName: fullPath,
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
  return (output.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
}

console.log('\n=== PATCH 35G — THẨM XÉT KỸ THUẬT & F.11-P.09 ===');

const backendFiles = [
  'src/technical-reviews/technical-review-criteria.ts',
  'src/technical-reviews/dto/save-technical-review-workspace.dto.ts',
  'src/technical-reviews/technical-reviews.controller.ts',
  'src/technical-reviews/technical-reviews.module.ts',
  'src/technical-reviews/technical-reviews.service.ts',
  'src/audit-documents/audit-documents.controller.ts',
  'src/audit-documents/audit-documents.service.ts',
];
for (const file of backendFiles) {
  check(exists(file), `Có file backend ${file}`);
  const diagnostics = syntaxCheck(file);
  check(
    diagnostics.length === 0,
    `${file} không lỗi cú pháp TypeScript`,
    diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('; '),
  );
}

const frontendFiles = [
  'app/components/TechnicalReviewWorkspaceModal.tsx',
  'app/components/CertificationProjectDetailScreen.tsx',
  'app/components/AuditDocumentCenterModal.tsx',
];
for (const file of frontendFiles) {
  check(exists(file, frontendRoot), `Có file frontend ${file}`);
  const diagnostics = syntaxCheck(file, frontendRoot, true);
  check(
    diagnostics.length === 0,
    `${file} không lỗi cú pháp TSX`,
    diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('; '),
  );
}

const service = read('src/technical-reviews/technical-reviews.service.ts');
const reviewerPolicy = read('src/technical-reviews/technical-review-reviewer-policy.service.ts');
// Parse named production methods, not comments or unrelated methods.
function methodText(source, className, name) {
  const file = ts.createSourceFile('authority.ts', source, ts.ScriptTarget.Latest, true);
  const owner = file.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === className);
  const method = owner?.members.find((node) => name === 'constructor'
    ? ts.isConstructorDeclaration(node) : ts.isMethodDeclaration(node) && node.name?.getText(file) === name);
  return method ? ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, method, file) : '';
}
const reviewMethod = (name) => methodText(service, 'TechnicalReviewsService', name).replace(/\s+/g, '');
const controller = read('src/technical-reviews/technical-reviews.controller.ts');
const moduleSource = read('src/technical-reviews/technical-reviews.module.ts');
const auditService = read('src/audit-documents/audit-documents.service.ts');
const auditController = read('src/audit-documents/audit-documents.controller.ts');
const criteria = read('src/technical-reviews/technical-review-criteria.ts');
const workspace = read('app/components/TechnicalReviewWorkspaceModal.tsx', frontendRoot);
const projectScreen = read('app/components/CertificationProjectDetailScreen.tsx', frontendRoot);
const documentCenter = read('app/components/AuditDocumentCenterModal.tsx', frontendRoot);

check(controller.includes("@Get('plan/:planId/workspace')"), 'Có API lấy workspace thẩm xét theo PLAN');
check(
  controller.includes("@Post('plan/:planId/assign')") &&
    !controller.includes("@Post('plan/:planId/ensure')"),
  'Có API phân công thẩm xét theo PLAN và không còn self-claim',
);
check(controller.includes("@Patch(':id/workspace')"), 'Có API lưu dự thảo F.11');
check(controller.includes("@Post(':id/f11/generate')"), 'Có API sinh F.11 Word/PDF theo hồ sơ thẩm xét');
check(controller.includes("@Patch(':id/sync-documents')"), 'Có API đồng bộ tài liệu thẩm xét');
check(controller.includes("@Patch(':id/items/:documentKey')"), 'Có API kết luận từng hạng mục');
check(controller.includes("@Patch(':id/complete')"), 'Có API hoàn thành thẩm xét');
check(moduleSource.includes('AuditDocumentsModule'), 'TechnicalReviewsModule dùng chung engine Word/PDF');
check(moduleSource.includes('TechnicalReviewsService'), 'TechnicalReviewsService vẫn được export');

check(service.includes('assertReviewerIndependent'), 'Backend kiểm tra độc lập người thẩm xét');
check(methodText(reviewerPolicy, 'TechnicalReviewReviewerPolicyService', 'assertReviewerIndependent')
  .includes('Người thẩm xét không được là thành viên đoàn đánh giá'), 'Có thông báo rõ khi người thẩm xét thuộc đoàn');
check(/if\s*\(auditMember\)\s*\{\s*throw new BadRequestException/.test(methodText(reviewerPolicy, 'TechnicalReviewReviewerPolicyService', 'assertReviewerIndependent'))
  && methodText(reviewerPolicy, 'TechnicalReviewReviewerPolicyService', 'assertReviewerIndependent').replace(/\s+/g, '').includes('member.experts?.user_id===reviewerId'),
  'Reviewer policy chặn đúng user thuộc đoàn, không chỉ giữ message');
check(reviewMethod('constructor').includes('this.reviewerPolicyService=reviewerPolicyService??newTechnicalReviewReviewerPolicyService(prisma)')
  && /providers:\s*\[[^\]]*TechnicalReviewReviewerPolicyService/.test(moduleSource), 'Reviewer policy được inject và đăng ký provider');
check(reviewMethod('assertReviewerIndependent').includes('returnthis.reviewerPolicyService.assertReviewerIndependent(plan,reviewerId)'), 'Wrapper production delegate đúng plan/reviewer tới policy');
for (const flow of ['assignForPlan', 'reassign']) {
  check(reviewMethod(flow).includes('this.assertReviewerIndependent(context.plan,dto.reviewer_id)'), `${flow} vẫn kiểm độc lập trước phân công`);
}
check(reviewMethod('assertCanPerformReview').includes('this.assertReviewerIndependent(context.plan,review.reviewer_id)')
  && reviewMethod('assertCanPerformReview').includes('this.assertReviewerIndependent(context.plan,actorId)')
  && reviewMethod('complete').includes('awaitthis.assertCanPerformReview(id,actor)'), 'Complete giữ kiểm tra độc lập reviewer và người được ủy quyền');
check(service.includes('assertReportReady'), 'Backend kiểm tra báo cáo sẵn sàng thẩm xét');
check(service.includes('Còn ${unresolvedNc.length} NC chưa được đóng'), 'Backend chặn thẩm xét khi còn NC chưa đóng');
check(service.includes('PRELIMINARY_REVIEW_CRITERIA'), 'Backend dùng thư viện tiêu chí thẩm xét sơ bộ');
check(service.includes('TECHNICAL_REVIEW_CRITERIA'), 'Backend dùng thư viện tiêu chí thẩm xét kỹ thuật');
check((criteria.match(/key: 'preliminary_/g) ?? []).length === 19, 'F.11 có đúng 19 tiêu chí thẩm xét sơ bộ');
check((criteria.match(/key: 'technical_/g) ?? []).length === 4, 'F.11 có đúng 4 tiêu chí thẩm xét kỹ thuật');
check(service.includes('F.11 còn ${unanswered.length} tiêu chí'), 'Không hoàn thành khi còn tiêu chí F.11 chưa kết luận');
check(service.includes('Phải nhập lý do khi kiến nghị không cấp chứng nhận'), 'Không kiến nghị không cấp khi thiếu lý do');
check(service.includes("status: 'completed'"), 'Hoàn thành thẩm xét khóa hồ sơ');
check(service.includes("'technical_review_completed'"), 'Hoàn thành thẩm xét cập nhật trạng thái báo cáo');
check(service.includes("'generated_document'"), 'Checklist, danh sách họp và audit log được xem là biểu mẫu hệ thống');
check(service.includes('attachCurrentDocumentFiles'), 'Backend tự tìm phiên bản tài liệu hiện hành');
check(service.includes('Tài liệu có phiên bản mới; cần thẩm xét lại.'), 'Phiên bản tài liệu mới tự mở lại hạng mục đã chấp nhận');
check(service.includes("'audit_checklist_f06'"), 'Đồng bộ đúng checklist F.06');
check(service.includes("'audit_attendance_f07'"), 'Đồng bộ đúng danh sách tham dự F.07');
check(service.includes("'audit_log_f15'"), 'Đồng bộ đúng audit log F.15');
check(service.includes("'stage1_audit_report'"), 'Đồng bộ đúng báo cáo Giai đoạn 1');
check(service.includes("'stage2_audit_report'"), 'Đồng bộ đúng báo cáo Giai đoạn 2');

check(auditService.includes('buildTechnicalReviewDocument'), 'Engine tài liệu có bộ dựng F.11');
check(auditService.includes("requestType:\n                    'technical_review_report_f11'"), 'F.11 có định danh sinh tài liệu riêng');
check(auditService.includes("templateFile:\n                    'F.11-P.09.technical-review.template.docx'"), 'F.11 dùng đúng mẫu Word riêng');
check(auditService.includes('`preliminary_${index + 1}_yes_mark`'), 'Engine cấp dấu kết luận động cho đủ 19 tiêu chí sơ bộ');
check(auditService.includes('`technical_${index + 1}_yes_mark`'), 'Engine cấp dấu kết luận động cho đủ 4 tiêu chí kỹ thuật');
check(auditService.includes('recommendation_issue_mark'), 'Engine đánh dấu kiến nghị cấp chứng nhận');
check(auditService.includes('recommendation_not_issue_mark'), 'Engine đánh dấu kiến nghị không cấp chứng nhận');
check(auditController.includes("'technical_review_report_f11'"), 'API tài liệu công bố loại F.11');

check(workspace.includes('Không gian thẩm xét kỹ thuật'), 'Frontend có workspace thẩm xét riêng');
check(workspace.includes('Hồ sơ thẩm xét'), 'Workspace có tab hồ sơ thẩm xét');
check(workspace.includes('Thẩm xét sơ bộ'), 'Workspace có tab thẩm xét sơ bộ');
check(workspace.includes('Thẩm xét kỹ thuật'), 'Workspace có tab thẩm xét kỹ thuật');
check(workspace.includes('Kiến nghị & F.11 Word/PDF'), 'Workspace có tab kiến nghị và tài liệu F.11');
check(
  workspace.includes('Phân công người thẩm xét') &&
    !workspace.includes('Bắt đầu thẩm xét'),
  'Frontend dùng phân công người thẩm xét và không còn nút self-claim',
);
check(workspace.includes('Đồng bộ tài liệu'), 'Frontend có nút đồng bộ phiên bản hồ sơ');
check(workspace.includes('Chấp nhận'), 'Frontend cho chấp nhận từng hạng mục');
check(workspace.includes('Yêu cầu sửa'), 'Frontend cho yêu cầu sửa từng hạng mục');
check(workspace.includes('Lưu dự thảo F.11'), 'Frontend có lưu dự thảo F.11');
check(workspace.includes('Hoàn thành thẩm xét'), 'Frontend có hoàn thành thẩm xét');
check(workspace.includes('Xuất Word') && workspace.includes('Xuất PDF'), 'Frontend xuất F.11 Word và PDF');
check(workspace.includes('Phiên bản F.11-P.09 đã sinh'), 'Frontend hiển thị lịch sử F.11');
check(workspace.includes('/technical-reviews/plan/${planId}/workspace'), 'Frontend gọi API workspace theo PLAN');
check(workspace.includes('/f11/generate?format=${format}'), 'Frontend gọi API sinh F.11 đúng hồ sơ thẩm xét');
check(projectScreen.includes('TechnicalReviewWorkspaceModal'), 'Thành phần hồ sơ đã nối workspace thẩm xét');
check(
  projectScreen.includes('key === "technical_review_report"')
    && projectScreen.includes('setTechnicalReviewWorkspacePlanId(plan.id)')
    && projectScreen.includes('Thẩm xét'),
  'Dòng báo cáo thẩm xét có thao tác mở workspace riêng',
);
check(projectScreen.includes('technical_review_report_f11'), 'Bảng hồ sơ nhận diện mã biểu F.11');
check(documentCenter.includes('technical_review_report_f11'), 'Kiểu tài liệu frontend nhận diện F.11');

const templatePath = path.join(
  backendRoot,
  'src',
  'reports',
  'templates',
  'F.11-P.09.technical-review.template.docx',
);
check(fs.existsSync(templatePath), 'Có mẫu Word F.11-P.09');
const entries = engine.readZipEntries(templatePath);
const documentXml = entries.find((item) => item.name === 'word/document.xml')?.data.toString('utf8') ?? '';
check(entries.some((item) => /^word\/media\//.test(item.name)), 'F.11 giữ logo/hình ảnh từ form gốc');
check(entries.some((item) => /^word\/header\d+\.xml$/.test(item.name)), 'F.11 giữ header form gốc');
check(entries.some((item) => /^word\/footer\d+\.xml$/.test(item.name)), 'F.11 giữ footer form gốc');
check(documentXml.includes('BÁO CÁO THẨM XÉT'), 'F.11 giữ tiêu đề tiếng Việt gốc');
check(documentXml.includes('REVIEW REPORT'), 'F.11 giữ tiêu đề tiếng Anh gốc');
check(documentXml.includes('{{customer_code}}'), 'Mã khách hàng được điền động, không gắn C0218');
check(documentXml.includes('{{#team}}') && documentXml.includes('{{/team}}'), 'Bảng đoàn đánh giá lặp theo dữ liệu thực');
check(!documentXml.includes('>C0218<'), 'F.11 không còn mã khách hàng mẫu C0218');

const tokens = engine.listTemplateTokens(templatePath);
for (const required of [
  'customer_code',
  'organization_name_vi',
  'organization_name_en',
  'audit_location',
  'certification_scope',
  'audit_objectives',
  'standard_name',
  'audit_dates',
  'audit_mandays',
  'preliminary_19_yes_mark',
  'technical_4_yes_mark',
  'recommendation_issue_mark',
  'recommendation_not_issue_mark',
]) {
  check(tokens.includes(required), `Mẫu F.11 có placeholder ${required}`);
}

const sample = {
  customer_code: 'CUST001',
  organization_name_vi: 'CÔNG TY TNHH MẪU VIỆT NAM',
  organization_name_en: 'SAMPLE VIETNAM COMPANY LIMITED',
  organization_address: 'Hải Phòng, Việt Nam',
  audit_location: 'Nhà máy mẫu',
  certification_scope: 'Sản xuất sản phẩm mẫu',
  audit_objectives: 'Đánh giá sự phù hợp và hiệu lực của hệ thống quản lý.',
  audit_type_label: 'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
  standard_name: 'ISO 9001:2015 + ISO 14001:2015',
  excluded_clauses: 'Không có',
  audit_criteria: 'Tiêu chuẩn chứng nhận và tài liệu hệ thống của tổ chức.',
  audit_dates: '04/09/2026 - 06/09/2026',
  audit_mandays: '5,5 MD',
  audit_language: 'Tiếng Việt',
  team: [
    { team: { no: 1, full_name: 'NGUYỄN VĂN A', code: 'AUD-001', role: 'Trưởng đoàn đánh giá', contact: '0901000001' } },
    { team: { no: 2, full_name: 'TRẦN VĂN B', code: 'AUD-002', role: 'Chuyên gia đánh giá', contact: '0901000002' } },
  ],
  review_date: '06/09/2026',
  preliminary_other_comment: 'Hồ sơ đầy đủ.',
  preliminary_reviewer_name: 'NGUYỄN THỊ C',
  technical_other_comment: 'Kết quả phù hợp.',
  technical_reviewer_name: 'NGUYỄN THỊ C',
  recommendation_issue_mark: 'X',
  recommendation_not_issue_mark: '\u200B',
  recommendation_comment: 'Kiến nghị cấp chứng nhận.',
  recommendation_reviewer_name: 'NGUYỄN THỊ C',
};
for (let index = 1; index <= 19; index += 1) {
  sample[`preliminary_${index}_yes_mark`] = 'X';
  sample[`preliminary_${index}_no_mark`] = '\u200B';
}
for (let index = 1; index <= 4; index += 1) {
  sample[`technical_${index}_yes_mark`] = 'X';
  sample[`technical_${index}_no_mark`] = '\u200B';
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35g-f11-'));
const outputPath = path.join(tempDir, 'F11.docx');
engine.renderDocxTemplate({ templatePath, outputPath, data: sample });
check(fs.existsSync(outputPath) && fs.statSync(outputPath).size > 30000, 'Engine sinh được DOCX F.11 thực tế');
const outputEntries = engine.readZipEntries(outputPath);
const outputXml = outputEntries.find((item) => item.name === 'word/document.xml')?.data.toString('utf8') ?? '';
check(!/{{\s*[#/A-Za-z0-9_.]+\s*}}/.test(outputXml), 'DOCX F.11 sau sinh không còn placeholder');
check(outputXml.includes('CUST001'), 'DOCX F.11 điền đúng mã khách hàng');
check(outputXml.includes('NGUYỄN VĂN A') && outputXml.includes('TRẦN VĂN B'), 'DOCX F.11 điền đủ đoàn đánh giá');
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
