import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');

let ts;
try {
  const typescriptPath = require.resolve('typescript', { paths: [root] });
  ts = require(typescriptPath);
} catch (error) {
  throw new Error(
    'Không tìm thấy package TypeScript cục bộ của backend. Hãy chạy npm install (hoặc npm ci) trong ctic-backend rồi chạy lại regression.',
    { cause: error },
  );
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let pass = 0;
let fail = 0;
function check(condition, label) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
}

const integritySource = read('src/common/file-integrity.ts');
const uploadSource = read('src/common/upload-security.ts');
const docController = read('src/document-files/document-files.controller.ts');
const docService = read('src/document-files/document-files.service.ts');
const certController = read('src/certificates/certificates.controller.ts');
const certService = read('src/certificates/certificates.service.ts');
const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260810001500_patch36b5_document_file_integrity/migration.sql');

check(integritySource.includes('isPdfBuffer') && integritySource.includes("'%%EOF'"), 'PDF được kiểm tra header và EOF thực tế');
check(integritySource.includes('isPngBuffer') && integritySource.includes("'IHDR'"), 'PNG được kiểm tra signature và IHDR');
check(integritySource.includes('isJpegBuffer') && integritySource.includes('0xff, 0xd8, 0xff'), 'JPEG được kiểm tra SOI/EOI');
check(integritySource.includes('isLegacyDocBuffer') && integritySource.includes('0xd0, 0xcf, 0x11, 0xe0'), 'Word .doc cũ được kiểm tra OLE signature');
check(integritySource.includes('0x06054b50') && integritySource.includes('0x02014b50'), 'DOCX được parse ZIP central directory thay vì chỉ tin đuôi file');
check(integritySource.includes("'word/document.xml'") && integritySource.includes("'[Content_Types].xml'"), 'DOCX bắt buộc có cấu trúc OOXML Word');
check(integritySource.includes('200 * 1024 * 1024'), 'DOCX có ngưỡng chống gói nén bất thường/zip bomb');
check(integritySource.includes('sanitizeOriginalFileName') && integritySource.includes("replace(/\\\\/g, '/')"), 'Tên file client được loại path và ký tự điều khiển');
check(uploadSource.includes('.tempDirectory') && uploadSource.includes("`${randomUUID()}.upload`"), 'Upload đi vào vùng temp trước, không ghi thẳng vào documents');
check(uploadSource.includes('TempUploadCleanupInterceptor'), 'Có interceptor dọn file temp khi DTO/handler lỗi');
check(uploadSource.includes('EXTENSIONS_BY_FILE_KIND') && uploadSource.includes("signed_scan: ['.pdf']"), 'PDF ký/chốt bị khóa đúng loại PDF');
check(docController.includes('createSecureUploadOptions()') && docController.includes('TempUploadCleanupInterceptor'), 'Upload hồ sơ dùng pipeline bảo mật chung');
check(certController.includes("createSecureUploadOptions(['.pdf'])") && certController.includes('TempUploadCleanupInterceptor'), 'Upload chứng chỉ chỉ nhận PDF qua pipeline chung');
check(!docController.includes('diskStorage(') && !certController.includes('diskStorage('), 'Controller không còn tự cấu hình Multer rời rạc');
check(docService.indexOf('validateUploadedFile(') < docService.indexOf('promoteValidatedUpload('), 'Nội dung file được xác minh trước khi promote vào documents');
check(docService.includes('sha256: validated.sha256'), 'SHA-256 được lưu cùng phiên bản hồ sơ');
check(docService.includes('verifyStoredFileIntegrity('), 'Download hồ sơ kiểm tra toàn vẹn trước khi trả file');
check(docService.includes('if (!documentFile.sha256)') && docService.includes('data: { sha256 }'), 'Hồ sơ cũ tự neo SHA-256 ở lần tải đầu sau khi size vẫn khớp');
check(certService.includes('documentFilesService.getDownload('), 'PDF chứng chỉ công khai dùng cùng luồng download có kiểm tra toàn vẹn');
check(schema.includes('sha256    String? @db.NVarChar(64)'), 'Prisma có trường SHA-256 cho document_files');
check(migration.includes("COL_LENGTH(N'dbo.document_files', N'sha256')") && migration.includes('ADD [sha256] NVARCHAR(64) NULL'), 'Migration 36B.5 bổ sung SHA-256 an toàn/idempotent');

