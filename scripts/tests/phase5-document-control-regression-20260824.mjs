import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let failed = 0;

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260824150000_document_control_core/migration.sql');
const service = read('src/document-control/document-control.service.ts');
const controller = read('src/document-control/document-control.controller.ts');
const fileService = read('src/document-files/document-files.service.ts');
const uploadSecurity = read('src/common/upload-security.ts');
const reportDocuments = read('src/reports/report-documents.service.ts');
const auditDocuments = read('src/audit-documents/audit-documents.service.ts');
const certificateService = read('src/certificates/certificates.service.ts');
const customerDocuments = read('src/customer-documents/customer-documents.service.ts');
const experts = read('src/experts/experts.service.ts');

check('Template series/revision tách khỏi DocumentFile', /model controlled_template_series/.test(schema) && /model controlled_template_versions/.test(schema));
check('Document instance/version/action là các record riêng', /model controlled_documents/.test(schema) && /model controlled_document_versions/.test(schema) && /model controlled_document_actions/.test(schema));
check('File bytes vẫn reuse DocumentFile', /source_file\s+DocumentFile/.test(schema) && /official_file\s+DocumentFile/.test(schema));
check('Template revision unique trong series', /@@unique\(\[series_id, revision_no\]/.test(schema));
check('Document version unique trong instance', /@@unique\(\[document_id, version_no\]/.test(schema));
check('Migration 24 additive, không sửa migration cũ', /CREATE TABLE \[dbo\]\.\[controlled_template_series\]/.test(migration) && /CREATE TABLE \[dbo\]\.\[controlled_documents\]/.test(migration));
check('Nullable file links dùng filtered unique indexes', /WHERE \[source_file_id\] IS NOT NULL/.test(migration) && /WHERE \[official_file_id\] IS NOT NULL/.test(migration));
check('Template effective supersedes revision cũ, không delete', /status: 'SUPERSEDED'/.test(service) && !/controlled_template_versions\.delete/.test(service));
check('Tài liệu snapshot exact template code/revision', /template_version_id: template\?\.id/.test(service) && /template_revision: template\?\.revision_label/.test(service));
check('Number allocation dùng SERIALIZABLE + atomic SQL MERGE/HOLDLOCK/OUTPUT', /TransactionIsolationLevel\.Serializable/.test(service) && /MERGE \[dbo\]\.\[controlled_number_sequences\] WITH \(HOLDLOCK\)/.test(service) && /OUTPUT inserted\.\[prefix\], inserted\.\[next_value\]/.test(service));
check('Number namespace canonical theo prefix + year, không tách series ẩn gây duplicate', /const seriesKey = requestedPrefix/.test(service));
check('Transient ENOTBEGUN retry toàn SERIALIZABLE transaction', /isTransactionNotBegunError/.test(service) && /transaction has not begun/.test(service));
check('Official PDF không thể silently overwrite', /Official PDF đã tồn tại; phải tạo controlled version mới/.test(service));
check('Signature acknowledgement bind exact SHA-256', /signed_sha256: file\.sha256/.test(service) && /signed_by: actorId/.test(service));
check('Correction sau issue tạo replacement version', /previous_version_id: current\.id/.test(service) && /CREATE_REPLACEMENT_VERSION/.test(service));
check('Withdraw/void giữ history và không tái sử dụng number', /withdrawTemplate/.test(service) && /voidDocumentVersion/.test(service) && !/controlled_number_sequences\.delete/.test(service));
check('Issued/effective không có content update API', !/@Patch/.test(controller) && !/@Put/.test(controller));
check('CUSTOMER không nằm trong internal document-control roles', !/CUSTOMER/.test(controller));
check('Internal controlled documents vẫn resource-scoped server-side', /assertDocumentEntityAccess/.test(service) && /filterDocumentEntities/.test(service));
check('Secure file pipeline vẫn magic-byte, SHA-256 và download integrity', /validateUploadedFile/.test(fileService) && /verifyStoredFileIntegrity/.test(fileService) && /sha256/.test(fileService) && /inspectStoredFile/.test(uploadSecurity));
check('OOXML/report generation block missing required data', /Không thể sinh báo cáo khi còn thiếu trường bắt buộc/.test(reportDocuments) && /Không thể sinh tài liệu khi còn thiếu trường bắt buộc/.test(auditDocuments));
check('Certificate exact-version lifecycle vẫn giữ nguyên', /certificate_series_id/.test(certificateService) && /supersedes_certificate_id/.test(certificateService));
check('Phase 3 customer document flow vẫn dùng service riêng', /customer_document_requests/.test(customerDocuments) && !/controlled_documents/.test(customerDocuments));
check('Phase 4 evidence vẫn là attachment, không bị migrate thành controlled document', /documentFile/.test(experts) && !/controlled_documents/.test(experts));

console.log(`\nPhase 5 document control regression: ${24 - failed}/24 PASS`);
if (failed) process.exitCode = 1;
