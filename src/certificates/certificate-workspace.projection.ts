type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const scalar = (value: unknown) => value instanceof Date ? value.toISOString() : ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
const pick = (value: unknown, keys: string) => Object.fromEntries(keys.split(' ').map(key => [key, scalar(row(value)[key])]));
const decision = (value: unknown) => value ? pick(value, 'id decision_number decision_date decision_type decision_result status organization_name standard_name certification_scope effective_date expiry_date') : null;
function sites(value: unknown) {
    try {
        return list(typeof value === 'string' ? JSON.parse(value) : value).slice(0, 100)
            .map(site => pick(site, 'site_no site_name address activities employee_count is_headquarters'));
    } catch { return []; }
}
const certificate = (value: unknown) => ({
    ...pick(value, 'id technical_review_id certificate_series_id cert_number verification_code version_no supersedes_certificate_id change_reason organization_name organization_address management_system standard_name certification_scope issue_date expire_date status created_at updated_at'),
    // Re-serialize only approved scalar fields for the existing snapshot renderer.
    site_snapshot_json: JSON.stringify(sites(row(value).site_snapshot_json)),
});
const file = (value: unknown): Row => ({ ...pick(value, 'id entity_id document_type file_kind original_name version_no mime_type is_current created_at'),
    download_url: `/document-files/${encodeURIComponent(String(row(value).id))}/download` });

export function projectCertificateWorkspace(selected: unknown, versions: unknown[], documents: unknown[], history: unknown[], verification: unknown, caseId: string, canUpload: boolean) {
    const source = row(selected);
    const review = row(source.technical_reviews);
    const report = row(review.reports);
    const current = versions[0] ?? selected;
    const selectedDocuments = documents.filter(item => row(item).entity_id === source.id).map(file);
    const publicState = row(verification);
    const currentPdf = selectedDocuments.some(item => item.document_type === 'certificate_pdf' && item.mime_type === 'application/pdf' && item.is_current === true);
    const publicPath = `/public/certificates/${encodeURIComponent(String(source.verification_code))}`;
    const safeHistory = history.slice(0, 50).map(item => ({ ...pick(item, 'id from_status to_status reason effective_date created_at'),
        certification_decision: decision(row(item).certification_decision),
        changed_by_user: row(item).changed_by_user ? pick(row(item).changed_by_user, 'id full_name') : null }));
    return {
        case_id: caseId, certificate_id: source.id,
        is_historical: publicState.is_current_version !== true,
        can_upload_pdf: canUpload && publicState.is_current_version === true,
        public_verification: { available: true, is_valid: publicState.is_valid === true, path: publicPath,
            pdf_path: publicState.is_valid === true && currentPdf ? `${publicPath}/pdf` : null,
            qr_path: `${publicPath}/qr` },
        plan: { id: report.audit_plan_id, project_id: caseId, project_code: null },
        report: pick(report, 'id report_code status'), technical_review: pick(review, 'id status completed_at'),
        decision: decision(review.certification_decision), notification: review.audit_result_notification ? pick(review.audit_result_notification, 'id notification_number notification_date notification_result status sent_at') : null,
        certificate: certificate(selected), current_certificate: certificate(current), current_status: row(current).status,
        current_series: pick(source.certificate_series, 'id series_code status'),
        version_timeline: versions.slice(0, 50).map(item => ({ ...certificate(item), is_current: row(item).id === row(current).id,
            certification_decision: decision(row(item).certification_decision),
            documents: documents.filter(doc => row(doc).entity_id === row(item).id).map(file),
            official_pdf_available: documents.some(doc => row(doc).entity_id === row(item).id && row(doc).document_type === 'certificate_pdf' && row(doc).is_current === true),
        })),
        history: safeHistory, status_history: safeHistory, documents: selectedDocuments,
        history_limit: 50, versions_truncated: versions.length > 50,
        // This exact-resource page never issues a new certificate from a historical source review.
        can_issue_certificate: false, requires_certificate_issuance: false, maintains_current_certificate: false,
        allowed_status_actions: [], can_issue_status_decision: false, eligibility_errors: [],
        issuance_preview: { previous_version: null, proposed_version: null }, defaults: {},
    };
}
