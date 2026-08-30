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

const library = read('src/document-control/document-library.service.ts');
const controlled = read('src/document-control/document-control.service.ts');
const frontendRoot = [path.resolve(root, '../ctic-frontend'), path.resolve(root, '../frontend')].find((candidate) => fs.existsSync(candidate));
if (!frontendRoot) throw new Error('Không tìm thấy frontend sibling để kiểm tra UX');
const panel = fs.readFileSync(path.join(frontendRoot, 'app/components/ControlledDocumentPanel.tsx'), 'utf8');
const screen = fs.readFileSync(path.join(frontendRoot, 'app/components/DocumentsScreen.tsx'), 'utf8');

check(!library.includes('Người tạo không được tự xem xét'), 'Người tạo tài liệu nội bộ được phép tự xác nhận nội dung');
check(library.includes('không được tự phê duyệt tài liệu nội bộ'), 'Tài liệu nội bộ vẫn chặn tự phê duyệt');
check(!controlled.includes('Người tạo không được tự review biểu mẫu'), 'Người tạo mẫu được phép tự xác nhận nội dung');
check(controlled.includes('không được tự phê duyệt biểu mẫu'), 'Mẫu biểu vẫn chặn tự phê duyệt');
check(!controlled.includes('Người tạo không được tự review tài liệu'), 'Người tạo controlled document được phép tự xác nhận nội dung');
check(controlled.includes('không được tự phê duyệt tài liệu'), 'Controlled document vẫn chặn tự phê duyệt');

check(panel.includes('Mẫu biểu tự động') && panel.includes('Hồ sơ đã tạo'), 'Tên khu vực chính đơn giản, dễ hiểu');
check(panel.includes('Lưu & gửi xác nhận') && panel.includes('Lưu & đưa vào sử dụng'), 'Tạo tài liệu gộp tải file và bước tiếp theo');
check(panel.includes('Chọn tệp phiên bản mới trước khi lưu') && panel.includes('Cập nhật'), 'Cập nhật tài liệu thực hiện trong một modal');
check(panel.includes('Hủy bỏ / ngừng sử dụng') && panel.includes('/withdraw'), 'Hủy bỏ có luồng rõ ràng và giữ lịch sử');
check(panel.includes('Cần người khác phê duyệt'), 'UI giải thích rõ khi người hiện tại không được tự phê duyệt');
check(panel.includes('Trường dữ liệu tự động') && panel.includes('Mã chèn vào Word/Excel'), 'Template UX dùng ngôn ngữ nghiệp vụ thay cho jargon');
check(!panel.includes('Mẫu biểu & sinh hồ sơ') && !panel.includes('Xác nhận xem xét'), 'Loại bỏ nhãn thao tác cũ gây khó hiểu');
check(screen.includes('Kho tệp nghiệp vụ khác') && screen.includes('<Collapse'), 'Kho tệp phụ được thu gọn khỏi luồng chính');

const passed = checks.filter(Boolean).length;
console.log(`\nDOCUMENT CONTROL SIMPLIFIED UX: ${passed === checks.length ? 'PASS' : 'FAIL'} (${passed} pass, ${checks.length - passed} fail)`);
if (passed !== checks.length) process.exit(1);
