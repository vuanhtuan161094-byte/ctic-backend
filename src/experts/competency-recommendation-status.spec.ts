import { ExpertsService } from './experts.service';

describe('recommendation competency workflow boundary', () => {
  it.each([
    ['APPROVED', '2020-01-01', null, true],
    ['DRAFT', '2020-01-01', null, false],
    ['PENDING_APPROVAL', '2020-01-01', null, false],
    ['RETURNED', '2020-01-01', null, false],
    ['SUSPENDED', '2020-01-01', null, false],
    ['APPROVED', '2099-01-01', null, false],
    ['APPROVED', '2020-01-01', '2026-01-01', false],
  ])('%s effective %s expiry %s eligibility %s', async (status, effective, expiry, eligible) => {
    const start = new Date('2026-09-24'); const end = new Date('2026-09-25');
    const competency = { id: 'c', management_system: 'QMS', standard_code: 'ISO 9001:2015', competency_role: 'AUDITOR',
      approval_status: status, effective_date: new Date(effective as string), expiry_date: expiry ? new Date(expiry as string) : null };
    const prisma = {
      audit_plans: { findUnique: jest.fn().mockResolvedValue({
        id: 'p', planned_start_date: start, planned_end_date: end, audit_team_appointment: null,
        certification_projects: { standard_name: 'ISO 9001:2015', industry_scopes: [],
          certification_applications: { customer_id: 'customer', customers: { company_name: 'Customer' } } },
      }) },
      experts: { findMany: jest.fn(async (args) => {
        const where = args.include.competencies.where;
        expect(where.approval_status).toBe('APPROVED');
        expect(where.effective_date).toEqual({ lte: start });
        expect(where.OR).toEqual([{ expiry_date: null }, { expiry_date: { gte: end } }]);
        const included = competency.approval_status === where.approval_status
          && competency.effective_date <= where.effective_date.lte
          && (!competency.expiry_date || competency.expiry_date >= where.OR[1].expiry_date.gte);
        return [{ id: 'e', full_name: 'Expert', profile_status: 'APPROVED', competencies: included ? [competency] : [] }];
      }) },
    };
    const service = new ExpertsService(prisma as any);
    jest.spyOn((service as any).resourceGovernance, 'evaluateMany').mockResolvedValue(new Map([['e', {
      eligible: true, reasons: [], assignments: [], availability_periods: [], workload: { capacity_exceeded: false, assigned_mandays: 0 },
    }]]));
    const result = await service.recommendForPlan('p', 'AUDITOR');
    expect(result.recommendations[0].eligible).toBe(eligible);
  });
});
