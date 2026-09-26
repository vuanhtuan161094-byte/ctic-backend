import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(__dirname, '../../prisma/migrations/20260925150000_competency_workflow_audit_actions/migration.sql'), 'utf8');
const service = readFileSync(resolve(__dirname, 'expert-competencies.service.ts'), 'utf8');
const legacy = ['BASELINE', 'CREATE', 'UPDATE_DRAFT', 'APPROVE', 'SUSPEND', 'REACTIVATE', 'RENEW', 'REVIEW_RECORDED', 'EVIDENCE_ADDED', 'EVIDENCE_VOIDED'];
const allowed = [...new Set([...migration.matchAll(/N'([A-Z_]+)'/g)].map((m) => m[1]))].sort();

describe('competency audit action SQL contract', () => {
  it('preserves legacy values and includes every action currently emitted by the service', () => {
    const literalWrites = [...service.matchAll(/action_type:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    const transitionType = service.match(/action:\s*('SUBMIT'\s*\|\s*'RETURN'\s*\|\s*'APPROVE')/);
    expect(transitionType).not.toBeNull();
    const transitions = [...transitionType![1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(allowed).toEqual([...new Set([...legacy, ...literalWrites, ...transitions])].sort());
  });

  it('validates existing rows and recreates only the named CHECK within a transaction', () => {
    expect(migration).toContain('SET XACT_ABORT ON');
    expect(migration).toContain('BEGIN TRANSACTION');
    expect(migration).toContain('ROLLBACK TRANSACTION');
    expect(migration).toContain('WHERE [action_type] NOT IN');
    expect(migration).toContain('WITH CHECK');
    expect(migration).toContain('DROP CONSTRAINT [CK_expert_competency_action_type]');
    expect(migration).toContain('ADD CONSTRAINT [CK_expert_competency_action_type]');
    expect(migration).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|TRUNCATE)\s+(?:FROM|INTO|\[dbo\])/i);
    expect(migration).not.toMatch(/\b(?:DROP|CREATE)\s+TABLE|\b(?:ADD|DROP|ALTER)\s+COLUMN/i);
    const targets = [...migration.matchAll(/ALTER TABLE\s+(\[dbo\]\.\[[^\]]+\])/g)].map((m) => m[1]);
    expect(targets).toEqual(['[dbo].[expert_competency_actions]', '[dbo].[expert_competency_actions]']);
  });
});
