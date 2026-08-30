export const CERTIFICATE_DECISION_TYPES = [
    'GRANT',
    'MAINTAIN',
    'RECERTIFY',
    'AMEND',
    'EXTEND_SCOPE',
    'REDUCE_SCOPE',
    'SUSPEND',
    'RESTORE',
    'WITHDRAW',
    'REFUSE',
] as const;

export type CertificateDecisionType =
    typeof CERTIFICATE_DECISION_TYPES[number];

export const CERTIFICATE_STATUSES = [
    'active',
    'suspended',
    'withdrawn',
    'expired',
    'replaced',
] as const;

export type CertificateStatus =
    typeof CERTIFICATE_STATUSES[number];

export type CertificateStatusDecisionType =
    | 'SUSPEND'
    | 'RESTORE'
    | 'WITHDRAW';

export type CertificateLifecycleAction =
    | 'CREATE_FIRST_VERSION'
    | 'CREATE_NEXT_VERSION'
    | 'PRESERVE_CURRENT_VERSION'
    | 'TRANSITION_STATUS'
    | 'NO_CERTIFICATE';

export type AuditLifecycle =
    | 'INITIAL_STAGE2'
    | 'SURVEILLANCE'
    | 'RECERTIFICATION'
    | 'LEGACY_UNKNOWN';

const ACTION_BY_DECISION_TYPE:
Record<CertificateDecisionType, CertificateLifecycleAction> = {
    GRANT: 'CREATE_FIRST_VERSION',
    MAINTAIN: 'PRESERVE_CURRENT_VERSION',
    RECERTIFY: 'CREATE_NEXT_VERSION',
    AMEND: 'CREATE_NEXT_VERSION',
    EXTEND_SCOPE: 'CREATE_NEXT_VERSION',
    REDUCE_SCOPE: 'CREATE_NEXT_VERSION',
    SUSPEND: 'TRANSITION_STATUS',
    RESTORE: 'TRANSITION_STATUS',
    WITHDRAW: 'TRANSITION_STATUS',
    REFUSE: 'NO_CERTIFICATE',
};

const STATUS_TARGET_BY_DECISION_TYPE:
Partial<Record<CertificateDecisionType, CertificateStatus>> = {
    SUSPEND: 'suspended',
    RESTORE: 'active',
    WITHDRAW: 'withdrawn',
};

const ALLOWED_STATUS_TRANSITIONS:
Record<CertificateStatus, readonly CertificateStatus[]> = {
    active: [
        'suspended',
        'withdrawn',
        'expired',
        'replaced',
    ],
    suspended: [
        'active',
        'withdrawn',
        'expired',
    ],
    replaced: [],
    withdrawn: [],
    expired: [],
};

const ALLOWED_DECISIONS_BY_LIFECYCLE:
Record<AuditLifecycle, readonly CertificateDecisionType[]> = {
    INITIAL_STAGE2: ['GRANT', 'REFUSE'],
    SURVEILLANCE: [
        'MAINTAIN',
        'AMEND',
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
    ],
    RECERTIFICATION: ['RECERTIFY', 'REFUSE'],
    // Explicit compatibility boundary for historical rows and pre-Phase 1 clients
    // whose audit type was not normalized. New known lifecycle types remain strict.
    LEGACY_UNKNOWN: CERTIFICATE_DECISION_TYPES,
};

function normalizeToken(value?: string | null) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

export function normalizeDecisionType(
    value: string,
): CertificateDecisionType | null {
    const normalized = value.trim().toUpperCase();
    return CERTIFICATE_DECISION_TYPES.includes(
        normalized as CertificateDecisionType,
    )
        ? normalized as CertificateDecisionType
        : null;
}

export function classifyAuditLifecycle(
    auditType?: string | null,
    eventType?: string | null,
): AuditLifecycle {
    const tokens = [
        normalizeToken(auditType),
        normalizeToken(eventType),
    ].filter(Boolean);

    if (tokens.some((token) => [
        'stage2',
        'initialstage2',
        'gd2',
    ].includes(token))) {
        return 'INITIAL_STAGE2';
    }

    if (tokens.some((token) =>
        token.startsWith('surveillance') ||
        ['gs1', 'gs2', 'monitoring'].includes(token),
    )) {
        return 'SURVEILLANCE';
    }

    if (tokens.some((token) => [
        'recertification',
        'recertify',
        'reassessment',
    ].includes(token))) {
        return 'RECERTIFICATION';
    }

    return 'LEGACY_UNKNOWN';
}

export function allowedDecisionTypesForLifecycle(
    lifecycle: AuditLifecycle,
) {
    return ALLOWED_DECISIONS_BY_LIFECYCLE[lifecycle];
}

const PHASE_12_WORKSPACE_DECISION_TYPES:
readonly CertificateDecisionType[] = [
    'GRANT',
    'MAINTAIN',
    'AMEND',
    'EXTEND_SCOPE',
    'REDUCE_SCOPE',
];

