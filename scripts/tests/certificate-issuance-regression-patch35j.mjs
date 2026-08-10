import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');
const frontendCandidates = [
  path.resolve(backendRoot, '../ctic-frontend'),
  path.resolve(backendRoot, '../frontend'),
  path.resolve(backendRoot, '../../ctic-frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'app', 'components', 'CertificationProjectDetailScreen.tsx')),
);

let pass = 0;
let fail = 0;
function check(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`✓ ${message}`);
  } else {
    fail += 1;
    console.error(`✗ ${message}`);
  }
}
function read(base, relative) {
  return fs.readFileSync(path.join(base, relative), 'utf8');
}

console.log('=== PATCH 35J — CẤP & QUẢN LÝ GIẤY CHỨNG NHẬN ===');
check(Boolean(frontendRoot), 'Tìm được thư mục frontend');
if (!frontendRoot) process.exit(1);

const service = read(backendRoot, 'src/certificates/certificates.service.ts');
const controller = read(backendRoot, 'src/certificates/certificates.controller.ts');
const moduleFile = read(backendRoot, 'src/certificates/certificates.module.ts');
const dossierService = read(backendRoot, 'src/certification-projects/certification-projects.service.ts');
const modal = read(frontendRoot, 'app/components/CertificateIssuanceWorkspaceModal.tsx');
const detail = read(frontendRoot, 'app/components/CertificationProjectDetailScreen.tsx');
const certificatesScreen = read(frontendRoot, 'app/components/CertificatesScreen.tsx');
const css = read(frontendRoot, 'app/globals.css');

check(service.includes('getPlanIssuanceWorkspace(planId: string)'), 'Backend có workspace cấp chứng chỉ theo PLAN');
check(service.includes("Chưa có báo cáo đánh giá Giai đoạn 2."), 'Workspace kiểm tra báo cáo GĐ2');
check(service.includes("Thẩm xét kỹ thuật chưa hoàn thành."), 'Workspace kiểm tra thẩm xét kỹ thuật');
check(service.includes("Chưa ban hành Quyết định chứng nhận F.13."), 'Workspace kiểm tra F.13');
check(service.includes("Thông báo kết quả chưa được ghi nhận đã gửi khách hàng."), 'Workspace kiểm tra F.12 đã gửi');
check(service.includes("['certification_granted', 'certification_maintained']"), 'Chỉ kết quả phù hợp mới được cấp chứng chỉ');
check(service.includes('can_issue_certificate'), 'Workspace trả cờ đủ điều kiện cấp');
check(service.includes('buildCertificateNumberProposal'), 'Có đề xuất số chứng chỉ trung tính');
check(service.includes('`CERT-${year}-${sequence}`'), 'Số đề xuất dùng năm cấp và số thứ tự dự án, không gắn cứng thương hiệu CTIC');
check(service.includes("entity_type: 'certificate'"), 'Workspace lấy tài liệu theo entity certificate');
check(service.includes("certificate_status_histories.findMany"), 'Workspace trả lịch sử trạng thái chứng chỉ');
check(service.includes('certificate_status_histories.createMany'), 'Thay thế chứng chỉ cũ có ghi lịch sử');
check(service.includes("to_status: 'replaced'"), 'Lịch sử chứng chỉ cũ ghi trạng thái replaced');
check(service.includes('changedBy?: string'), 'Cấp chứng chỉ ghi nhận người thao tác khi thay thế bản cũ');

check(controller.includes("@Get('plan/:planId/workspace')"), 'Controller có API workspace theo PLAN');
check(controller.includes("@Post(':id/pdf')"), 'Controller có API tải PDF chính thức');
check(controller.includes("@Permissions('certificates.manage')"), 'Tải PDF dùng quyền quản lý chứng chỉ');
check(controller.includes("createSecureUploadOptions(['.pdf'])"), 'API chỉ nhận PDF cho giấy chứng nhận chính thức');
check(controller.includes("document_type: 'certificate_pdf'"), 'PDF được lưu đúng document_type');
check(controller.includes("file_kind: 'signed_scan'"), 'PDF chính thức được lưu dạng signed_scan');
check(moduleFile.includes('DocumentFilesModule'), 'CertificatesModule nạp DocumentFilesModule');

