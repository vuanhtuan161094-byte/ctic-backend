const { PrismaMssql } = require('@prisma/adapter-mssql');
const { Prisma, PrismaClient } = require('../node_modules/.prisma/client');

const TARGET = Object.freeze({
  projectCode: 'PRJ-2026-0006',
  projectId: '8a583ca5-3c31-400f-ae37-7e273b8385e1',
  eventId: '79d9e1bb-55f7-42d4-8a14-305d1c6e8880',
  canonical: Object.freeze({
    id: '3dc29f18-d136-4378-bde6-875fb0777078',
    code: 'PLAN-2027-0003',
  }),
  duplicates: Object.freeze([
    Object.freeze({
      id: '1f856641-ec6f-4094-aa4a-7eb3308b92f8',
      code: 'PLAN-2027-0004',
    }),
    Object.freeze({
      id: '9fddca00-040e-42f2-9b7e-f263ca408fca',
      code: 'PLAN-2027-0005',
    }),
  ]),
  approvedStart: '2027-10-26',
  approvedEnd: '2027-11-07',
  oldDuplicateEnd: '2027-10-30',
  approvedMandays: 9.5,
  historicalF05: 'F.05-P.09_C0002_PLAN-2027-0004.docx',
  confirmationToken:
    'RETIRE_PRJ-2026-0006_GS1_79d9e1bb-55f7-42d4-8a14-305d1c6e8880',
});

const EXPECTED_CHECKLIST_ROWS = Object.freeze({
  'ISO9001:2015': 89,
  'ISO14001:2015': 34,
  'ISO45001:2018': 42,
});

class RepairAbortError extends Error {
  constructor(reason, details = []) {
    super(reason);
    this.name = 'RepairAbortError';
    this.details = details;
  }
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}

