export type RuntimeRuleSource = 'PROJECT_SNAPSHOT' | 'CODE_DEFAULT';

export type EffectiveSchemeRuntimeRules = {
    source: RuntimeRuleSource;
    scheme_codes: string[];
    configuration_ids: string[];
    cycle_duration_months: number;
    surveillance_frequency_months: number;
    validity_duration_months: number;
    renewal_window_days: number;
    reminder_lead_days: number;
    stage1_applicable: boolean;
    required_audit_types: string[];
    required_decision_types: string[];
    warnings: string[];
};

type SnapshotEntry = {
    scheme?: {
        id?: unknown;
        code?: unknown;
        name?: unknown;
    } | null;
    configuration?: Record<string, unknown> | null;
};

const DEFAULT_RULES: EffectiveSchemeRuntimeRules = {
    source: 'CODE_DEFAULT',
    scheme_codes: [],
    configuration_ids: [],
    cycle_duration_months: 36,
    surveillance_frequency_months: 12,
    validity_duration_months: 36,
    renewal_window_days: 90,
    reminder_lead_days: 60,
    stage1_applicable: true,
    required_audit_types: [
        'INITIAL_STAGE_1',
        'INITIAL_STAGE_2',
        'SURVEILLANCE',
        'RECERTIFICATION',
    ],
    required_decision_types: [
        'GRANT',
        'MAINTAIN',
        'RENEW',
    ],
    warnings: [
        'Dự án chưa có snapshot quy tắc chương trình; runtime đang dùng baseline tương thích lịch sử.',
    ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.trunc(numeric);
    return rounded >= 1 ? rounded : null;
}

function nonNegativeInteger(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.trunc(numeric);
    return rounded >= 0 ? rounded : null;
}

function list(value: unknown): string[] {
    if (Array.isArray(value)) {
        return [...new Set(
            value
                .map((item) => String(item ?? '').trim().toUpperCase())
                .filter(Boolean),
        )];
    }

    return [...new Set(
        String(value ?? '')
            .split(',')
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean),
    )];
}

function uniqueNumbers(values: number[]) {
    return [...new Set(values)].sort((left, right) => left - right);
}

function numericValues(
    configurations: Record<string, unknown>[],
    key: string,
    parser: (value: unknown) => number | null,
) {
    return configurations
        .map((configuration) => parser(configuration[key]))
        .filter((value): value is number => value !== null);
}

