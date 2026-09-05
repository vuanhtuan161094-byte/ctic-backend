import type { audit_findings, corrective_actions } from '@prisma/client';

/** The existing customer normalizer's explicit allowlist, not a Prisma graph. */
export interface CapEvidenceProjection {
  id: string;
  original_name: string;
  file_kind: string | null;
  version_no: number;
  is_current: boolean;
  created_at: Date;
  download_url: string;
}

export type CapVersionProjection = Pick<
  corrective_actions,
  | 'id'
  | 'version_no'
  | 'root_cause'
  | 'correction'
  | 'corrective_action_plan'
  | 'responsible_person'
  | 'target_date'
  | 'status'
  | 'submitted_at'
  | 'reviewed_at'
  | 'review_comment'
  | 'created_at'
  | 'updated_at'
> & {
  form_data: { custom_content?: { customer_comment?: unknown } } | null;
  submitted_by_user: { full_name: string | null } | null;
  reviewed_by_user: { full_name: string | null } | null;
  evidence_files: CapEvidenceProjection[];
};

export type CapFindingProjection = Pick<
  audit_findings,
  | 'id'
  | 'finding_code'
  | 'finding_type'
  | 'clause'
  | 'requirement'
  | 'description'
  | 'objective_evidence'
  | 'detected_date'
  | 'due_date'
  | 'status'
  | 'closed_at'
  | 'close_comment'
  | 'created_at'
  | 'updated_at'
> & {
  is_overdue: boolean;
  corrective_actions: CapVersionProjection[];
};
