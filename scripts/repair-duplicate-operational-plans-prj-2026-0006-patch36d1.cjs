const { PrismaMssql } = require('@prisma/adapter-mssql');
const { Prisma, PrismaClient } = require('../node_modules/.prisma/client');

const TARGET = Object.freeze({
  projectCode: 'PRJ-2026-0006',
  projectId: '8a583ca5-3c31-400f-ae37-7e273b8385e1',
  eventId: '79d9e1bb-55f7-42d4-8a14-305d1c6e8880',
  canonical: Object.freeze({
    id: '3dc29f18-d136-4378-bde6-875fb0777078',
    code: 'PLAN-2027-0003',
    version: 1,
  }),
  duplicates: Object.freeze([
    Object.freeze({
      id: '1f856641-ec6f-4094-aa4a-7eb3308b92f8',
      code: 'PLAN-2027-0004',
      version: 2,
    }),
    Object.freeze({
      id: '9fddca00-040e-42f2-9b7e-f263ca408fca',
      code: 'PLAN-2027-0005',
      version: 3,
    }),
  ]),
  approvedStart: '2027-10-26',
  approvedEnd: '2027-11-07',
  expectedDuplicateEnd: '2027-10-30',
  approvedMandays: 9.5,
  confirmationToken:
    'APPLY_PRJ-2026-0006_GS1_79d9e1bb-55f7-42d4-8a14-305d1c6e8880',
});

const EXPECTED_CHECKLIST_ROWS = Object.freeze({
  'ISO9001:2015': 89,
  'ISO14001:2015': 34,
  'ISO45001:2018': 42,
});

const GENERATED_F05_NAME = 'F.05-P.09_C0002_PLAN-2027-0004.docx';

class RepairAbortError extends Error {
  constructor(reason, details = [], writesCommitted = false) {
    super(reason);
    this.name = 'RepairAbortError';
    this.details = details;
    this.writesCommitted = writesCommitted;
  }
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
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

function parseFormData(value, label) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    throw new RepairAbortError(`${label} form_data is not valid JSON.`);
  }
}

function documentGeneration(plan) {
  if (!plan) return {};
  return (
    parseFormData(plan.form_data, plan.plan_code).document_generation ?? {}
  );
}

function workingDataSummary(plan) {
  const generation = documentGeneration(plan);
  return {
    scheduleRows: Array.isArray(generation.schedule_rows)
      ? generation.schedule_rows.length
      : 0,
    checklists: Object.fromEntries(
      (Array.isArray(generation.checklists) ? generation.checklists : []).map(
        (checklist) => [
          String(checklist.program_key ?? ''),
          Array.isArray(checklist.rows) ? checklist.rows.length : 0,
        ],
      ),
    ),
    attendanceRows: Array.isArray(generation.attendance_rows)
      ? generation.attendance_rows.length
      : 0,
    openingDate: generation.opening_date ?? null,
    openingTime: generation.opening_time ?? null,
    closingDate: generation.closing_date ?? null,
    closingTime: generation.closing_time ?? null,
  };
}

