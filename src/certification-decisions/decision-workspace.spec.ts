import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DecisionWorkspaceController } from './decision-workspace.controller';
import { CertificationDecisionsService } from './certification-decisions.service';
import { projectDecisionWorkspace } from './decision-workspace.projection';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';

function harness(roles = ['DECISION_MAKER']) {
    const events: string[] = [];
    const prisma = {
        audit_plans: { findFirst: jest.fn(async () => { events.push('context'); return { id: 'p' }; }) },
        technical_reviews: { findUnique: jest.fn(async () => ({ reviewer_id: 'reviewer', reports: { audit_plan_id: 'p' } })) },
        audit_team_members: { findFirst: jest.fn(async () => null as unknown) },
    };
    const access = { assertEntityAccess: jest.fn(async () => { events.push('access'); }) };
    const actions = { canPerformAction: jest.fn(async () => true) };
    const workspace = { plan: { id: 'p', project_id: 'c' }, report: { id: 'report' }, technical_review: { id: 'r', status: 'completed' }, can_issue_decision: true, eligibility_errors: [], allowed_decision_types: ['GRANT', 'REFUSE'] };
    const results = { getWorkspace: jest.fn(async () => { events.push('read'); return workspace; }) };
    const reviews = { getCaseWorkspace: jest.fn(async () => ({ report: { id: 'report' }, review: { id: 'r' }, eligibility_errors: ['Còn 1 NC chưa được đóng'] })) };
    const decisions = new CertificationDecisionsService(prisma as never);
    const controller = new DecisionWorkspaceController(prisma as never, access as never, actions as never, results as never, reviews as never, decisions);
    const request = { user: { userId: 'actor', roles, permissions: ['certification_decisions.read', 'certification_decisions.issue'] } };
    const read = (caseId = 'c', reviewId: string | undefined = 'r') => controller.getWorkspace('p', caseId, reviewId, request as never);
    return { read, prisma, access, actions, results, reviews, workspace, request, events, decisions };
}

