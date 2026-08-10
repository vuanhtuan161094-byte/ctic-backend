# CMP 36C.1a - Mô hình triển khai thương mại

## 1. Phạm vi sản phẩm

Mỗi bản cài đặt CMP phục vụ **một tổ chức chứng nhận duy nhất**.

- 1 application/backend riêng.
- 1 database riêng.
- 1 storage hồ sơ riêng.
- 1 bộ branding/cấu hình tổ chức riêng.
- Bên trong tổ chức đó có thể quản lý nhiều người dùng, chuyên gia, khách hàng và hồ sơ chứng nhận.

Không sử dụng kiến trúc dùng chung một database cho nhiều tổ chức chứng nhận. Dữ liệu nghiệp vụ chỉ thuộc tổ chức sở hữu bản cài đặt đó.

## 2. Hai tài khoản database

### Runtime account (`DATABASE_URL`)

Dùng hàng ngày bởi NestJS. Tài khoản này chỉ cần quyền nghiệp vụ cần thiết, thông thường `db_datareader` + `db_datawriter`. Production không nên có `db_owner`, `db_ddladmin`, `CREATE TABLE`, `ALTER` hoặc `DROP`.

### Migration account (`MIGRATION_DATABASE_URL`)

Chỉ dùng lúc cài đặt/nâng cấp. Khuyến nghị database roles:

- `db_ddladmin`
- `db_datareader`
- `db_datawriter`

Thông tin này nằm trong `.env.migration`, được `.gitignore`, và backend runtime không đọc để kết nối thường ngày.

## 3. Windows development hiện tại

Nếu chưa tạo migration account riêng, `STABILIZE_36C1A.cmd` có chế độ development an toàn:

1. Dùng Windows Authentication để mở kết nối quản trị database.
2. Tạm thêm runtime database user vào `db_ddladmin`, `db_datareader`, `db_datawriter` nếu thiếu.
3. Chạy baseline + migration + schema contract + build + regression.
4. Luôn thu hồi đúng các role đã thêm trong `finally`.
5. Không cấp `db_owner`.

Chế độ này bị cấm khi `NODE_ENV=production`.

## 4. Baseline database hiện hữu

Database đang có dữ liệu nhưng chưa có `_prisma_migrations` được xử lý theo trình tự:

1. Xác minh bảng/cột baseline thực sự đã tồn tại.
2. Chỉ đánh dấu `00000000000000_baseline` là applied.
3. Chạy thật các migration 35A.3, 36B.5, 36B.6 và 36C.1.
4. Chạy schema contract so `schema.prisma` với SQL Server vật lý.

Không dùng `migrate reset`, không xóa database, không giả đánh dấu các migration mới là applied.

## 5. Production

Production phải cấu hình `.env.migration` hoặc inject `MIGRATION_DATABASE_URL` từ secret manager/release pipeline. Migration nên chạy trong bước release trước khi backend instance mới nhận traffic. Sau migration, chỉ runtime account được dùng bởi ứng dụng.
