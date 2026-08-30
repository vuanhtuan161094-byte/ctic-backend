const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('../node_modules/.prisma/client');
require('dotenv').config();

const DRY_RUN = true;

if (process.argv.some((argument) => argument === '--apply')) {
  throw new Error(
    '[DUPLICATE PLAN REPAIR] Apply mode is intentionally unavailable. ' +
    'This script is read-only until Technical Lead approves a separate execution patch.',
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error('[DUPLICATE PLAN REPAIR] DATABASE_URL is required.');
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(process.env.DATABASE_URL),
});

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function appointmentPriority(plan) {
  const status = normalize(plan.audit_team_appointment?.status);
  if (status === 'issued') return 2;
  if (
    plan.audit_team_appointment &&
    !['cancelled', 'canceled', 'revoked', 'superseded'].includes(status)
  ) return 1;
  return 0;
}

function canonicalPlan(plans) {
  return [...plans].sort((left, right) => (
    appointmentPriority(right) - appointmentPriority(left) ||
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
    left.id.localeCompare(right.id)
  ))[0];
}

function parseFormData(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { invalid_json: true };
  }
}

function workingDocumentSummary(plan) {
  const formData = parseFormData(plan.form_data);
  const generation = formData.document_generation ?? {};
  return {
    has_document_generation: Object.keys(generation).length > 0,
    f05_schedule_rows: Array.isArray(generation.schedule_rows)
      ? generation.schedule_rows.length
      : 0,
    f06_checklists: Array.isArray(generation.checklists)
      ? generation.checklists.map((checklist) => ({
        program_key: checklist.program_key ?? null,
        row_count: Array.isArray(checklist.rows) ? checklist.rows.length : 0,
      }))
      : [],
    f07_attendance_rows: Array.isArray(generation.attendance_rows)
      ? generation.attendance_rows.length
      : 0,
  };
}

function planReferenceIds(plan) {
  return [
    plan.id,
    plan.audit_team_appointment?.id,
    ...plan.reports.flatMap((report) => [
      report.id,
      ...report.audit_findings.flatMap((finding) => [
        finding.id,
        ...finding.corrective_actions.map((action) => action.id),
      ]),
      ...report.technical_reviews.map((review) => review.id),
    ]),
  ].filter(Boolean);
}

function filesForPlanTree(plan, files) {
  const referenceIds = new Set(planReferenceIds(plan));
  return files
    .filter((file) => referenceIds.has(file.entity_id))
    .map((file) => ({
      id: file.id,
      entity_type: file.entity_type,
      entity_id: file.entity_id,
      document_type: file.document_type,
      file_kind: file.file_kind,
      version_no: file.version_no,
      is_current: file.is_current,
      original_name: file.original_name,
    }));
}

function reportAndCorrectiveActionReferences(plan) {
  return plan.reports.map((report) => ({
    id: report.id,
    report_code: report.report_code,
    status: report.status,
    form: 'F.09',
    findings: report.audit_findings.map((finding) => ({
      id: finding.id,
      finding_code: finding.finding_code,
      status: finding.status,
      corrective_actions: finding.corrective_actions.map((action) => ({
        id: action.id,
        version_no: action.version_no,
        status: action.status,
        form: 'F.10',
      })),
    })),
    technical_reviews: report.technical_reviews.map((review) => ({
      id: review.id,
      status: review.status,
    })),
  }));
}

function proposedActions(canonical, duplicate, files) {
  const actions = [];
  const canonicalDocuments = workingDocumentSummary(canonical);
  const duplicateDocuments = workingDocumentSummary(duplicate);

  if (
    duplicateDocuments.has_document_generation &&
    !canonicalDocuments.has_document_generation
  ) {
    actions.push({
      action: 'RECONCILE_AND_TRANSFER_FORM_DATA',
      reason: 'Duplicate contains F.05/F.06/F.07 working data missing from canonical PLAN.',
      automatic: false,
    });
  }

  if (
    String(canonical.planned_start_date) !== String(duplicate.planned_start_date) ||
    String(canonical.planned_end_date) !== String(duplicate.planned_end_date)
  ) {
    actions.push({
      action: 'RECONCILE_PLAN_DATES',
      reason: 'Canonical and duplicate date windows differ.',
      automatic: false,
    });
  }

  const duplicateFiles = filesForPlanTree(duplicate, files);
  if (duplicateFiles.length > 0) {
    actions.push({
      action: 'TRANSFER_DOCUMENT_FILE_OWNERSHIP',
      target_plan_id: canonical.id,
      file_ids: duplicateFiles.map((file) => file.id),
      automatic: false,
    });
  }

  if (duplicate.audit_team_appointment) {
    actions.push({
      action: 'RECONCILE_F04_APPOINTMENT',
      appointment_id: duplicate.audit_team_appointment.id,
      reason: 'A duplicate PLAN owns an F.04 and cannot be retired automatically.',
      automatic: false,
    });
  }

  if (duplicate.reports.length > 0) {
    actions.push({
      action: 'RECONCILE_REPORT_CHAIN',
      report_ids: duplicate.reports.map((report) => report.id),
      reason: 'Reports/findings/reviews must preserve their relational chain.',
      automatic: false,
    });
  }

  actions.push({
    action: 'RETIRE_DUPLICATE_WITH_AUDIT_NOTE',
    plan_id: duplicate.id,
    proposed_status: 'cancelled',
    delete: false,
    automatic: false,
    prerequisite: 'All transfer and reconciliation actions approved and completed.',
  });

  return actions;
}

