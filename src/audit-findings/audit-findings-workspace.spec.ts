import { ForbiddenException } from '@nestjs/common';
import { AuditFindingsService } from './audit-findings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../security/resource-access.service';
import { ActionAuthorizationService } from '../work-items/action-authorization.service';

describe('Step 17.4 preserves existing CAP creation deadlines', () => {
  it.each([
    ['stage2', 'minor_nc', '2026-10-16T05:00:00.000Z'],
    ['stage2', 'major_nc', '2026-10-16T05:00:00.000Z'],
    ['surveillance1', 'minor_nc', '2026-10-01T05:00:00.000Z'],
    ['surveillance1', 'major_nc', '2026-10-01T05:00:00.000Z'],
  ])(
    '%s / %s keeps its source-owned deadline',
    async (auditType, findingType, due) => {
      const db = {
        audit_findings: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'finding',
            due_date: new Date(due),
            corrective_actions: [],
          }),
        },
        reports: {
          findUnique: jest.fn().mockResolvedValue({
            audit_plan_id: 'plan',
            status: 'draft',
            form_data: null,
            technical_reviews: [],
            audit_plans: {
              id: 'plan',
              project_id: 'case',
              audit_type: auditType,
            },
          }),
          update: jest.fn(),
        },
        users: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ expert_profile: { id: 'expert' } }),
        },
        audit_team_appointments: {
          findUnique: jest.fn().mockResolvedValue({
            status: 'issued',
            members: [{ expert_id: 'expert' }],
          }),
        },
        $transaction: jest.fn(),
      };
      db.$transaction.mockImplementation(
        (run: (tx: unknown) => Promise<unknown>) => run(db),
      );
      const service = new AuditFindingsService(
        db as unknown as PrismaService,
        {} as ResourceAccessService,
      );
      await service.create(
        {
          report_id: 'report',
          finding_type: findingType,
          description: 'Description',
          objective_evidence: 'Evidence',
          detected_date: '2026-09-01T12:00:00+07:00',
        },
        'actor',
      );
      const calls = db.audit_findings.create.mock.calls as Array<
        [{ data: { due_date: Date } }]
      >;
      const write = calls[0][0];
      expect(write.data.due_date.toISOString()).toBe(due);
    },
  );
});

