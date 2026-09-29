import { ExpertCompetenciesService } from './expert-competencies.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

const dto = { expert_id: 'e1', management_system: 'QMS', standard_code: 'ISO 9001:2015', competency_role: 'LEAD_AUDITOR', iaf_codes: ['14', '17'], effective_date: '2026-01-01' };
function harness() {
  let rows: any[] = [];
  const db: any = { experts: { findUnique: jest.fn(async () => ({ id: 'e1', user_id: 'owner', status: 'active' })), findFirst: jest.fn(async () => ({ id: 'e1' })) },
    iaf_scopes: { findMany: jest.fn(async () => [{ iaf_code: '14' }, { iaf_code: '17' }]) },
    expert_competencies: { findMany: jest.fn(async ({ where }) => where.id ? rows : []), createMany: jest.fn(async ({ data }) => { rows = data; }) },
    expert_competency_actions: { createMany: jest.fn() } };
  db.$transaction = jest.fn(async (fn) => { const before = [...rows]; try { return await fn(db); } catch (e) { rows = before; throw e; } });
  return { db, service: new ExpertCompetenciesService(db), rows: () => rows };
}
describe('atomic canonical multi-IAF', () => {
  it('creates two canonical rows and audit entries in one serializable transaction', async () => {
    const h = harness(); const rows = await h.service.createBatch(dto, 'admin');
    expect(rows.map(r => r.iaf_code)).toEqual(['14', '17']);
    expect(rows.every(r => r.scope_level === 'IAF' && r.approval_status === 'DRAFT')).toBe(true);
    expect(h.db.expert_competencies.createMany).toHaveBeenCalledTimes(1);
    expect(h.db.expert_competency_actions.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(h.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('rejects duplicate normalized codes before writing', async () => {
    const h = harness(); await expect(h.service.createBatch({ ...dto, iaf_codes: ['14', ' 14 '] }, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects existing canonical scopes and does not partially create', async () => {
    const h = harness(); h.db.expert_competencies.findMany.mockResolvedValue([{ iaf_code: '14' }]);
    await expect(h.service.createBatch(dto, 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(h.db.expert_competencies.createMany).not.toHaveBeenCalled();
  });
  it('rejects unknown or inactive catalog codes', async () => {
    const h = harness(); h.db.iaf_scopes.findMany.mockResolvedValue([]);
    await expect(h.service.createBatch(dto, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(h.db.expert_competencies.createMany).not.toHaveBeenCalled();
  });
  it('self batch resolves ownership server-side and rechecks in transaction', async () => {
    const h = harness(); await h.service.createOwnBatch({ ...dto, expert_id: 'forged' } as any, 'owner');
    expect(h.rows().every(r => r.expert_id === 'e1')).toBe(true);
    await expect(h.service.createBatch(dto, 'stranger', true)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rolls back rows when audit persistence fails', async () => {
    const h = harness(); h.db.expert_competency_actions.createMany.mockRejectedValue(new Error('audit failed'));
    await expect(h.service.createBatch(dto, 'admin')).rejects.toThrow('audit failed'); expect(h.rows()).toEqual([]);
  });
});
