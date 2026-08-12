import { ConflictException, ForbiddenException } from '@nestjs/common';

import { ROLES_KEY } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { ResourceAccessService } from '../security/resource-access.service';
import { AuditFindingsController } from './audit-findings.controller';
import { AuditFindingsService } from './audit-findings.service';

type DatabaseMock = {
  audit_plans: {
    findMany: jest.Mock;
  };
  audit_findings: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  corrective_actions: {
    aggregate: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

const findingId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';

const dto = {
  root_cause: 'Root cause',
  correction: 'Immediate correction',
  corrective_action_plan: 'Corrective action plan',
  responsible_person: 'Example Customer',
  target_date: '2026-08-30',
  custom_content: {
    customer_comment: 'Evidence will follow',
  },
};

function createDatabaseMock(): DatabaseMock {
  const database: DatabaseMock = {
    audit_plans: {
      findMany: jest.fn(),
    },
    audit_findings: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    corrective_actions: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  database.$transaction.mockImplementation(
    async (callback: (transaction: DatabaseMock) => Promise<unknown>) =>
      callback(database),
  );

  return database;
}

function createResourceAccessMock() {
  return {
    getAccessibleCustomerIds: jest.fn(),
    assertCustomerEntityAccess: jest.fn(),
  };
}

describe('P.09 customer CAP submission', () => {
  let database: DatabaseMock;
  let resourceAccess: ReturnType<typeof createResourceAccessMock>;
  let service: AuditFindingsService;

  beforeEach(() => {
    database = createDatabaseMock();
    resourceAccess = createResourceAccessMock();
    service = new AuditFindingsService(
      database as unknown as PrismaService,
      resourceAccess as unknown as ResourceAccessService,
    );

    database.audit_findings.findUnique.mockResolvedValue({
      id: findingId,
      finding_type: 'minor_nc',
      status: 'open',
    });
    database.corrective_actions.aggregate.mockResolvedValue({
      _max: {
        version_no: 1,
      },
    });
    database.corrective_actions.create.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      finding_id: findingId,
      version_no: 2,
      status: 'submitted',
      form_data: JSON.stringify({
        custom_content: dto.custom_content,
      }),
    });
    database.audit_findings.update.mockResolvedValue({});
  });

  it('returns an empty workspace index without querying plans when no active mapping exists', async () => {
    await expect(service.findCustomerWorkspaceIndex([])).resolves.toEqual([]);
    expect(database.audit_plans.findMany).not.toHaveBeenCalled();
  });

  it('lists only plans for the active mapped customer IDs using a safe response shape', async () => {
    const customerId = '44444444-4444-4444-8444-444444444444';
    database.audit_plans.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        plan_code: 'PLAN-001',
        audit_type: 'stage2',
        planned_start_date: new Date('2026-08-01'),
        planned_end_date: new Date('2026-08-02'),
        status: 'completed',
        certification_projects: {
          project_code: 'PRJ-001',
          standard_name: 'ISO 9001:2015',
          status: 'corrective_action_required',
          certification_applications: {
            customers: {
              customer_code: 'CUS-001',
              company_name: 'Example Customer',
            },
          },
        },
        reports: [
          {
            audit_findings: [
              {
                status: 'open',
                due_date: new Date('2026-07-01'),
              },
              {
                status: 'closed',
                due_date: null,
              },
            ],
          },
        ],
      },
    ]);

    const result = await service.findCustomerWorkspaceIndex([customerId]);

    expect(database.audit_plans.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          certification_projects: {
            certification_applications: {
              customer_id: {
                in: [customerId],
              },
            },
          },
        },
      }),
    );
    expect(result).toEqual([
      {
        // Jest asymmetric matchers are intentionally typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        plan: expect.objectContaining({
          plan_code: 'PLAN-001',
        }),
        project: {
          project_code: 'PRJ-001',
          standard_name: 'ISO 9001:2015',
          status: 'corrective_action_required',
        },
        customer: {
          customer_code: 'CUS-001',
          company_name: 'Example Customer',
        },
        finding_summary: {
          total: 2,
          open: 1,
          overdue: 1,
        },
      },
    ]);
    expect(result[0]).not.toHaveProperty('reports');
  });

  it('creates the next CAP version and updates finding status atomically', async () => {
    const result = await service.createCustomerCorrectiveAction(
      findingId,
      dto,
      {
        userId: actorUserId,
        roles: ['CUSTOMER'],
      },
    );

    expect(resourceAccess.assertCustomerEntityAccess).toHaveBeenCalledWith(
      {
        entity_type: 'audit_finding',
        entity_id: findingId,
      },
      {
        userId: actorUserId,
        roles: ['CUSTOMER'],
      },
      database,
    );
    expect(database.corrective_actions.create).toHaveBeenCalledWith({
      // Jest asymmetric matchers are intentionally typed as any.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        finding_id: findingId,
        version_no: 2,
        submitted_by: actorUserId,
        status: 'submitted',
      }),
    });
    expect(database.audit_findings.update).toHaveBeenCalledWith({
      where: {
        id: findingId,
      },
      data: {
        status: 'response_submitted',
      },
    });
    expect(result.version_no).toBe(2);
  });

  it('does not mutate when ownership is denied', async () => {
    resourceAccess.assertCustomerEntityAccess.mockRejectedValue(
      new ForbiddenException('Denied'),
    );

    await expect(
      service.createCustomerCorrectiveAction(findingId, dto, {
        userId: actorUserId,
        roles: ['CUSTOMER'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.corrective_actions.create).not.toHaveBeenCalled();
    expect(database.audit_findings.update).not.toHaveBeenCalled();
  });

  it('rejects another submission while the current CAP awaits review', async () => {
    database.audit_findings.findUnique.mockResolvedValue({
      id: findingId,
      finding_type: 'minor_nc',
      status: 'response_submitted',
    });

    await expect(
      service.createCustomerCorrectiveAction(findingId, dto, {
        userId: actorUserId,
        roles: ['CUSTOMER'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.corrective_actions.create).not.toHaveBeenCalled();
  });

  it('allows a revised CAP after revision is requested', async () => {
    database.audit_findings.findUnique.mockResolvedValue({
      id: findingId,
      finding_type: 'major_nc',
      status: 'revision_required',
    });

    await expect(
      service.createCustomerCorrectiveAction(findingId, dto, {
        userId: actorUserId,
        roles: ['CUSTOMER'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        version_no: 2,
      }),
    );
  });

  it('keeps the public route customer-only and the internal route separate', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // Reflection needs the original method reference, not a bound copy.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        AuditFindingsController.prototype.findCustomerWorkspaceIndex,
      ),
    ).toEqual(['CUSTOMER']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // Reflection needs the original method reference, not a bound copy.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        AuditFindingsController.prototype.createCorrectiveAction,
      ),
    ).toEqual(['CUSTOMER']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // Reflection needs the original method reference, not a bound copy.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        AuditFindingsController.prototype.createCorrectiveActionInternal,
      ),
    ).toEqual(['ADMIN', 'STAFF', 'COORDINATOR', 'AUDITOR', 'LEAD_AUDITOR']);
  });
});
