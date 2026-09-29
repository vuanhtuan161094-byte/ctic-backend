import { ExpertsService } from './experts.service';
import { BadRequestException } from '@nestjs/common';

describe('recommendation competency workflow boundary', () => {
  it.each([
    ['LEAD_AUDITOR', 'AUDITOR', '14', true],
    ['AUDITOR', 'TEAM_LEADER', '14', false],
    ['LEAD_AUDITOR', 'AUDITOR', '17', false],
    ['LEAD_AUDITOR', 'TECHNICAL_REVIEWER', '14', false],
    ['LEAD_AUDITOR', 'CERTIFICATION_DECISION_MAKER', '14', false],
  ])('recommends %s for %s with IAF %s: %s', async (competencyRole, teamRole, iafCode, eligible) => {
    const competency = { id: 'c', management_system: 'QMS', standard_code: 'ISO 9001:2015',
      competency_role: competencyRole, scope_level: 'IAF', iaf_code: iafCode, nace_code: null,
      approval_status: 'APPROVED', effective_date: new Date('2020-01-01'), expiry_date: null };
    const prisma: any = {
      audit_plans: { findUnique: jest.fn().mockResolvedValue({ id: 'p', planned_start_date: new Date('2026-09-24'),
        planned_end_date: new Date('2026-09-25'), audit_team_appointment: null,
        certification_projects: { standard_name: 'ISO 9001:2015', industry_scopes: [{ id: 's', management_system: 'QMS', standard_code: 'ISO 9001:2015',
          nace_iaf_mapping: { iaf_scope: { iaf_code: '14', iaf_name: 'Rubber' } },
          isic_nace_mapping: { target_code: { code: '22.19', title_en: 'Rubber' } } }],
          certification_applications: { customer_id: 'customer', customers: { company_name: 'Customer' } } } }) },
      experts: { findMany: jest.fn(async (args) => [{ id: 'e', full_name: 'Expert', profile_status: 'APPROVED',
        competencies: args.include.competencies.where.competency_role.in.includes(competencyRole) ? [competency] : [] }]) },
    };
    const service = new ExpertsService(prisma);
    jest.spyOn((service as any).resourceGovernance, 'evaluateMany').mockResolvedValue(new Map([['e', {
      eligible: true, reasons: [], assignments: [], availability_periods: [], workload: { capacity_exceeded: false, assigned_mandays: 0 },
    }]]));
    if (['TECHNICAL_REVIEWER', 'CERTIFICATION_DECISION_MAKER'].includes(teamRole as string)) {
      await expect(service.recommendForPlan('p', teamRole as string)).rejects.toBeInstanceOf(BadRequestException);
      return;
    }
    const result = await service.recommendForPlan('p', teamRole as string);
    expect(result.recommendations[0].eligible).toBe(eligible);
  });
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
