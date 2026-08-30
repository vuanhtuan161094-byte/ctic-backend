import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DelegationsService } from './delegations.service';

describe('DelegationsService', () => {
    const prisma = {
        users: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        delegations: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        delegated_action_logs: {
            create: jest.fn(),
        },
    };
    const notifications = {
        deliver: jest.fn(),
    };
    let service: DelegationsService;

    const activeUser = (id: string, role: string) => ({
        id,
        username: id,
        full_name: id,
        email: `${id}@example.test`,
        status: 'active',
        user_roles: [{ roles: { role_name: role } }],
    });

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.delegations.findFirst.mockResolvedValue(null);
        notifications.deliver.mockResolvedValue({ delivered: 2, suppressed: 0 });
        service = new DelegationsService(prisma as any, notifications as any);
    });

    it('blocks customer identity delegation', async () => {
        await expect(service.create({
            delegate_user_id: 'delegate',
            effective_from: new Date(Date.now() + 60_000),
            effective_to: new Date(Date.now() + 120_000),
            scope_type: 'ACTION',
            action_codes: ['cap.respond'],
            reason: 'absence',
        }, {
            userId: 'customer',
            roles: ['CUSTOMER'],
        })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not grant missing base eligibility to the delegate', async () => {
        prisma.users.findUnique
            .mockResolvedValueOnce(activeUser('reviewer-a', 'technical_reviewer'))
            .mockResolvedValueOnce(activeUser('auditor-a', 'auditor'));

        await expect(service.create({
            delegate_user_id: 'auditor-a',
            effective_from: new Date(Date.now() + 60_000),
            effective_to: new Date(Date.now() + 120_000),
            scope_type: 'ACTION',
            action_codes: ['technical_review.perform'],
            reason: 'temporary absence',
        }, {
            userId: 'reviewer-a',
            roles: ['TECHNICAL_REVIEWER'],
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a bounded delegation for two base-eligible users and notifies both', async () => {
        const from = new Date(Date.now() + 60_000);
        const to = new Date(Date.now() + 120_000);
        prisma.users.findUnique
            .mockResolvedValueOnce(activeUser('coordinator-a', 'coordinator'))
            .mockResolvedValueOnce(activeUser('coordinator-b', 'coordinator'));
        prisma.delegations.create.mockResolvedValue({
            id: 'delegation-1',
            delegator_user_id: 'coordinator-a',
            delegate_user_id: 'coordinator-b',
            effective_from: from,
            effective_to: to,
            status: 'SCHEDULED',
            scope_type: 'ACTION',
            action_codes_json: JSON.stringify(['audit_team.issue']),
            project_id: null,
            reason: 'temporary absence',
            delegator: { id: 'coordinator-a' },
            delegate: { id: 'coordinator-b' },
        });

        const result = await service.create({
            delegate_user_id: 'coordinator-b',
            effective_from: from,
            effective_to: to,
            scope_type: 'ACTION',
            action_codes: ['audit_team.issue'],
            reason: 'temporary absence',
        }, {
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        });

        expect(result.status).toBe('SCHEDULED');
        expect(result.action_codes).toEqual(['audit_team.issue']);
        expect(notifications.deliver).toHaveBeenCalledWith(expect.objectContaining({
            recipientIds: ['coordinator-a', 'coordinator-b'],
        }));
    });

    it('revokes active delegation without altering original work ownership', async () => {
        const record = {
            id: 'delegation-1',
            delegator_user_id: 'coordinator-a',
            delegate_user_id: 'coordinator-b',
            effective_from: new Date(Date.now() - 60_000),
            effective_to: new Date(Date.now() + 60_000),
            status: 'ACTIVE',
            scope_type: 'ACTION',
            action_codes_json: JSON.stringify(['audit_team.issue']),
            project_id: null,
            reason: 'temporary absence',
        };
        prisma.delegations.findUnique.mockResolvedValue(record);
        prisma.delegations.update.mockResolvedValue({
            ...record,
            status: 'REVOKED',
            revoked_at: new Date(),
        });

        const result = await service.revoke('delegation-1', {
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        });

        expect(result.status).toBe('REVOKED');
        expect(prisma.delegations.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'REVOKED' }),
        }));
    });

    it('applies governance user, status and overlapping time-range filters server-side', async () => {
        prisma.delegations.findMany.mockResolvedValue([]);

        await service.listGovernance({ userId: 'admin', roles: ['ADMIN'] }, {
            delegator_user_id: 'coordinator-a',
            delegate_user_id: 'coordinator-b',
            status: 'active',
            from: '2026-08-21T00:00:00.000Z',
            to: '2026-08-31T23:59:59.999Z',
        });

        expect(prisma.delegations.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                delegator_user_id: 'coordinator-a',
                delegate_user_id: 'coordinator-b',
                status: 'ACTIVE',
                effective_from: { lte: new Date('2026-08-31T23:59:59.999Z') },
                effective_to: { gte: new Date('2026-08-21T00:00:00.000Z') },
            }),
        }));
    });

    it('records an action only while delegation scope and base eligibility remain valid', async () => {
        const record = {
            id: 'delegation-1',
            delegator_user_id: 'coordinator-a',
            delegate_user_id: 'coordinator-b',
            effective_from: new Date(Date.now() - 60_000),
            effective_to: new Date(Date.now() + 60_000),
            status: 'ACTIVE',
            action_codes_json: JSON.stringify(['audit_team.issue']),
            project_id: 'project-1',
        };
        prisma.delegations.findUnique.mockResolvedValue(record);
        prisma.delegated_action_logs.create.mockResolvedValue({ id: 'log-1' });

        await service.recordDelegatedAction({
            delegationId: record.id,
            actor: { userId: 'coordinator-b', roles: ['COORDINATOR'] },
            actionCode: 'audit_team.issue',
            entityType: 'audit_plan',
            entityId: 'plan-1',
            projectId: 'project-1',
        });

        expect(prisma.delegated_action_logs.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                actor_user_id: 'coordinator-b',
                delegated_for_user_id: 'coordinator-a',
                delegation_id: 'delegation-1',
            }),
        });

        prisma.delegations.findUnique.mockResolvedValue({
            ...record,
            effective_to: new Date(Date.now() - 1),
        });
        await expect(service.recordDelegatedAction({
            delegationId: record.id,
            actor: { userId: 'coordinator-b', roles: ['COORDINATOR'] },
            actionCode: 'audit_team.issue',
            entityType: 'audit_plan',
            entityId: 'plan-1',
            projectId: 'project-1',
        })).rejects.toBeInstanceOf(ForbiddenException);
    });
});
