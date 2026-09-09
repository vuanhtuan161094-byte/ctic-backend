// Explicit scalar allowlists: no Prisma relations, form JSON, storage paths or actor secrets.
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const scalar = (value: unknown) => value instanceof Date ? value.toISOString()
    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
const pick = (value: unknown, keys: string) => Object.fromEntries(keys.split(' ').map(key => [key, scalar(row(value)[key])]));
const list = (value: unknown) => Array.isArray(value) ? value : [];
const strings = (value: unknown) => list(value).filter((item): item is string => typeof item === 'string');
const certificate = (value: unknown) => value ? pick(value, 'id certificate_series_id cert_number version_no issue_date expire_date status organization_name organization_address management_system standard_name certification_scope') : null;
const file = (value: unknown) => ({
    ...pick(value, 'id original_name file_kind version_no is_current created_at'),
    download_url: typeof row(value).id === 'string' ? `/document-files/${encodeURIComponent(row(value).id as string)}/download` : null,
});

export function projectDecisionWorkspace(source: unknown, upstream: unknown, caseId: string, actions: { issue: boolean; generate: boolean; independence: string }) {
    const value = row(source);
    const review = row(upstream);
    const decision = row(value.decision);
    return {
        case_id: caseId,
        plan: pick(value.plan, 'id plan_code audit_type planned_start_date planned_end_date project_id project_code'),
        lifecycle_type: scalar(value.lifecycle_type),
        is_surveillance: value.is_surveillance === true,
        allowed_decision_types: strings(value.allowed_decision_types),
        current_status: scalar(value.current_status),
        allowed_status_actions: strings(value.allowed_status_actions),
        certificate_series: list(value.certificate_series).map(item => ({
            ...pick(item, 'id series_code status'),
            current_certificate: certificate(row(item).current_certificate),
            allowed_status_actions: strings(row(item).allowed_status_actions),
        })),
        active_certificate: certificate(value.active_certificate),
        current_certificate: certificate(value.current_certificate),
        report: value.report ? pick(value.report, 'id report_code status audit_start_date audit_end_date') : null,
        technical_review: value.technical_review ? pick(value.technical_review, 'id status completed_at reviewer_name recommendation recommendation_comment conditions') : null,
        decision: value.decision ? {
            ...pick(decision, 'id technical_review_id decision_number decision_date decision_result decision_type certificate_series_id organization_name organization_address management_system standard_name certification_scope effective_date expiry_date surveillance_interval_months signatory_name signatory_title status change_reason note created_at'),
            lifecycle: decision.lifecycle ? pick(decision.lifecycle, 'certificate_action requires_certificate_version preserves_current_certificate') : null,
        } : null,
        decision_history: list(value.decision_history).map(file),
        supporting_documents: list(review.document_history).map(file),
        can_issue_decision: value.can_issue_decision === true && actions.issue,
        can_generate_decision: actions.generate,
        independence: actions.independence,
        assignment_basis: 'DECISION_MAKER_ROLE',
        eligibility_errors: strings(value.eligibility_errors),
        upstream_errors: strings(review.eligibility_errors),
        // Notification and certificate issuance remain in their existing compatibility owners.
        notification: null, notification_history: [], can_issue_notification: false,
        defaults: pick(value.defaults, 'organization_name organization_address standard_name management_system certification_scope decision_number decision_date effective_date expiry_date surveillance_interval_months signatory_name signatory_title'),
    };
}
