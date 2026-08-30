import { BadRequestException, ConflictException } from '@nestjs/common';
import { TechnicalReviewsService } from './technical-reviews.service';

describe('Technical reviewer assignment', () => {
    const transaction = {
        technical_reviews: {
            create: jest.fn(),
            update: jest.fn(),
        },
        technical_review_assignments: {
            create: jest.fn(),
            updateMany: jest.fn(),
        },
        work_items: {
            updateMany: jest.fn(),
        },
        audit_logs: {
            create: jest.fn(),
        },
    };
    const prisma = {
        users: { findFirst: jest.fn() },
        technical_reviews: { findUnique: jest.fn() },
        $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const workItems = {
        completeMatchingWorkItems: jest.fn(),
        openWorkItem: jest.fn(),
    };
    const notifications = {
        notifyWorkAssigned: jest.fn(),
    };
    let service: TechnicalReviewsService;

    const context = (members: any[] = [], reviews: any[] = []) => ({
        plan: {
            id: 'plan-1',
            project_id: 'project-1',
            audit_event_id: 'event-1',
            audit_team_appointment: { members },
        },
        report: {
            id: 'report-1',
            report_code: 'REP-001',
            status: 'ready_for_technical_review',
            audit_findings: [],
            technical_reviews: reviews,
        },
    });

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.$transaction.mockImplementation(async (callback) => callback(transaction));
        service = new TechnicalReviewsService(
            prisma as any,
            workItems as any,
            undefined,
            notifications as any,
        );
        (service as any).loadPlanReviewContext = jest.fn().mockResolvedValue(context());
        (service as any).attachCurrentDocumentFiles = jest.fn().mockResolvedValue([{ document_key: 'report' }]);
        (service as any).buildReviewItems = jest.fn().mockReturnValue([{ document_key: 'report' }]);
        (service as any).getWorkspaceByPlan = jest.fn().mockResolvedValue({ assignment_status: 'ASSIGNED' });
        prisma.users.findFirst.mockResolvedValue({ id: 'reviewer-a', username: 'reviewer-a' });
        transaction.technical_reviews.create.mockResolvedValue({ id: 'review-1' });
        transaction.technical_review_assignments.create.mockResolvedValue({ id: 'assignment-1' });
        workItems.openWorkItem.mockResolvedValue({
            id: 'work-1',
            status: 'OPEN',
            assigned_user_id: 'reviewer-a',
        });
    });

    it('has no implicit self-claim ensure method', () => {
        expect((service as any).ensureForPlan).toBeUndefined();
    });

    it('creates assignment history, one specifically assigned Work Item and notification', async () => {
        const result = await service.assignForPlan('plan-1', {
            reviewer_id: 'reviewer-a',
            note: 'Priority dossier',
        }, {
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        });

        expect(result).toEqual({ assignment_status: 'ASSIGNED' });
        expect(transaction.technical_review_assignments.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                reviewer_id: 'reviewer-a',
                assigned_by: 'coordinator-a',
            }),
        });
        expect(workItems.openWorkItem).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceKey: 'technical-review:review-1:assignment-1',
                assignedUserId: 'reviewer-a',
            }),
            transaction,
        );
        expect(notifications.notifyWorkAssigned).toHaveBeenCalledTimes(1);
    });

    it('rejects an audit-team participant at assignment time', async () => {
        (service as any).loadPlanReviewContext.mockResolvedValue(context([{
            experts: { user_id: 'reviewer-a', full_name: 'Reviewer A' },
        }]));

        await expect(service.assignForPlan('plan-1', {
            reviewer_id: 'reviewer-a',
        }, {
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        })).rejects.toBeInstanceOf(BadRequestException);
        expect(transaction.technical_reviews.create).not.toHaveBeenCalled();
    });

    it('requires an explicit ADMIN override reason', async () => {
        await expect(service.assignForPlan('plan-1', {
            reviewer_id: 'reviewer-a',
        }, {
            userId: 'admin-a',
            roles: ['ADMIN'],
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('prohibits normal reassignment after review work has started', async () => {
        (service as any).getReviewOrThrow = jest.fn().mockResolvedValue({
            id: 'review-1',
            reviewer_id: 'reviewer-a',
            status: 'in_review',
            reports: {
                audit_plan_id: 'plan-1',
                audit_plans: { project_id: 'project-1', audit_event_id: 'event-1' },
            },
        });

        await expect(service.reassign('review-1', {
            reviewer_id: 'reviewer-b',
            reason: 'Reviewer unavailable',
        }, {
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        })).rejects.toBeInstanceOf(ConflictException);
    });

    it('retries the whole assignment transaction when SQL Server reports ENOTBEGUN', async () => {
        (service as any).getReviewOrThrow = jest.fn().mockResolvedValue({
            id: 'review-1',
            report_id: 'report-1',
            reviewer_id: 'reviewer-a',
            status: 'pending',
            reports: {
                report_code: 'REP-001',
                audit_plan_id: 'plan-1',
                audit_plans: { project_id: 'project-1', audit_event_id: 'event-1' },
            },
        });
        (service as any).findOne = jest.fn().mockResolvedValue({ id: 'review-1', reviewer_id: 'reviewer-b' });
        prisma.users.findFirst.mockResolvedValue({ id: 'reviewer-b', username: 'reviewer-b' });
        const transient = Object.assign(
            new Error('Transaction has not begun. Call begin() first.'),
            { code: 'ENOTBEGUN' },
        );
        prisma.$transaction.mockImplementationOnce(async (callback) => {
            await callback(transaction);
            throw transient;
        });

        await expect(service.reassign('review-1', {
            reviewer_id: 'reviewer-b',
            reason: 'Reviewer unavailable',
        }, {
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        })).resolves.toEqual({ id: 'review-1', reviewer_id: 'reviewer-b' });

        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(transaction.technical_review_assignments.updateMany).toHaveBeenCalledTimes(2);
        expect(prisma.$transaction.mock.calls.every((args) => args.length === 1)).toBe(true);
        expect(notifications.notifyWorkAssigned).toHaveBeenCalledTimes(1);
    });

    it('stops after two total attempts when ENOTBEGUN persists', async () => {
        const transient = Object.assign(new Error('Transaction has not begun.'), { code: 'ENOTBEGUN' });
        prisma.$transaction.mockRejectedValue(transient);

        await expect((service as any).retryTransaction(jest.fn())).rejects.toBe(transient);

        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry connection or business errors', async () => {
        const errors = [
            Object.assign(new Error("Can't reach database server at localhost:1433"), { code: 'P1001' }),
            Object.assign(new Error('A commit cannot be executed on an expired transaction.'), { code: 'P2028' }),
            new ConflictException('Hồ sơ đã được giao'),
        ];

        for (const error of errors) {
            prisma.$transaction.mockReset().mockRejectedValue(error);
            await expect((service as any).retryTransaction(jest.fn())).rejects.toBe(error);
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        }
    });
});
