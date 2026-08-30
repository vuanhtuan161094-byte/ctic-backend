export interface TemplateFieldDefinition {
    token: string;
    label: string;
    group: string;
    example: string;
    kind?: 'scalar' | 'repeat_start' | 'repeat_end' | 'repeat_field';
}

export const TEMPLATE_FIELD_CATALOG: TemplateFieldDefinition[] = [
    { token: 'organization.legal_name', label: 'Tên pháp lý tổ chức chứng nhận', group: 'Tổ chức chứng nhận', example: 'CÔNG TY TNHH ABC CERTIFICATION VIỆT NAM' },
    { token: 'organization.display_name', label: 'Tên hiển thị', group: 'Tổ chức chứng nhận', example: 'ABC Certification Việt Nam' },
    { token: 'organization.short_name', label: 'Tên viết tắt', group: 'Tổ chức chứng nhận', example: 'ABC' },
    { token: 'organization.address', label: 'Địa chỉ tổ chức chứng nhận', group: 'Tổ chức chứng nhận', example: 'Hà Nội, Việt Nam' },
    { token: 'organization.email', label: 'Email tổ chức chứng nhận', group: 'Tổ chức chứng nhận', example: 'certification@abc.vn' },
    { token: 'organization.phone', label: 'Điện thoại tổ chức chứng nhận', group: 'Tổ chức chứng nhận', example: '024 1234 5678' },
    { token: 'organization.website', label: 'Website', group: 'Tổ chức chứng nhận', example: 'www.abc.vn' },
    { token: 'customer.code', label: 'Mã khách hàng', group: 'Khách hàng', example: 'C0001' },
    { token: 'customer.name', label: 'Tên khách hàng', group: 'Khách hàng', example: 'CÔNG TY TNHH NHÀ MÁY ABC' },
    { token: 'customer.tax_code', label: 'Mã số thuế', group: 'Khách hàng', example: '0201234567' },
    { token: 'customer.address', label: 'Địa chỉ khách hàng', group: 'Khách hàng', example: 'Hải Phòng, Việt Nam' },
    { token: 'customer.email', label: 'Email khách hàng', group: 'Khách hàng', example: 'qa@abc.com' },
    { token: 'customer.phone', label: 'Điện thoại khách hàng', group: 'Khách hàng', example: '0225 123 4567' },
    { token: 'application.code', label: 'Mã đơn đăng ký', group: 'Đơn đăng ký', example: 'APP-2026-0001' },
    { token: 'application.date', label: 'Ngày đăng ký', group: 'Đơn đăng ký', example: '26/08/2026' },
    { token: 'application.scope', label: 'Phạm vi đăng ký/chứng nhận', group: 'Đơn đăng ký', example: 'Sản xuất và lắp ráp thiết bị điện' },
    { token: 'application.standard_name', label: 'Tiêu chuẩn đăng ký', group: 'Đơn đăng ký', example: 'ISO 9001:2015' },
    { token: 'application.site_count', label: 'Số địa điểm', group: 'Đơn đăng ký', example: '2' },
    { token: 'application.employee_count', label: 'Số nhân sự', group: 'Đơn đăng ký', example: '250' },
    { token: 'project.code', label: 'Mã hồ sơ chứng nhận', group: 'Hồ sơ chứng nhận', example: 'PRJ-2026-0001' },
    { token: 'project.standard_name', label: 'Tiêu chuẩn của hồ sơ', group: 'Hồ sơ chứng nhận', example: 'ISO 9001:2015' },
    { token: 'project.status', label: 'Trạng thái hồ sơ', group: 'Hồ sơ chứng nhận', example: 'Đang đánh giá' },
    { token: 'audit.plan_code', label: 'Mã kế hoạch đánh giá', group: 'Đánh giá', example: 'PLAN-2026-0001' },
    { token: 'audit.type', label: 'Loại đánh giá', group: 'Đánh giá', example: 'Giai đoạn 2' },
    { token: 'audit.start_date', label: 'Ngày bắt đầu đánh giá', group: 'Đánh giá', example: '01/09/2026' },
    { token: 'audit.end_date', label: 'Ngày kết thúc đánh giá', group: 'Đánh giá', example: '03/09/2026' },
    { token: 'audit.scope', label: 'Phạm vi đánh giá', group: 'Đánh giá', example: 'Sản xuất và lắp ráp thiết bị điện' },
    { token: 'audit.location', label: 'Địa điểm đánh giá', group: 'Đánh giá', example: 'Nhà máy Hải Phòng' },
    { token: 'certificate.number', label: 'Số chứng chỉ', group: 'Chứng chỉ', example: 'ABC-QMS-2026-0001' },
    { token: 'certificate.issue_date', label: 'Ngày cấp chứng chỉ', group: 'Chứng chỉ', example: '15/09/2026' },
    { token: 'certificate.expiry_date', label: 'Ngày hết hạn chứng chỉ', group: 'Chứng chỉ', example: '14/09/2029' },
    { token: 'certificate.scope', label: 'Phạm vi trên chứng chỉ', group: 'Chứng chỉ', example: 'Sản xuất và lắp ráp thiết bị điện' },
    { token: 'certificate.standard_name', label: 'Tiêu chuẩn trên chứng chỉ', group: 'Chứng chỉ', example: 'ISO 9001:2015' },
    { token: 'certificate.organization_name', label: 'Tên tổ chức trên chứng chỉ', group: 'Chứng chỉ', example: 'CÔNG TY TNHH NHÀ MÁY ABC' },
    { token: '#sites', label: 'Bắt đầu dòng lặp danh sách địa điểm', group: 'Bảng lặp', example: '{{#sites}}', kind: 'repeat_start' },
    { token: '/sites', label: 'Kết thúc dòng lặp danh sách địa điểm', group: 'Bảng lặp', example: '{{/sites}}', kind: 'repeat_end' },
    { token: 'site_no', label: 'STT địa điểm (trong dòng lặp)', group: 'Bảng lặp', example: '1', kind: 'repeat_field' },
    { token: 'site_name', label: 'Tên địa điểm (trong dòng lặp)', group: 'Bảng lặp', example: 'Nhà máy 1', kind: 'repeat_field' },
    { token: 'address', label: 'Địa chỉ (trong dòng lặp)', group: 'Bảng lặp', example: 'Hải Phòng', kind: 'repeat_field' },
    { token: 'activities', label: 'Hoạt động (trong dòng lặp)', group: 'Bảng lặp', example: 'Sản xuất', kind: 'repeat_field' },
    { token: 'employee_count', label: 'Nhân sự (trong dòng lặp)', group: 'Bảng lặp', example: '100', kind: 'repeat_field' },
    { token: '#audit_team', label: 'Bắt đầu dòng lặp đoàn đánh giá', group: 'Bảng lặp', example: '{{#audit_team}}', kind: 'repeat_start' },
    { token: '/audit_team', label: 'Kết thúc dòng lặp đoàn đánh giá', group: 'Bảng lặp', example: '{{/audit_team}}', kind: 'repeat_end' },
    { token: 'full_name', label: 'Họ tên (trong dòng lặp)', group: 'Bảng lặp', example: 'Nguyễn Văn A', kind: 'repeat_field' },
    { token: 'role', label: 'Vai trò (trong dòng lặp)', group: 'Bảng lặp', example: 'Trưởng đoàn', kind: 'repeat_field' },
    { token: 'mandays', label: 'Ngày công (trong dòng lặp)', group: 'Bảng lặp', example: '2.0', kind: 'repeat_field' },
];

export const TEMPLATE_ALLOWED_TOKENS = new Set(TEMPLATE_FIELD_CATALOG.map((item) => item.token));