export function resolveSchemeRuntimeRules(
    snapshotJson?: string | null,
): EffectiveSchemeRuntimeRules {
    if (!snapshotJson?.trim()) {
        return { ...DEFAULT_RULES, warnings: [...DEFAULT_RULES.warnings] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(snapshotJson);
    } catch {
        return {
            ...DEFAULT_RULES,
            warnings: [
                'Snapshot quy tắc chương trình bị lỗi JSON; runtime dùng baseline tương thích lịch sử.',
            ],
        };
    }

    if (!Array.isArray(parsed)) {
        return {
            ...DEFAULT_RULES,
            warnings: [
                'Snapshot quy tắc chương trình không đúng cấu trúc; runtime dùng baseline tương thích lịch sử.',
            ],
        };
    }

    const entries = parsed.filter((item): item is SnapshotEntry => isRecord(item));
    const configurations = entries
        .map((entry) => entry.configuration)
        .filter((item): item is Record<string, unknown> => isRecord(item));

    if (!configurations.length) {
        return {
            ...DEFAULT_RULES,
            scheme_codes: entries
                .map((entry) => String(entry.scheme?.code ?? '').trim().toUpperCase())
                .filter(Boolean),
            warnings: [
                'Snapshot dự án không chứa cấu hình ACTIVE; runtime dùng baseline tương thích lịch sử.',
            ],
        };
    }

    const schemeCodes = [...new Set(
        entries
            .map((entry) => String(entry.scheme?.code ?? '').trim().toUpperCase())
            .filter(Boolean),
    )];
    const configurationIds = [...new Set(
        configurations
            .map((configuration) => String(configuration.id ?? '').trim())
            .filter(Boolean),
    )];

    const cycleValues = numericValues(configurations, 'cycle_duration_months', positiveInteger);
    const surveillanceValues = numericValues(configurations, 'surveillance_frequency_months', positiveInteger);
    const validityValues = numericValues(configurations, 'validity_duration_months', positiveInteger);
    const renewalValues = numericValues(configurations, 'renewal_window_days', nonNegativeInteger);
    const reminderValues = numericValues(configurations, 'reminder_lead_days', nonNegativeInteger);
    const stage1Values = configurations
        .map((configuration) => configuration.stage1_applicable)
        .filter((value): value is boolean => typeof value === 'boolean');

    const auditTypes = [...new Set(
        configurations.flatMap((configuration) => list(configuration.required_audit_types)),
    )];
    const decisionTypes = [...new Set(
        configurations.flatMap((configuration) => list(configuration.required_decision_types)),
    )];

    const warnings: string[] = [];
    const mismatchFields: Array<[string, number[]]> = [
        ['chu kỳ chứng nhận', uniqueNumbers(cycleValues)],
        ['khoảng giám sát', uniqueNumbers(surveillanceValues)],
        ['thời hạn chứng chỉ', uniqueNumbers(validityValues)],
        ['cửa sổ tái chứng nhận', uniqueNumbers(renewalValues)],
        ['mốc nhắc vận hành', uniqueNumbers(reminderValues)],
    ];

    for (const [label, values] of mismatchFields) {
        if (values.length > 1) {
            warnings.push(
                `Dự án tích hợp có nhiều giá trị ${label} (${values.join(', ')}); runtime dùng giá trị bảo thủ để không nới lỏng yêu cầu.`,
            );
        }
    }

    if (new Set(stage1Values).size > 1) {
        warnings.push(
            'Các chương trình trong dự án tích hợp không đồng nhất về Giai đoạn 1; runtime yêu cầu Giai đoạn 1 nếu bất kỳ chương trình nào yêu cầu.',
        );
    }

    return {
        source: 'PROJECT_SNAPSHOT',
        scheme_codes: schemeCodes,
        configuration_ids: configurationIds,
        cycle_duration_months: cycleValues.length
            ? Math.min(...cycleValues)
            : DEFAULT_RULES.cycle_duration_months,
        surveillance_frequency_months: surveillanceValues.length
            ? Math.min(...surveillanceValues)
            : DEFAULT_RULES.surveillance_frequency_months,
        validity_duration_months: validityValues.length
            ? Math.min(...validityValues)
            : DEFAULT_RULES.validity_duration_months,
        renewal_window_days: renewalValues.length
            ? Math.max(...renewalValues)
            : DEFAULT_RULES.renewal_window_days,
        reminder_lead_days: reminderValues.length
            ? Math.max(...reminderValues)
            : DEFAULT_RULES.reminder_lead_days,
        stage1_applicable: stage1Values.length
            ? stage1Values.some(Boolean)
            : DEFAULT_RULES.stage1_applicable,
        required_audit_types: auditTypes.length
            ? auditTypes
            : [...DEFAULT_RULES.required_audit_types],
        required_decision_types: decisionTypes.length
            ? decisionTypes
            : [...DEFAULT_RULES.required_decision_types],
        warnings,
    };
}

export function expiryDateFromValidityMonths(
    effectiveDate: Date,
    validityMonths: number,
) {
    const result = new Date(effectiveDate);
    const originalDay =
        result.getUTCDate();
    const months =
        Math.max(
            1,
            Math.trunc(validityMonths),
        );

    result.setUTCDate(1);
    result.setUTCMonth(
        result.getUTCMonth() + months,
    );

    const lastDayOfTargetMonth =
        new Date(
            Date.UTC(
                result.getUTCFullYear(),
                result.getUTCMonth() + 1,
                0,
            ),
        ).getUTCDate();

    result.setUTCDate(
        Math.min(
            originalDay,
            lastDayOfTargetMonth,
        ),
    );
    result.setUTCDate(
        result.getUTCDate() - 1,
    );
    return result;
}

export function runtimeRuleSummary(rules: EffectiveSchemeRuntimeRules) {
    return {
        source: rules.source,
        scheme_codes: rules.scheme_codes,
        configuration_ids: rules.configuration_ids,
        cycle_duration_months: rules.cycle_duration_months,
        surveillance_frequency_months: rules.surveillance_frequency_months,
        validity_duration_months: rules.validity_duration_months,
        renewal_window_days: rules.renewal_window_days,
        reminder_lead_days: rules.reminder_lead_days,
        stage1_applicable: rules.stage1_applicable,
        required_audit_types: rules.required_audit_types,
        required_decision_types: rules.required_decision_types,
        warnings: rules.warnings,
    };
}
