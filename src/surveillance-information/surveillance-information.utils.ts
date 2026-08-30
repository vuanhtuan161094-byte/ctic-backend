export type SurveillanceChangeCategory = 'ADMINISTRATIVE' | 'CERTIFICATION_RELEVANT';

export interface SurveillanceChange {
    field: string;
    label: string;
    before: unknown;
    after: unknown;
    category: SurveillanceChangeCategory;
    affects_manday: boolean;
}

const fieldMetadata: Record<string, {
    label: string;
    certificationRelevant?: boolean;
    affectsManday?: boolean;
}> = {
    company_name: { label: 'Tên tổ chức', certificationRelevant: true },
    company_name_en: { label: 'Tên tiếng Anh' },
    country_code: { label: 'Quốc gia' },
    country_name: { label: 'Tên quốc gia' },
    tax_code: { label: 'Mã số thuế/đăng ký kinh doanh', certificationRelevant: true },
    registered_address: { label: 'Địa chỉ đăng ký', certificationRelevant: true },
    headquarters_address: { label: 'Địa chỉ trụ sở/địa điểm chính', certificationRelevant: true },
    representative_name: { label: 'Người đại diện' },
    representative_position: { label: 'Chức vụ người đại diện' },
    representative_phone: { label: 'Điện thoại người đại diện' },
    representative_email: { label: 'Email người đại diện' },
    contact_name: { label: 'Người liên hệ' },
    contact_position: { label: 'Chức vụ người liên hệ' },
    contact_phone: { label: 'Điện thoại liên hệ' },
    contact_email: { label: 'Email liên hệ' },
    standard_name: { label: 'Tiêu chuẩn chứng nhận', certificationRelevant: true, affectsManday: true },
    certification_scope: { label: 'Phạm vi chứng nhận', certificationRelevant: true, affectsManday: true },
    excluded_clauses: { label: 'Điều khoản loại trừ', certificationRelevant: true },
    site_count: { label: 'Số địa điểm', certificationRelevant: true, affectsManday: true },
    total_employee_count: { label: 'Tổng số nhân sự', certificationRelevant: true, affectsManday: true },
    employee_count: { label: 'Nhân sự hiệu dụng', certificationRelevant: true, affectsManday: true },
    shift_count: { label: 'Số ca làm việc', certificationRelevant: true, affectsManday: true },
    external_provider_used: { label: 'Sử dụng nhà cung cấp bên ngoài', certificationRelevant: true, affectsManday: true },
    outsourced_processes: { label: 'Quá trình thuê ngoài', certificationRelevant: true, affectsManday: true },
    management_system_details: { label: 'Thông tin hệ thống quản lý', certificationRelevant: true, affectsManday: true },
    certificate_languages: { label: 'Ngôn ngữ chứng chỉ' },
    other_requests: { label: 'Yêu cầu khác' },
    sites: { label: 'Danh sách địa điểm', certificationRelevant: true, affectsManday: true },
};

function comparable(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => comparable(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, item]) => item !== null && item !== undefined && item !== '')
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, comparable(item)]),
        );
    }
    if (value === undefined || value === '') return null;
    return value;
}

function equals(left: unknown, right: unknown) {
    return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function calculateSurveillanceChanges(
    baseline: Record<string, unknown>,
    current: Record<string, unknown>,
): SurveillanceChange[] {
    const fields = new Set([
        ...Object.keys(fieldMetadata),
        ...Object.keys(baseline),
        ...Object.keys(current),
    ]);

    return Array.from(fields)
        .filter((field) => fieldMetadata[field])
        .flatMap((field) => {
            const before = baseline[field] ?? null;
            const after = current[field] ?? null;
            if (equals(before, after)) return [];
            const metadata = fieldMetadata[field];
            return [{
                field,
                label: metadata.label,
                before,
                after,
                category: metadata.certificationRelevant
                    ? 'CERTIFICATION_RELEVANT' as const
                    : 'ADMINISTRATIVE' as const,
                affects_manday: Boolean(metadata.affectsManday),
            }];
        });
}

export function summarizeSurveillanceChanges(changes: SurveillanceChange[]) {
    const certificationRelevantCount = changes.filter(
        (change) => change.category === 'CERTIFICATION_RELEVANT',
    ).length;
    const mandayRelevantCount = changes.filter((change) => change.affects_manday).length;

    const scopeReviewFields = new Set([
        'standard_name',
        'certification_scope',
        'sites',
        'site_count',
    ]);

    return {
        changed_count: changes.length,
        administrative_count: changes.length - certificationRelevantCount,
        certification_relevant_count: certificationRelevantCount,
        manday_relevant_count: mandayRelevantCount,
        change_impact: certificationRelevantCount > 0
            ? 'CERTIFICATION_RELEVANT'
            : changes.length > 0
                ? 'ADMINISTRATIVE'
                : 'NONE',
        manday_review_recommended: mandayRelevantCount > 0,
        scope_review_required: changes.some((change) => scopeReviewFields.has(change.field)),
    } as const;
}