describe('Step 17.6 bounded Decision workspace', () => {
    it('uses existing read roles and permission, with no automatic ADMIN mutation bypass', () => {
        expect(Reflect.getMetadata(ROLES_KEY, DecisionWorkspaceController.prototype.getWorkspace)).toEqual(['ADMIN', 'TECHNICAL_REVIEWER', 'DECISION_MAKER']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY, DecisionWorkspaceController.prototype.getWorkspace)).toEqual(['certification_decisions.read']);
    });
    it('authorizes before context and graph reads; reuses role-assigned action authority', async () => {
        const h = harness(); const value = await h.read();
        expect(h.events).toEqual(['access', 'context', 'read']);
        expect(value.can_issue_decision).toBe(true);
        expect(value.independence).toBe('CONFIRMED');
        expect(value.assignment_basis).toBe('DECISION_MAKER_ROLE');
        expect(h.actions.canPerformAction).toHaveBeenCalledWith(expect.objectContaining({ assignment: { assignedRole: 'DECISION_MAKER' }, resource: { entityType: 'technical_review', entityId: 'r' } }));
    });
    it('denied resource never reads workspace', async () => {
        const h = harness(); h.access.assertEntityAccess.mockRejectedValue(new ForbiddenException());
        await expect(h.read()).rejects.toBeInstanceOf(ForbiddenException);
        expect(h.prisma.audit_plans.findFirst).not.toHaveBeenCalled(); expect(h.results.getWorkspace).not.toHaveBeenCalled();
    });
    it('wrong case stops before graph read', async () => {
        const h = harness(); h.prisma.audit_plans.findFirst.mockResolvedValue(null as never);
        await expect(h.read('other')).rejects.toBeInstanceOf(ForbiddenException);
        expect(h.results.getWorkspace).not.toHaveBeenCalled();
    });
    it('wrong review and mismatched returned case do not disclose the projection', async () => {
        const h = harness(); await expect(h.read('c', 'other')).rejects.toBeInstanceOf(ForbiddenException);
        h.workspace.plan.project_id = 'other'; await expect(h.read()).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('concurrent upstream selection drift fails closed', async () => {
        const h = harness(); h.reviews.getCaseWorkspace.mockResolvedValue({ report: { id: 'changed' }, review: { id: 'r' }, eligibility_errors: [] });
        await expect(h.read()).rejects.toBeInstanceOf(ForbiddenException);
    });
    it.each(['ADMIN', 'COORDINATOR', 'TECHNICAL_REVIEWER', 'AUDITOR', 'LEAD_AUDITOR', 'STAFF'])('%s has no issue capability without DECISION_MAKER', async role => {
        const h = harness([role]); expect((await h.read()).can_issue_decision).toBe(false); expect(h.actions.canPerformAction).not.toHaveBeenCalled();
    });
    it('missing permission or rejected assignment scope cannot issue', async () => {
        const h = harness(); h.request.user.permissions = ['certification_decisions.read'];
        expect((await h.read()).can_issue_decision).toBe(false);
        h.request.user.permissions.push('certification_decisions.issue'); h.actions.canPerformAction.mockResolvedValue(false);
        expect((await h.read()).can_issue_decision).toBe(false);
    });
    it('same reviewer is rejected by the shared mutation independence guard', async () => {
        const h = harness(); h.prisma.technical_reviews.findUnique.mockResolvedValue({ reviewer_id: 'actor', reports: { audit_plan_id: 'p' } });
        const value = await h.read(); expect(value.can_issue_decision).toBe(false); expect(value.independence).toBe('CONFLICT');
        await expect(h.decisions.assertDecisionMakerIndependent({ reviewer_id: 'actor', reports: { audit_plan_id: 'p' } }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('audit participation is rejected using the same noncancelled team query', async () => {
        const h = harness(); h.prisma.audit_team_members.findFirst.mockResolvedValue({ id: 'team' });
        expect((await h.read()).independence).toBe('CONFLICT');
        expect(h.prisma.audit_team_members.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { audit_team_appointments: { audit_plan_id: 'p' }, experts: { user_id: 'actor' }, assignment_status: { not: 'cancelled' } } }));
    });
    it('keeps upstream blockers separate and never overrides existing result readiness', async () => {
        const h = harness(); h.workspace.can_issue_decision = false;
        (h.workspace.eligibility_errors as string[]).push('Hồ sơ thẩm xét kỹ thuật chưa hoàn thành.');
        const value = await h.read(); expect(value.can_issue_decision).toBe(false); expect(value.eligibility_errors).toEqual(h.workspace.eligibility_errors); expect(value.upstream_errors).toEqual(['Còn 1 NC chưa được đóng']);
    });
    it('projection allowlists nested data and creates only authorized document endpoint references', () => {
        const secret = { password_hash: 'SECRET', email: 'SECRET', storage_path: 'SECRET', sha256: 'SECRET', arbitrary: { secret: 'SECRET' } };
        const value = projectDecisionWorkspace({ plan: { id: 'p', ...secret }, defaults: { organization_name: 'Customer', ...secret }, decision: { id: 'd', form_data: secret, lifecycle: { requires_certificate_version: true, ...secret }, ...secret }, certificate_series: [{ id: 's', current_certificate: { id: 'cert', ...secret }, versions: [secret] }], technical_review: { reviewer_name: 'Reviewer', ...secret }, decision_history: [{ id: 'f', download_url: 'https://evil.invalid', ...secret }], allowed_decision_types: ['RECERTIFY', secret] }, { document_history: [{ id: 'f11', ...secret }] }, 'c', { issue: false, generate: false, independence: 'NOT_CHECKED' });
        expect(JSON.stringify(value)).not.toContain('SECRET'); expect(JSON.stringify(value)).not.toContain('evil.invalid');
        expect(value.decision_history[0].download_url).toBe('/document-files/f/download'); expect(value.allowed_decision_types).toEqual(['RECERTIFY']);
    });
});
