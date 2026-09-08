// Read-only boundary for the nested workspace. Never forward a Prisma graph.
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const rows = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const date = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : text(value);
const person = (value: unknown) => {
  const item = record(value);
  return value
    ? {
        id: text(item.id),
        full_name: text(item.full_name),
        username: text(item.username),
      }
    : null;
};
const file = (item: RecordValue) => ({
  id: text(item.id),
  original_name: text(item.original_name),
  file_kind: text(item.file_kind),
  mime_type: text(item.mime_type),
  version_no: typeof item.version_no === 'number' ? item.version_no : null,
  is_current: item.is_current === true,
  created_at: date(item.created_at),
  download_url:
    typeof item.id === 'string'
      ? `/document-files/${encodeURIComponent(item.id)}/download`
      : null,
});
const criterion = (item: RecordValue) => ({
  key: text(item.key),
  label: text(item.label),
  result: text(item.result),
  comment: text(item.comment),
});
const assignment = (item: RecordValue) => ({
  id: text(item.id),
  status: text(item.status),
  assigned_at: date(item.assigned_at),
  due_at: date(item.due_at),
  note: text(item.note),
  reason: text(item.reason),
  reviewer: person(item.reviewer),
  actor: person(item.actor),
});

export function projectTechnicalReviewWorkspace(
  source: unknown,
  caseId: string,
  actions: { perform: boolean; assign: boolean },
) {
  const root = record(source);
  const plan = record(root.plan);
  const report = record(root.report);
  const review = record(root.review);
  const form = record(review.form_data);
  const f11 = record(form.f11);
  const criteria = record(root.criteria);
  return {
    case_id: caseId,
    plan: {
      id: text(plan.id),
      plan_code: text(plan.plan_code),
      audit_type: text(plan.audit_type),
      planned_start_date: date(plan.planned_start_date),
      planned_end_date: date(plan.planned_end_date),
      project_code: text(plan.project_code),
      standard_name: text(plan.standard_name),
      organization_name: text(plan.organization_name),
    },
    report: root.report
      ? {
          id: text(report.id),
          report_code: text(report.report_code),
          version_no:
            typeof report.version_no === 'number' ? report.version_no : null,
          status: text(report.status),
        }
      : null,
    can_start: root.can_start === true,
    can_assign: actions.assign,
    can_perform: actions.perform,
    assignment_status: text(root.assignment_status),
    current_assignment: root.current_assignment
      ? assignment(record(root.current_assignment))
      : null,
    assignment_history: rows(root.assignment_history).map(assignment),
    eligibility_errors: Array.isArray(root.eligibility_errors)
      ? root.eligibility_errors.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    review: root.review
      ? {
          id: text(review.id),
          report_id: text(review.report_id),
          reviewer_id: text(review.reviewer_id),
          status: text(review.status),
          completed_at: date(review.completed_at),
          reviewer: person(review.reviewer),
          form_data: {
            review_items: rows(form.review_items).map((item) => ({
              item_no: typeof item.item_no === 'number' ? item.item_no : null,
              document_key: text(item.document_key),
              document_name: text(item.document_name),
              document_id: text(item.document_id),
              source_type: text(item.source_type),
              required: item.required !== false,
              status: text(item.status),
              reviewer_comment: text(item.reviewer_comment),
              submitted_note: text(item.submitted_note),
              file_name: text(item.file_name),
              updated_at: date(item.updated_at),
              files: rows(item.files).map(file),
            })),
            f11: {
              review_date: text(f11.review_date),
              audit_language: text(f11.audit_language),
              preliminary_criteria: rows(f11.preliminary_criteria).map(
                criterion,
              ),
              technical_criteria: rows(f11.technical_criteria).map(criterion),
              preliminary_other_comment: text(f11.preliminary_other_comment),
              technical_other_comment: text(f11.technical_other_comment),
              recommendation: text(f11.recommendation),
              recommendation_comment: text(f11.recommendation_comment),
              conditions: text(f11.conditions),
            },
          },
        }
      : null,
    document_history: rows(root.document_history).map(file),
    criteria: {
      preliminary: rows(criteria.preliminary).map(criterion),
      technical: rows(criteria.technical).map(criterion),
    },
  };
}
