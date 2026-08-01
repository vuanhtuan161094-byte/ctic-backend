# SRS TỔNG HỢP – CTIC Certification Management Platform

## 1. THÔNG TIN DỰ ÁN

**Tên dự án:** Certification Management Platform (CMP)
**Đơn vị sử dụng:** CTIC VIETNAM
**Phiên bản:** 1.0
**Ngày cập nhật:** 18/07/2026
**Nguồn yêu cầu:** P.08, P.09, P.10, P.13, R.01

---

## 2. MỤC TIÊU HỆ THỐNG

Số hóa toàn bộ hoạt động chứng nhận của CTIC bao gồm:

- Đăng ký chứng nhận trực tuyến
- Quản lý hồ sơ và hợp đồng
- Tính man-day tự động
- Lập kế hoạch và phân công chuyên gia
- Đánh giá và lập báo cáo online
- Quản lý NC/CAP
- Thẩm xét và ra quyết định chứng nhận
- Phát hành chứng chỉ điện tử có ký số
- Nhắc hẹn giám sát và tái chứng nhận tự động
- Dashboard phân tích hiệu suất và nguồn lực

---

## 3. PHẠM VI GIAI ĐOẠN 1

### In Scope
- Chứng nhận hệ thống quản lý (P.09)
- Chứng nhận sản phẩm (P.10)
- Quản lý nhân sự và năng lực chuyên gia (P.08)
- Verification / Validation (P.13)
- Tính man-day theo R.01
- Ký số điện tử
- Dashboard cơ bản

### Out of Scope
- ERP kế toán
- HRM bên ngoài
- Mobile native riêng
- BI nâng cao

---

## 4. QUY TRÌNH NGHIỆP VỤ CHUẨN HÓA

Đăng ký → Xem xét đơn → Hợp đồng → Tính man-day → Lập kế hoạch → Phân công → Đánh giá → NC/CAP → Thẩm xét → Quyết định → Ký số → Phát hành → Giám sát → Tái chứng nhận

---

## 5. CÁC MODULE CHÍNH

| Mã | Module |
|----|--------|
| MD-01 | CRM & Khách hàng |
| MD-02 | Đăng ký chứng nhận |
| MD-03 | Quản lý hợp đồng |
| MD-04 | Tính man-day |
| MD-05 | Quản lý chuyên gia |
| MD-06 | Kế hoạch & lịch đánh giá |
| MD-07 | Báo cáo & checklist online |
| MD-08 | NC/CAP |
| MD-09 | Thẩm xét |
| MD-10 | Ra quyết định |
| MD-11 | Chứng chỉ & ký số |
| MD-12 | Dashboard & phân tích |

---

## 6. VAI TRÒ NGƯỜI DÙNG

| Vai trò | Quyền chính |
|---------|-------------|
| Admin | Toàn quyền hệ thống |
| Sales/CRM | Khách hàng, báo giá, hợp đồng |
| Coordinator | Kế hoạch, phân công |
| Lead Auditor | Quản lý đoàn đánh giá |
| Auditor | Checklist, báo cáo |
| Technical Reviewer | Thẩm xét |
| Decision Maker | Quyết định chứng nhận |
| Customer | Đăng ký, theo dõi hồ sơ |

---

## 7. YÊU CẦU TÍNH MAN-DAY (R.01)

Hệ thống phải:

- Phân loại High / Medium / Low
- Tính Initial Certification
- Tính Surveillance ≈ 1/3
- Tính Recertification ≈ 2/3
- Cộng thêm nhiều site
- Cộng thêm nhiều ngôn ngữ
- Cộng thêm rủi ro cao
- Giảm tối đa 30% theo quy định
- Tính mở rộng phạm vi và thêm site

### Input chính
- Số nhân viên
- Ngành nghề (EA/NACE)
- Mức độ phức tạp
- Số site
- Ngôn ngữ đánh giá
- Loại audit

### Output
- Total man-days
- Stage 1
- Stage 2
- Surveillance Y1
- Surveillance Y2
- Recertification

---

## 8. YÊU CẦU TỰ ĐỘNG HÓA

- Nhắc lịch đánh giá
- Nhắc hạn báo cáo
- Nhắc phê duyệt quá hạn
- Nhắc hết hạn chứng chỉ
- Nhắc gia hạn năng lực chuyên gia
- Tự động tạo công việc khi đến hạn

---

## 9. YÊU CẦU BÁO CÁO ONLINE

- Soạn thảo trực tiếp trên web
- Track changes
- Comment theo đoạn
- Lịch sử phiên bản
- So sánh 2 phiên bản
- Khóa chỉnh sửa sau phê duyệt
- Xuất PDF chính thức

---

## 10. YÊU CẦU KÝ SỐ

- USB Token
- Remote Signing
- Ký trên web
- Lưu log ký số
- Xác thực toàn vẹn tài liệu
- QR xác thực chứng chỉ

---

## 11. DATABASE PHASE 1 (ĐÃ THIẾT KẾ)

### Core
- customers
- contacts
- contracts
- certification_projects
- audit_plans
- reports
- technical_reviews
- certificates

### User & Permission
- users
- roles
- permissions
- user_roles
- role_permissions
- user_sessions

### Workflow
- workflow_approvals
- audit_logs

### Expert
- experts

---

## 12. CÁC BẢNG CẦN BỔ SUNG (PHASE 1.1)

- sites
- audit_team
- checklists
- checklist_items
- nonconformities
- corrective_actions
- competencies
- expert_competencies
- trainings
- training_records
- schedules
- notifications
- notification_logs
- documents
- document_versions

---

## 13. KIẾN TRÚC KỸ THUẬT

| Thành phần | Công nghệ |
|------------|------------|
| Frontend | Next.js / React |
| Backend | NestJS |
| ORM | Prisma |
| Database | SQL Server |
| Auth | JWT + Refresh Token |
| Storage | MinIO / Azure Blob |
| PDF | Puppeteer |
| Scheduler | @nestjs/schedule |
| Queue | BullMQ + Redis |

---

## 14. LỘ TRÌNH TRIỂN KHAI

### Sprint 1
- AuthModule
- JWT Login
- RolesGuard
- CustomerModule

### Sprint 2
- ContractModule
- ProjectModule

### Sprint 3
- Manday Engine

### Sprint 4
- Audit Planning & Schedule

### Sprint 5
- Reports & Checklist

### Sprint 6
- NC/CAP

### Sprint 7
- Technical Review

### Sprint 8
- Decision & Certificate PDF

### Sprint 9
- Digital Signature

### Sprint 10
- Notification & Dashboard

---

## 15. TIÊU CHÍ NGHIỆM THU GIAI ĐOẠN 1

Hệ thống được chấp nhận khi:

- Khách hàng đăng ký trực tuyến thành công
- Tạo hồ sơ chứng nhận tự động
- Chuyên gia lập báo cáo online
- Phân công không trùng lịch
- Tính man-day đúng theo R.01
- Phê duyệt và ký số thành công
- Phát hành chứng chỉ PDF có QR
- Nhắc hẹn hoạt động đúng cấu hình

---

## 16. KẾT LUẬN

SRS này là tài liệu tổng hợp chính thức cho Phase 1 của CTIC Certification Management Platform, được xây dựng dựa trên các quy trình P.08, P.09, P.10, P.13 và quy định R.01.

Mục tiêu tiếp theo: hoàn thiện Database Phase 1 Final và triển khai các module nền tảng Auth, Roles, Customers, Contracts và Manday Engine.