# CTIC Certification Management Platform

## Mục tiêu hiện tại

Hoàn thiện backend quản lý chứng nhận hệ thống quản lý theo P.09 trước ngày 15/08/2026. P.10, P.11 và P.13 để giai đoạn sau.

## Công nghệ và kiến trúc

- NestJS + TypeScript
- Prisma 7 + PrismaMssql
- Microsoft SQL Server (`CTIC_Certification`)
- Modular monolith
- JWT + role + permission (RBAC)
- Swagger tại `/api-docs`

## Quyết định đã chốt

- Không thay đổi luồng nghiệp vụ P.09 nếu chưa được yêu cầu.
- Chữ ký số chưa bắt buộc; xác nhận bằng tài khoản và audit log là đủ trong giai đoạn hiện tại.
- Chứng chỉ được thiết kế bằng CorelDRAW và upload PDF chính thức.
- QR trỏ đến API PDF chứng chỉ công khai; các tệp nghiệp vụ khác phải có JWT và permission.
- Không xóa khách hàng; ưu tiên chuyển trạng thái inactive.

## Trạng thái backend

Đã triển khai:

- Auth, Users, role/permission, audit log
- Customers
- Certification Applications và Application Reviews
- Contracts và Certification Agreements
- Certification Projects và Project Scopes
- Manday Calculations theo R.01
- Audit Programs, Events, Plans và Team Appointments F.04
- Experts, Competencies, ISIC/NACE/IAF
- Reports, Findings và Corrective Actions
- Technical Reviews và Technical Review Report
- Document Files, upload thật và quản lý phiên bản
- Certification Decisions F.13
- Audit Result Notifications F.12
- Certificates, lịch sử trạng thái, thay thế/tái chứng nhận, QR/PDF
- Dashboard, Notifications, Project Dossier và Project Alerts
- Health check, Swagger, smoke test P.09

## Kiểm tra đã có

- Unit test cho Auth và Prisma bootstrap
- E2E liveness tại `/health/live`
- Smoke test P.09 trong `scripts/p09-smoke-test.ps1`
- Swagger bao phủ toàn bộ controller hiện tại

## Hạ tầng dữ liệu

- Baseline migration: `prisma/migrations/00000000000000_baseline`
- Seed RBAC: `prisma/seed.js`
- Backup SQL Server: `scripts/backup-database.sql`
- Upload nội bộ: `/document-files/:id/download`
- PDF chứng chỉ công khai: `/public/certificates/:verificationCode/pdf`

## Việc tiếp theo

1. Kiểm thử hồi quy đầy đủ bằng dữ liệu thật P.09.
2. Làm frontend MVP: đăng nhập, dashboard, khách hàng, dự án, lịch đánh giá, hồ sơ, thẩm xét và chứng chỉ.
3. Chuẩn hóa dữ liệu mẫu còn thiếu và đóng các cảnh báo hồ sơ thử nghiệm.
4. Thiết lập Git repository và CI build/test.
5. Chuẩn bị môi trường staging, backup định kỳ và quy trình restore thử nghiệm.

## Quy tắc làm việc với AI

- Kiểm tra code thực tế trong repository trước khi sửa.
- Chỉ sửa phần liên quan; không thay schema hoặc luồng nghiệp vụ khi chưa được phép.
- Build/test sau mỗi nhóm thay đổi.
- Khi hướng dẫn người dùng, ưu tiên code/lệnh hoàn chỉnh để copy và test.
