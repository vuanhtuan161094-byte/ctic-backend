import type { ResourceActor } from '../security/resource-access.service';

export const CERTIFICATION_CASE_CONTRACT_VERSION = '2.0' as const;

export type CertificationCaseActor = ResourceActor;

export type CaseActivityType =
  | 'APPLICATION_REVIEW'
  | 'WORK_ITEM'
  | 'AUDIT_REPORT'
  | 'TECHNICAL_REVIEW'
  | 'CERTIFICATION_DECISION'
  | 'CERTIFICATE';

export interface CaseActivityQuery {
  cursor?: string;
  limit?: number;
  cycle?: string;
  types?: string[];
}

export interface CaseActivityEvent {
  id: string;
  occurred_at: Date;
  type: CaseActivityType;
  title: string;
  description: string | null;
  actor: { display_name: string } | null;
  cycle_key: string | null;
  stage: string | null;
  destination: {
    route_name: string;
    params: Record<string, string>;
    query: Record<string, string>;
    legacy_path: string | null;
    contract_version: typeof CERTIFICATION_CASE_CONTRACT_VERSION;
  } | null;
  importance: 'INFO' | 'IMPORTANT' | 'CRITICAL';
}

export interface CaseActivityPage {
  contract_version: typeof CERTIFICATION_CASE_CONTRACT_VERSION;
  items: CaseActivityEvent[];
  page: {
    limit: number;
    next_cursor: string | null;
    has_more: boolean;
  };
}
