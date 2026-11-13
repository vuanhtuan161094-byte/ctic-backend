import { ForbiddenException, ConflictException } from '@nestjs/common';
import { configuredQmrIds, dateKey, GS1_EXCEPTION_SCHEMA, hasCurrentGs1QmrApproval } from './p09-gs1-exception';
import { P09Gs1ExceptionService } from './p09-gs1-exception.service';

const qmr = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requester = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const evidence = {
    schema: GS1_EXCEPTION_SCHEMA, project_id: 'project-1', program_id: 'program-1',
    decision_id: 'decision-1', decision_date: '2026-02-28',
    approved_date: '2027-03-01', reason: 'Lý do khách quan và phương án giảm thiểu rủi ro',
    requested_by: requester, requested_at: '2026-07-01T00:00:00Z',
    reviewer_comment: 'Đã đối chiếu đầy đủ nguyên nhân và chấp thuận phương án kiểm soát',
    reviewed_at: '2026-07-03T00:00:00Z',
};
describe('P09 GS1 QMR exception exact-authority guard', () => {
    const db = { workflow_approvals: { findFirst: jest.fn() } };
    beforeEach(() => jest.clearAllMocks());
    const input = () => ({
        database: db as never, eventId: 'event-1', projectId: 'project-1',
        programId: 'program-1', decisionId: 'decision-1',
        decisionDate: new Date('2026-02-28T00:00:00Z'),
        proposedDate: '2027-03-01', qmrIds: configuredQmrIds(qmr),
    });

    it('fails closed with no configured QMR identity', async () => {
        expect(configuredQmrIds('INVALID')).toEqual(new Set());
        expect(await hasCurrentGs1QmrApproval({ ...input(), qmrIds: new Set() })).toBe(false);
        expect(db.workflow_approvals.findFirst).not.toHaveBeenCalled();
    });

    it('accepts latest independently approved date and original decision exactly', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({
            status: 'approved', approved_at: new Date(), approver_id: qmr,
            comment: JSON.stringify(evidence),
        });
        expect(await hasCurrentGs1QmrApproval(input())).toBe(true);
        expect(await hasCurrentGs1QmrApproval({ ...input(), proposedDate: '2027-03-02' })).toBe(false);
        expect(await hasCurrentGs1QmrApproval({ ...input(), decisionId: 'reissued' })).toBe(false);
        expect(await hasCurrentGs1QmrApproval({ ...input(), programId: 'wrong-program' })).toBe(false);
    });

    it('denies pending, rejected, missing approval comment or self-approval', async () => {
        for (const status of ['pending', 'rejected']) {
            db.workflow_approvals.findFirst.mockResolvedValue({
                status, approved_at: new Date(), approver_id: qmr, comment: JSON.stringify(evidence),
            });
            expect(await hasCurrentGs1QmrApproval(input())).toBe(false);
        }
        db.workflow_approvals.findFirst.mockResolvedValue({
            status: 'approved', approved_at: new Date(), approver_id: qmr,
            comment: JSON.stringify({ ...evidence, requested_by: qmr }),
        });
        expect(await hasCurrentGs1QmrApproval(input())).toBe(false);
        db.workflow_approvals.findFirst.mockResolvedValue({
            status: 'approved', approved_at: new Date(), approver_id: qmr, comment: '{malformed',
        });
        expect(await hasCurrentGs1QmrApproval(input())).toBe(false);
    });

    it('never honors stale approval when a new pending/rejected latest request supersedes it', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({ status: 'pending' });
        expect(await hasCurrentGs1QmrApproval(input())).toBe(false);
        expect(db.workflow_approvals.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { entity_type: 'P09_GS1_EXCEPTION', entity_id: 'event-1' },
            orderBy: [{ step_no: 'desc' }],
        }));
    });
});

