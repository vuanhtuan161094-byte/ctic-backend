import {
  CertificationCaseProjectionService,
  decodeCaseActivityCursor,
  encodeCaseActivityCursor,
} from './certification-case-projection.service';

describe('CertificationCaseProjectionService', () => {
  const projects = {
    findOne: jest.fn(),
    getDossier: jest.fn(),
    getAlerts: jest.fn(),
  };
  const actionAuthorization = {
    canPerformActionWithinScope: jest.fn(),
  };
  const teamReadiness = { evaluate: jest.fn() };
  const prisma = {
    work_items: { findMany: jest.fn() },
    delegations: { findMany: jest.fn() },
    audit_team_appointments: { findFirst: jest.fn() },
    application_review_actions: { findMany: jest.fn() },
    reports: { findMany: jest.fn() },
    technical_reviews: { findMany: jest.fn() },
    certification_decisions: { findMany: jest.fn() },
    certificates: { findMany: jest.fn() },
  };
  let service: CertificationCaseProjectionService;

  const dossier = {
    project: {
      id: 'project-1',
      project_code: 'CASE-001',
      status: 'active',
      customer: {
        id: 'customer-1',
        customer_code: 'CUS-1',
        company_name: 'Khách hàng',
      },
      standard_name: 'ISO 9001:2015',
      certification_scope: 'Sản xuất sản phẩm mẫu',
    },
    summary: {},
    common_items: [],
    current_dossier_key: 'initial_certification',
    dossiers: [
      {
        dossier_key: 'initial_certification',
        dossier_type: 'initial',
        dossier_label: 'Chứng nhận lần đầu',
        sequence_no: 1,
        plan_ids: ['plan-1'],
        summary: { completion_percentage: 50 },
        next_action: {
          code: 'TECHNICAL_REVIEW',
          label: 'Thẩm xét kỹ thuật',
          plan_id: 'plan-1',
          responsible_label: 'Người thẩm xét',
        },
        items: [
          {
            item_no: 1,
            document_key: 'technical_review_report',
            document_name: 'Thẩm xét kỹ thuật',
            storage_type: 'system_record',
            status: 'pending',
          },
        ],
      },
    ],
    files: [
      {
        id: 'file-1',
        entity_type: 'report',
        entity_id: 'report-1',
        document_type: 'audit_report',
        file_kind: 'official',
        original_name: 'bao-cao.pdf',
        file_url: '/internal/path',
        version_no: 2,
        uploaded_at: new Date('2026-09-01T08:00:00Z'),
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CertificationCaseProjectionService(
      prisma as never,
      projects as never,
      actionAuthorization as never,
      teamReadiness as never,
    );
    projects.findOne.mockResolvedValue({
      id: 'project-1',
      application_id: 'application-1',
      project_code: 'CASE-001',
      standard_name: 'ISO 9001:2015',
      status: 'active',
      created_at: new Date('2026-08-01T00:00:00Z'),
      updated_at: new Date('2026-09-01T00:00:00Z'),
      certification_applications: {
        application_code: 'APP-001',
        standard_name: 'ISO 9001:2015',
        certification_scope: 'Sản xuất sản phẩm mẫu',
        certification_type: 'initial',
        customers: {
          id: 'customer-1',
          customer_code: 'CUS-1',
          company_name: 'Khách hàng',
        },
        sites: [],
      },
    });
    projects.getDossier.mockResolvedValue(dossier);
    projects.getAlerts.mockResolvedValue({
      alerts: [],
      summary: { total: 0, critical: 0, warning: 0, info: 0 },
    });
    prisma.work_items.findMany.mockResolvedValue([]);
    prisma.delegations.findMany.mockResolvedValue([]);
    prisma.audit_team_appointments.findFirst.mockResolvedValue(null);
    prisma.application_review_actions.findMany.mockResolvedValue([]);
    prisma.reports.findMany.mockResolvedValue([]);
    prisma.technical_reviews.findMany.mockResolvedValue([]);
    prisma.certification_decisions.findMany.mockResolvedValue([]);
    prisma.certificates.findMany.mockResolvedValue([]);
    actionAuthorization.canPerformActionWithinScope.mockReturnValue(false);
  });

  it('returns a bounded versioned workspace without raw Prisma file fields', async () => {
    const workspace = await service.getWorkspace('project-1', {
      userId: 'reviewer-1',
      roles: ['TECHNICAL_REVIEWER'],
    });

    expect(workspace.contract_version).toBe('2.0');
    expect(workspace.identity.case_reference).toBe('CASE-001');
    expect(workspace.current_cycle?.key).toBe('initial_certification');
    expect(workspace.current_stage?.code).toBe('technical_review_report');
    expect(workspace.sla.status).toBe('NOT_CONFIGURED');
    expect(workspace.document_summary.groups).toHaveLength(7);
    expect(workspace.document_summary.groups[1].latest).toEqual(
      expect.objectContaining({ id: 'file-1', original_name: 'bao-cao.pdf' }),
    );
    expect(JSON.stringify(workspace)).not.toContain('/internal/path');
    expect(workspace.projection_meta).toEqual(
      expect.objectContaining({
        bounded: true,
        mutation_capable: false,
      }),
    );
  });

  it('derives allowed actions from the existing server action boundary', async () => {
    prisma.work_items.findMany.mockResolvedValueOnce([
      {
        id: 'work-1',
        action_code: 'technical_review.perform',
        title: 'Thẩm xét kỹ thuật',
        status: 'OPEN',
        assigned_user_id: 'reviewer-1',
        assigned_role: null,
        cycle_key: 'initial_certification',
        audit_event_id: null,
        audit_plan_id: 'plan-1',
        due_at: new Date('2026-09-10T00:00:00Z'),
        destination_path: '/projects/project-1?workspace=technical-review',
      },
    ]);
    actionAuthorization.canPerformActionWithinScope.mockReturnValue(true);

    const workspace = await service.getWorkspace('project-1', {
      userId: 'reviewer-1',
      roles: ['TECHNICAL_REVIEWER'],
    });

    expect(actionAuthorization.canPerformActionWithinScope).toHaveBeenCalled();
    expect(workspace.allowed_actions).toHaveLength(1);
    expect(workspace.next_action?.authorized).toBe(true);
    expect(workspace.next_action?.destination.legacy_path).toContain(
      'technical-review',
    );
  });

  it('orders activity deterministically and paginates with occurred_at plus stable id', async () => {
    prisma.work_items.findMany.mockResolvedValue([
      {
        id: 'b',
        title: 'B',
        status: 'DONE',
        action_code: 'audit.execute',
        cycle_key: 'initial_certification',
        audit_plan_id: 'plan-1',
        destination_path: null,
        created_at: new Date('2026-09-03T00:00:00Z'),
        completed_at: null,
        completed_user: null,
      },
      {
        id: 'a',
        title: 'A',
        status: 'DONE',
        action_code: 'audit.execute',
        cycle_key: 'initial_certification',
        audit_plan_id: 'plan-1',
        destination_path: null,
        created_at: new Date('2026-09-03T00:00:00Z'),
        completed_at: null,
        completed_user: null,
      },
      {
        id: 'older',
        title: 'Older',
        status: 'DONE',
        action_code: 'audit.execute',
        cycle_key: 'initial_certification',
        audit_plan_id: 'plan-1',
        destination_path: null,
        created_at: new Date('2026-09-02T00:00:00Z'),
        completed_at: null,
        completed_user: null,
      },
    ]);

    const first = await service.getActivity(
      'project-1',
      { userId: 'user-1', roles: ['AUDITOR'] },
      { limit: 2, cycle: 'initial_certification', types: ['WORK_ITEM'] },
    );
    expect(first.items.map((item) => item.id)).toEqual([
      'work-item:b',
      'work-item:a',
    ]);
    expect(first.page.has_more).toBe(true);
    expect(decodeCaseActivityCursor(first.page.next_cursor!)).toEqual({
      occurred_at: '2026-09-03T00:00:00.000Z',
      id: 'work-item:a',
    });

    const second = await service.getActivity(
      'project-1',
      { userId: 'user-1', roles: ['AUDITOR'] },
      {
        limit: 2,
        cycle: 'initial_certification',
        types: ['WORK_ITEM'],
        cursor: first.page.next_cursor!,
      },
    );
    expect(second.items.map((item) => item.id)).toEqual(['work-item:older']);
  });

  it('redacts internal actor identity from sales activity projection', async () => {
    prisma.application_review_actions.findMany.mockResolvedValueOnce([
      {
        id: 'review-action-1',
        action: 'approve',
        to_status: 'APPROVED',
        created_at: new Date('2026-09-03T00:00:00Z'),
        actor: {
          full_name: 'Tên nội bộ',
          username: 'internal.user',
        },
      },
    ]);

    const result = await service.getActivity(
      'project-1',
      { userId: 'sales-1', roles: ['SALES'] },
      { types: ['APPLICATION_REVIEW'] },
    );

    expect(result.items[0]?.actor).toEqual({
      display_name: 'Nhân sự nội bộ',
    });
    expect(JSON.stringify(result)).not.toContain('Tên nội bộ');
    expect(JSON.stringify(result)).not.toContain('internal.user');
  });

  it('uses opaque cursor encoding and rejects malformed cursors', () => {
    const cursor = encodeCaseActivityCursor({
      id: 'event-1',
      occurred_at: new Date('2026-09-01T00:00:00Z'),
    });
    expect(decodeCaseActivityCursor(cursor)).toEqual({
      id: 'event-1',
      occurred_at: '2026-09-01T00:00:00.000Z',
    });
    expect(decodeCaseActivityCursor('not-a-valid-cursor')).toBeNull();
  });

  it('does not query audit_logs or mutate workflow state', async () => {
    await service.getWorkspace('project-1', {
      userId: 'user-1',
      roles: ['ADMIN'],
    });
    expect('audit_logs' in prisma).toBe(false);
    expect(
      Object.keys(prisma).some((key) =>
        /create|update|delete|upsert/.test(key),
      ),
    ).toBe(false);
  });
});
