import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isEmail, isURL } from 'class-validator';

export const ORGANIZATION_TIMEZONE_FALLBACK = 'Asia/Ho_Chi_Minh';
export function validOrganizationTimezone(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim() || /^[+-]/.test(value)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(); return true; } catch { return false; }
}
export function organizationReminderDays(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3650 ? value : 90;
}
export async function readOrganizationTimezone(client: Pick<Prisma.TransactionClient, 'organization_profiles'>) {
    const profile = await client.organization_profiles?.findUnique({ where: { profile_key: 'PRIMARY' }, select: { timezone: true } });
    return validOrganizationTimezone(profile?.timezone) ? profile.timezone.trim() : ORGANIZATION_TIMEZONE_FALLBACK;
}
type Profile = Record<string, unknown>;
export function organizationReadiness(profile: Profile | null) {
    const reasons: Array<{ code: string; field: string; message: string }> = [];
    for (const field of ['legal_name', 'display_name', 'short_name']) {
        if (typeof profile?.[field] !== 'string' || !(profile[field] as string).trim()) reasons.push({ code: `ORGANIZATION_${field.toUpperCase()}_MISSING`, field, message: `${field}: bắt buộc nhập nội dung khác khoảng trắng` });
    }
    if (!validOrganizationTimezone(profile?.timezone)) reasons.push({ code: 'ORGANIZATION_TIMEZONE_INVALID', field: 'timezone', message: 'Múi giờ IANA không hợp lệ' });
    for (const [field, supported] of [['locale', 'vi-VN'], ['default_language', 'vi']]) {
        if (profile?.[field] !== supported) reasons.push({ code: `ORGANIZATION_${field.toUpperCase()}_UNSUPPORTED`, field, message: `V1 chỉ hỗ trợ ${supported}; chưa hỗ trợ chuyển ngôn ngữ toàn hệ thống` });
    }
    const reminder = profile?.certificate_reminder_days;
    if (typeof reminder !== 'number' || !Number.isInteger(reminder) || reminder < 0 || reminder > 3650) reasons.push({ code: 'ORGANIZATION_REMINDER_DAYS_INVALID', field: 'certificate_reminder_days', message: 'Mốc nhắc phải là số nguyên từ 0 đến 3650' });
    return { ready: reasons.length === 0, reasons };
}
export function validateOrganizationProfile(profile: Profile) {
    const readiness = organizationReadiness(profile);
    const reasons = [...readiness.reasons];
    if (profile.email && (typeof profile.email !== 'string' || !isEmail(profile.email))) reasons.push({ code: 'ORGANIZATION_EMAIL_INVALID', field: 'email', message: 'Email không hợp lệ' });
    if (profile.website && (typeof profile.website !== 'string' || !isURL(profile.website, { require_protocol: true, protocols: ['http', 'https'], require_valid_protocol: true }))) reasons.push({ code: 'ORGANIZATION_WEBSITE_INVALID', field: 'website', message: 'Website phải là URL HTTP/HTTPS hợp lệ' });
    if (profile.file_retention_days != null && (typeof profile.file_retention_days !== 'number' || !Number.isInteger(profile.file_retention_days) || profile.file_retention_days < 0 || profile.file_retention_days > 2147483647)) reasons.push({ code: 'ORGANIZATION_RETENTION_INVALID', field: 'file_retention_days', message: 'Giá trị lưu trữ tương thích phải là số nguyên không âm' });
    if (!['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].includes(String(profile.date_format))) reasons.push({ code: 'ORGANIZATION_DATE_FORMAT_INVALID', field: 'date_format', message: 'Metadata định dạng ngày không hợp lệ' });
    if (typeof profile.portal_title !== 'string' || !profile.portal_title.trim()) reasons.push({ code: 'ORGANIZATION_PORTAL_TITLE_MISSING', field: 'portal_title', message: 'Tiêu đề portal không được để trống' });
    if (reasons.length) throw new BadRequestException({ message: 'Hồ sơ tổ chức không hợp lệ', reasons });
}

export const ORGANIZATION_FIELD_MANIFEST = [
    ...['legal_name', 'display_name', 'short_name', 'address', 'email', 'phone', 'website', 'portal_title'].map(field => ({ field, status: 'APPLIED', editable: true, effect: field === 'legal_name' ? 'Trường tổ chức trong Template Manager; không tự thay tên hiển thị trên mọi mẫu tài liệu' : 'Nhận diện/liên hệ trên các tài liệu hỗ trợ branding; tên hiển thị, viết tắt và tiêu đề được chiếu an toàn lên giao diện' })),
    { field: 'timezone', status: 'APPLIED', editable: true, effect: 'Ngày/năm cấp số tương lai và kỳ báo cáo thương mại; không đổi số đã cấp hoặc lịch tác vụ cố định' },
    { field: 'certificate_reminder_days', status: 'APPLIED', editable: true, effect: 'Mốc nhắc dự phòng cho hồ sơ chưa có snapshot quy tắc' },
    ...['logo_reference', 'document_footer', 'locale', 'date_format', 'default_language', 'file_retention_days'].map(field => ({ field, status: 'COMPATIBILITY_ONLY', editable: false, effect: 'Lưu để tương thích; runtime hiện không áp dụng như thiết lập tùy chọn' })),
];