describe('P09 QMR independent request and decision', () => {
    const row = { id: 'event-1', event_type: 'surveillance1', planned_start_date: null,
        audit_programs: { id: 'program-1', project_id: 'project-1' } };
    const prisma = {
        audit_program_events: { findUnique: jest.fn() },
        users: { findFirst: jest.fn(), findMany: jest.fn() },
        certification_decisions: { findFirst: jest.fn() },
        workflow_approvals: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
        audit_logs: { create: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
    };
    const service = new P09Gs1ExceptionService(prisma as never);
    const before = process.env.P09_QMR_APPROVER_IDS;
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.P09_QMR_APPROVER_IDS = qmr;
        prisma.audit_program_events.findUnique.mockResolvedValue(row);
        prisma.users.findFirst.mockResolvedValue({ id: qmr });
        prisma.users.findMany.mockResolvedValue([
            { id: qmr, username: 'qmr.test', full_name: 'Người phụ trách QMR' },
        ]);
        prisma.certification_decisions.findFirst.mockResolvedValue({
            id: 'decision-1', decision_date: new Date('2026-02-28T00:00:00Z'),
        });
        prisma.workflow_approvals.findFirst.mockResolvedValue(null);
        prisma.workflow_approvals.create.mockResolvedValue({ id: 'approval-1', step_no: 1, status: 'pending' });
        prisma.workflow_approvals.updateMany.mockResolvedValue({ count: 1 });
        prisma.audit_logs.create.mockResolvedValue({ id: 'audit-1' });
        prisma.$queryRaw.mockResolvedValue([{ id: 'event-1' }]);
        prisma.$transaction.mockImplementation(async (run) => run(prisma));
    });
    afterAll(() => {
        if (before === undefined) delete process.env.P09_QMR_APPROVER_IDS;
        else process.env.P09_QMR_APPROVER_IDS = before;
    });

    const request = () => ({
        proposed_start_date: '2027-03-01',
        reason: 'Lý do khách quan và phương án giảm thiểu rủi ro',
        qmr_approver_id: qmr,
    });
    it('lists only active configured QMR administrator accounts', async () => {
        expect(await service.availableApprovers()).toHaveLength(1);
        expect(prisma.users.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: { in: [qmr] }, status: 'active',
                user_roles: { some: { roles: { role_name: 'ADMIN' } } },
            }),
        }));
    });
    it('marks previously approved QMR date stale if an authoritative grant changes', async () => {
        prisma.workflow_approvals.findFirst.mockResolvedValue({
            id: 'approval-1', status: 'approved', approver_id: qmr,
            approved_at: new Date('2026-07-03T00:00:00Z'), comment: JSON.stringify(evidence),
        });
        const valid = await service.latest('program-1', 'event-1');
        expect(valid).toEqual(expect.objectContaining({
            status: 'approved', effective_approved: true,
        }));
        prisma.certification_decisions.findFirst.mockResolvedValue({
            id: 'new-cycle', decision_date: new Date('2026-02-28T00:00:00Z'),
        });
        const stale = await service.latest('program-1', 'event-1');
        expect(stale).toEqual(expect.objectContaining({
            status: 'stale', effective_approved: false,
        }));
    });
    it('rejects a configured QMR without an active ADMIN account', async () => {
        prisma.users.findFirst.mockResolvedValue(null);
        await expect(service.request('program-1', 'event-1', request(), requester))
            .rejects.toThrow('ADMIN đang hoạt động');
        expect(prisma.workflow_approvals.create).not.toHaveBeenCalled();
    });
    it('stores requested schedule with independent designated QMR, actor and audit log', async () => {
        const result = await service.request('program-1', 'event-1', request(), requester);
        expect(result.status).toBe('pending');
        expect(prisma.workflow_approvals.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'pending', approver_id: qmr, entity_id: 'event-1' }),
        }));
        expect(prisma.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ user_id: requester, action: 'P09_GS1_EXCEPTION_REQUEST' }),
        }));
    });
    it('rejects self-approval and unconfigured reviewers before database writes', async () => {
        await expect(service.request('program-1', 'event-1', request(), qmr))
            .rejects.toBeInstanceOf(ForbiddenException);
        process.env.P09_QMR_APPROVER_IDS = '';
        await expect(service.request('program-1', 'event-1', request(), requester))
            .rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('rejects duplicate pending request and does not forge another workflow row', async () => {
        prisma.workflow_approvals.findFirst.mockResolvedValue({ step_no: 1, status: 'pending' });
        await expect(service.request('program-1', 'event-1', request(), requester))
            .rejects.toBeInstanceOf(ConflictException);
        expect(prisma.workflow_approvals.create).not.toHaveBeenCalled();
    });
    it('requires reviewer assigned to this exact request and separately verifies source decision', async () => {
        prisma.workflow_approvals.findFirst.mockResolvedValue({
            id: 'approval-1', status: 'pending', approver_id: qmr,
            comment: JSON.stringify({ ...evidence, reviewer_comment: undefined, reviewed_at: undefined }),
        });
        await expect(service.decide('program-1', 'event-1', {
            decision: 'approved', comment: 'Đã kiểm tra lý do khách quan và xác minh bằng chứng',
        }, qmr)).resolves.toEqual(expect.objectContaining({ status: 'approved' }));
        expect(prisma.workflow_approvals.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'approval-1', status: 'pending', approver_id: qmr }),
        }));
        expect(prisma.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ user_id: qmr, action: 'P09_GS1_EXCEPTION_DECIDE' }),
        }));
    });
    it('rejects changed certification decision before QMR can sign', async () => {
        prisma.workflow_approvals.findFirst.mockResolvedValue({
            id: 'approval-1', status: 'pending', approver_id: qmr,
            comment: JSON.stringify(evidence),
        });
        prisma.certification_decisions.findFirst.mockResolvedValue({
            id: 'decision-2', decision_date: new Date('2026-02-28T00:00:00Z'),
        });
        await expect(service.decide('program-1', 'event-1', {
            decision: 'approved', comment: 'Đã kiểm tra lý do khách quan và xác minh bằng chứng',
        }, qmr)).rejects.toBeInstanceOf(ConflictException);
    });
    it('strictly parses ISO dates on requested evidence', () => {
        expect(dateKey('2024-02-29')).toBe('2024-02-29');
    });
});
