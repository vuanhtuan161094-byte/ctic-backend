import {
    ActionAuthorizationService,
} from './action-authorization.service';

describe('ActionAuthorizationService', () => {
    const resourceAccess = {
        filterProjectIds:
            jest.fn(),
        filterEntities:
            jest.fn(),
    };
    let service:
        ActionAuthorizationService;
    const prisma = {
        delegations: {
            findMany: jest.fn(),
        },
        application_reviews: {
            findUnique: jest.fn(),
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        resourceAccess.filterProjectIds
            .mockResolvedValue([
                'project-1',
            ]);
        resourceAccess.filterEntities
            .mockImplementation(
                async (items) =>
                    items,
            );
        prisma.delegations.findMany.mockResolvedValue([]);
        prisma.application_reviews.findUnique.mockResolvedValue({
            reviewer_id: 'user-1',
            workflow_status: 'SUBMITTED',
        });
        service =
            new ActionAuthorizationService(
                resourceAccess as any,
                prisma as any,
            );
    });

    const input = (
        roles: string[],
        actionCode: string,
        overrides: Record<string, unknown> = {},
    ) => ({
        user: {
            userId:
                'user-1',
            roles,
        },
        actionCode,
        resource: {
            projectId:
                'project-1',
        },
        assignment: {
            assignedUserId:
                'user-1',
        },
        workflowState:
            'OPEN',
        ...overrides,
    });

    it('denies ordinary ADMIN access to a business action without base eligibility', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['ADMIN'],
                    'certificate.issue',
                ),
            ),
        ).resolves.toBe(false);
    });

    it('denies an unknown action', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['ADMIN'],
                    'unknown.action',
                ),
            ),
        ).resolves.toBe(false);
    });

    it('allows the assigned application reviewer to execute application.review', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['TECHNICAL_REVIEWER'],
                    'application.review',
                    { workflowState: 'SUBMITTED' },
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows a pre-project application reviewer without requiring project scope', async () => {
        resourceAccess.filterEntities.mockResolvedValue([]);

        await expect(
            service.canPerformAction(
                input(
                    ['AUDITOR'],
                    'application.review',
                    {
                        resource: {
                            entityType: 'application_review',
                            entityId: 'review-1',
                        },
                        workflowState: 'SUBMITTED',
                    },
                ),
            ),
        ).resolves.toBe(true);

        expect(resourceAccess.filterEntities).not.toHaveBeenCalled();
    });

    it('denies a pre-project application review when database assignment does not match', async () => {
        prisma.application_reviews.findUnique.mockResolvedValue({
            reviewer_id: 'other-user',
            workflow_status: 'SUBMITTED',
        });

        await expect(
            service.canPerformAction(
                input(
                    ['AUDITOR'],
                    'application.review',
                    {
                        resource: {
                            entityType: 'application_review',
                            entityId: 'review-1',
                        },
                        workflowState: 'SUBMITTED',
                    },
                ),
            ),
        ).resolves.toBe(false);
    });

    it('denies COORDINATOR from executing the reviewer application.review action', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['COORDINATOR'],
                    'application.review',
                    { workflowState: 'SUBMITTED' },
                ),
            ),
        ).resolves.toBe(false);
    });

    it('denies a missing action code', async () => {
        await expect(
            service.canPerformAction({
                ...input(
                    ['TECHNICAL_REVIEWER'],
                    'application.review',
                ),
                actionCode:
                    null,
            }),
        ).resolves.toBe(false);
    });

    it('denies missing resource scope', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['TECHNICAL_REVIEWER'],
                    'application.review',
                    {
                        resource:
                            null,
                    },
                ),
            ),
        ).resolves.toBe(false);
    });

    it('denies missing assignment even for ADMIN', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['ADMIN'],
                    'application.review',
                    {
                        assignment:
                            null,
                    },
                ),
            ),
        ).resolves.toBe(false);
    });

    it('denies invalid workflow state', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['TECHNICAL_REVIEWER'],
                    'application.review',
                    {
                        workflowState:
                            'DONE',
                    },
                ),
            ),
        ).resolves.toBe(false);
    });

    it('denies COORDINATOR from audit execution', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['COORDINATOR'],
                    'audit.execute',
                ),
            ),
        ).resolves.toBe(false);
    });

    it('allows COORDINATOR to review surveillance changes', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['COORDINATOR'],
                    'surveillance.change_review',
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows an assigned LEAD_AUDITOR to prepare an audit plan', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['LEAD_AUDITOR'],
                    'audit_plan.prepare',
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows an assigned AUDITOR to execute an audit', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['AUDITOR'],
                    'audit.execute',
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows a role-assigned TECHNICAL_EXPERT on audit execution only', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['TECHNICAL_EXPERT'],
                    'audit.execute',
                    {
                        assignment: {
                            assignedRole:
                                'technical_expert',
                        },
                    },
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows the assigned TECHNICAL_REVIEWER', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['TECHNICAL_REVIEWER'],
                    'technical_review.perform',
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows an eligible delegate only for an active matching delegation', async () => {
        prisma.delegations.findMany.mockResolvedValue([{
            id: 'delegation-1',
            delegator_user_id: 'reviewer-a',
            action_codes_json: JSON.stringify(['technical_review.perform']),
        }]);

        await expect(
            service.canPerformAction(
                input(
                    ['TECHNICAL_REVIEWER'],
                    'technical_review.perform',
                    {
                        assignment: { assignedUserId: 'reviewer-a' },
                    },
                ),
            ),
        ).resolves.toBe(true);
    });

    it('does not manufacture reviewer eligibility through delegation', async () => {
        prisma.delegations.findMany.mockResolvedValue([{
            id: 'delegation-1',
            delegator_user_id: 'reviewer-a',
            action_codes_json: JSON.stringify(['technical_review.perform']),
        }]);

        await expect(
            service.canPerformAction(
                input(
                    ['LEAD_AUDITOR'],
                    'technical_review.perform',
                    {
                        assignment: { assignedUserId: 'reviewer-a' },
                    },
                ),
            ),
        ).resolves.toBe(false);
    });

    it('allows DECISION_MAKER to issue a certificate task', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['DECISION_MAKER'],
                    'certificate.issue',
                ),
            ),
        ).resolves.toBe(true);
    });

    it('allows CUSTOMER only on an own scoped CAP response', async () => {
        await expect(
            service.canPerformAction(
                input(
                    ['CUSTOMER'],
                    'cap.respond',
                    {
                        assignment: {
                            assignedRole:
                                'CUSTOMER',
                        },
                    },
                ),
            ),
        ).resolves.toBe(true);
    });

    it('denies cross-resource access even when role and assignment match', async () => {
        resourceAccess.filterProjectIds
            .mockResolvedValue([]);

        await expect(
            service.canPerformAction(
                input(
                    ['DECISION_MAKER'],
                    'certification_decision.issue',
                ),
            ),
        ).resolves.toBe(false);
    });
});
