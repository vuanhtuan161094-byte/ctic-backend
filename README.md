# CTIC Certification Management Platform

Backend quản lý quy trình chứng nhận hệ thống quản lý P.09 của CTIC VIETNAM.

## Công nghệ

- NestJS 11, TypeScript
- Prisma 7 với `PrismaMssql`
- Microsoft SQL Server
- JWT, RBAC theo role và permission
- Swagger/OpenAPI

## Phạm vi hiện tại

Backend đã có các luồng chính của P.09: khách hàng, đăng ký và xem xét đăng ký, hợp đồng/thỏa thuận, dự án chứng nhận, tính man-day, chương trình và kế hoạch đánh giá, chỉ định đoàn, báo cáo/NC-CAP, thẩm xét kỹ thuật, quyết định, thông báo kết quả, chứng chỉ, QR/PDF công khai, dashboard, cảnh báo, hồ sơ dự án, chuyên gia/năng lực và nhật ký hệ thống.

P.10, P.11 và P.13 chưa thuộc đợt triển khai hiện tại. Chữ ký số là tùy chọn sau này; hiện hành động xác nhận được ghi nhận theo tài khoản đăng nhập.

## Cài đặt

```powershell
npm install
```

Tạo `.env` với tối thiểu:

```env
DATABASE_URL="sqlserver://localhost:1433;database=CTIC_Certification;user=YOUR_USER;password=YOUR_PASSWORD;trustServerCertificate=true"
JWT_SECRET="CHANGE_ME"
JWT_EXPIRES_IN="15m"
CORS_ORIGINS="http://localhost:5173,http://localhost:3001"
SWAGGER_ENABLED="true"
```

Không commit `.env`, file backup cơ sở dữ liệu hoặc thư mục `uploads`.

## Chạy hệ thống

```powershell
# Phát triển
npm run start:dev

# Build
npm run build

# Production
$env:NODE_ENV="production"
npm run start:prod
```

Mặc định backend chạy tại `http://localhost:3000`.

## Swagger

Khi backend đang chạy và Swagger được bật:

```text
http://localhost:3000/api-docs
```

Đăng nhập bằng `POST /auth/login`, sao chép `access_token`, bấm **Authorize** và dán token.

## Kiểm tra

```powershell
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:smoke
npm run build
```

## Tệp hồ sơ

- Tệp được lưu vật lý trong `uploads/documents` và không được công khai trực tiếp.
- API nội bộ tải/mở tệp: `GET /document-files/:id/download` (cần JWT và `documents.read`).
- API phản hồi của module document-files có thêm `download_url` để frontend sử dụng.
- PDF chứng chỉ dùng cho QR vẫn công khai qua `GET /public/certificates/:verificationCode/pdf` và có kiểm tra trạng thái chứng chỉ.

## Prisma migration và seed

Baseline hiện tại nằm tại:

```text
prisma/migrations/00000000000000_baseline/migration.sql
```

Với cơ sở dữ liệu CTIC hiện có, sau khi sao lưu và xác nhận schema khớp, chỉ đánh dấu baseline đã áp dụng một lần:

```powershell
npx prisma migrate resolve --applied 00000000000000_baseline
```

Không chạy migration baseline trực tiếp lên database đang có dữ liệu.

Lưu ý ngày 01/08/2026: phép so sánh read-only cho thấy database hiện tại còn lệch một số `DEFAULT constraint` so với `schema.prisma`. Vì vậy chưa chạy lệnh `migrate resolve` trên database thật. Cần tạo bản sao staging, đồng bộ các default constraint và kiểm tra lại trước khi chính thức nhận baseline.

Với database mới, rỗng:

```powershell
npm run db:migrate:deploy
npm run db:seed
```

Seed chỉ đồng bộ role, permission và liên kết RBAC theo kiểu idempotent; không tạo tài khoản admin và không xóa quyền ngoài danh sách.

## Sao lưu SQL Server

Mở `scripts/backup-database.sql` trong SSMS, sửa `@BackupDirectory` thành thư mục mà tài khoản dịch vụ SQL Server có quyền ghi, rồi Execute. Script dùng `CHECKSUM` và tự chạy `RESTORE VERIFYONLY` để kiểm tra file backup.

Nên sao lưu cả:

- Database `CTIC_Certification`
- Thư mục `uploads/documents`
- File `.env` bằng kho bí mật riêng

## Quy tắc triển khai

1. Sao lưu database và uploads.
2. Chạy `npm install` và `npm run build`.
3. Chạy `npm run db:migrate:deploy` cho các migration mới (sau khi baseline đã được đánh dấu).
4. Chạy unit test, e2e test và smoke test.
5. Khởi động bằng `npm run start:prod` với `NODE_ENV=production`.
6. Kiểm tra `/health/live`, `/health`, đăng nhập và luồng QR/PDF chứng chỉ.