function decimalNumber(value) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function parseFormData(plan) {
  try {
    return plan?.form_data ? JSON.parse(plan.form_data) : {};
  } catch {
    throw new RepairAbortError(`${plan?.plan_code ?? 'PLAN'} form_data is invalid JSON.`);
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableSerialize(value) {
  return JSON.stringify(stableValue(value));
}

function planById(state, id) {
  return state.plans.find((plan) => plan.id === id) ?? null;
}

function filesForPlan(state, id) {
  return state.files.filter((file) => file.entity_id === id);
}

function dependencySummary(plan) {
  const reports = plan?.reports ?? [];
  const findings = reports.flatMap((report) => report.audit_findings ?? []);
  const correctiveActions = findings.flatMap(
    (finding) => finding.corrective_actions ?? [],
  );
  const reviews = reports.flatMap((report) => report.technical_reviews ?? []);
  return {
    reportIds: reports.map((item) => item.id).sort(),
    findingIds: findings.map((item) => item.id).sort(),
    correctiveActionIds: correctiveActions.map((item) => item.id).sort(),
    reviewIds: reviews.map((item) => item.id).sort(),
    decisionIds: reviews.flatMap((item) =>
      item.certification_decision ? [item.certification_decision.id] : [],
    ).sort(),
    notificationIds: reviews.flatMap((item) =>
      item.audit_result_notification ? [item.audit_result_notification.id] : [],
    ).sort(),
    certificateIds: reviews.flatMap((item) =>
      item.certificates ? [item.certificates.id] : [],
    ).sort(),
  };
}

function dependencyCount(summary) {
  return Object.values(summary).reduce((total, ids) => total + ids.length, 0);
}

function appointmentMandays(plan) {
  return (plan?.audit_team_appointment?.members ?? []).reduce(
    (total, member) => total + decimalNumber(member.planned_mandays),
    0,
  );
}

function allocationMandays(plan) {
  return (plan?.audit_team_appointment?.program_manday_allocations ?? []).reduce(
    (total, allocation) => total + decimalNumber(allocation.manday_units) / 2,
    0,
  );
}

function generation(plan) {
  return parseFormData(plan).document_generation ?? {};
}

function workingSummary(plan) {
  const data = generation(plan);
  return {
    scheduleRows: Array.isArray(data.schedule_rows) ? data.schedule_rows.length : 0,
    checklists: Object.fromEntries(
      (Array.isArray(data.checklists) ? data.checklists : []).map((checklist) => [
        String(checklist.program_key ?? ''),
        Array.isArray(checklist.rows) ? checklist.rows.length : 0,
      ]),
    ),
    attendanceRows: Array.isArray(data.attendance_rows)
      ? data.attendance_rows.length
      : 0,
    openingDate: data.opening_date ?? null,
    closingDate: data.closing_date ?? null,
  };
}

function normalizedF05(plan, errors, label) {
  const data = structuredClone(parseFormData(plan));
  const documentGeneration = data.document_generation ?? {};
  const scheduleRows = documentGeneration.schedule_rows ?? [];
  const expectedAuditor = label === 'canonical'
    ? 'Nguyễn Văn Trưởng đoàn'
    : 'Đoàn đánh giá';

  if (scheduleRows[1]?.auditor !== expectedAuditor) {
    errors.push(
      `${plan.plan_code} F.05 schedule row 2 auditor changed: ` +
        `${JSON.stringify(scheduleRows[1]?.auditor)}`,
    );
  }
  if (scheduleRows[1]) scheduleRows[1].auditor = '__APPROVED_AUDITOR__';
  documentGeneration.closing_date = TARGET.approvedEnd;
  delete documentGeneration.checklists;
  delete documentGeneration.attendance_rows;
  delete documentGeneration.updated_at;
  data.document_generation = documentGeneration;
  return data;
}

function checklistMap(plan) {
  return new Map(
    (generation(plan).checklists ?? []).map((checklist) => [
      checklist.program_key,
      checklist,
    ]),
  );
}

function normalizedChecklist(checklist, expectedAuditor, errors, label) {
  if (checklist?.auditor_name !== expectedAuditor) {
    errors.push(
      `${label} auditor_name changed: ${JSON.stringify(checklist?.auditor_name)}`,
    );
  }
  const normalized = structuredClone(checklist);
  if (normalized) normalized.auditor_name = '__APPROVED_AUDITOR__';
  return normalized;
}

function compareApprovedContent(canonical, workingDuplicate) {
  const errors = [];
  const canonicalSummary = workingSummary(canonical);
  const duplicateSummary = workingSummary(workingDuplicate);

  const ignoredPlanFields = new Set([
    'id',
    'plan_code',
    'version_no',
    'created_at',
    'updated_at',
    'planned_end_date',
    'form_data',
    'status',
    'audit_team_appointment',
    'reports',
  ]);
  const comparableScalars = (plan) => Object.fromEntries(
    Object.entries(plan).filter(([key]) => !ignoredPlanFields.has(key)),
  );
  if (
    stableSerialize(comparableScalars(canonical)) !==
    stableSerialize(comparableScalars(workingDuplicate))
  ) {
    errors.push('PLAN-2027-0004 contains an unapproved structured PLAN-field difference.');
  }

  if (canonicalSummary.scheduleRows !== 4) {
    errors.push(`Canonical F.05 row count is ${canonicalSummary.scheduleRows}, expected 4.`);
  }
  if (duplicateSummary.scheduleRows !== 4) {
    errors.push(`PLAN-2027-0004 F.05 row count is ${duplicateSummary.scheduleRows}, expected 4.`);
  }
  if (canonicalSummary.attendanceRows !== 3) {
    errors.push(`Canonical F.07 row count is ${canonicalSummary.attendanceRows}, expected 3.`);
  }
  if (duplicateSummary.attendanceRows !== 2) {
    errors.push(`PLAN-2027-0004 F.07 row count is ${duplicateSummary.attendanceRows}, expected 2.`);
  }
  if (canonicalSummary.openingDate !== TARGET.approvedStart) {
    errors.push('Canonical F.05/F.07 opening boundary changed.');
  }
  if (canonicalSummary.closingDate !== TARGET.approvedEnd) {
    errors.push('Canonical F.05/F.07 closing boundary changed.');
  }
  if (duplicateSummary.openingDate !== TARGET.approvedStart) {
    errors.push('PLAN-2027-0004 opening boundary changed.');
  }
  if (duplicateSummary.closingDate !== TARGET.oldDuplicateEnd) {
    errors.push('PLAN-2027-0004 historical closing boundary changed.');
  }

  const canonicalF05 = normalizedF05(canonical, errors, 'canonical');
  const duplicateF05 = normalizedF05(workingDuplicate, errors, 'duplicate');
  if (stableSerialize(canonicalF05) !== stableSerialize(duplicateF05)) {
    errors.push('PLAN-2027-0004 contains an unapproved F.05 difference.');
  }

  const canonicalChecklists = checklistMap(canonical);
  const duplicateChecklists = checklistMap(workingDuplicate);
  const expectedPrograms = Object.keys(EXPECTED_CHECKLIST_ROWS).sort();
  if (stableSerialize([...canonicalChecklists.keys()].sort()) !== stableSerialize(expectedPrograms)) {
    errors.push('Canonical F.06 program set changed.');
  }
  if (stableSerialize([...duplicateChecklists.keys()].sort()) !== stableSerialize(expectedPrograms)) {
    errors.push('PLAN-2027-0004 F.06 program set changed.');
  }
  for (const [programKey, rowCount] of Object.entries(EXPECTED_CHECKLIST_ROWS)) {
    const canonicalChecklist = canonicalChecklists.get(programKey);
    const duplicateChecklist = duplicateChecklists.get(programKey);
    if ((canonicalChecklist?.rows ?? []).length !== rowCount) {
      errors.push(`Canonical ${programKey} row count changed.`);
    }
    if ((duplicateChecklist?.rows ?? []).length !== rowCount) {
      errors.push(`PLAN-2027-0004 ${programKey} row count changed.`);
    }
    const normalizedCanonical = normalizedChecklist(
      canonicalChecklist,
      'Nguyễn Văn Trưởng đoàn',
      errors,
      `Canonical ${programKey}`,
    );
    const normalizedDuplicate = normalizedChecklist(
      duplicateChecklist,
      'Đoàn đánh giá',
      errors,
      `PLAN-2027-0004 ${programKey}`,
    );
    if (stableSerialize(normalizedCanonical) !== stableSerialize(normalizedDuplicate)) {
      errors.push(`PLAN-2027-0004 contains unique ${programKey} checklist data.`);
    }
  }

  const canonicalAttendance = generation(canonical).attendance_rows ?? [];
  const duplicateAttendance = generation(workingDuplicate).attendance_rows ?? [];
  const canonicalRows = new Set(canonicalAttendance.map(stableSerialize));
  for (const row of duplicateAttendance) {
    if (!canonicalRows.has(stableSerialize(row))) {
      errors.push(`PLAN-2027-0004 contains a unique F.07 attendee: ${row.full_name ?? 'unknown'}.`);
    }
  }
  const extras = canonicalAttendance.filter(
    (row) => !duplicateAttendance.some(
      (candidate) => stableSerialize(candidate) === stableSerialize(row),
    ),
  );
  if (
    extras.length !== 1 ||
    extras[0]?.full_name !== 'Nguyễn Văn Trưởng đoàn' ||
    extras[0]?.department_title !== 'Chuyên gia đánh giá - Trưởng đoàn'
  ) {
    errors.push('Canonical F.07 extra participant no longer matches the approved comparison.');
  }

  return {
    ok: errors.length === 0,
    errors,
    classification: errors.length === 0 ? 'CANONICAL_SUPERSET' : 'MISMATCH',
    canonical: canonicalSummary,
    duplicate: duplicateSummary,
  };
}

function isEmptyPlanTemplate(plan) {
  const data = parseFormData(plan);
  const meetings = [data.meetings?.opening_meeting, data.meetings?.closing_meeting]
    .filter(Boolean);
  const meetingsEmpty = meetings.every((meeting) =>
    !meeting.planned_time &&
    !meeting.location &&
    Array.isArray(meeting.participants) &&
    meeting.participants.length === 0,
  );
  const logisticsEmpty = Object.values(data.logistics ?? {}).every(
    (value) => value == null || value === '',
  );
  return !data.document_generation &&
    ['audit_team', 'observers', 'guides', 'detailed_schedule', 'risks_and_opportunities', 'notes']
      .every((key) => Array.isArray(data[key]) && data[key].length === 0) &&
    meetingsEmpty &&
    logisticsEmpty &&
    !data.confidentiality?.requirements;
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

function resolveCanonicalPlan(plans) {
  return [...plans].sort(
    (left, right) =>
      appointmentPriority(right) - appointmentPriority(left) ||
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
      left.id.localeCompare(right.id),
  )[0] ?? null;
}

function planFingerprint(plan, excludeStatus = false) {
  const copy = { ...plan };
  delete copy.reports;
  if (excludeStatus) {
    delete copy.status;
    delete copy.updated_at;
  }
  return stableSerialize(copy);
}

function dependencyFingerprint(state) {
  return stableSerialize(
    state.plans.map((plan) => ({ id: plan.id, ...dependencySummary(plan) })),
  );
}

function fileFingerprint(state) {
  return stableSerialize(state.files);
}

async function inspectState(client) {
  const project = await client.certification_projects.findFirst({
    where: { project_code: TARGET.projectCode },
    select: { id: true, project_code: true },
  });
  const event = await client.audit_program_events.findUnique({
    where: { id: TARGET.eventId },
    include: {
      audit_programs: {
        select: { project_id: true, program_code: true },
      },
    },
  });
  const plans = await client.audit_plans.findMany({
    where: { audit_event_id: TARGET.eventId },
    include: {
      audit_team_appointment: {
        include: {
          members: { orderBy: { created_at: 'asc' } },
          program_manday_allocations: {
            orderBy: [{ member_id: 'asc' }, { program_key: 'asc' }],
          },
        },
      },
      reports: {
        orderBy: { created_at: 'asc' },
        include: {
          audit_findings: {
            orderBy: { created_at: 'asc' },
            include: { corrective_actions: { orderBy: { version_no: 'asc' } } },
          },
          technical_reviews: {
            orderBy: { created_at: 'asc' },
            include: {
              certificates: { select: { id: true } },
              certification_decision: { select: { id: true } },
              audit_result_notification: { select: { id: true } },
            },
          },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  });
  const ids = plans.map((plan) => plan.id);
  const files = ids.length
    ? await client.documentFile.findMany({
        where: { entity_id: { in: ids } },
        orderBy: [{ entity_id: 'asc' }, { document_type: 'asc' }, { version_no: 'asc' }],
      })
    : [];
  const auditLogs = await client.audit_logs.findMany({
    where: { entity_id: { in: [TARGET.eventId, ...ids] } },
    orderBy: { created_at: 'asc' },
  });
  return { project, event, plans, files, auditLogs };
}

function assertEqual(actual, expected, message, errors) {
  if (actual !== expected) {
    errors.push(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertPreconditions(state) {
  const errors = [];
  const expectedIds = [TARGET.canonical.id, ...TARGET.duplicates.map((plan) => plan.id)].sort();
  const actualIds = state.plans.map((plan) => plan.id).sort();
  assertEqual(state.project?.id, TARGET.projectId, 'Target project ID', errors);
  assertEqual(state.event?.audit_programs?.project_id, TARGET.projectId, 'Target event project', errors);
  assertEqual(decimalNumber(state.event?.planned_mandays), TARGET.approvedMandays, 'Event effective MD', errors);
  assertEqual(stableSerialize(actualIds), stableSerialize(expectedIds), 'Exact event PLAN IDs', errors);

  const canonical = planById(state, TARGET.canonical.id);
  const duplicate4 = planById(state, TARGET.duplicates[0].id);
  const duplicate5 = planById(state, TARGET.duplicates[1].id);
  for (const expected of [TARGET.canonical, ...TARGET.duplicates]) {
    const plan = planById(state, expected.id);
    assertEqual(plan?.plan_code, expected.code, `${expected.code} identity`, errors);
    assertEqual(plan?.project_id, TARGET.projectId, `${expected.code} project`, errors);
    assertEqual(plan?.audit_event_id, TARGET.eventId, `${expected.code} event`, errors);
    assertEqual(normalize(plan?.status), 'draft', `${expected.code} pre-repair status`, errors);
  }

  assertEqual(dateOnly(canonical?.planned_start_date), TARGET.approvedStart, 'Canonical start', errors);
  assertEqual(dateOnly(canonical?.planned_end_date), TARGET.approvedEnd, 'Canonical end', errors);
  assertEqual(normalize(canonical?.audit_team_appointment?.status), 'issued', 'Canonical F.04', errors);
  assertEqual(appointmentMandays(canonical), TARGET.approvedMandays, 'Canonical member MD', errors);
  assertEqual(allocationMandays(canonical), TARGET.approvedMandays, 'Canonical allocation MD', errors);

  const content = canonical && duplicate4
    ? compareApprovedContent(canonical, duplicate4)
    : { ok: false, errors: ['Canonical or PLAN-2027-0004 is missing.'] };
  errors.push(...content.errors);

  assertEqual(duplicate4?.audit_team_appointment ?? null, null, 'PLAN-2027-0004 F.04', errors);
  assertEqual(dependencyCount(dependencySummary(duplicate4)), 0, 'PLAN-2027-0004 downstream dependency count', errors);
  assertEqual(duplicate5?.audit_team_appointment ?? null, null, 'PLAN-2027-0005 F.04', errors);
  assertEqual(isEmptyPlanTemplate(duplicate5), true, 'PLAN-2027-0005 material data', errors);
  assertEqual(dependencyCount(dependencySummary(duplicate5)), 0, 'PLAN-2027-0005 downstream dependency count', errors);
  assertEqual(filesForPlan(state, duplicate5?.id).length, 0, 'PLAN-2027-0005 file count', errors);

  const historicalFiles = filesForPlan(state, duplicate4?.id);
  assertEqual(historicalFiles.length, 1, 'PLAN-2027-0004 historical file count', errors);
  assertEqual(historicalFiles[0]?.entity_type, 'audit_plan', 'Historical F.05 entity type', errors);
  assertEqual(historicalFiles[0]?.document_type, 'audit_plan_f05', 'Historical F.05 document type', errors);
  assertEqual(historicalFiles[0]?.file_kind, 'generated_docx', 'Historical F.05 file kind', errors);
  assertEqual(historicalFiles[0]?.original_name, TARGET.historicalF05, 'Historical F.05 filename', errors);
  assertEqual(Boolean(historicalFiles[0]?.sha256), true, 'Historical F.05 SHA-256', errors);

  if (errors.length) {
    throw new RepairAbortError('DEV preconditions do not match; retirement was not started.', errors);
  }
  return { ok: true, checks: 34, contentClassification: content.classification };
}

function validateAppliedState(after, before) {
  const errors = [];
  const canonicalBefore = planById(before, TARGET.canonical.id);
  const canonicalAfter = planById(after, TARGET.canonical.id);
  const duplicate4Before = planById(before, TARGET.duplicates[0].id);
  const duplicate4After = planById(after, TARGET.duplicates[0].id);
  const duplicate5Before = planById(before, TARGET.duplicates[1].id);
  const duplicate5After = planById(after, TARGET.duplicates[1].id);
  const active = after.plans.filter(
    (plan) => !['cancelled', 'canceled'].includes(normalize(plan.status)),
  );

  assertEqual(active.length, 1, 'Non-cancelled operational PLAN count', errors);
  assertEqual(active[0]?.id, TARGET.canonical.id, 'Only non-cancelled PLAN', errors);
  assertEqual(resolveCanonicalPlan(after.plans)?.id, TARGET.canonical.id, 'Canonical resolver result', errors);
  assertEqual(planFingerprint(canonicalAfter), planFingerprint(canonicalBefore), 'Canonical PLAN unchanged', errors);
  assertEqual(normalize(duplicate4After?.status), 'cancelled', 'PLAN-2027-0004 status', errors);
  assertEqual(normalize(duplicate5After?.status), 'cancelled', 'PLAN-2027-0005 status', errors);
  assertEqual(planFingerprint(duplicate4After, true), planFingerprint(duplicate4Before, true), 'PLAN-2027-0004 status-only mutation', errors);
  assertEqual(planFingerprint(duplicate5After, true), planFingerprint(duplicate5Before, true), 'PLAN-2027-0005 status-only mutation', errors);
  assertEqual(fileFingerprint(after), fileFingerprint(before), 'Document attachment preservation', errors);
  assertEqual(dependencyFingerprint(after), dependencyFingerprint(before), 'Downstream dependency preservation', errors);
  assertEqual(
    stableSerialize(after.auditLogs.map((item) => item.id)),
    stableSerialize(before.auditLogs.map((item) => item.id)),
    'Existing audit history preservation before repair audit',
    errors,
  );
  assertEqual(
    filesForPlan(after, TARGET.duplicates[0].id).some(
      (file) => file.original_name === TARGET.historicalF05,
    ),
    true,
    'Historical PLAN-2027-0004 F.05 attachment',
    errors,
  );
  const content = canonicalAfter && duplicate4After
    ? compareApprovedContent(canonicalAfter, duplicate4After)
    : { ok: false, errors: ['Post-repair content records missing.'] };
  errors.push(...content.errors);

  if (errors.length) {
    throw new RepairAbortError('Applied-state validation failed; transaction must roll back.', errors);
  }
  return { ok: true, checks: 13, contentClassification: content.classification };
}

function validateAuditState(after, before, auditRecord) {
  const errors = [];
  const beforeIds = new Set(before.auditLogs.map((item) => item.id));
  for (const id of beforeIds) {
    if (!after.auditLogs.some((item) => item.id === id)) {
      errors.push(`Existing audit record ${id} was not preserved.`);
    }
  }
  const added = after.auditLogs.filter((item) => !beforeIds.has(item.id));
  assertEqual(added.length, 1, 'New repair audit record count', errors);
  assertEqual(added[0]?.id, auditRecord.id, 'Repair audit record identity', errors);
  assertEqual(added[0]?.action, 'RETIRE_DUPLICATE_OPERATIONAL_PLANS', 'Repair audit action', errors);
  assertEqual(added[0]?.outcome, 'success', 'Repair audit outcome', errors);
  if (errors.length) {
    throw new RepairAbortError('Audit validation failed; transaction must roll back.', errors);
  }
  return { ok: true, checks: 4 };
}

function parseArguments(argv) {
  const options = { mode: 'DRY_RUN', project: null, event: null, confirm: null };
  for (const argument of argv) {
    if (argument === '--apply') options.mode = 'APPLY';
    else if (argument.startsWith('--project=')) options.project = argument.slice(10);
    else if (argument.startsWith('--event=')) options.event = argument.slice(8);
    else if (argument.startsWith('--confirm=')) options.confirm = argument.slice(10);
    else throw new RepairAbortError(`Unknown argument: ${argument}`);
  }
  return options;
}

function validateTargetArguments(options) {
  if (options.project && options.project !== TARGET.projectCode) {
    throw new RepairAbortError(`Target project guard rejected ${options.project}.`);
  }
  if (options.event && options.event !== TARGET.eventId) {
    throw new RepairAbortError(`Target event guard rejected ${options.event}.`);
  }
}

function requireApplyAuthorization(options) {
  validateTargetArguments(options);
  const errors = [];
  if (options.project !== TARGET.projectCode) errors.push(`--project must equal ${TARGET.projectCode}`);
  if (options.event !== TARGET.eventId) errors.push(`--event must equal ${TARGET.eventId}`);
  if (options.confirm !== TARGET.confirmationToken) errors.push('Explicit confirmation token is missing or incorrect.');
  if (errors.length) {
    throw new RepairAbortError(
      'APPLY authorization rejected: exact target and confirmation token are required.',
      errors,
    );
  }
}

async function runSerializableRepair(prisma, work) {
  return prisma.$transaction(async (transaction) => work(transaction), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

function auditMetadata() {
  return {
    project: TARGET.projectCode,
    event: TARGET.eventId,
    canonical: TARGET.canonical.id,
    retired: TARGET.duplicates.map((plan) => plan.id),
  };
}

function proposedActions() {
  return [
    { action: 'KEEP_CANONICAL_UNCHANGED', plan: TARGET.canonical },
    {
      action: 'RETIRE_DUPLICATES',
      plans: TARGET.duplicates,
      status: 'cancelled',
      transfer: false,
      delete: false,
    },
    {
      action: 'PRESERVE_HISTORICAL_F05',
      filename: TARGET.historicalF05,
      remainsAttachedTo: TARGET.duplicates[0].id,
    },
    {
      action: 'WRITE_REPAIR_AUDIT',
      auditAction: 'RETIRE_DUPLICATE_OPERATIONAL_PLANS',
      metadata: auditMetadata(),
    },
  ];
}

function stateSummary(state) {
  return {
    project: state.project,
    event: state.event ? {
      id: state.event.id,
      projectId: state.event.audit_programs.project_id,
      effectiveMandays: decimalNumber(state.event.planned_mandays),
    } : null,
    plans: state.plans.map((plan) => ({
      id: plan.id,
      code: plan.plan_code,
      status: plan.status,
      dates: [dateOnly(plan.planned_start_date), dateOnly(plan.planned_end_date)],
      f04: plan.audit_team_appointment ? {
        status: plan.audit_team_appointment.status,
        memberMandays: appointmentMandays(plan),
        allocationMandays: allocationMandays(plan),
      } : null,
      workingData: workingSummary(plan),
      dependencies: dependencySummary(plan),
      files: filesForPlan(state, plan.id).map((file) => ({
        id: file.id,
        type: file.document_type,
        kind: file.file_kind,
        filename: file.original_name,
        version: file.version_no,
      })),
    })),
    canonicalResolver: resolveCanonicalPlan(state.plans)?.plan_code ?? null,
  };
}

function projectedAfter(state) {
  return {
    canonical: { ...TARGET.canonical, status: planById(state, TARGET.canonical.id)?.status, changed: false },
    retired: TARGET.duplicates.map((plan) => ({ ...plan, status: 'cancelled' })),
    nonCancelledOperationalPlans: 1,
    canonicalResolver: TARGET.canonical.code,
    transfers: 0,
    deletes: 0,
    historicalF05: {
      filename: TARGET.historicalF05,
      remainsAttachedTo: TARGET.duplicates[0].id,
    },
  };
}

function simulatedRetirementState(before) {
  const duplicateIds = new Set(TARGET.duplicates.map((plan) => plan.id));
  return {
    ...before,
    plans: before.plans.map((plan) => duplicateIds.has(plan.id)
      ? { ...plan, status: 'cancelled' }
      : plan),
  };
}

async function executeApply(prisma) {
  const startedAt = Date.now();
  return runSerializableRepair(prisma, async (transaction) => {
    await transaction.$queryRaw`
      SELECT id FROM dbo.audit_program_events WITH (UPDLOCK, HOLDLOCK)
      WHERE id = ${TARGET.eventId}
    `;
    await transaction.$queryRaw`
      SELECT id FROM dbo.audit_plans WITH (UPDLOCK, HOLDLOCK)
      WHERE audit_event_id = ${TARGET.eventId}
    `;

    const before = await inspectState(transaction);
    const preconditions = assertPreconditions(before);
    const updateResult = await transaction.audit_plans.updateMany({
      where: {
        id: { in: TARGET.duplicates.map((plan) => plan.id) },
        project_id: TARGET.projectId,
        audit_event_id: TARGET.eventId,
        status: 'draft',
      },
      data: { status: 'cancelled' },
    });
    if (updateResult.count !== 2) {
      throw new RepairAbortError(
        'Retirement update count mismatch; transaction must roll back.',
        [`Expected 2 duplicate PLAN updates, received ${updateResult.count}.`],
      );
    }

    const afterRetirement = await inspectState(transaction);
    const applied = validateAppliedState(afterRetirement, before);
    const metadata = JSON.stringify(auditMetadata());
    if (metadata.length > 255) {
      throw new RepairAbortError('Repair audit metadata exceeds audit_logs.user_agent capacity.');
    }
    const auditRecord = await transaction.audit_logs.create({
      data: {
        user_id: null,
        action: 'RETIRE_DUPLICATE_OPERATIONAL_PLANS',
        entity_type: 'audit_program_event',
        entity_id: TARGET.eventId,
        ip_address: null,
        user_agent: metadata,
        request_id: 'repair:PRJ-2026-0006:GS1:retire-only',
        outcome: 'success',
        status_code: 200,
        duration_ms: Math.max(0, Date.now() - startedAt),
      },
    });
    const afterAudit = await inspectState(transaction);
    const auditValidation = validateAuditState(afterAudit, before, auditRecord);
    return { before, after: afterAudit, preconditions, applied, auditValidation, auditRecord };
  });
}

function createPrismaClient() {
  require('dotenv').config();
  if (!process.env.DATABASE_URL) throw new RepairAbortError('DATABASE_URL is required.');
  return new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL) });
}

async function run(argv) {
  const options = parseArguments(argv);
  validateTargetArguments(options);
  if (options.mode === 'APPLY') requireApplyAuthorization(options);
  const prisma = createPrismaClient();
  try {
    if (options.mode === 'DRY_RUN') {
      const before = await inspectState(prisma);
      const validation = assertPreconditions(before);
      const projectedValidation = validateAppliedState(
        simulatedRetirementState(before),
        before,
      );
      return {
        MODE: 'DRY_RUN',
        TARGET: { project: TARGET.projectCode, event: TARGET.eventId },
        BEFORE: stateSummary(before),
        PROPOSED_ACTIONS: proposedActions(),
        AFTER: projectedAfter(before),
        VALIDATION: {
          preconditions: validation,
          projectedAfter: projectedValidation,
          writesPerformed: false,
        },
        AUDIT_RECORD: {
          action: 'RETIRE_DUPLICATE_OPERATIONAL_PLANS',
          metadata: auditMetadata(),
          persisted: false,
        },
      };
    }
    const result = await executeApply(prisma);
    return {
      MODE: 'APPLY',
      TARGET: { project: TARGET.projectCode, event: TARGET.eventId },
      BEFORE: stateSummary(result.before),
      APPLIED_ACTIONS: proposedActions(),
      AFTER: stateSummary(result.after),
      VALIDATION: {
        preconditions: result.preconditions,
        applied: result.applied,
        audit: result.auditValidation,
      },
      AUDIT_RECORD: {
        id: result.auditRecord.id,
        action: result.auditRecord.action,
        timestamp: result.auditRecord.created_at,
        outcome: result.auditRecord.outcome,
        metadata: auditMetadata(),
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  try {
    const output = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      MODE: process.argv.includes('--apply') ? 'APPLY' : 'DRY_RUN',
      STATUS: 'ABORTED',
      ROLLBACK_ABORT_REASON: error instanceof Error ? error.message : String(error),
      DETAILS: error instanceof RepairAbortError ? error.details : [],
      WRITES_COMMITTED: false,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  RepairAbortError,
  TARGET,
  assertPreconditions,
  compareApprovedContent,
  executeApply,
  parseArguments,
  requireApplyAuthorization,
  runSerializableRepair,
  validateAppliedState,
  validateTargetArguments,
};
