export type CanonicalAuditPlanCandidate = {
    id: string;
    audit_event_id?: string | null;
    plan_code?: string | null;
    created_at: Date | string;
    audit_team_appointment?: {
        id: string;
        status?: string | null;
    } | null;
};

export type CanonicalAuditPlanDiagnostic = {
    code: 'DUPLICATE_OPERATIONAL_AUDIT_PLANS';
    audit_event_id: string;
    canonical_plan_id: string;
    canonical_plan_code: string | null;
    duplicate_plan_ids: string[];
    duplicate_plan_codes: Array<string | null>;
    message: string;
};

const normalize = (value?: string | null) =>
    (value ?? '').trim().toLowerCase();

const appointmentPriority = (
    plan: CanonicalAuditPlanCandidate,
) => {
    const status = normalize(
        plan.audit_team_appointment?.status,
    );

    if (status === 'issued') {
        return 2;
    }

    if (
        plan.audit_team_appointment &&
        ![
            'cancelled',
            'canceled',
            'revoked',
            'superseded',
        ].includes(status)
    ) {
        return 1;
    }

    return 0;
};

const createdAtValue = (
    plan: CanonicalAuditPlanCandidate,
) => {
    const value = new Date(
        plan.created_at,
    ).getTime();

    return Number.isFinite(value)
        ? value
        : Number.MAX_SAFE_INTEGER;
};

export function resolveCanonicalAuditPlan<
    T extends CanonicalAuditPlanCandidate,
>(
    candidates: readonly T[],
): T | null {
    return [...candidates].sort(
        (left, right) =>
            appointmentPriority(right) -
                appointmentPriority(left) ||
            createdAtValue(left) -
                createdAtValue(right) ||
            left.id.localeCompare(right.id),
    )[0] ?? null;
}

export function resolveCanonicalOperationalPlans<
    T extends CanonicalAuditPlanCandidate,
>(
    plans: readonly T[],
) {
    const plansByEvent = new Map<string, T[]>();

    for (const plan of plans) {
        if (!plan.audit_event_id) {
            continue;
        }

        const candidates =
            plansByEvent.get(
                plan.audit_event_id,
            ) ?? [];
        candidates.push(plan);
        plansByEvent.set(
            plan.audit_event_id,
            candidates,
        );
    }

    const canonicalEventPlans: T[] = [];
    const diagnostics: CanonicalAuditPlanDiagnostic[] = [];

    for (const [eventId, candidates] of plansByEvent) {
        const canonical =
            resolveCanonicalAuditPlan(
                candidates,
            );

        if (!canonical) {
            continue;
        }

        canonicalEventPlans.push(
            canonical,
        );

        if (candidates.length <= 1) {
            continue;
        }

        const duplicates = candidates.filter(
            (plan) => plan.id !== canonical.id,
        );

        diagnostics.push({
            code: 'DUPLICATE_OPERATIONAL_AUDIT_PLANS',
            audit_event_id: eventId,
            canonical_plan_id: canonical.id,
            canonical_plan_code:
                canonical.plan_code ?? null,
            duplicate_plan_ids: duplicates.map(
                (plan) => plan.id,
            ),
            duplicate_plan_codes: duplicates.map(
                (plan) => plan.plan_code ?? null,
            ),
            message:
                `Audit event ${eventId} có ${candidates.length} PLAN vận hành; ` +
                `hệ thống đang sử dụng ${canonical.plan_code ?? canonical.id} làm PLAN canonical.`,
        });
    }

    const canonicalIds = new Set(
        canonicalEventPlans.map(
            (plan) => plan.id,
        ),
    );

    return {
        plans: plans.filter(
            (plan) =>
                !plan.audit_event_id ||
                canonicalIds.has(plan.id),
        ),
        diagnostics,
    };
}
