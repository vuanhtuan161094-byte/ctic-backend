import { Injectable } from '@nestjs/common';

import { AuditTeamReadinessService } from '../audit-team-appointments/audit-team-readiness.service';
import { countsTowardAuditMandays } from '../audit-team-appointments/integrated-manday-allocation.engine';
import { PrismaService } from '../prisma/prisma.service';
import { ActionAuthorizationService } from '../work-items/action-authorization.service';
import { CertificationProjectsService } from './certification-projects.service';
import {
  CERTIFICATION_CASE_CONTRACT_VERSION,
  type CaseActivityEvent,
  type CaseActivityPage,
  type CaseActivityQuery,
  type CertificationCaseActor,
} from './certification-case-projection.types';

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const ACTIVE_WORK_STATES = ['OPEN', 'IN_PROGRESS'] as const;
const ACTIVITY_SOURCE_LIMIT = 101;

type DossierCycle = {
  dossier_key: string;
  dossier_type: string;
  dossier_label: string;
  dossier_description?: string | null;
  sequence_no: number;
  plan_ids: string[];
  plan_codes?: Array<string | null>;
  planned_start_date?: Date | string | null;
  planned_end_date?: Date | string | null;
  planned_mandays?: unknown;
  next_action?: {
    code: string;
    label: string;
    event_id?: string | null;
    plan_id?: string | null;
    item_key?: string | null;
    responsible_roles?: string[];
    responsible_label?: string | null;
  } | null;
  summary: Record<string, unknown>;
  items: Array<{
    item_no: number;
    document_key: string;
    document_name: string;
    storage_type: string;
    status: string;
    reference_id?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    action_event_id?: string | null;
  }>;
};

type DossierProjection = {
  project: {
    id: string;
    project_code: string;
    status: string | null;
    customer: {
      id: string;
      customer_code: string | null;
      company_name: string;
    };
    standard_name: string | null;
    certification_scope: string | null;
  };
  summary: Record<string, unknown>;
  common_items?: DossierCycle['items'];
  dossiers?: DossierCycle[];
  current_dossier_key?: string | null;
  files: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    document_type: string;
    file_kind: string;
    original_name: string;
    file_url: string | null;
    version_no: number;
    uploaded_at: Date | string;
  }>;
};

type ActivityCursor = {
  occurred_at: string;
  id: string;
};

type TeamReasonProjection = {
  code: string;
  severity: 'BLOCK' | 'WARNING';
  message: string;
};

type TeamProjection = {
  status: string;
  appointment: {
    id: string;
    plan_id: string;
    number: string;
    appointment_date: Date;
    status: string;
    team_lead: string | null;
    audit_start_date: Date | null;
    audit_end_date: Date | null;
  } | null;
  members: Array<Record<string, unknown>>;
  planned_mandays: number | null;
  competence: { status: string; reasons: TeamReasonProjection[] };
  independence: { status: string; reasons: TeamReasonProjection[] };
  blockers: TeamReasonProjection[];
};

function projectTeamReadiness(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { ready: false, reasons: [] as TeamReasonProjection[] };
  }
  const source = value as Record<string, unknown>;
  const rawReasons = Array.isArray(source.reasons) ? source.reasons : [];
  const reasons = rawReasons.flatMap((reason): TeamReasonProjection[] => {
    if (!reason || typeof reason !== 'object') return [];
    const row = reason as Record<string, unknown>;
    if (
      typeof row.code !== 'string' ||
      !['BLOCK', 'WARNING'].includes(String(row.severity)) ||
      typeof row.message !== 'string'
    ) {
      return [];
    }
    return [
      {
        code: row.code,
        severity: row.severity as TeamReasonProjection['severity'],
        message: row.message,
      },
    ];
  });
  return { ready: source.ready_to_issue === true, reasons };
}

