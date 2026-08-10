import fs from 'node:fs';
import path from 'node:path';

const backendRoot = path.resolve(import.meta.dirname, '../..');
const parent = path.dirname(backendRoot);
const frontendCandidates = [
  path.join(parent, 'ctic-frontend'),
  path.join(parent, 'frontend'),
  path.resolve(backendRoot, '../ctic-frontend'),
  path.resolve(backendRoot, '../frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app')),
);

if (!frontendRoot) {
  throw new Error('Không tìm thấy source frontend để chạy regression Patch 36B.2.');
}

let pass = 0;
let fail = 0;
const check = (condition, label) => {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
};

const read = (file) => fs.readFileSync(path.join(frontendRoot, file), 'utf8');
const client = read('app/lib/document-file-client.ts');

check(client.includes('inferDocumentMimeType'), 'Có helper suy luận MIME tài liệu dùng chung');
check(client.includes('application/pdf') && client.includes('extensionOf(filename)'), 'PDF được nhận diện cả theo MIME và phần mở rộng');
check(client.includes('previewDocumentFile') && client.includes('createLoadingWindow'), 'Preview mở cửa sổ trước khi chờ API để tránh popup blocker');
check(client.includes('downloadDocumentFile') && client.includes('anchor.download'), 'Download được tách riêng khỏi hành vi preview');
check(client.includes('openDocumentFile') && client.includes('isBrowserPreviewableDocument'), 'Nút Mở dùng quy tắc preview nếu hỗ trợ, tải nếu không hỗ trợ');
check(client.includes('application/octet-stream') && client.includes('new Blob([rawBlob], { type: mimeType })'), 'Blob MIME sai/thiếu được chuẩn hóa để PDF không bị tải xuống ngoài ý muốn');
check(client.includes('Tệp Word không thể xem trực tiếp ổn định'), 'Preview Word có thông báo rõ thay vì giả vờ xem trực tiếp');
check(client.includes('Trình duyệt đang chặn cửa sổ xem tài liệu'), 'Có thông báo thống nhất khi trình duyệt chặn popup');

const strictPreviewFiles = [
  'app/components/TechnicalReviewWorkspaceModal.tsx',
  'app/components/CertificateIssuanceWorkspaceModal.tsx',
  'app/components/CertificatesScreen.tsx',
];
check(
  strictPreviewFiles.every((file) => read(file).includes('previewDocumentFile')),
  'Các màn hình Xem PDF/thẩm xét dùng preview helper chung',
);

const downloadFiles = [
  'app/components/AuditDocumentCenterModal.tsx',
  'app/components/AuditExecutionWorkspaceModal.tsx',
  'app/components/CorrectiveActionWorkspaceModal.tsx',
  'app/components/CertificationResultWorkspaceModal.tsx',
];
check(
  downloadFiles.every((file) => read(file).includes('downloadDocumentFile')),
  'Các màn hình xuất/tải tài liệu dùng download helper chung',
);

const genericOpenFiles = [
  'app/components/DocumentsScreen.tsx',
  'app/components/CertificationProjectDetailScreen.tsx',
  'app/components/CommercialDocumentsPanel.tsx',
  'app/components/ScheduleResourcesScreen.tsx',
];
check(
  genericOpenFiles.every((file) => read(file).includes('openDocumentFile')),
  'Các nút Mở tệp dùng open helper chung',
);

const documentComponents = [
  ...strictPreviewFiles,
  ...downloadFiles,
  ...genericOpenFiles,
];
const documentComponentText = documentComponents.map(read).join('\n');
const documentBlobComponents = documentComponents
  .filter((file) => file !== 'app/components/ScheduleResourcesScreen.tsx')
  .map(read)
  .join('\n');
check(!documentBlobComponents.includes('URL.createObjectURL'), 'Component tài liệu không còn tự tạo Blob URL riêng lẻ');
check(!documentComponentText.includes('responseType: "blob"'), 'Component tài liệu không còn tự fetch Blob riêng lẻ');
check(!documentComponentText.includes('window.open("about:blank"'), 'Component tài liệu không còn tự xử lý popup riêng lẻ');

const project = read('app/components/CertificationProjectDetailScreen.tsx');
check(project.includes('isPdfDocument(file.original_name)') && project.includes('previewDocumentFile'), 'Hồ sơ chứng nhận ép nút Xem PDF đi đúng nhánh preview');

console.log(`\nPatch 36B.2 document file client regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
