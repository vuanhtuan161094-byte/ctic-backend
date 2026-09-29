import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExpertCompetenciesService } from './expert-competencies.service';
import { ExpertCompetenciesController } from './expert-competencies.controller';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';

const draft = () => ({
  id: 'c1', expert_id: 'e1', management_system: 'QMS', standard_code: 'ISO 9001:2015',
  competency_role: 'AUDITOR', scope_level: 'IAF', iaf_code: '14', nace_code: null,
  competency_level: 'QUALIFIED', approval_status: 'DRAFT', effective_date: new Date('2020-01-01'),
  expiry_date: null, evidence_summary: 'Evidence', updated_at: new Date(), notes: null,
});
function harness(status = 'DRAFT') {
  let row = { ...draft(), approval_status: status };
  const actions: any[] = [];
  const prisma: any = {
    experts: {
      findFirst: jest.fn(async ({ where }) => where.user_id === 'owner' && (!where.id || where.id === 'e1') ? { id: 'e1', status: 'active' } : null),
      findUnique: jest.fn().mockResolvedValue({ id: 'e1', user_id: 'owner', status: 'active' }),
    },
    expert_competencies: {
      findUnique: jest.fn(async () => ({ ...row })),
      findUniqueOrThrow: jest.fn(async () => ({ ...row })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(async () => [row]),
      create: jest.fn(async ({ data }) => (row = { ...draft(), ...data })),
      update: jest.fn(async ({ data }) => (row = { ...row, ...data })),
    },
    expert_competency_actions: {
      create: jest.fn(async ({ data }) => { actions.push(data); return data; }),
      findFirst: jest.fn(async () => [...actions].reverse().find((a) => a.action_type === 'SUBMIT') ?? null),
    },
    expert_competency_evidences: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }) => ({ id: 'ev1', ...data })),
    },
    expert_competency_reviews: { findFirst: jest.fn().mockResolvedValue({
      result: 'SATISFACTORY', review_date: new Date(), next_review_date: new Date('2099-01-01'),
    }) },
  };
  prisma.$transaction = jest.fn((fn) => fn(prisma));
  return { prisma, actions, service: new ExpertCompetenciesService(prisma),
    row: () => row, set: (data: Partial<typeof row>) => { row = { ...row, ...data }; } };
}
const input = { management_system: 'QMS', standard_code: 'ISO 9001:2015', competency_role: 'AUDITOR', scope_level: 'IAF', iaf_code: '14', effective_date: '2020-01-01' };

