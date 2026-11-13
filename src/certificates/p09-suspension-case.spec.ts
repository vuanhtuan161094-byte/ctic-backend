import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { CertificatesController } from './certificates.controller';
import { addCalendarMonthsClamped } from './suspension-review';
import {
    hasValidSuspensionApproval, parseSuspensionEvidence, SUSPENSION_REVIEW_SCHEMA,
    suspensionDeadlineStatus, suspensionType,
} from './p09-suspension-case';
import { P09SuspensionCaseService } from './p09-suspension-case.service';

const actor = '11111111-1111-4111-8111-111111111111';
const maker = '22222222-2222-4222-8222-222222222222';
const f11 = '33333333-3333-4333-8333-333333333333';
const ref = '44444444-4444-4444-8444-444444444444';
const history = '55555555-5555-4555-8555-555555555555';
const proof = {
    schema: SUSPENSION_REVIEW_SCHEMA,
    action: 'EXTEND_3_MONTHS', certificate_id: ref,
    project_id: 'project-1', series_id: 'series-1',
    suspension_history_id: history, suspended_at: '2026-01-31',
    technical_review_id: f11, requested_by: actor,
    requested_at: '2026-02-01T00:00:00Z', reason: 'Đã kiểm tra bằng chứng khắc phục của khách hàng',
    corrective_evidence: 'F11/2026/00001',
    reviewer_comment: 'Chấp thuận gia hạn có giới hạn đúng 3 tháng',
    reviewed_at: '2026-02-02T00:00:00Z',
};
describe('P09 independent suspension endpoint role gates', () => {
    it('restricts request, decision and reviewer-list endpoint to intended roles and permissions', () => {
        const proto = CertificatesController.prototype;
        expect(Reflect.getMetadata(ROLES_KEY, proto.requestSuspensionCase))
            .toEqual(['ADMIN', 'COORDINATOR']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.requestSuspensionCase))
            .toEqual(['audit_programs.manage']);
        expect(Reflect.getMetadata(ROLES_KEY, proto.decideSuspensionCase))
            .toEqual(['DECISION_MAKER']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.decideSuspensionCase))
            .toEqual(['certification_decisions.issue']);
        for (const method of [proto.requestSuspensionCase, proto.decideSuspensionCase]) {
            const roles = Reflect.getMetadata(ROLES_KEY, method) as string[];
            expect(roles).not.toContain('CUSTOMER');
            expect(roles).not.toContain('AUDITOR');
        }
    });
});
describe('P09 3+3 suspension controls', () => {
    it('uses calendar months with bounded six-month maximum', () => {
        expect(addCalendarMonthsClamped(new Date('2026-01-31T00:00:00Z'), 3)
            .toISOString().slice(0, 10)).toBe('2026-04-30');
        const first = suspensionDeadlineStatus(
            new Date('2026-01-31T00:00:00Z'), new Date('2026-04-30T00:00:00Z'));
        expect(first.after_initial).toBe(true);
        expect(first.after_maximum).toBe(false);
        expect(suspensionDeadlineStatus(
            new Date('2026-01-31T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))
            .after_maximum).toBe(true);
    });
    it('accepts only matching issued suspension and distinct reviewer evidence', () => {
        const row = { status: 'approved', approved_at: new Date(), approver_id: maker,
            comment: JSON.stringify(proof) };
        const base = { row, action: 'EXTEND_3_MONTHS' as const,
            certificateId: ref, seriesId: 'series-1', projectId: 'project-1',
            historyId: history };
        expect(hasValidSuspensionApproval(base)).toBe(true);
        expect(hasValidSuspensionApproval({ ...base, historyId: 'new-suspension' })).toBe(false);
        expect(hasValidSuspensionApproval({ ...base, f11Id: 'other-f11' })).toBe(false);
        expect(hasValidSuspensionApproval({ ...base, row: { ...row, status: 'pending' } })).toBe(false);
        expect(hasValidSuspensionApproval({ ...base, row: {
            ...row, comment: JSON.stringify({ ...proof, requested_by: maker }),
        } })).toBe(false);
        expect(parseSuspensionEvidence('{invalid')).toBe(null);
        expect(suspensionType('RECOMMEND_RESTORE')).toBe('P09_SUSPENSION_REVIEW');
    });
});
describe('P09 suspension case independent review transaction', () => {
    const db = {
        certificates: { findUnique: jest.fn() },
        users: { findFirst: jest.fn(), findMany: jest.fn() },
        technical_reviews: { findUnique: jest.fn() },
        audit_team_members: { findFirst: jest.fn() },
        workflow_approvals: {
            findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(),
        },
        audit_logs: { create: jest.fn() },
        $queryRaw: jest.fn(), $transaction: jest.fn(),
    };
    const service = new P09SuspensionCaseService(db as never);
    const request = () => ({
        action: 'EXTEND_3_MONTHS' as const, decision_maker_id: maker,
        technical_review_id: f11, reason: 'Đánh giá bằng chứng khắc phục và cần thêm thời gian',
        corrective_evidence: 'F11/2026/00001',
    });
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers().setSystemTime(new Date('2026-04-15T00:00:00Z'));
        db.certificates.findUnique.mockResolvedValue({
            id: ref, cert_number: 'C-001', status: 'suspended',
            certificate_series_id: 'series-1',
            certificate_series: { project_id: 'project-1' },
            status_histories: [{
                id: history, effective_date: new Date('2026-01-31T00:00:00Z'),
                certification_decision_id: 'decision-1',
            }],
        });
        db.users.findFirst.mockResolvedValue({ id: maker });
        db.technical_reviews.findUnique.mockResolvedValue({
            id: f11, reviewer_id: '66666666-6666-4666-8666-666666666666',
            status: 'completed',
            reports: { audit_plan_id: 'audit-plan-1',
                audit_plans: { project_id: 'project-1' } },
        });
        db.workflow_approvals.findFirst.mockResolvedValue(null);
        db.workflow_approvals.findMany.mockResolvedValue([]);
        db.workflow_approvals.create.mockResolvedValue({ id: 'review-1', status: 'pending', step_no: 1 });
        db.workflow_approvals.updateMany.mockResolvedValue({ count: 1 });
        db.audit_team_members.findFirst.mockResolvedValue(null);
        db.$queryRaw.mockResolvedValue([{ id: ref }]);
        db.$transaction.mockImplementation(async (fn) => fn(db));
    });
    afterEach(() => jest.useRealTimers());
    it('creates an auditable review request but never updates certificates', async () => {
        const res = await service.request(ref, request(), actor);
        expect(res.status).toBe('pending');
        expect(res.legal_status_unchanged).toBe(true);
        expect(db.workflow_approvals.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ entity_id: ref, approver_id: maker, status: 'pending' }),
        }));
        expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ user_id: actor, action: 'P09_SUSPENSION_REVIEW_REQUEST' }),
        }));
        expect(db.certificates).not.toHaveProperty('update');
    });
    it('rejects self decisions and unauthenticated case reviewers', async () => {
        await expect(service.request(ref, {
            ...request(), decision_maker_id: actor,
        }, actor)).rejects.toBeInstanceOf(ForbiddenException);
        db.users.findFirst.mockResolvedValue(null);
        await expect(service.request(ref, request(), actor))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('denies a second extension when existing approved 3-month extension is recorded', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({
            status: 'approved', step_no: 1, approver_id: maker,
            approved_at: new Date(), comment: JSON.stringify(proof),
        });
        db.workflow_approvals.findMany.mockResolvedValue([{
            status: 'approved', approver_id: maker,
            approved_at: new Date(), comment: JSON.stringify(proof),
        }]);
        await expect(service.request(ref, request(), actor))
            .rejects.toBeInstanceOf(ConflictException);
    });
    it('prevents second extension after a rejected newer request hides a prior approval', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({ status: 'rejected', step_no: 2 });
        db.workflow_approvals.findMany.mockResolvedValue([{
            status: 'approved', approver_id: maker,
            approved_at: new Date(), comment: JSON.stringify(proof),
        }]);
        await expect(service.request(ref, request(), actor))
            .rejects.toBeInstanceOf(ConflictException);
        expect(db.workflow_approvals.create).not.toHaveBeenCalled();
    });
    it('continues to project the approved extension after another request was rejected', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({
            status: 'rejected', step_no: 2,
            approver_id: maker, approved_at: null,
            comment: JSON.stringify({ ...proof, reviewer_comment: 'Từ chối lại' }),
        });
        db.workflow_approvals.findMany.mockResolvedValue([{
            status: 'approved', approver_id: maker,
            approved_at: new Date(), comment: JSON.stringify(proof),
        }]);
        const result = await service.get(ref);
        expect(result.approved_extension).toBe(true);
        expect(result.extension?.status).toBe('rejected');
        expect(result.legal_status_unchanged).toBe(true);
    });
    it('cannot approve extension after maximum six months', async () => {
        jest.setSystemTime(new Date('2026-08-01T00:00:00Z'));
        await expect(service.request(ref, request(), actor))
            .rejects.toBeInstanceOf(BadRequestException);
    });
    it('cannot approve when F11 reviewer is same as independent decision maker', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({
            id: 'review-1', status: 'pending', approver_id: maker,
            comment: JSON.stringify(proof),
        });
        db.technical_reviews.findUnique.mockResolvedValue({
            id: f11, reviewer_id: maker, status: 'completed',
            reports: { audit_plan_id: 'audit-plan-1',
                audit_plans: { project_id: 'project-1' } },
        });
        await expect(service.decide(ref, 'EXTEND_3_MONTHS', {
            decision: 'approved', comment: 'Đã thẩm xét toàn bộ bằng chứng liên quan',
        }, maker)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('approves only the nominated independent maker; results require F13', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({
            id: 'review-1', status: 'pending', approver_id: maker,
            comment: JSON.stringify(proof),
        });
        const res = await service.decide(ref, 'EXTEND_3_MONTHS', {
            decision: 'approved', comment: 'Đã thẩm xét toàn bộ bằng chứng liên quan',
        }, maker);
        expect(res.legal_status_unchanged).toBe(true);
        expect(res.requires_f13).toBe(true);
        expect(db.workflow_approvals.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'review-1', status: 'pending', approver_id: maker },
        }));
        expect(db.certificates).not.toHaveProperty('update');
    });
});
