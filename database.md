# Database - CTIC_Certification

## Technology
- Database: Microsoft SQL Server
- ORM: Prisma
- Primary Key: UNIQUEIDENTIFIER (UUID)
- Naming: snake_case

---

## Core Business Tables

### customers
Thông tin khách hàng.

### contacts
Người liên hệ của khách hàng.

### contracts
Hợp đồng chứng nhận với khách hàng.

### certification_projects
Dự án chứng nhận (ISO, sản phẩm...).

### audit_plans
Kế hoạch đánh giá.

### reports
Báo cáo đánh giá.

### technical_reviews
Xem xét kỹ thuật báo cáo.

### certificates
Giấy chứng nhận được cấp.

---

## User & Permission Tables

### users
Tài khoản người dùng.

### roles
Vai trò hệ thống (ADMIN, AUDITOR, STAFF...).

### permissions
Danh sách quyền.

### user_roles
Liên kết nhiều-nhiều giữa users và roles.

### role_permissions
Liên kết nhiều-nhiều giữa roles và permissions.

### user_sessions
Lưu refresh token và phiên đăng nhập.

---

## Workflow & Audit Tables

### workflow_approvals
Quy trình phê duyệt nhiều bước.

### audit_logs
Nhật ký thao tác hệ thống.

---

## Expert Management

### experts
Quản lý chuyên gia đánh giá.

---

## Main Relationships

customers (1) ─── (N) contacts
customers (1) ─── (N) contracts
contracts (1) ─── (N) certification_projects
certification_projects (1) ─── (N) audit_plans
audit_plans (1) ─── (N) reports
reports (1) ─── (N) technical_reviews
technical_reviews (1) ─── (1) certificates

users (N) ─── (N) roles       [user_roles]
roles (N) ─── (N) permissions [role_permissions]

users (1) ─── (N) workflow_approvals
users (1) ─── (N) audit_logs
users (1) ─── (N) user_sessions

---

## Certification Process Flow

Customer
  ↓
Contract
  ↓
Certification Project
  ↓
Audit Plan
  ↓
Report
  ↓
Technical Review
  ↓
Certificate

---

## Important Constraints

- customers.customer_code: UNIQUE
- customers.tax_code: UNIQUE
- contracts.contract_number: UNIQUE
- certification_projects.project_code: UNIQUE
- certificates.cert_number: UNIQUE
- users.username: UNIQUE
- users.email: UNIQUE
- experts.email: UNIQUE

---

## Recommended Enums (Future)

CustomerStatus: active | inactive
ProjectStatus: planning | auditing | review | certified | closed
CertificateStatus: active | suspended | withdrawn | expired
WorkflowStatus: pending | approved | rejected
UserStatus: active | locked | inactive

---

## Notes

- Hiện tại các trường status đang dùng NVARCHAR.
- Có thể chuyển sang enum trong Prisma ở phiên bản tiếp theo.
- Cấu trúc đã hỗ trợ cả chứng nhận ISO và chứng nhận sản phẩm.
- workflow_approvals đủ để xây dựng quy trình ký số và phê duyệt nhiều cấp.