function dependencySummary(plan) {
  const reports = plan.reports ?? [];
  const findings = reports.flatMap((report) => report.audit_findings ?? []);
  const correctiveActions = findings.flatMap(
    (finding) => finding.corrective_actions ?? [],
  );
  const reviews = reports.flatMap((report) => report.technical_reviews ?? []);
  const certificates = reviews.flatMap((review) =>
    review.certificates ? [review.certificates] : [],
  );
  const decisions = reviews.flatMap((review) =>
    review.certification_decision ? [review.certification_decision] : [],
  );
  const notifications = reviews.flatMap((review) =>
    review.audit_result_notification ? [review.audit_result_notification] : [],
  );

  return {
    reportIds: reports.map((item) => item.id).sort(),
    findingIds: findings.map((item) => item.id).sort(),
    correctiveActionIds: correctiveActions.map((item) => item.id).sort(),
    reviewIds: reviews.map((item) => item.id).sort(),
    certificateIds: certificates.map((item) => item.id).sort(),
    decisionIds: decisions.map((item) => item.id).sort(),
    notificationIds: notifications.map((item) => item.id).sort(),
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
  return (
    plan?.audit_team_appointment?.program_manday_allocations ?? []
  ).reduce(
    (total, allocation) => total + Number(allocation.manday_units ?? 0) / 2,
    0,
  );
}

function planById(state, id) {
  return state.plans.find((plan) => plan.id === id) ?? null;
}

function filesForPlan(state, planId) {
  return state.files.filter((file) => file.entity_id === planId);
}

function materialWorkingData(plan) {
  if (!plan) return false;
  const summary = workingDataSummary(plan);
  const data = parseFormData(plan.form_data, plan.plan_code);
  return (
    summary.scheduleRows > 0 ||
    Object.keys(summary.checklists).length > 0 ||
    summary.attendanceRows > 0 ||
    (Array.isArray(data.detailed_schedule) &&
      data.detailed_schedule.length > 0) ||
    (Array.isArray(data.audit_team) && data.audit_team.length > 0)
  );
}

function planSummary(state, plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    code: plan.plan_code,
    version: plan.version_no,
    status: plan.status,
    dates: {
      start: dateOnly(plan.planned_start_date),
      end: dateOnly(plan.planned_end_date),
    },
    f04: plan.audit_team_appointment
      ? {
          id: plan.audit_team_appointment.id,
          status: plan.audit_team_appointment.status,
          memberCount: plan.audit_team_appointment.members.length,
          memberMandays: appointmentMandays(plan),
          allocatedMandays: allocationMandays(plan),
        }
      : null,
    workingData: workingDataSummary(plan),
    files: filesForPlan(state, plan.id).map((file) => ({
      id: file.id,
      documentType: file.document_type,
      fileKind: file.file_kind,
      originalName: file.original_name,
      version: file.version_no,
      current: file.is_current,
    })),
    dependencies: dependencySummary(plan),
  };
}

function stateSummary(state) {
  return {
    project: state.project,
    event: state.event
      ? {
          id: state.event.id,
          projectId: state.event.audit_programs.project_id,
          type: state.event.event_type,
          plannedMandays: decimalNumber(state.event.planned_mandays),
        }
      : null,
    plans: state.plans.map((plan) => planSummary(state, plan)),
  };
}