describe('Step 17.4 bounded CAP workspace', () => {
  const actor = { userId: 'actor', roles: ['AUDITOR'] };
  const access = {
    assertEntityAccess: jest.fn(),
    assertCustomerEntityAccess: jest.fn(),
  };
  const auth = { canPerformAction: jest.fn() };
  const db = {
    audit_findings: { findUnique: jest.fn() },
    documentFile: { findMany: jest.fn() },
    users: { findMany: jest.fn(), findUnique: jest.fn() },
    audit_team_appointments: { findUnique: jest.fn() },
  };
  const service = new AuditFindingsService(
    db as unknown as PrismaService,
    access as unknown as ResourceAccessService,
  );
  const request = (
    roles = ['AUDITOR'],
    permissions = ['projects.read', 'findings.manage', 'documents.manage'],
    caseId = 'case',
  ) =>
    service.getWorkspace(
      'finding',
      caseId,
      { ...actor, roles },
      permissions,
      auth as unknown as ActionAuthorizationService,
    );
  let record: ReturnType<typeof fixture>;
  function fixture() {
    return {
      id: 'finding',
      finding_code: 'NC-001',
      finding_type: 'minor_nc',
      status: 'response_submitted',
      due_date: new Date('2026-10-01T12:00:00+07:00'),
      description: 'Description',
      close_comment: 'internal-close-comment',
      reports: {
        audit_plans: {
          id: 'plan',
          project_id: 'case',
          plan_code: 'PLAN-001',
          audit_type: 'stage2',
          certification_projects: {
            project_code: 'CASE-001',
            certification_applications: {
              customers: { company_name: 'Customer A' },
            },
          },
        },
      },
      corrective_actions: [
        {
          id: 'v2',
          version_no: 2,
          status: 'submitted',
          root_cause: 'v2 root',
          submitted_by: 'actor',
          reviewed_by: 'reviewer',
          form_data: JSON.stringify({
            internal_note: 'secret',
            custom_content: { customer_comment: 'shared', hidden: 'secret' },
          }),
        },
        {
          id: 'v1',
          version_no: 1,
          status: 'revision_required',
          root_cause: 'v1 root',
          reviewed_by: 'reviewer',
          review_comment: 'Please revise',
          form_data: null,
        },
      ],
    };
  }
  beforeEach(() => {
    jest.resetAllMocks();
    record = fixture();
    db.audit_findings.findUnique.mockResolvedValue(record);
    db.documentFile.findMany.mockResolvedValue([
      {
        id: 'file1',
        entity_id: 'v1',
        original_name: 'prior.pdf',
        storage_path: 'SECRET_PATH',
        sha256: 'SECRET_HASH',
      },
    ]);
    db.users.findMany.mockResolvedValue([
      { id: 'actor', full_name: 'Actor', email: 'secret@email' },
      { id: 'reviewer', full_name: 'Reviewer' },
    ]);
    db.users.findUnique.mockResolvedValue({ expert_profile: { id: 'expert' } });
    db.audit_team_appointments.findUnique.mockResolvedValue({
      status: 'issued',
      members: [{ expert_id: 'expert' }],
    });
    auth.canPerformAction.mockResolvedValue(true);
  });
  it('projects exact context and assigned reviewer authority without raw graphs', async () => {
    const result = await request();
    expect(result.context).toMatchObject({ case_id: 'case', audit_id: 'plan' });
    expect(result.allowed_actions).toEqual({
      respond: false,
      review: true,
      close: false,
      upload_evidence: true,
    });
    expect(
      result.finding.corrective_actions[1].evidence_files[0].download_url,
    ).toBe('/document-files/file1/download');
    expect(JSON.stringify(result)).not.toMatch(
      /SECRET_|secret@email|internal_note|"reports"/,
    );
  });
  it('uses customer ownership and redacts internal identity/comments/form metadata', async () => {
    record.status = 'revision_required';
    const result = await request(['CUSTOMER'], []);
    expect(access.assertCustomerEntityAccess).toHaveBeenCalledWith(
      { entity_type: 'audit_finding', entity_id: 'finding' },
      { ...actor, roles: ['CUSTOMER'] },
    );
    expect(access.assertEntityAccess).not.toHaveBeenCalled();
    expect(result.allowed_actions).toEqual({
      respond: true,
      review: false,
      close: false,
      upload_evidence: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /internal-close-comment|Reviewer|secret|SECRET_/,
    );
    expect(result.finding.corrective_actions[1].review_comment).toBe(
      'Please revise',
    );
    expect(
      result.finding.corrective_actions[1].evidence_files[0].download_url,
    ).toBe('/document-files/customer/file1/download');
  });
  it('supports customer evidence only for the submitted current response', async () => {
    expect(
      (await request(['CUSTOMER'], [])).allowed_actions.upload_evidence,
    ).toBe(true);
    record.corrective_actions[0].status = 'accepted';
    expect(
      (await request(['CUSTOMER'], [])).allowed_actions.upload_evidence,
    ).toBe(false);
  });
  it('returns no mutation authority to a case reader', async () => {
    expect(
      (await request(['AUDITOR'], ['projects.read'])).allowed_actions,
    ).toEqual({
      respond: false,
      review: false,
      close: false,
      upload_evidence: false,
    });
  });
  it('does not infer reviewer authority from role or permission alone', async () => {
    db.audit_team_appointments.findUnique.mockResolvedValue({
      status: 'issued',
      members: [],
    });
    expect((await request()).allowed_actions.review).toBe(false);
  });
  it('preserves controller role restriction even for ADMIN', async () => {
    expect((await request(['ADMIN'], [])).allowed_actions.review).toBe(false);
  });
  it('honors existing action authorization denial', async () => {
    auth.canPerformAction.mockResolvedValue(false);
    expect((await request()).allowed_actions.review).toBe(false);
  });
  it.each(['internal', 'customer'])(
    'denies unrelated %s before querying finding details',
    async (mode) => {
      const denial =
        mode === 'customer'
          ? access.assertCustomerEntityAccess
          : access.assertEntityAccess;
      denial.mockRejectedValue(new ForbiddenException());
      await expect(
        request(mode === 'customer' ? ['CUSTOMER'] : ['AUDITOR']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.audit_findings.findUnique).not.toHaveBeenCalled();
    },
  );
  it('rejects a missing or mismatched case before normalizing evidence', async () => {
    await expect(
      request(undefined, undefined, 'other-case'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.documentFile.findMany).not.toHaveBeenCalled();
    db.audit_findings.findUnique.mockResolvedValue(null);
    await expect(request()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requires internal read permission before resource queries', async () => {
    await expect(request(['AUDITOR'], [])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(access.assertEntityAccess).not.toHaveBeenCalled();
  });
  it('retains immutable version content, version-specific evidence and stored deadline', async () => {
    const before = JSON.stringify(record);
    const result = await request();
    expect(result.finding.corrective_actions.map((v) => v.root_cause)).toEqual([
      'v2 root',
      'v1 root',
    ]);
    expect(result.finding.corrective_actions[0].evidence_files).toEqual([]);
    expect(result.finding.corrective_actions[1].evidence_files).toHaveLength(1);
    expect(result.finding.due_date).toBe(record.due_date);
    expect(JSON.stringify(record)).toBe(before);
  });
  it('projects close only with accepted evidence of a CAP and never after closing', async () => {
    record.status = 'action_accepted';
    record.corrective_actions[0].status = 'accepted';
    expect((await request()).allowed_actions.close).toBe(true);
    record.status = 'closed';
    expect((await request()).allowed_actions).toEqual({
      respond: false,
      review: false,
      close: false,
      upload_evidence: false,
    });
  });
});
