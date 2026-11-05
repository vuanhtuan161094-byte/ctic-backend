# Mở CMP DEMO

## Sử dụng

1. Đăng nhập Windows bằng tài khoản đã được cấp quyền đọc dữ liệu DEMO trên máy.
2. Nhấp đúp **CMP DEMO** trên Desktop. Trình khởi động sẽ kiểm tra cấu hình và SQL, dùng lại tiến trình hợp lệ hoặc khởi động runtime-only, rồi mở trình duyệt.
3. Nhấp đúp **CMP - Tài khoản DEMO** để chọn tài khoản. Cửa sổ chỉ hiện tên đăng nhập; chọn tài khoản rồi bấm **Chép mật khẩu** để chép mật khẩu vào clipboard.

## Nếu không mở được

- Thông báo không đọc được dữ liệu DEMO nghĩa là phiên Windows hiện tại chưa có quyền đọc tệp DEMO được bảo vệ. Hãy dùng tài khoản Windows đã được cấp quyền; không nới quyền cho `Users` hoặc `Everyone`.
- Lỗi kiểm tra SQL hoặc dịch vụ nghĩa là launcher đã dừng trước khi tạo hoặc sửa dữ liệu. Không chạy Gate A, migration hay seed để khắc phục lỗi mở ứng dụng.
- Không gửi mật khẩu, connection string, token hoặc ảnh chứa các giá trị này qua log hay GitHub.

CMP DEMO dùng dữ liệu sandbox và không phát hành chứng chỉ có hiệu lực pháp lý.