export function phase12WorkspaceDecisionTypes(
    lifecycle: AuditLifecycle,
) {
    return allowedDecisionTypesForLifecycle(lifecycle)
        .filter((decisionType) =>
            PHASE_12_WORKSPACE_DECISION_TYPES
                .includes(decisionType),
        );
}

export function allowedStatusDecisionTypesForCertificateStatus(
    status?: string | null,
): CertificateStatusDecisionType[] {
    const normalizedStatus =
        normalizeCertificateStatus(status);

    if (normalizedStatus === 'active') {
        return [
            'SUSPEND',
            'WITHDRAW',
        ];
    }

    if (normalizedStatus === 'suspended') {
        return [
            'RESTORE',
            'WITHDRAW',
        ];
    }

    return [];
}

export function phase13WorkspaceDecisionTypes(
    lifecycle: AuditLifecycle,
    currentStatus?: string | null,
) {
    const phase12Types =
        phase12WorkspaceDecisionTypes(
            lifecycle,
        );
    const statusTypes =
        allowedStatusDecisionTypesForCertificateStatus(
            currentStatus,
        ).filter((decisionType) =>
            isDecisionTypeAllowedForLifecycle(
                decisionType,
                lifecycle,
            ),
        );

    if (lifecycle === 'SURVEILLANCE') {
        if (
            normalizeCertificateStatus(
                currentStatus,
            ) === 'active'
        ) {
            return [
                ...phase12Types,
                ...statusTypes,
            ];
        }

        return statusTypes;
    }

    return [
        ...phase12Types,
        ...statusTypes,
    ];
}

export function phase14WorkspaceDecisionTypes(
    lifecycle: AuditLifecycle,
    currentStatus?: string | null,
) {
    if (lifecycle === 'RECERTIFICATION') {
        return normalizeCertificateStatus(currentStatus) === 'active'
            ? ['RECERTIFY'] as CertificateDecisionType[]
            : [];
    }

    return phase13WorkspaceDecisionTypes(
        lifecycle,
        currentStatus,
    );
}

export function canReplaceCertificateStatus(
    status?: string | null,
) {
    const normalizedStatus =
        normalizeCertificateStatus(status);

    return normalizedStatus !== null &&
        canTransitionCertificateStatus(
            normalizedStatus,
            'replaced',
        );
}

export function isStatusDecisionType(
    decisionType: CertificateDecisionType,
): decisionType is CertificateStatusDecisionType {
    return [
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
    ].includes(decisionType);
}

export function decisionRequiresChangeReason(
    decisionType: CertificateDecisionType,
) {
    return [
        'AMEND',
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
    ].includes(decisionType);
}

export function decisionChangesCertifiedScope(
    decisionType: CertificateDecisionType,
) {
    return [
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
    ].includes(decisionType);
}

export function isDecisionTypeAllowedForLifecycle(
    decisionType: CertificateDecisionType,
    lifecycle: AuditLifecycle,
) {
    return allowedDecisionTypesForLifecycle(lifecycle)
        .includes(decisionType);
}

export function inferLegacyDecisionType(input: {
    auditType?: string | null;
    eventType?: string | null;
    decisionResult: string;
}): CertificateDecisionType {
    const lifecycle = classifyAuditLifecycle(
        input.auditType,
        input.eventType,
    );

    if (input.decisionResult.trim().toLowerCase() === 'rejected') {
        return 'REFUSE';
    }

    if (lifecycle === 'SURVEILLANCE') return 'MAINTAIN';
    if (lifecycle === 'RECERTIFICATION') return 'RECERTIFY';

    // Historical approved/deferred decisions with an unknown audit token were
    // created by the former issuance-only workflow, so GRANT is the least
    // destructive compatibility fallback. The original decision_result remains.
    return 'GRANT';
}

export function certificateActionForDecisionType(
    decisionType: CertificateDecisionType,
): CertificateLifecycleAction {
    return ACTION_BY_DECISION_TYPE[decisionType];
}

export function decisionRequiresCertificateVersion(
    decisionType: CertificateDecisionType,
) {
    return [
        'CREATE_FIRST_VERSION',
        'CREATE_NEXT_VERSION',
    ].includes(certificateActionForDecisionType(decisionType));
}

export function decisionPreservesCurrentCertificate(
    decisionType: CertificateDecisionType,
) {
    return certificateActionForDecisionType(decisionType) ===
        'PRESERVE_CURRENT_VERSION';
}

export function statusTargetForDecisionType(
    decisionType: CertificateDecisionType,
) {
    return STATUS_TARGET_BY_DECISION_TYPE[decisionType] ?? null;
}

export function normalizeCertificateStatus(
    value?: string | null,
): CertificateStatus | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    return CERTIFICATE_STATUSES.includes(
        normalized as CertificateStatus,
    )
        ? normalized as CertificateStatus
        : null;
}

export function canTransitionCertificateStatus(
    from: CertificateStatus,
    to: CertificateStatus,
) {
    return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function assertCertificateStatusTransition(
    from: CertificateStatus,
    to: CertificateStatus,
) {
    if (!canTransitionCertificateStatus(from, to)) {
        throw new Error(
            `Invalid certificate status transition: ${from} -> ${to}`,
        );
    }
}