async function inspectState(client) {
  const project = await client.certification_projects.findFirst({
    where: {
      project_code: TARGET.projectCode,
    },
    select: {
      id: true,
      project_code: true,
    },
  });

  const event = await client.audit_program_events.findUnique({
    where: {
      id: TARGET.eventId,
    },
    include: {
      audit_programs: {
        select: {
          id: true,
          project_id: true,
          program_code: true,
        },
      },
    },
  });

  const plans = await client.audit_plans.findMany({
    where: {
      audit_event_id: TARGET.eventId,
    },
    include: {
      audit_team_appointment: {
        include: {
          members: true,
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
          technical_reviews: {
            include: {
              certificates: {
                select: { id: true },
              },
              certification_decision: {
                select: { id: true },
              },
              audit_result_notification: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  const files =
    plans.length > 0
      ? await client.documentFile.findMany({
          where: {
            entity_id: {
              in: plans.map((plan) => plan.id),
            },
          },
          orderBy: {
            created_at: 'asc',
          },
        })
      : [];

  return {
    project,
    event,
    plans,
    files,
  };
}

function assertEqual(actual, expected, message, errors) {
  if (actual !== expected) {
    errors.push(
      `${message}: expected ${JSON.stringify(expected)}, ` +
        `received ${JSON.stringify(actual)}`,
    );
  }
}

function assertPreconditions(state) {
  const errors = [];
  const expectedIds = [
    TARGET.canonical.id,
    ...TARGET.duplicates.map((plan) => plan.id),
  ].sort();
  const actualIds = state.plans.map((plan) => plan.id).sort();

  assertEqual(state.project?.id, TARGET.projectId, 'Target project ID', errors);
  assertEqual(state.event?.id, TARGET.eventId, 'Target event ID', errors);
  assertEqual(
    state.event?.audit_programs?.project_id,
    TARGET.projectId,
    'Event project ownership',
    errors,
  );
  assertEqual(
    decimalNumber(state.event?.planned_mandays),
    TARGET.approvedMandays,
    'Event approved MD',
    errors,
  );
  assertEqual(
    JSON.stringify(actualIds),
    JSON.stringify(expectedIds),
    'Exact operational PLAN IDs for target event',
    errors,
  );
  assertEqual(state.plans.length, 3, 'Operational PLAN count', errors);

  const canonical = planById(state, TARGET.canonical.id);
  const workingDuplicate = planById(state, TARGET.duplicates[0].id);
  const emptyDuplicate = planById(state, TARGET.duplicates[1].id);

  for (const expected of [TARGET.canonical, ...TARGET.duplicates]) {
    const plan = planById(state, expected.id);
    assertEqual(
      plan?.plan_code,
      expected.code,
      `${expected.code} code`,
      errors,
    );
    assertEqual(
      plan?.version_no,
      expected.version,
      `${expected.code} version`,
      errors,
    );
    assertEqual(
      plan?.project_id,
      TARGET.projectId,
      `${expected.code} project ownership`,
      errors,
    );
    assertEqual(
      plan?.audit_event_id,
      TARGET.eventId,
      `${expected.code} event ownership`,
      errors,
    );
    assertEqual(
      normalize(plan?.status),
      'draft',
      `${expected.code} DEV status`,
      errors,
    );
  }

  assertEqual(
    dateOnly(canonical?.planned_start_date),
    TARGET.approvedStart,
    'Canonical start date',
    errors,
  );
  assertEqual(
    dateOnly(canonical?.planned_end_date),
    TARGET.approvedEnd,
    'Canonical end date',
    errors,
  );
  assertEqual(
    normalize(canonical?.audit_team_appointment?.status),
    'issued',
    'Canonical F.04 status',
    errors,
  );
  assertEqual(
    appointmentMandays(canonical),
    TARGET.approvedMandays,
    'Canonical appointment member MD',
    errors,
  );
  assertEqual(
    allocationMandays(canonical),
    TARGET.approvedMandays,
    'Canonical program allocation MD',
    errors,
  );
  assertEqual(
    materialWorkingData(canonical),
    false,
    'Canonical must not already contain material F.05/F.06/F.07 data',
    errors,
  );
  assertEqual(
    Object.keys(documentGeneration(canonical)).length,
    0,
    'Canonical document_generation must be empty before merge',
    errors,
  );
  assertEqual(
    filesForPlan(state, TARGET.canonical.id).some(
      (file) =>
        file.document_type === 'audit_plan_f05' &&
        file.file_kind === 'generated_docx',
    ),
    false,
    'Canonical must not already own a generated F.05 DOCX',
    errors,
  );

  assertEqual(
    workingDuplicate?.audit_team_appointment ?? null,
    null,
    'PLAN-2027-0004 F.04',
    errors,
  );
  assertEqual(
    dateOnly(workingDuplicate?.planned_start_date),
    TARGET.approvedStart,
    'PLAN-2027-0004 start date',
    errors,
  );
  assertEqual(
    dateOnly(workingDuplicate?.planned_end_date),
    TARGET.expectedDuplicateEnd,
    'PLAN-2027-0004 DEV end date',
    errors,
  );

  if (workingDuplicate) {
    const working = workingDataSummary(workingDuplicate);
    assertEqual(
      working.scheduleRows,
      4,
      'PLAN-2027-0004 F.05 schedule rows',
      errors,
    );
    assertEqual(
      working.attendanceRows,
      2,
      'PLAN-2027-0004 F.07 attendance rows',
      errors,
    );
    assertEqual(
      working.openingDate,
      TARGET.approvedStart,
      'PLAN-2027-0004 opening boundary date',
      errors,
    );
    assertEqual(
      working.closingDate,
      TARGET.expectedDuplicateEnd,
      'PLAN-2027-0004 closing boundary date',
      errors,
    );
    for (const [programKey, rowCount] of Object.entries(
      EXPECTED_CHECKLIST_ROWS,
    )) {
      assertEqual(
        working.checklists[programKey],
        rowCount,
        `PLAN-2027-0004 F.06 ${programKey} rows`,
        errors,
      );
    }
    assertEqual(
      Object.keys(working.checklists).length,
      3,
      'PLAN-2027-0004 F.06 program count',
      errors,
    );
    assertEqual(
      dependencyCount(dependencySummary(workingDuplicate)),
      0,
      'PLAN-2027-0004 downstream dependencies',
      errors,
    );
  }

  const workingFiles = workingDuplicate
    ? filesForPlan(state, workingDuplicate.id)
    : [];
  assertEqual(workingFiles.length, 1, 'PLAN-2027-0004 file count', errors);
  assertEqual(
    workingFiles[0]?.document_type,
    'audit_plan_f05',
    'PLAN-2027-0004 generated document type',
    errors,
  );
  assertEqual(
    workingFiles[0]?.file_kind,
    'generated_docx',
    'PLAN-2027-0004 generated file kind',
    errors,
  );
  assertEqual(
    workingFiles[0]?.original_name,
    GENERATED_F05_NAME,
    'PLAN-2027-0004 generated file name',
    errors,
  );

  assertEqual(
    emptyDuplicate?.audit_team_appointment ?? null,
    null,
    'PLAN-2027-0005 F.04',
    errors,
  );
  assertEqual(
    dateOnly(emptyDuplicate?.planned_start_date),
    TARGET.approvedStart,
    'PLAN-2027-0005 start date',
    errors,
  );
  assertEqual(
    dateOnly(emptyDuplicate?.planned_end_date),
    TARGET.expectedDuplicateEnd,
    'PLAN-2027-0005 DEV end date',
    errors,
  );
  if (emptyDuplicate) {
    assertEqual(
      materialWorkingData(emptyDuplicate),
      false,
      'PLAN-2027-0005 material working data',
      errors,
    );
    assertEqual(
      dependencyCount(dependencySummary(emptyDuplicate)),
      0,
      'PLAN-2027-0005 downstream dependencies',
      errors,
    );
    assertEqual(
      filesForPlan(state, emptyDuplicate.id).length,
      0,
      'PLAN-2027-0005 file count',
      errors,
    );
  }

  for (const duplicate of [workingDuplicate, emptyDuplicate]) {
    if (!duplicate) continue;
    const dependencies = dependencySummary(duplicate);
    assertEqual(
      dependencies.reportIds.length,
      0,
      `${duplicate.plan_code} reports`,
      errors,
    );
    assertEqual(
      dependencies.findingIds.length,
      0,
      `${duplicate.plan_code} findings`,
      errors,
    );
    assertEqual(
      dependencies.correctiveActionIds.length,
      0,
      `${duplicate.plan_code} F.10 records`,
      errors,
    );
    assertEqual(
      dependencies.reviewIds.length,
      0,
      `${duplicate.plan_code} technical reviews`,
      errors,
    );
    assertEqual(
      dependencies.certificateIds.length,
      0,
      `${duplicate.plan_code} certificates`,
      errors,
    );
  }

  if (errors.length > 0) {
    throw new RepairAbortError(
      'DEV preconditions do not match; repair was not started.',
      errors,
    );
  }

  return {
    ok: true,
    checks: 61,
  };
}

function appointmentPriority(plan) {
  const status = normalize(plan.audit_team_appointment?.status);
  if (status === 'issued') return 2;
  if (
    plan.audit_team_appointment &&
    !['cancelled', 'canceled', 'revoked', 'superseded'].includes(status)
  )
    return 1;
  return 0;
}

function resolveCanonicalPlan(plans) {
  return (
    [...plans].sort(
      (left, right) =>
        appointmentPriority(right) - appointmentPriority(left) ||
        new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime() ||
        left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

function allDependencyIds(state) {
  const aggregate = {
    reportIds: [],
    findingIds: [],
    correctiveActionIds: [],
    reviewIds: [],
    certificateIds: [],
    decisionIds: [],
    notificationIds: [],
  };
  for (const plan of state.plans) {
    const dependencies = dependencySummary(plan);
    for (const key of Object.keys(aggregate)) {
      aggregate[key].push(...dependencies[key]);
      aggregate[key].sort();
    }
  }
  return aggregate;
}

function validateAppliedState(state, beforeDependencies) {
  const errors = [];
  const canonical = planById(state, TARGET.canonical.id);
  const workingDuplicate = planById(state, TARGET.duplicates[0].id);
  const emptyDuplicate = planById(state, TARGET.duplicates[1].id);
  const activePlans = state.plans.filter(
    (plan) => !['cancelled', 'canceled'].includes(normalize(plan.status)),
  );

  assertEqual(
    activePlans.length,
    1,
    'Non-cancelled operational PLAN count',
    errors,
  );
  assertEqual(
    activePlans[0]?.id,
    TARGET.canonical.id,
    'Only active operational PLAN',
    errors,
  );
  assertEqual(
    resolveCanonicalPlan(state.plans)?.id,
    TARGET.canonical.id,
    'Canonical resolver result',
    errors,
  );
  assertEqual(
    normalize(canonical?.audit_team_appointment?.status),
    'issued',
    'Issued F.04 preservation',
    errors,
  );
  assertEqual(
    appointmentMandays(canonical),
    TARGET.approvedMandays,
    'Canonical appointment MD after repair',
    errors,
  );
  assertEqual(
    allocationMandays(canonical),
    TARGET.approvedMandays,
    'Canonical allocation MD after repair',
    errors,
  );
  assertEqual(
    dateOnly(canonical?.planned_start_date),
    TARGET.approvedStart,
    'Canonical repaired start date',
    errors,
  );
  assertEqual(
    dateOnly(canonical?.planned_end_date),
    TARGET.approvedEnd,
    'Canonical repaired end date',
    errors,
  );

  if (canonical) {
    const working = workingDataSummary(canonical);
    assertEqual(
      working.scheduleRows,
      4,
      'Canonical F.05 schedule rows after repair',
      errors,
    );
    assertEqual(
      working.attendanceRows,
      2,
      'Canonical F.07 attendance rows after repair',
      errors,
    );
    assertEqual(
      working.openingDate,
      TARGET.approvedStart,
      'Canonical F.05/F.07 opening date',
      errors,
    );
    assertEqual(
      working.closingDate,
      TARGET.approvedEnd,
      'Canonical F.05/F.07 closing date',
      errors,
    );
    for (const [programKey, rowCount] of Object.entries(
      EXPECTED_CHECKLIST_ROWS,
    )) {
      assertEqual(
        working.checklists[programKey],
        rowCount,
        `Canonical F.06 ${programKey} rows after repair`,
        errors,
      );
    }
  }

  assertEqual(
    normalize(workingDuplicate?.status),
    'cancelled',
    'PLAN-2027-0004 retired status',
    errors,
  );
  assertEqual(
    normalize(emptyDuplicate?.status),
    'cancelled',
    'PLAN-2027-0005 retired status',
    errors,
  );
  assertEqual(
    filesForPlan(state, TARGET.duplicates[0].id).some(
      (file) => file.original_name === GENERATED_F05_NAME,
    ),
    true,
    'Historical PLAN-2027-0004 F.05 DOCX attachment',
    errors,
  );
  assertEqual(
    filesForPlan(state, TARGET.canonical.id).some(
      (file) =>
        file.document_type === 'audit_plan_f05' &&
        file.file_kind === 'generated_docx',
    ),
    false,
    'Canonical F.05 DOCX must be regenerated normally',
    errors,
  );
  assertEqual(
    JSON.stringify(allDependencyIds(state)),
    JSON.stringify(beforeDependencies),
    'Downstream reference preservation',
    errors,
  );

  if (errors.length > 0) {
    throw new RepairAbortError(
      'Applied-state validation failed; transaction must roll back.',
      errors,
    );
  }

  return {
    ok: true,
    checks: 20,
  };
}

function auditMetadata() {
  return {
    project: TARGET.projectCode,
    event: TARGET.eventId,
    canonical: TARGET.canonical.id,
    retired: TARGET.duplicates.map((plan) => plan.id),
  };
}

function proposedTransfers() {
  return [
    {
      action: 'KEEP_CANONICAL',
      planId: TARGET.canonical.id,
      planCode: TARGET.canonical.code,
    },
    {
      action: 'RECONCILE_OPERATIONAL_DATES',
      plannedStartDate: TARGET.approvedStart,
      plannedEndDate: TARGET.approvedEnd,
    },
    {
      action: 'MERGE_STRUCTURED_WORKING_DATA',
      fromPlanId: TARGET.duplicates[0].id,
      toPlanId: TARGET.canonical.id,
      content: [
        'F.05 schedule rows',
        'F.06 checklists for ISO9001/ISO14001/ISO45001',
        'F.07 attendance rows',
      ],
      boundaryDates: {
        opening: TARGET.approvedStart,
        closing: TARGET.approvedEnd,
      },
      preserveExistingTimes: true,
    },
    {
      action: 'KEEP_GENERATED_F05_AS_HISTORICAL_EVIDENCE',
      filename: GENERATED_F05_NAME,
      remainsOnPlanId: TARGET.duplicates[0].id,
      reassign: false,
      nextStep:
        'Regenerate current F.05 normally from PLAN-2027-0003 after repair.',
    },
    {
      action: 'RETIRE_DUPLICATES',
      planIds: TARGET.duplicates.map((plan) => plan.id),
      status: 'cancelled',
      destructiveDelete: false,
    },
  ];
}

function projectedAfterSummary(before) {
  const canonical = planSummary(before, planById(before, TARGET.canonical.id));
  const source = planSummary(before, planById(before, TARGET.duplicates[0].id));
  return {
    canonical: {
      ...canonical,
      status: canonical?.status,
      dates: {
        start: TARGET.approvedStart,
        end: TARGET.approvedEnd,
      },
      workingData: {
        ...source?.workingData,
        openingDate: TARGET.approvedStart,
        closingDate: TARGET.approvedEnd,
      },
      generatedF05Docx: 'not created or reassigned by this script',
    },
    retired: TARGET.duplicates.map((plan) => ({
      id: plan.id,
      code: plan.code,
      status: 'cancelled',
    })),
    historicalGeneratedF05: {
      filename: GENERATED_F05_NAME,
      entityId: TARGET.duplicates[0].id,
    },
  };
}

function parseArguments(argv) {
  const options = {
    mode: 'DRY_RUN',
    project: null,
    event: null,
    confirm: null,
  };
  for (const argument of argv) {
    if (argument === '--apply') {
      options.mode = 'APPLY';
    } else if (argument.startsWith('--project=')) {
      options.project = argument.slice('--project='.length);
    } else if (argument.startsWith('--event=')) {
      options.event = argument.slice('--event='.length);
    } else if (argument.startsWith('--confirm=')) {
      options.confirm = argument.slice('--confirm='.length);
    } else {
      throw new RepairAbortError(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function validateTargetArguments(options) {
  if (options.project && options.project !== TARGET.projectCode) {
    throw new RepairAbortError(
      `Target project guard rejected ${options.project}.`,
    );
  }
  if (options.event && options.event !== TARGET.eventId) {
    throw new RepairAbortError(`Target event guard rejected ${options.event}.`);
  }
}

function requireApplyAuthorization(options) {
  validateTargetArguments(options);
  const errors = [];
  if (options.project !== TARGET.projectCode) {
    errors.push(`--project must equal ${TARGET.projectCode}`);
  }
  if (options.event !== TARGET.eventId) {
    errors.push(`--event must equal ${TARGET.eventId}`);
  }
  if (options.confirm !== TARGET.confirmationToken) {
    errors.push('Explicit confirmation token is missing or incorrect.');
  }
  if (errors.length > 0) {
    throw new RepairAbortError(
      'APPLY authorization rejected: exact target and confirmation token ' +
        'are required before opening a transaction.',
      errors,
    );
  }
}

async function runSerializableRepair(prisma, repairWork) {
  return prisma.$transaction(async (transaction) => repairWork(transaction), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

function mergedCanonicalFormData(canonical, source) {
  const canonicalData = parseFormData(canonical.form_data, canonical.plan_code);
  const sourceData = parseFormData(source.form_data, source.plan_code);
  const sourceGeneration = sourceData.document_generation;

  if (!sourceGeneration) {
    throw new RepairAbortError(
      'PLAN-2027-0004 document_generation is missing.',
    );
  }

  return {
    ...canonicalData,
    document_generation: {
      ...sourceGeneration,
      opening_date: TARGET.approvedStart,
      closing_date: TARGET.approvedEnd,
      updated_at: new Date().toISOString(),
    },
  };
}

async function executeApply(prisma) {
  const startedAt = Date.now();
  return runSerializableRepair(prisma, async (transaction) => {
    await transaction.$queryRaw`
        SELECT id
        FROM dbo.audit_program_events WITH (UPDLOCK, HOLDLOCK)
        WHERE id = ${TARGET.eventId}
      `;

    const before = await inspectState(transaction);
    const preconditionValidation = assertPreconditions(before);
    const beforeDependencies = allDependencyIds(before);
    const canonical = planById(before, TARGET.canonical.id);
    const source = planById(before, TARGET.duplicates[0].id);

    const mergedFormData = mergedCanonicalFormData(canonical, source);

    await transaction.audit_plans.update({
      where: {
        id: TARGET.canonical.id,
      },
      data: {
        planned_start_date: new Date(`${TARGET.approvedStart}T00:00:00.000Z`),
        planned_end_date: new Date(`${TARGET.approvedEnd}T00:00:00.000Z`),
        form_data: JSON.stringify(mergedFormData),
      },
    });

    for (const duplicate of TARGET.duplicates) {
      await transaction.audit_plans.update({
        where: {
          id: duplicate.id,
        },
        data: {
          status: 'cancelled',
        },
      });
    }

    const appliedState = await inspectState(transaction);
    const appliedValidation = validateAppliedState(
      appliedState,
      beforeDependencies,
    );

    const metadata = JSON.stringify(auditMetadata());
    if (metadata.length > 255) {
      throw new RepairAbortError(
        'Repair audit metadata exceeds audit_logs.user_agent capacity.',
      );
    }

    const auditRecord = await transaction.audit_logs.create({
      data: {
        user_id: null,
        action: 'REPAIR_DUPLICATE_OPERATIONAL_PLANS',
        entity_type: 'audit_program_event',
        entity_id: TARGET.eventId,
        ip_address: null,
        user_agent: metadata,
        request_id: 'repair:PRJ-2026-0006:GS1',
        outcome: 'success',
        status_code: 200,
        duration_ms: Math.max(0, Date.now() - startedAt),
      },
    });

    return {
      before,
      appliedState,
      preconditionValidation,
      appliedValidation,
      auditRecord,
    };
  });
}

function createPrismaClient() {
  require('dotenv').config();
  if (!process.env.DATABASE_URL) {
    throw new RepairAbortError('DATABASE_URL is required.');
  }
  return new PrismaClient({
    adapter: new PrismaMssql(process.env.DATABASE_URL),
  });
}

async function run(argv) {
  const options = parseArguments(argv);
  validateTargetArguments(options);
  if (options.mode === 'APPLY') {
    requireApplyAuthorization(options);
  }

  const prisma = createPrismaClient();
  try {
    if (options.mode === 'DRY_RUN') {
      const before = await inspectState(prisma);
      const validation = assertPreconditions(before);
      return {
        MODE: 'DRY_RUN',
        TARGET: {
          project: TARGET.projectCode,
          event: TARGET.eventId,
        },
        BEFORE: stateSummary(before),
        PROPOSED_TRANSFERS: proposedTransfers(),
        AFTER: projectedAfterSummary(before),
        VALIDATION: {
          preconditions: validation,
          writesPerformed: false,
          postTransaction: 'not applicable in DRY_RUN',
        },
        AUDIT_RECORD: {
          action: 'REPAIR_DUPLICATE_OPERATIONAL_PLANS',
          metadata: auditMetadata(),
          persisted: false,
        },
      };
    }

    const result = await executeApply(prisma);
    let postTransactionState;
    let postTransactionValidation;
    try {
      postTransactionState = await inspectState(prisma);
      postTransactionValidation = validateAppliedState(
        postTransactionState,
        allDependencyIds(result.before),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const details = error instanceof RepairAbortError ? error.details : [];
      throw new RepairAbortError(
        `Repair committed, but post-transaction validation failed: ${reason}`,
        details,
        true,
      );
    }

    return {
      MODE: 'APPLY',
      TARGET: {
        project: TARGET.projectCode,
        event: TARGET.eventId,
      },
      BEFORE: stateSummary(result.before),
      APPLIED_TRANSFERS: proposedTransfers(),
      AFTER: stateSummary(postTransactionState),
      VALIDATION: {
        preconditions: result.preconditionValidation,
        inTransaction: result.appliedValidation,
        postTransaction: postTransactionValidation,
      },
      AUDIT_RECORD: {
        id: result.auditRecord.id,
        action: result.auditRecord.action,
        entityType: result.auditRecord.entity_type,
        entityId: result.auditRecord.entity_id,
        metadata: auditMetadata(),
        timestamp: result.auditRecord.created_at,
        outcome: result.auditRecord.outcome,
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
    const reason = error instanceof Error ? error.message : String(error);
    const details = error instanceof RepairAbortError ? error.details : [];
    const writesCommitted = Boolean(error?.writesCommitted);
    process.stderr.write(
      `${JSON.stringify(
        {
          MODE: process.argv.includes('--apply') ? 'APPLY' : 'DRY_RUN',
          STATUS: writesCommitted ? 'POST_COMMIT_VALIDATION_FAILED' : 'ABORTED',
          ROLLBACK_ABORT_REASON: reason,
          DETAILS: details,
          WRITES_COMMITTED: writesCommitted,
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  EXPECTED_CHECKLIST_ROWS,
  RepairAbortError,
  TARGET,
  assertPreconditions,
  executeApply,
  parseArguments,
  requireApplyAuthorization,
  runSerializableRepair,
  validateAppliedState,
  validateTargetArguments,
};
