import {
    BadRequestException,
} from '@nestjs/common';

import {
    WorkItemsService,
} from './work-items.service';

describe('WorkItemsService', () => {
    const workItems = {
        upsert:
            jest.fn(),
        findUnique:
            jest.fn(),
        update:
            jest.fn(),
        updateMany:
            jest.fn(),
        findMany:
            jest.fn(),
    };
    const prisma = {
        work_items:
            workItems,
        technical_reviews: {
            findMany:
                jest.fn(),
        },
        certification_decisions: {
            findMany:
                jest.fn(),
        },
        audit_findings: {
            findMany:
                jest.fn(),
        },
        application_reviews: {
            findMany:
                jest.fn(),
        },
        surveillance_information_snapshots: {
            findMany:
                jest.fn(),
        },
        audit_plans: {
            findMany:
                jest.fn(),
        },
        reports: {
            findMany:
                jest.fn(),
        },
    };
    const authorization = {
        canPerformActionWithinScope:
            jest.fn(),
    };
    const resourceAccess = {
        filterProjectIds:
            jest.fn(),
        filterEntities:
            jest.fn(),
    };
    let service:
        WorkItemsService;

    const openInput = {
        sourceKey:
            'technical-review:1',
        workType:
            'TECHNICAL_REVIEW' as const,
        actionCode:
            'technical_review.perform',
        title:
            'Thẩm xét kỹ thuật',
        entityType:
            'technical_review',
        entityId:
            'review-1',
        projectId:
            'project-1',
        assignedUserId:
            'user-1',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        workItems.upsert.mockResolvedValue({
            id:
                'work-1',
            source_key:
                openInput.sourceKey,
            status:
                'OPEN',
        });
        workItems.update.mockImplementation(
            async ({ data }) => ({
                id:
                    'work-1',
                ...data,
            }),
        );
        workItems.updateMany.mockResolvedValue({
            count:
                1,
        });
        workItems.findMany.mockResolvedValue([]);
        authorization.canPerformActionWithinScope
            .mockReturnValue(true);
        resourceAccess.filterProjectIds
            .mockImplementation(
                async (ids) =>
                    ids,
            );
        resourceAccess.filterEntities
            .mockImplementation(
                async (items) =>
                    items,
            );
        prisma.technical_reviews.findMany
            .mockResolvedValue([]);
        prisma.certification_decisions.findMany
            .mockResolvedValue([]);
        prisma.audit_findings.findMany
            .mockResolvedValue([]);
        prisma.application_reviews.findMany
            .mockResolvedValue([]);
        prisma.surveillance_information_snapshots.findMany
            .mockResolvedValue([]);
        prisma.audit_plans.findMany
            .mockResolvedValue([]);
        prisma.reports.findMany
            .mockResolvedValue([]);
        service =
            new WorkItemsService(
                prisma as any,
                authorization as any,
                resourceAccess as any,
            );
    });

    it('requires source_key', async () => {
        await expect(
            service.openWorkItem({
                ...openInput,
                sourceKey:
                    ' ',
            }),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('requires a user or role assignment', async () => {
        await expect(
            service.openWorkItem({
                ...openInput,
                assignedUserId:
                    null,
            }),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('upserts by source_key and normalizes action/role', async () => {
        await service.openWorkItem({
            ...openInput,
            actionCode:
                ' Technical_Review.Perform ',
            assignedUserId:
                null,
            assignedRole:
                ' technical_reviewer ',
        });

        expect(
            workItems.upsert,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    source_key:
                        openInput.sourceKey,
                },
                update:
                    expect.objectContaining({
                        action_code:
                            'technical_review.perform',
                        assigned_role:
                            'TECHNICAL_REVIEWER',
                    }),
            }),
        );
    });

    it('does not include status in upsert update, so DONE is not reopened', async () => {
        await service.openWorkItem(
            openInput,
        );

        expect(
            workItems.upsert.mock.calls[0][0]
                .update,
        ).not.toHaveProperty(
            'status',
        );
    });

    it('returns null when completing a missing item', async () => {
        workItems.findUnique
            .mockResolvedValue(null);

        await expect(
            service.completeWorkItem({
                sourceKey:
                    'missing',
            }),
        ).resolves.toBeNull();
    });

    it('keeps DONE completion idempotent', async () => {
        const done = {
            id:
                'work-1',
            status:
                'DONE',
        };
        workItems.findUnique
            .mockResolvedValue(done);

        await expect(
            service.completeWorkItem({
                id:
                    'work-1',
            }),
        ).resolves.toBe(done);
        expect(
            workItems.update,
        ).not.toHaveBeenCalled();
    });

    it('completes an OPEN item with actor and timestamp', async () => {
        workItems.findUnique
            .mockResolvedValue({
                id:
                    'work-1',
                status:
                    'OPEN',
            });

        await service.completeWorkItem(
            {
                id:
                    'work-1',
            },
            'user-1',
        );

        expect(
            workItems.update,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data:
                    expect.objectContaining({
                        status:
                            'DONE',
                        completed_by:
                            'user-1',
                    }),
            }),
        );
    });

    it('does not cancel a DONE item', async () => {
        const done = {
            id:
                'work-1',
            status:
                'DONE',
        };
        workItems.findUnique
            .mockResolvedValue(done);

        await expect(
            service.cancelWorkItem({
                id:
                    'work-1',
            }),
        ).resolves.toBe(done);
        expect(
            workItems.update,
        ).not.toHaveBeenCalled();
    });

    it('cancels an OPEN item', async () => {
        workItems.findUnique
            .mockResolvedValue({
                id:
                    'work-1',
                status:
                    'OPEN',
            });

        await service.cancelWorkItem({
            sourceKey:
                'source-1',
        });

        expect(
            workItems.update,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data:
                    expect.objectContaining({
                        status:
                            'CANCELLED',
                    }),
            }),
        );
    });

    it('completes all active matching work items only', async () => {
        await service.completeMatchingWorkItems(
            {
                actionCode:
                    'CAP.REVIEW',
                entityType:
                    'AUDIT_FINDING',
                entityId:
                    'finding-1',
            },
            'auditor-1',
        );

        expect(
            workItems.updateMany,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where:
                    expect.objectContaining({
                        action_code:
                            'cap.review',
                        status: {
                            in: [
                                'OPEN',
                                'IN_PROGRESS',
                            ],
                        },
                    }),
            }),
        );
    });

    it.each([
        [
            'status',
            {
                status:
                    'invalid',
            },
        ],
        [
            'priority',
            {
                priority:
                    'invalid',
            },
        ],
        [
            'work_type',
            {
                work_type:
                    'invalid',
            },
        ],
        [
            'due',
            {
                due:
                    'invalid',
            },
        ],
    ])('rejects invalid %s filters', async (_field, query) => {
        await expect(
            service.getMyWork(
                {
                    userId:
                        'user-1',
                    roles: [
                        'ADMIN',
                    ],
                },
                query,
            ),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('queries non-admin work by exact user or role assignment', async () => {
        await service.getMyWork(
            {
                userId:
                    'user-1',
                roles: [
                    'technical_reviewer',
                ],
            },
            {},
        );

        expect(
            workItems.findMany.mock.calls[0][0]
                .where.AND[0],
        ).toEqual({
            OR: [
                {
                    assigned_user_id:
                        'user-1',
                },
                {
                    assigned_user_id:
                        null,
                    assigned_role: {
                        in: [
                            'TECHNICAL_REVIEWER',
                        ],
                    },
                },
            ],
        });
    });

    it('lets ADMIN query all assignments explicitly', async () => {
        await service.getMyWork(
            {
                userId:
                    'admin-1',
                roles: [
                    'ADMIN',
                ],
            },
            {},
        );

        expect(
            workItems.findMany.mock.calls[0][0]
                .where.AND,
        ).toHaveLength(1);
    });

    it('hides project work outside resource scope', async () => {
        workItems.findMany.mockResolvedValue([
            {
                id:
                    'work-1',
                project_id:
                    'project-1',
            },
        ]);
        resourceAccess.filterProjectIds
            .mockResolvedValue([]);

        const result =
            await service.getMyWork(
                {
                    userId:
                        'user-1',
                    roles: [
                        'AUDITOR',
                    ],
                },
                {},
            );

        expect(result.items)
            .toEqual([]);
    });

    it('returns safe context, overdue and can_execute fields', async () => {
        workItems.findMany.mockResolvedValue([
            {
                id:
                    'work-1',
                source_key:
                    'source-1',
                work_type:
                    'TECHNICAL_REVIEW',
                action_code:
                    'technical_review.perform',
                title:
                    'Review',
                description:
                    null,
                entity_type:
                    'technical_review',
                entity_id:
                    'review-1',
                project_id:
                    'project-1',
                project: {
                    project_code:
                        'PRJ-1',
                    certification_applications: {
                        customers: {
                            company_name:
                                'Customer',
                        },
                    },
                },
                audit_event_id:
                    null,
                audit_plan_id:
                    null,
                cycle_key:
                    null,
                assigned_user_id:
                    'user-1',
                assigned_role:
                    null,
                assigned_user: {
                    full_name:
                        'Reviewer',
                    username:
                        'reviewer',
                },
                status:
                    'OPEN',
                priority:
                    'HIGH',
                due_at:
                    new Date(0),
                destination_path:
                    '/projects/project-1',
                context_json:
                    '{"report_id":"report-1"}',
                available_at:
                    null,
                completed_at:
                    null,
                cancelled_at:
                    null,
                created_at:
                    new Date(),
                updated_at:
                    new Date(),
            },
        ]);

        const result =
            await service.getMyWork(
                {
                    userId:
                        'user-1',
                    roles: [
                        'TECHNICAL_REVIEWER',
                    ],
                },
                {},
            );

        expect(result.items[0])
            .toEqual(
                expect.objectContaining({
                    context: {
                        report_id:
                            'report-1',
                    },
                    is_overdue:
                        true,
                    can_execute:
                        true,
                }),
            );
    });

    it('defaults reconciliation to dry-run and performs no writes', async () => {
        const result =
            await service.reconcile();

        expect(result)
            .toEqual(
                expect.objectContaining({
                    mode:
                        'dry-run',
                    candidate_count:
                        0,
                }),
            );
        expect(
            workItems.upsert,
        ).not.toHaveBeenCalled();
    });

    it('apply reconciliation is idempotent through openWorkItem upsert', async () => {
        const result =
            await service.reconcile(true);

        expect(result)
            .toEqual(
                expect.objectContaining({
                    mode:
                        'apply',
                    persisted_count:
                        0,
                }),
            );
    });
});
