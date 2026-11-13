import { BadRequestException } from '@nestjs/common';
import { AuditPlansService } from './audit-plans.service';

describe('P09 surveillance plan deadline cannot bypass audit-program check', () => {
  const prisma = {
    certification_decisions: { findFirst: jest.fn() },
  };
  const service = new AuditPlansService(prisma as never) as AuditPlansService & {
    ensureSurveillancePlanDeadline(
      projectId: string, auditType: string | null,
      date: string | Date | null,
    ): Promise<void>;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.certification_decisions.findFirst.mockResolvedValue({
      decision_date: new Date('2026-04-15T00:00:00Z'),
    });
  });

  it('rejects late first-year surveillance even from direct plan path', async () => {
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance1', '2027-04-16'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.certification_decisions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        project_id: 'project-1',
        decision_type: { in: ['GRANT', 'RECERTIFY'] },
      }),
    }));
  });

  it('allows the 12-month anniversary and ignores surveillance year 2', async () => {
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance1', '2027-04-15'))
      .resolves.toBeUndefined();
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance2', '2028-04-16'))
      .resolves.toBeUndefined();
    expect(prisma.certification_decisions.findFirst).toHaveBeenCalledTimes(1);
  });

    it('queries approvals in the same supplied transaction, not through another Prisma client', async () => {
      const eventId = 'event-test';
      const requested = new Date('2027-04-16T00:00:00Z');
      const tx = {
        certification_decisions: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'decision-1', decision_date: new Date('2026-04-15T00:00:00Z'),
          }),
        },
        audit_program_events: {
          findUnique: jest.fn().mockResolvedValue({ program_id: 'program-test' }),
        },
        workflow_approvals: { findFirst: jest.fn() },
      };
      const saved = process.env.P09_QMR_APPROVER_IDS;
      process.env.P09_QMR_APPROVER_IDS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      try {
        tx.workflow_approvals.findFirst.mockResolvedValue({
          approver_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'approved', approved_at: new Date(),
          comment: JSON.stringify({
            schema: 'CMP_P09_GS1_QMR_1', project_id: 'project-1',
            program_id: 'program-test', decision_id: 'decision-1',
            decision_date: '2026-04-15', approved_date: '2027-04-16',
            reason: 'Chậm do điều kiện khách quan và có kế hoạch kiểm soát',
            requested_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            requested_at: '2026-06-01T00:00:00Z',
            reviewer_comment: 'Xác nhận độc lập và chấp thuận biện pháp kiểm soát',
            reviewed_at: '2026-06-02T00:00:00Z',
          }),
        });
        await expect((service as any).ensureSurveillancePlanDeadline(
          'project-1', 'surveillance1', requested, tx, eventId,
        )).resolves.toBeUndefined();
        expect(tx.workflow_approvals.findFirst).toHaveBeenCalledTimes(1);
        expect(tx.audit_program_events.findUnique).toHaveBeenCalledTimes(1);
      } finally {
        if (saved === undefined) delete process.env.P09_QMR_APPROVER_IDS;
        else process.env.P09_QMR_APPROVER_IDS = saved;
      }
    });

  it('retains draft plans without dated surveillance when decision is unavailable', async () => {
    prisma.certification_decisions.findFirst.mockResolvedValue(null);
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance_1', '2028-01-01'))
      .resolves.toBeUndefined();
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance1', null))
      .resolves.toBeUndefined();
    expect(prisma.certification_decisions.findFirst).toHaveBeenCalledTimes(1);
  });
});
