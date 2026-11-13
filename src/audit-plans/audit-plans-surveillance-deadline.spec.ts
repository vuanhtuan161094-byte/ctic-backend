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

  it('retains draft plans without dated surveillance when decision is unavailable', async () => {
    prisma.certification_decisions.findFirst.mockResolvedValue(null);
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance_1', '2028-01-01'))
      .resolves.toBeUndefined();
    await expect(service.ensureSurveillancePlanDeadline('project-1', 'surveillance1', null))
      .resolves.toBeUndefined();
    expect(prisma.certification_decisions.findFirst).toHaveBeenCalledTimes(1);
  });
});