export function encodeCaseActivityCursor(
  event: Pick<CaseActivityEvent, 'id' | 'occurred_at'>,
) {
  return Buffer.from(
    JSON.stringify({
      occurred_at: event.occurred_at.toISOString(),
      id: event.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeCaseActivityCursor(
  cursor?: string,
): ActivityCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<ActivityCursor>;
    const date = new Date(parsed.occurred_at ?? '');
    if (!parsed.id || Number.isNaN(date.getTime())) return null;
    return { occurred_at: date.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

@Injectable()
export class CertificationCaseProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: CertificationProjectsService,
    private readonly actionAuthorization: ActionAuthorizationService,
    private readonly teamReadiness: AuditTeamReadinessService,
  ) {}

  private destination(
    projectId: string,
    input?: {
      actionCode?: string | null;
      legacyPath?: string | null;
      cycleKey?: string | null;
      planId?: string | null;
      eventId?: string | null;
    },
  ) {
    const query: Record<string, string> = {};
    if (input?.cycleKey) query.dossier_key = input.cycleKey;
    if (input?.planId) query.audit_plan_id = input.planId;
    if (input?.eventId) query.audit_event_id = input.eventId;
    return {
      route_name: input?.actionCode
        ? `certification_case.${input.actionCode.replaceAll('.', '_').toLowerCase()}`
        : 'certification_case.overview',
      params: { id: projectId },
      query,
      legacy_path: input?.legacyPath ?? null,
      contract_version: CERTIFICATION_CASE_CONTRACT_VERSION,
    };
  }

  private legacyPath(
    projectId: string,
    cycle: DossierCycle | null,
    actionCode?: string | null,
    sourcePath?: string | null,
  ) {
    if (sourcePath?.trim()) return sourcePath;
    const workspaces: Record<string, string> = {
      UPDATE_INFORMATION: 'surveillance-change',
      REVIEW_CHANGE: 'surveillance-change',
      APPOINT_TEAM: 'audit-team',
      PLAN_AUDIT: 'audit-plan',
      EXECUTE_AUDIT: 'audit-execution',
      COMPLETE_NC_CAP: 'cap',
      TECHNICAL_REVIEW: 'technical-review',
      MAKE_DECISION: 'certification-decision',
      NOTIFY_RESULT: 'certification-decision',
      ISSUE_CERTIFICATE: 'certificate-issue',
    };
    const workspace = workspaces[actionCode ?? ''];
    if (!workspace || !cycle) return null;
    const query = new URLSearchParams({
      workspace,
      dossier_key: cycle.dossier_key,
    });
    const planId = cycle.next_action?.plan_id ?? cycle.plan_ids[0];
    if (planId) query.set('audit_plan_id', planId);
    if (cycle.next_action?.event_id) {
      query.set('audit_event_id', cycle.next_action.event_id);
    }
    return `/projects/${encodeURIComponent(projectId)}?${query.toString()}`;
  }

  private groupDocuments(files: DossierProjection['files']) {
    const groups = new Map<string, DossierProjection['files']>();
    const groupKey = (file: DossierProjection['files'][number]) => {
      const value = normalize(
        `${file.document_type} ${file.file_kind} ${file.entity_type}`,
      );
      if (value.includes('certificate')) return 'certificate';
      if (value.includes('technical') || value.includes('review'))
        return 'technical_review';
      if (
        value.includes('decision') ||
        value.includes('result') ||
        value.includes('notification')
      )
        return 'decision_result';
      if (
        value.includes('finding') ||
        value.includes('cap') ||
        value.includes('corrective')
      )
        return 'cap';
      if (
        value.includes('audit') ||
        value.includes('plan') ||
        value.includes('report') ||
        value.includes('checklist')
      )
        return 'audit';
      if (
        value.includes('application') ||
        value.includes('customer') ||
        value.includes('business')
      )
        return 'customer_evidence';
      return 'other';
    };
    for (const file of files) {
      const key = groupKey(file);
      groups.set(key, [...(groups.get(key) ?? []), file]);
    }
    const order = [
      'customer_evidence',
      'audit',
      'cap',
      'technical_review',
      'decision_result',
      'certificate',
      'other',
    ];
    return order.map((key) => {
      const entries = [...(groups.get(key) ?? [])].sort(
        (left, right) =>
          new Date(right.uploaded_at).getTime() -
          new Date(left.uploaded_at).getTime(),
      );
      return {
        key,
        count: entries.length,
        ready: entries.length > 0,
        latest: entries[0]
          ? {
              id: entries[0].id,
              entity_type: entries[0].entity_type,
              entity_id: entries[0].entity_id,
              document_type: entries[0].document_type,
              file_kind: entries[0].file_kind,
              original_name: entries[0].original_name,
              version_no: entries[0].version_no,
              uploaded_at: entries[0].uploaded_at,
            }
          : null,
        items: entries.slice(0, 20).map((file) => ({
          id: file.id,
          entity_type: file.entity_type,
          entity_id: file.entity_id,
          document_type: file.document_type,
          file_kind: file.file_kind,
          original_name: file.original_name,
          version_no: file.version_no,
          uploaded_at: file.uploaded_at,
        })),
      };
    });
  }

  private async projectTeam(planIds: string[]): Promise<TeamProjection> {
    if (!planIds.length) {
      return {
        status: 'NOT_CONFIGURED',
        appointment: null,
        members: [],
        planned_mandays: null,
        competence: { status: 'NOT_EVALUATED', reasons: [] },
        independence: { status: 'NOT_EVALUATED', reasons: [] },
        blockers: [],
      };
    }
    const appointment = await this.prisma.audit_team_appointments.findFirst({
      where: {
        audit_plan_id: { in: planIds },
        status: { not: 'cancelled' },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        audit_plan_id: true,
        appointment_number: true,
        appointment_date: true,
        status: true,
        members: {
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            team_role: true,
            planned_start_date: true,
            planned_end_date: true,
            planned_mandays: true,
            assignment_status: true,
            competency_status: true,
            confirmed_at: true,
            experts: {
              select: {
                id: true,
                employee_code: true,
                full_name: true,
              },
            },
          },
        },
      },
    });
    if (!appointment) {
      return {
        status: 'NOT_CONFIGURED',
        appointment: null,
        members: [],
        planned_mandays: null,
        competence: { status: 'NOT_EVALUATED', reasons: [] },
        independence: { status: 'NOT_EVALUATED', reasons: [] },
        blockers: [],
      };
    }
    const readinessValue: unknown = await this.teamReadiness.evaluate(
      appointment.id,
    );
    const readiness = projectTeamReadiness(readinessValue);
    const reasons = readiness.reasons.map((reason) => ({
      code: reason.code,
      severity: reason.severity,
      message: reason.message,
    }));
    const independenceReasons = reasons.filter((reason) =>
      reason.code.includes('INDEPENDENCE'),
    );
    const competenceReasons = reasons.filter(
      (reason) =>
        reason.code.includes('COMPETENCY') ||
        reason.code.includes('SCOPE') ||
        reason.code.includes('LEADER') ||
        reason.code.includes('TECHNICAL'),
    );
    const statusFor = (source: typeof reasons) =>
      source.some((item) => item.severity === 'BLOCK')
        ? 'BLOCKED'
        : source.some((item) => item.severity === 'WARNING')
          ? 'WARNING'
          : 'READY';
    const auditStartDates = appointment.members
      .map((member) => member.planned_start_date)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime());
    const auditEndDates = appointment.members
      .map((member) => member.planned_end_date)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime());
    return {
      status: readiness.ready ? 'READY' : 'BLOCKED',
      appointment: {
        id: appointment.id,
        plan_id: appointment.audit_plan_id,
        number: appointment.appointment_number,
        appointment_date: appointment.appointment_date,
        status: appointment.status,
        team_lead:
          appointment.members.find(
            (member) => normalize(member.team_role) === 'team_leader',
          )?.experts.full_name ?? null,
        audit_start_date: auditStartDates[0] ?? null,
        audit_end_date: auditEndDates.at(-1) ?? null,
      },
      members: appointment.members.map((member) => ({
        id: member.id,
        expert: {
          id: member.experts.id,
          employee_code: member.experts.employee_code,
          display_name: member.experts.full_name,
        },
        role: member.team_role,
        planned_start_date: member.planned_start_date,
        planned_end_date: member.planned_end_date,
        planned_mandays: member.planned_mandays,
        assignment_status: member.assignment_status,
        competency_status: member.competency_status,
        confirmed: Boolean(member.confirmed_at),
      })),
      planned_mandays: appointment.members
        .filter((member) => countsTowardAuditMandays(member.team_role))
        .reduce(
          (total, member) => total + Number(member.planned_mandays ?? 0),
          0,
        ),
      competence: {
        status: statusFor(competenceReasons),
        reasons: competenceReasons,
      },
      independence: {
        status: statusFor(independenceReasons),
        reasons: independenceReasons,
      },
      blockers: reasons,
    };
  }

  private safeActor(
    displayName: string | null | undefined,
    actor: CertificationCaseActor,
  ) {
    const roles = new Set(
      (actor.roles ?? []).map((role) => role.toUpperCase()),
    );
    if (!displayName) return null;
    if (roles.has('SALES')) return { display_name: 'Nhân sự nội bộ' };
    return { display_name: displayName };
  }

  private activityDescription(
    type: CaseActivityEvent['type'],
    status?: string | null,
  ) {
    const labels: Record<CaseActivityEvent['type'], string> = {
      APPLICATION_REVIEW: 'Trạng thái thẩm xét đơn đã được cập nhật.',
      WORK_ITEM: 'Công việc nghiệp vụ trong hồ sơ đã được cập nhật.',
      AUDIT_REPORT: 'Báo cáo đánh giá đã được ghi nhận.',
      TECHNICAL_REVIEW: 'Thẩm xét kỹ thuật đã được ghi nhận.',
      CERTIFICATION_DECISION: 'Quyết định chứng nhận đã được ghi nhận.',
      CERTIFICATE: 'Phiên bản chứng chỉ đã được ghi nhận.',
    };
    return status ? `${labels[type]} Trạng thái: ${status}.` : labels[type];
  }

  private async activityEvents(
    projectId: string,
    actor: CertificationCaseActor,
    query: CaseActivityQuery,
    dossier?: DossierProjection,
  ) {
    const cursor = decodeCaseActivityCursor(query.cursor);
    const maxDate = cursor ? new Date(cursor.occurred_at) : undefined;
    const cycles = dossier?.dossiers ?? [];
    const cycle = query.cycle
      ? (cycles.find((item) => item.dossier_key === query.cycle) ?? null)
      : null;
    const planIds = cycle?.plan_ids ?? [];
    const types = new Set(
      (query.types ?? []).map((type) => type.toUpperCase()),
    );
    const accepts = (type: CaseActivityEvent['type']) =>
      types.size === 0 || types.has(type);
    const dateWhere = maxDate ? { lte: maxDate } : undefined;
    const planWhere = cycle ? { in: planIds } : undefined;

    const [
      reviewActions,
      workItems,
      reports,
      reviews,
      decisions,
      certificates,
    ] = await Promise.all([
      accepts('APPLICATION_REVIEW') && !cycle
        ? this.prisma.application_review_actions.findMany({
            where: {
              created_at: dateWhere,
              review: {
                certification_applications: {
                  certification_projects: { some: { id: projectId } },
                },
              },
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: ACTIVITY_SOURCE_LIMIT,
            select: {
              id: true,
              action: true,
              to_status: true,
              created_at: true,
              actor: { select: { full_name: true, username: true } },
            },
          })
        : [],
      accepts('WORK_ITEM')
        ? this.prisma.work_items.findMany({
            where: {
              project_id: projectId,
              ...(cycle
                ? {
                    OR: [
                      { cycle_key: cycle.dossier_key },
                      { audit_plan_id: { in: planIds } },
                    ],
                  }
                : {}),
              created_at: dateWhere,
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: ACTIVITY_SOURCE_LIMIT,
            select: {
              id: true,
              title: true,
              status: true,
              action_code: true,
              cycle_key: true,
              audit_plan_id: true,
              destination_path: true,
              created_at: true,
              completed_at: true,
              completed_user: { select: { full_name: true, username: true } },
            },
          })
        : [],
      accepts('AUDIT_REPORT')
        ? this.prisma.reports.findMany({
            where: {
              audit_plan_id: planWhere,
              audit_plans: { project_id: projectId },
              created_at: dateWhere,
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: ACTIVITY_SOURCE_LIMIT,
            select: {
              id: true,
              audit_plan_id: true,
              report_code: true,
              status: true,
              created_at: true,
              preparer: { select: { full_name: true, username: true } },
            },
          })
        : [],
      accepts('TECHNICAL_REVIEW')
        ? this.prisma.technical_reviews.findMany({
            where: {
              reports: {
                audit_plan_id: planWhere,
                audit_plans: { project_id: projectId },
              },
              created_at: dateWhere,
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: ACTIVITY_SOURCE_LIMIT,
            select: {
              id: true,
              status: true,
              created_at: true,
              reports: { select: { audit_plan_id: true } },
              reviewer: { select: { full_name: true, username: true } },
            },
          })
        : [],
      accepts('CERTIFICATION_DECISION')
        ? this.prisma.certification_decisions.findMany({
            where: {
              project_id: projectId,
              created_at: dateWhere,
              ...(cycle
                ? {
                    technical_reviews: {
                      reports: { audit_plan_id: { in: planIds } },
                    },
                  }
                : {}),
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: ACTIVITY_SOURCE_LIMIT,
            select: {
              id: true,
              decision_number: true,
              decision_result: true,
              status: true,
              created_at: true,
            },
          })
        : [],
      accepts('CERTIFICATE')
        ? this.prisma.certificates.findMany({
            where: {
              technical_reviews: {
                reports: {
                  audit_plan_id: planWhere,
                  audit_plans: { project_id: projectId },
                },
              },
              created_at: dateWhere,
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: ACTIVITY_SOURCE_LIMIT,
            select: {
              id: true,
              cert_number: true,
              status: true,
              created_at: true,
              technical_reviews: {
                select: { reports: { select: { audit_plan_id: true } } },
              },
            },
          })
        : [],
    ]);

    const cycleForPlan = (planId?: string | null) =>
      cycles.find((item) => item.plan_ids.includes(planId ?? ''))
        ?.dossier_key ?? null;
    const result: CaseActivityEvent[] = [];
    for (const item of reviewActions)
      result.push({
        id: `application-review:${item.id}`,
        occurred_at: item.created_at,
        type: 'APPLICATION_REVIEW',
        title: 'Cập nhật thẩm xét đơn đăng ký',
        description: this.activityDescription(
          'APPLICATION_REVIEW',
          item.to_status ?? item.action,
        ),
        actor: this.safeActor(
          item.actor.full_name ?? item.actor.username,
          actor,
        ),
        cycle_key: null,
        stage: 'application_review',
        destination: null,
        importance: 'INFO',
      });
    for (const item of workItems) {
      const occurredAt = item.completed_at ?? item.created_at;
      result.push({
        id: `work-item:${item.id}`,
        occurred_at: occurredAt,
        type: 'WORK_ITEM',
        title: item.title,
        description: this.activityDescription('WORK_ITEM', item.status),
        actor: this.safeActor(
          item.completed_user?.full_name ?? item.completed_user?.username,
          actor,
        ),
        cycle_key: item.cycle_key ?? cycleForPlan(item.audit_plan_id),
        stage: item.action_code,
        destination: this.destination(projectId, {
          actionCode: item.action_code,
          legacyPath: item.destination_path,
          cycleKey: item.cycle_key,
          planId: item.audit_plan_id,
        }),
        importance: item.status === 'DONE' ? 'INFO' : 'IMPORTANT',
      });
    }
    for (const item of reports)
      result.push({
        id: `audit-report:${item.id}`,
        occurred_at: item.created_at,
        type: 'AUDIT_REPORT',
        title: item.report_code
          ? `Báo cáo ${item.report_code}`
          : 'Báo cáo đánh giá',
        description: this.activityDescription('AUDIT_REPORT', item.status),
        actor: this.safeActor(
          item.preparer?.full_name ?? item.preparer?.username,
          actor,
        ),
        cycle_key: cycleForPlan(item.audit_plan_id),
        stage: 'audit_report',
        destination: null,
        importance: 'INFO',
      });
    for (const item of reviews)
      result.push({
        id: `technical-review:${item.id}`,
        occurred_at: item.created_at,
        type: 'TECHNICAL_REVIEW',
        title: 'Thẩm xét kỹ thuật',
        description: this.activityDescription('TECHNICAL_REVIEW', item.status),
        actor: this.safeActor(
          item.reviewer.full_name ?? item.reviewer.username,
          actor,
        ),
        cycle_key: cycleForPlan(item.reports.audit_plan_id),
        stage: 'technical_review',
        destination: null,
        importance: 'IMPORTANT',
      });
    for (const item of decisions)
      result.push({
        id: `certification-decision:${item.id}`,
        occurred_at: item.created_at,
        type: 'CERTIFICATION_DECISION',
        title: `Quyết định ${item.decision_number}`,
        description: this.activityDescription(
          'CERTIFICATION_DECISION',
          item.decision_result ?? item.status,
        ),
        actor: null,
        cycle_key: null,
        stage: 'certification_decision',
        destination: null,
        importance: 'CRITICAL',
      });
    for (const item of certificates)
      result.push({
        id: `certificate:${item.id}`,
        occurred_at: item.created_at,
        type: 'CERTIFICATE',
        title: `Chứng chỉ ${item.cert_number}`,
        description: this.activityDescription('CERTIFICATE', item.status),
        actor: null,
        cycle_key: cycleForPlan(item.technical_reviews.reports.audit_plan_id),
        stage: 'certificate',
        destination: null,
        importance: 'CRITICAL',
      });
    return result
      .sort((left, right) => {
        const byDate = right.occurred_at.getTime() - left.occurred_at.getTime();
        return byDate || right.id.localeCompare(left.id);
      })
      .filter(
        (event) =>
          !cursor ||
          event.occurred_at.getTime() <
            new Date(cursor.occurred_at).getTime() ||
          (event.occurred_at.getTime() ===
            new Date(cursor.occurred_at).getTime() &&
            event.id.localeCompare(cursor.id) < 0),
      );
  }

  async getActivity(
    projectId: string,
    actor: CertificationCaseActor,
    query: CaseActivityQuery = {},
    dossierSource?: DossierProjection,
  ): Promise<CaseActivityPage> {
    const limit = Number.isFinite(query.limit)
      ? Math.min(Math.max(Math.trunc(query.limit ?? 20), 1), 50)
      : 20;
    const dossier =
      dossierSource ?? (await this.projects.getDossier(projectId));
    const events = await this.activityEvents(projectId, actor, query, dossier);
    const items = events.slice(0, limit);
    const hasMore = events.length > limit;
    return {
      contract_version: CERTIFICATION_CASE_CONTRACT_VERSION,
      items,
      page: {
        limit,
        has_more: hasMore,
        next_cursor:
          hasMore && items.length
            ? encodeCaseActivityCursor(items.at(-1)!)
            : null,
      },
    };
  }

  private async allowedActions(
    projectId: string,
    actor: CertificationCaseActor,
    cycle: DossierCycle | null,
  ) {
    const workItems = await this.prisma.work_items.findMany({
      where: {
        project_id: projectId,
        status: { in: [...ACTIVE_WORK_STATES] },
        ...(cycle
          ? {
              OR: [
                { cycle_key: cycle.dossier_key },
                { audit_plan_id: { in: cycle.plan_ids } },
              ],
            }
          : {}),
      },
      orderBy: [{ due_at: 'asc' }, { created_at: 'asc' }],
      take: 50,
      select: {
        id: true,
        action_code: true,
        title: true,
        status: true,
        assigned_user_id: true,
        assigned_role: true,
        cycle_key: true,
        audit_event_id: true,
        audit_plan_id: true,
        due_at: true,
        destination_path: true,
      },
    });
    const delegatedAssignments = new Map<string, string>();
    if (actor.userId) {
      const delegated = await this.prisma.delegations.findMany({
        where: {
          delegate_user_id: actor.userId,
          project_id: projectId,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          effective_from: { lte: new Date() },
          effective_to: { gt: new Date() },
        },
        select: {
          id: true,
          delegator_user_id: true,
          action_codes_json: true,
        },
      });
      for (const delegation of delegated) {
        try {
          const actions = JSON.parse(delegation.action_codes_json) as unknown[];
          for (const action of actions) {
            delegatedAssignments.set(
              `${delegation.delegator_user_id}:${String(action).toLowerCase()}`,
              delegation.id,
            );
          }
        } catch {
          // Invalid historical delegation metadata grants no action.
        }
      }
    }
    return workItems
      .filter((item) => {
        const delegationId = item.assigned_user_id
          ? delegatedAssignments.get(
              `${item.assigned_user_id}:${item.action_code.toLowerCase()}`,
            )
          : undefined;
        return this.actionAuthorization.canPerformActionWithinScope({
          user: actor,
          actionCode: item.action_code,
          resource: { projectId },
          assignment: {
            assignedUserId: item.assigned_user_id,
            assignedRole: item.assigned_role,
          },
          workflowState: item.status,
          effectiveDelegation:
            delegationId && item.assigned_user_id
              ? {
                  id: delegationId,
                  delegatorUserId: item.assigned_user_id,
                }
              : null,
        });
      })
      .map((item) => ({
        code: item.action_code,
        label: item.title,
        work_item_id: item.id,
        due_at: item.due_at,
        destination: this.destination(projectId, {
          actionCode: item.action_code,
          legacyPath: item.destination_path,
          cycleKey: item.cycle_key,
          planId: item.audit_plan_id,
          eventId: item.audit_event_id,
        }),
      }));
  }

  private sla(
    nextAction: { due_at?: Date | null } | null,
    fallbackDueDate?: Date | string | null,
  ) {
    const dueAt = nextAction?.due_at ?? fallbackDueDate ?? null;
    if (!dueAt) {
      return {
        applicability: nextAction ? 'APPLICABLE' : 'NOT_APPLICABLE',
        status: nextAction ? 'NOT_CONFIGURED' : 'NOT_APPLICABLE',
        due_at: null,
        remaining_days: null,
      };
    }
    const due = new Date(dueAt);
    const remainingDays = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    return {
      applicability: 'APPLICABLE',
      status:
        remainingDays < 0 ? 'OVERDUE' : remainingDays <= 7 ? 'WARNING' : 'DUE',
      due_at: due,
      remaining_days: remainingDays,
    };
  }

  async getWorkspace(projectId: string, actor: CertificationCaseActor) {
    const [project, dossierValue, alerts] = await Promise.all([
      this.projects.findOne(projectId),
      this.projects.getDossier(projectId),
      this.projects.getAlerts(projectId, 90, actor.roles ?? []),
    ]);
    const dossier = dossierValue as DossierProjection;
    const cycles = dossier.dossiers ?? [];
    const currentCycle =
      cycles.find(
        (cycle) => cycle.dossier_key === dossier.current_dossier_key,
      ) ??
      cycles[0] ??
      null;
    const [allowedActions, teamSummary, recentActivity] = await Promise.all([
      this.allowedActions(projectId, actor, currentCycle),
      this.projectTeam(currentCycle?.plan_ids ?? []),
      this.getActivity(
        projectId,
        actor,
        {
          limit: 8,
          cycle: currentCycle?.dossier_key,
        },
        dossier,
      ),
    ]);
    const nextItem =
      currentCycle?.items.find(
        (item) =>
          !['completed', 'not_applicable'].includes(normalize(item.status)),
      ) ?? null;
    const sourceAction = currentCycle?.next_action ?? null;
    const allowedPrimary =
      allowedActions.find((action) => {
        const expected: Record<string, string> = {
          UPDATE_INFORMATION: 'surveillance.change_review',
          REVIEW_CHANGE: 'surveillance.change_review',
          APPOINT_TEAM: 'audit_team.issue',
          PLAN_AUDIT: 'audit_plan.prepare',
          EXECUTE_AUDIT: 'audit.execute',
          COMPLETE_NC_CAP: 'cap.review',
          TECHNICAL_REVIEW: 'technical_review.perform',
          MAKE_DECISION: 'certification_decision.issue',
          ISSUE_CERTIFICATE: 'certificate.issue',
        };
        return action.code === expected[sourceAction?.code ?? ''];
      }) ??
      allowedActions[0] ??
      null;
    const nextAction = sourceAction
      ? {
          code: sourceAction.code,
          label: sourceAction.label,
          business_meaning:
            'Điều hướng đến không gian nghiệp vụ tương thích; không tự cấp quyền thao tác.',
          authorized: Boolean(allowedPrimary),
          disabled_reason: allowedPrimary
            ? null
            : 'Tài khoản hiện tại không có công việc được phân công và được máy chủ cho phép.',
          destination: this.destination(projectId, {
            actionCode: sourceAction.code,
            legacyPath: this.legacyPath(
              projectId,
              currentCycle,
              sourceAction.code,
            ),
            cycleKey: currentCycle?.dossier_key,
            planId: sourceAction.plan_id,
            eventId: sourceAction.event_id,
          }),
        }
      : null;
    const application = project.certification_applications;
    const firstDatedAlert = [...alerts.alerts]
      .filter((alert) => alert.due_date)
      .sort(
        (left, right) =>
          new Date(left.due_date!).getTime() -
          new Date(right.due_date!).getTime(),
      )[0];
    const documentGroups = this.groupDocuments(dossier.files);
    const blockers = [
      ...alerts.alerts.map((alert) => ({
        code: alert.alert_type,
        severity: alert.severity.toUpperCase(),
        message: alert.message,
        due_at: alert.due_date,
        source_id: alert.reference_id,
      })),
      ...teamSummary.blockers.map((reason) => ({
        code: reason.code,
        severity: reason.severity === 'BLOCK' ? 'CRITICAL' : 'WARNING',
        message: reason.message,
        due_at: null,
        source_id: teamSummary.appointment?.id ?? null,
      })),
    ];
    return {
      contract_version: CERTIFICATION_CASE_CONTRACT_VERSION,
      identity: {
        id: project.id,
        case_reference: project.project_code,
        application_id: project.application_id,
        application_reference: application.application_code,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
      customer: {
        id: application.customers.id,
        code: application.customers.customer_code,
        name: application.customers.company_name,
      },
      standards_scope: {
        standards: (project.standard_name ?? application.standard_name)
          .split(/\s*[·;,]\s*/)
          .filter(Boolean)
          .map((display_name) => ({ display_name })),
        display_name: project.standard_name ?? application.standard_name,
        certification_scope: application.certification_scope,
        certification_type: application.certification_type,
        sites: application.sites.map((site) => ({
          id: site.id,
          site_no: site.site_no,
          site_name: site.site_name,
          address: site.address,
          activities: site.activities,
          employee_count: site.employee_count,
          is_headquarters: site.is_headquarters,
        })),
      },
      cycles: cycles.map((cycle) => ({
        key: cycle.dossier_key,
        type: cycle.dossier_type,
        label: cycle.dossier_label,
        description: cycle.dossier_description ?? null,
        sequence_no: cycle.sequence_no,
        plan_ids: cycle.plan_ids,
        plan_codes: cycle.plan_codes ?? [],
        planned_start_date: cycle.planned_start_date ?? null,
        planned_end_date: cycle.planned_end_date ?? null,
        planned_mandays: cycle.planned_mandays ?? null,
        summary: cycle.summary,
        stages:
          cycle.dossier_type === 'initial'
            ? [...(dossier.common_items ?? []), ...cycle.items]
            : cycle.items,
      })),
      current_cycle: currentCycle
        ? { key: currentCycle.dossier_key, label: currentCycle.dossier_label }
        : null,
      case_status: project.status,
      current_stage: nextItem
        ? {
            code: nextItem.document_key,
            label: nextItem.document_name,
            status: nextItem.status,
            source_id: nextItem.reference_id ?? nextItem.entity_id ?? null,
          }
        : null,
      responsibility: allowedPrimary
        ? {
            label: allowedPrimary.label,
            action_code: allowedPrimary.code,
            work_item_id: allowedPrimary.work_item_id,
          }
        : sourceAction
          ? {
              label: sourceAction.responsible_label ?? 'Chưa xác định',
              action_code: null,
              work_item_id: null,
            }
          : null,
      next_action: nextAction,
      allowed_actions: allowedActions,
      blockers,
      sla: this.sla(
        allowedPrimary ?? (sourceAction ? { due_at: null } : null),
        firstDatedAlert?.due_date,
      ),
      team_summary: teamSummary,
      document_summary: {
        total: dossier.files.length,
        groups: documentGroups,
      },
      recent_activity: recentActivity,
      links: {
        self: this.destination(projectId),
        activity: {
          route_name: 'certification_case.activity',
          params: { id: projectId },
          query: {},
          legacy_path: null,
          contract_version: CERTIFICATION_CASE_CONTRACT_VERSION,
        },
        legacy_project: `/certification-projects/${encodeURIComponent(projectId)}`,
        legacy_dossier: `/certification-projects/${encodeURIComponent(projectId)}/dossier`,
        legacy_alerts: `/certification-projects/${encodeURIComponent(projectId)}/alerts`,
      },
      projection_meta: {
        generated_at: new Date(),
        bounded: true,
        mutation_capable: false,
      },
    };
  }
}