async function main() {
  const plans = await prisma.audit_plans.findMany({
    where: {
      audit_event_id: { not: null },
    },
    include: {
      certification_projects: {
        select: {
          id: true,
          project_code: true,
        },
      },
      audit_event: {
        include: {
          audit_programs: {
            select: {
              id: true,
              program_code: true,
              standard_name: true,
            },
          },
        },
      },
      audit_team_appointment: {
        include: {
          members: true,
          program_manday_requirements: true,
          program_manday_allocations: true,
        },
      },
      reports: {
        include: {
          audit_findings: {
            include: {
              corrective_actions: true,
            },
          },
          technical_reviews: true,
        },
      },
    },
    orderBy: [
      { audit_event_id: 'asc' },
      { created_at: 'asc' },
    ],
  });

  const byEvent = new Map();
  for (const plan of plans) {
    const candidates = byEvent.get(plan.audit_event_id) ?? [];
    candidates.push(plan);
    byEvent.set(plan.audit_event_id, candidates);
  }

  const duplicateGroups = [...byEvent.entries()]
    .filter(([, candidates]) => candidates.length > 1);
  const duplicateReferenceIds = duplicateGroups.flatMap(([, candidates]) => (
    candidates.flatMap((plan) => planReferenceIds(plan))
  ));
  const files = duplicateReferenceIds.length
    ? await prisma.documentFile.findMany({
      where: { entity_id: { in: duplicateReferenceIds } },
      orderBy: { created_at: 'asc' },
    })
    : [];

  const report = duplicateGroups.map(([eventId, candidates]) => {
    const canonical = canonicalPlan(candidates);
    const duplicates = candidates.filter((plan) => plan.id !== canonical.id);
    return {
      audit_event_id: eventId,
      project: canonical.certification_projects,
      program: canonical.audit_event?.audit_programs ?? null,
      event_type: canonical.audit_event?.event_type ?? null,
      candidate_canonical_plan: {
        id: canonical.id,
        plan_code: canonical.plan_code,
        f04: canonical.audit_team_appointment
          ? {
            id: canonical.audit_team_appointment.id,
            status: canonical.audit_team_appointment.status,
          }
          : null,
        dates: {
          start: canonical.planned_start_date,
          end: canonical.planned_end_date,
        },
        status: canonical.status,
        version_no: canonical.version_no,
        working_documents: workingDocumentSummary(canonical),
        files: filesForPlanTree(canonical, files),
        reports_and_f10: reportAndCorrectiveActionReferences(canonical),
      },
      duplicate_plans: duplicates.map((duplicate) => ({
        id: duplicate.id,
        plan_code: duplicate.plan_code,
        dates: {
          start: duplicate.planned_start_date,
          end: duplicate.planned_end_date,
        },
        status: duplicate.status,
        version_no: duplicate.version_no,
        created_at: duplicate.created_at,
        f04: duplicate.audit_team_appointment
          ? {
            id: duplicate.audit_team_appointment.id,
            status: duplicate.audit_team_appointment.status,
          }
          : null,
        working_documents: workingDocumentSummary(duplicate),
        files: filesForPlanTree(duplicate, files),
        reports_and_f10: reportAndCorrectiveActionReferences(duplicate),
        proposed_actions: proposedActions(canonical, duplicate, files),
      })),
    };
  });

  process.stdout.write(`${JSON.stringify({
    dry_run: DRY_RUN,
    destructive_operations: false,
    duplicate_event_count: report.length,
    duplicate_groups: report,
  }, null, 2)}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
