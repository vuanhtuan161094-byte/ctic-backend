import {
    NotificationRecipientService,
} from './notification-recipient.service';

describe('NotificationRecipientService', () => {
    function user(
        id: string,
        roles: string[],
    ) {
        return {
            id,
            user_roles:
                roles.map((role) => ({
                    roles: {
                        role_name:
                            role,
                    },
                })),
        };
    }

    function harness(
        users: ReturnType<typeof user>[],
        allowedIds: string[],
    ) {
        const prisma = {
            users: {
                findMany:
                    jest.fn()
                        .mockImplementation(
                            async ({ where }: any) => {
                                const ids:
                                    string[] | undefined =
                                    where.id?.in;
                                const roles:
                                    string[] | undefined =
                                    where.user_roles
                                        ?.some.roles
                                        ?.role_name.in;

                                return users.filter((candidate) =>
                                    (!ids || ids.includes(candidate.id)) &&
                                    (
                                        !roles ||
                                        candidate.user_roles.some(
                                            (entry) =>
                                                roles.includes(
                                                    entry.roles.role_name,
                                                ),
                                        )
                                    ),
                                );
                            },
                        ),
            },
        };
        const resourceAccess = {
            filterProjectIds:
                jest.fn()
                    .mockImplementation(
                        async (
                            projectIds: string[],
                            actor: {
                                userId: string;
                            },
                        ) => allowedIds.includes(
                            actor.userId,
                        )
                            ? projectIds
                            : [],
                    ),
            filterEntities:
                jest.fn()
                    .mockResolvedValue([]),
        };
        const service =
            new NotificationRecipientService(
                prisma as never,
                resourceAccess as never,
            );

        return {
            prisma,
            resourceAccess,
            service,
        };
    }

    const work = {
        assigned_user_id: null,
        assigned_role: 'LEAD_AUDITOR',
        project_id: 'project-a',
        entity_type: 'audit_plan',
        entity_id: 'plan-a',
    };

    it('resolves an eligible role queue user', async () => {
        const h = harness([
            user('lead-a', ['LEAD_AUDITOR']),
        ], ['lead-a']);

        await expect(
            h.service.resolveForWorkItem(work),
        ).resolves.toEqual(['lead-a']);
    });

    it('excludes a same-role user outside resource scope', async () => {
        const h = harness([
            user('lead-a', ['LEAD_AUDITOR']),
            user('lead-b', ['LEAD_AUDITOR']),
        ], ['lead-a']);

        await expect(
            h.service.resolveForWorkItem(work),
        ).resolves.toEqual(['lead-a']);
    });

    it('resolves a specifically assigned active user', async () => {
        const h = harness([
            user('assigned-a', ['AUDITOR']),
        ], ['assigned-a']);

        await expect(
            h.service.resolveForWorkItem({
                ...work,
                assigned_user_id:
                    'assigned-a',
                assigned_role:
                    null,
            }),
        ).resolves.toEqual(['assigned-a']);
    });

    it('deduplicates the same person received through multiple roles', async () => {
        const h = harness([
            user('multi-a', [
                'LEAD_AUDITOR',
                'COORDINATOR',
            ]),
        ], ['multi-a']);

        await expect(
            h.service.resolveForWorkItem(
                work,
                ['COORDINATOR'],
            ),
        ).resolves.toEqual(['multi-a']);
    });

    it('queries only active accounts', async () => {
        const h = harness([
            user('lead-a', ['LEAD_AUDITOR']),
        ], ['lead-a']);

        await h.service.resolveForWorkItem(work);

        expect(h.prisma.users.findMany)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: 'active',
                    }),
                }),
            );
    });

    it('uses the same scope check for customer CAP recipients', async () => {
        const h = harness([
            user('customer-a', ['CUSTOMER']),
            user('customer-b', ['CUSTOMER']),
        ], ['customer-a']);

        await expect(
            h.service.resolveForWorkItem({
                ...work,
                assigned_role:
                    'CUSTOMER',
            }),
        ).resolves.toEqual(['customer-a']);
    });

    it('does not fall back to every admin for a normal role queue', async () => {
        const h = harness([
            user('lead-a', ['LEAD_AUDITOR']),
            user('admin-a', ['ADMIN']),
        ], [
            'lead-a',
            'admin-a',
        ]);

        await expect(
            h.service.resolveForWorkItem(work),
        ).resolves.toEqual(['lead-a']);
    });

    it('resolves certificate recipients by role and project scope', async () => {
        const h = harness([
            user('coordinator-a', ['COORDINATOR']),
            user('decision-a', ['DECISION_MAKER']),
            user('decision-b', ['DECISION_MAKER']),
        ], [
            'coordinator-a',
            'decision-a',
        ]);

        await expect(
            h.service.resolveRolesForProject(
                'project-a',
                [
                    'COORDINATOR',
                    'DECISION_MAKER',
                ],
            ),
        ).resolves.toEqual([
            'coordinator-a',
            'decision-a',
        ]);
    });
});