// Chạy logic nhận diện nội dung thực tế bằng module thuần Node sau khi transpile TS.
const transpiled = ts.transpileModule(integritySource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;

const compileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-integrity-compile-'));
const compiledPath = path.join(compileDir, 'file-integrity.cjs');
fs.writeFileSync(compiledPath, transpiled);
const integrity = require(compiledPath);

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-integrity-data-'));
const write = (name, buffer) => {
  const filePath = path.join(testDir, name);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const pdfPath = write('signed.pdf', validPdf);
const inspectedPdf = integrity.inspectStoredFile(pdfPath, 'folder\\signed.pdf', 'application/octet-stream');
check(inspectedPdf.mimeType === 'application/pdf' && inspectedPdf.originalName === 'signed.pdf', 'PDF thật với MIME generic được chuẩn hóa và bỏ path client');
check(/^[a-f0-9]{64}$/.test(inspectedPdf.sha256), 'SHA-256 thực tế có đúng 64 ký tự hex');

let fakePdfRejected = false;
try {
  const fakePath = write('fake.pdf', Buffer.from('MZ-this-is-not-a-pdf'));
  integrity.inspectStoredFile(fakePath, 'fake.pdf', 'application/pdf');
} catch (error) {
  fakePdfRejected = error instanceof Error && error.message === 'CONTENT_EXTENSION_MISMATCH';
}
check(fakePdfRejected, 'File EXE/text đổi đuôi .pdf bị reject theo magic bytes');

let mimeMismatchRejected = false;
try {
  integrity.inspectStoredFile(pdfPath, 'signed.pdf', 'image/png');
} catch (error) {
  mimeMismatchRejected = error instanceof Error && error.message === 'MIME_EXTENSION_MISMATCH';
}
check(mimeMismatchRejected, 'MIME cụ thể không khớp extension bị reject');

const png = Buffer.alloc(24);
Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png, 0);
Buffer.from('IHDR').copy(png, 12);
check(integrity.isPngBuffer(png), 'PNG signature hợp lệ được nhận diện thực tế');

const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x01,0xff,0xd9]);
check(integrity.isJpegBuffer(jpeg), 'JPEG signature hợp lệ được nhận diện thực tế');

const doc = Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,0x00,0x00]);
check(integrity.isLegacyDocBuffer(doc), 'OLE Word .doc signature hợp lệ được nhận diện thực tế');

const docxBase64 = 'UEsDBBQAAAAIACqKCV3HHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwMEFAAAAAgAKooJXYLZHNUSAAAAEAAAAAsAAABfcmVscy8ucmVsc7MJSs1JLMnMzyvOyCwo1rcDAFBLAwQUAAAACAAqigld3VqGDQ8AAAANAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1ssym3SslPLs1NzSvRtwMAUEsBAhQDFAAAAAgAKooJXcccFzwKAAAACAAAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAAqigldgtkc1RIAAAAQAAAACwAAAAAAAAAAAAAAgAE7AAAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAAqigld3VqGDQ8AAAANAAAAEQAAAAAAAAAAAAAAgAF2AAAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAtAAAAAAA';
const validDocx = Buffer.from(docxBase64, 'base64');
check(integrity.isDocxBuffer(validDocx), 'DOCX ZIP/OOXML thật được nhận diện thực tế');

const fakeDocx = Buffer.from('PK\u0003\u0004[Content_Types].xml _rels/.rels word/document.xml');
check(!integrity.isDocxBuffer(fakeDocx), 'File giả chỉ chèn chuỗi OOXML nhưng không có central directory bị reject');

fs.rmSync(testDir, { recursive: true, force: true });
fs.rmSync(compileDir, { recursive: true, force: true });

console.log(`\nPatch 36B.5 upload/file integrity regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
