import { ORGANIZATION_TIMEZONE_FALLBACK } from '../common/organization-runtime-settings';
export const NUMBERING_TIMEZONE = ORGANIZATION_TIMEZONE_FALLBACK;

export const CONFIGURABLE_NUMBERING_ENTITY_TYPES = [
    'DOCUMENT',
    'COMPLAINT',
    'APPEAL',
    'CHANGE',
    'SPECIAL_AUDIT',
] as const;

export type ConfigurableNumberingEntityType =
    typeof CONFIGURABLE_NUMBERING_ENTITY_TYPES[number];

export type NumberingRuleLifecycleState =
    | 'CURRENT'
    | 'SCHEDULED'
    | 'HISTORICAL'
    | 'CANCELLED';

type NumberingCapability = {
    entity_type: ConfigurableNumberingEntityType;
    label: string;
    description: string;
    fallback_prefix: string;
    mandatory_for_global_readiness: boolean;
};

export const NUMBERING_CAPABILITIES: readonly NumberingCapability[] = [
    {
        entity_type: 'DOCUMENT',
        label: 'Tài liệu kiểm soát',
        description: 'Số tài liệu được cấp tự động khi tạo hồ sơ tài liệu kiểm soát.',
        fallback_prefix: 'Mã tài liệu',
        mandatory_for_global_readiness: true,
    },
    {
        entity_type: 'COMPLAINT',
        label: 'Khiếu nại',
        description: 'Số hồ sơ khiếu nại được cấp tự động.',
        fallback_prefix: 'CMP',
        mandatory_for_global_readiness: true,
    },
    {
        entity_type: 'APPEAL',
        label: 'Kháng nghị',
        description: 'Số hồ sơ kháng nghị được cấp tự động.',
        fallback_prefix: 'APL',
        mandatory_for_global_readiness: true,
    },
    {
        entity_type: 'CHANGE',
        label: 'Yêu cầu thay đổi',
        description: 'Số yêu cầu thay đổi chứng nhận được cấp tự động.',
        fallback_prefix: 'CHG',
        mandatory_for_global_readiness: true,
    },
    {
        entity_type: 'SPECIAL_AUDIT',
        label: 'Đánh giá đặc biệt',
        description: 'Chỉ cần cấu hình khi tổ chức sử dụng quy trình đánh giá đặc biệt.',
        fallback_prefix: 'SA',
        mandatory_for_global_readiness: false,
    },
];

export const NON_CONFIGURABLE_NUMBERING_ENTITIES = [
    {
        entity_type: 'APPLICATION',
        label: 'Đơn đăng ký',
        reason: 'Đang dùng cơ chế cấp số riêng của quy trình đơn đăng ký.',
    },
    {
        entity_type: 'CERTIFICATE',
        label: 'Chứng chỉ',
        reason: 'Đang dùng cơ chế số và phiên bản riêng của quy trình cấp chứng chỉ.',
    },
] as const;

export const MANDATORY_NUMBERING_ENTITY_TYPES = NUMBERING_CAPABILITIES
    .filter((item) => item.mandatory_for_global_readiness)
    .map((item) => item.entity_type);

export const OPTIONAL_NUMBERING_ENTITY_TYPES = NUMBERING_CAPABILITIES
    .filter((item) => !item.mandatory_for_global_readiness)
    .map((item) => item.entity_type);

export function isConfigurableNumberingEntity(
    value: string,
): value is ConfigurableNumberingEntityType {
    return CONFIGURABLE_NUMBERING_ENTITY_TYPES.includes(
        value as ConfigurableNumberingEntityType,
    );
}

export function numberingSequenceNamespace(prefix: string) {
    return prefix.trim().toUpperCase().slice(0, 50);
}

export function numberingBusinessDate(now = new Date(), timezone = NUMBERING_TIMEZONE) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
    );
    return new Date(Date.UTC(
        Number(value.year),
        Number(value.month) - 1,
        Number(value.day),
    ));
}

export function numberingBusinessYear(now = new Date(), timezone = NUMBERING_TIMEZONE) {
    return numberingBusinessDate(now, timezone).getUTCFullYear();
}

export function numberingRuleLifecycleState(
    rule: {
        status: string;
        effective_from: Date;
        effective_to: Date | null;
    },
    at = numberingBusinessDate(),
): NumberingRuleLifecycleState {
    if (rule.status !== 'ACTIVE') {
        return rule.effective_from > at ? 'CANCELLED' : 'HISTORICAL';
    }
    if (rule.effective_from > at) return 'SCHEDULED';
    if (rule.effective_to && rule.effective_to < at) return 'HISTORICAL';
    return 'CURRENT';
}

export function numberingCapabilities(now = new Date(), timezone = NUMBERING_TIMEZONE) {
    return {
        contract_version: 'CFG-1A',
        sequence_authority: 'NORMALIZED_VISIBLE_PREFIX_PER_BUSINESS_YEAR',
        format_template: '{PREFIX}-{YYYY}-{SEQUENCE}',
        timezone,
        preview_year: numberingBusinessYear(now, timezone),
        configurable_entities: NUMBERING_CAPABILITIES.map((item) => ({ ...item })),
        non_configurable_entities: NON_CONFIGURABLE_NUMBERING_ENTITIES.map((item) => ({ ...item })),
    };
}