describe('competency submission authority', () => {
  it('expert cannot call the admin approval endpoint even with manage permission', () => {
    const guard = new RolesGuard(new Reflector());
    const context: any = { getHandler: () => ExpertCompetenciesController.prototype.approve,
      getClass: () => ExpertCompetenciesController, switchToHttp: () => ({ getRequest: () => ({
        user: { userId: 'owner', roles: ['AUDITOR'], permissions: ['competencies.manage'] },
      }) }) };
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
  it('does not resolve an arbitrary expert when identity is missing', async () => {
    const h = harness();
    await expect(h.service.findOwn(undefined as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.experts.findFirst).not.toHaveBeenCalled();
  });
  it('self list is restricted to the resolved expert', async () => {
    const h = harness(); await h.service.findOwn('owner');
    expect(h.prisma.expert_competencies.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { expert_id: 'e1' } }));
    await expect(h.service.findOwn('stranger')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requires an actor for submission audit', async () => {
    await expect(harness().service.submit('c1', '')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('admin creates DRAFT and audits actor', async () => {
    const h = harness(); await h.service.create({ ...input, expert_id: 'e1' }, 'admin');
    expect(h.row().approval_status).toBe('DRAFT');
    expect(h.actions[0]).toMatchObject({ action_type: 'CREATE', actor_id: 'admin' });
  });
  it('self create resolves expert from user, ignoring a forged expert_id', async () => {
    const h = harness(); await h.service.createOwn({ ...input, expert_id: 'other' } as any, 'owner');
    expect(h.row().expert_id).toBe('e1');
    expect(h.prisma.experts.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 'owner' } }));
  });
  it('unlinked users cannot create a competency', async () => {
    const h = harness(); await expect(h.service.createOwn(input, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.expert_competencies.create).not.toHaveBeenCalled();
  });
  it.each(['update', 'evidence', 'submit'])('isolates ownership for %s', async (action) => {
    const h = harness(); h.set({ expert_id: 'someone-else' });
    const work = action === 'update' ? h.service.updateOwn('c1', {}, 'owner')
      : action === 'submit' ? h.service.submitOwn('c1', 'owner')
      : h.service.addOwnEvidence('c1', { evidence_type: 'OTHER', title: 'Evidence' }, 'owner');
    await expect(work).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('draft -> submit -> return -> update -> resubmit -> approve, with actor and reason', async () => {
    const h = harness();
    await h.service.submitOwn('c1', 'owner');
    expect(h.row().approval_status).toBe('PENDING_APPROVAL');
    await h.service.returnSubmission('c1', 'admin', 'Add reference');
    expect(h.row().approval_status).toBe('RETURNED');
    await h.service.updateOwn('c1', { evidence_summary: 'New reference' }, 'owner');
    await h.service.submitOwn('c1', 'owner');
    await h.service.approve('c1', 'admin');
    expect(h.row().approval_status).toBe('APPROVED');
    expect(h.actions.map((a) => a.action_type)).toEqual(['SUBMIT', 'RETURN', 'UPDATE', 'SUBMIT', 'APPROVE']);
    expect(h.actions[1]).toMatchObject({ actor_id: 'admin', reason: 'Add reference', from_status: 'PENDING_APPROVAL', to_status: 'RETURNED' });
  });
  it('rejects blank return reasons', async () => {
    await expect(harness('PENDING_APPROVAL').service.returnSubmission('c1', 'admin', '  ')).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['DRAFT', 'RETURNED', 'APPROVED', 'SUSPENDED'])('cannot approve or return %s', async (status) => {
    const h = harness(status);
    await expect(h.service.approve('c1', 'admin')).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.returnSubmission('c1', 'admin', 'reason')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('admin can create, submit and approve another expert', async () => {
    const h = harness(); await h.service.create({ ...input, expert_id: 'e1', evidence_summary: 'Evidence' }, 'admin');
    await h.service.submit('c1', 'admin'); await h.service.approve('c1', 'admin');
    expect(h.row().approval_status).toBe('APPROVED');
    expect(h.actions.map(a => a.action_type)).toEqual(['CREATE', 'SUBMIT', 'APPROVE']);
  });
  it('uses the latest submission after return/resubmit', async () => {
    const h = harness(); await h.service.submit('c1', 'admin1');
    await h.service.returnSubmission('c1', 'admin2', 'More evidence');
    await h.service.submit('c1', 'admin2');
    await h.service.approve('c1', 'admin2');
    expect(h.row().approval_status).toBe('APPROVED');
  });
  it.each(['owner', 'subject-admin'])('subject %s cannot approve even when another actor submitted', async (subject) => {
    const h = harness(); h.prisma.experts.findUnique.mockResolvedValue({ id: 'e1', user_id: subject, status: 'active' });
    await h.service.submit('c1', 'other-admin');
    await expect(h.service.approve('c1', subject)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.row().approval_status).toBe('PENDING_APPROVAL');
    expect(h.actions.some(a => a.action_type === 'APPROVE')).toBe(false);
  });
  it('fails closed without SUBMIT action or approval evidence', async () => {
    const h = harness('PENDING_APPROVAL');
    await expect(h.service.approve('c1', 'admin')).rejects.toThrow('Không tìm thấy người gửi');
    h.actions.push({ action_type: 'SUBMIT', actor_id: 'owner' }); h.set({ evidence_summary: '' });
    await expect(h.service.approve('c1', 'admin')).rejects.toThrow('bằng chứng');
    h.prisma.expert_competency_evidences.count.mockResolvedValue(1);
    await h.service.approve('c1', 'admin'); expect(h.row().approval_status).toBe('APPROVED');
  });
  it.each(['APPROVED', 'PENDING_APPROVAL', 'SUSPENDED'])('self cannot edit/add evidence/submit %s', async (status) => {
    const h = harness(status);
    await expect(h.service.updateOwn('c1', {}, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.addOwnEvidence('c1', { evidence_type: 'OTHER', title: 'Evidence' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.submitOwn('c1', 'owner')).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['DRAFT', 'RETURNED'])('self adds auditable evidence in %s', async (status) => {
    const h = harness(status);
    await h.service.addOwnEvidence('c1', { evidence_type: 'OTHER', title: 'Reference' }, 'owner');
    expect(h.actions[0]).toMatchObject({ action_type: 'EVIDENCE_ADDED', actor_id: 'owner' });
  });
  it('retains suspend/reactivate/renew lifecycle with review prerequisites', async () => {
    const h = harness('APPROVED');
    await h.service.suspend('c1', { reason: 'Investigate' }, 'admin');
    expect(h.row().approval_status).toBe('SUSPENDED');
    await h.service.reactivate('c1', { decision_basis: 'Resolved' }, 'admin');
    await h.service.renew('c1', { effective_date: '2026-01-01', expiry_date: '2099-01-01', decision_basis: 'Review' }, 'admin');
    expect(h.actions.map((a) => a.action_type)).toEqual(['SUSPEND', 'REACTIVATE', 'RENEW']);
  });
  it.each(['approve', 'returnSubmission', 'suspend', 'reactivate', 'renew', 'submit'])('admin %s retains role and permission guards', (method) => {
    const handler = ExpertCompetenciesController.prototype[method];
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['competencies.manage']);
  });
});