check(dossierService.includes('...certificates.map((item) => item.id)'), 'Dossier nạp file gắn trực tiếp với certificate');
check(dossierService.includes("['certificate_pdf']"), 'Trạng thái hồ sơ kiểm tra PDF chứng chỉ');
check(dossierService.includes("context.certificates.map((certificate) => certificate.id)"), 'Dossier kiểm tra PDF đúng certificate của kỳ');

check(modal.includes('KHÔNG GIAN CẤP GIẤY CHỨNG NHẬN'), 'Frontend có workspace cấp chứng chỉ riêng');
check(modal.includes('/certificates/plan/${planId}/workspace'), 'Frontend tải điều kiện cấp theo PLAN');
check(modal.includes('await api.post<CertificateRecord>("/certificates"'), 'Frontend cấp chứng chỉ qua API nghiệp vụ');
check(modal.includes('values.issue_date.format("YYYY-MM-DD")'), 'Frontend gửi ngày cấp chuẩn');
check(modal.includes('values.expire_date.format("YYYY-MM-DD")'), 'Frontend gửi ngày hết hạn chuẩn');
check(modal.includes('Ngày hết hạn phải sau ngày cấp'), 'Frontend kiểm tra thứ tự ngày hiệu lực');
check(modal.includes('await api.post(`/certificates/${certificate.id}/pdf`, data)'), 'Frontend tải PDF qua API chứng chỉ chuyên dụng');
check(modal.includes('accept="application/pdf,.pdf"'), 'Bộ chọn file chỉ nhận PDF');
check(modal.includes('QR chỉ được đưa vào sử dụng sau khi PDF chính thức được tải lên'), 'UI chặn sử dụng QR trước khi có PDF');
check(modal.includes('/public/certificates/${certificate.verification_code}/qr'), 'Workspace có QR tra cứu công khai');
check(modal.includes('/public/certificates/${certificate.verification_code}/pdf'), 'Workspace có link PDF công khai');
check(modal.includes('Tạo phiên bản PDF mới'), 'Cho phép cập nhật phiên bản PDF chứng chỉ');
check(modal.includes('workspace.history'), 'Workspace hiển thị lịch sử trạng thái');

check(detail.includes('CertificateIssuanceWorkspaceModal'), 'Hồ sơ chứng nhận đã tích hợp workspace cấp chứng chỉ');
check(detail.includes('setCertificateIssuancePlanId(plan.id)'), 'Dòng Giấy chứng nhận mở đúng PLAN GĐ2');
check(detail.includes('Mở chứng chỉ'), 'Thành phần hồ sơ có nút Mở chứng chỉ');
check(detail.includes('? "certificate_pdf"'), 'Phiên bản hiện hành của dòng chứng chỉ lấy certificate_pdf');
check(detail.includes('certificate: ["certificate", "certificate_pdf"]') || detail.includes('\"certificate\"].includes(normalize(record.document_key))'), 'Dòng chứng chỉ hỗ trợ hiển thị phiên bản hiện hành');

check(certificatesScreen.includes('&& Boolean(certificatePdf)'), 'Trang Chứng chỉ chỉ bật link QR công khai khi đã có PDF');
check(css.includes('.certificate-issuance-workspace'), 'Có CSS riêng cho workspace cấp chứng chỉ');
check(css.includes('.certificate-pdf-picker'), 'Có giao diện tải PDF riêng');

// Không thay đổi schema/migration ở Patch 35J.
const schema = read(backendRoot, 'prisma/schema.prisma');
check(schema.includes('model certificates {'), 'Tiếp tục dùng model certificates hiện có');
check(schema.includes('model certificate_status_histories {'), 'Tiếp tục dùng bảng lịch sử trạng thái hiện có');

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
