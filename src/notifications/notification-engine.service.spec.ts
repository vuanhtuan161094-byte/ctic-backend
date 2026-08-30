import {
    NotificationEngineService,
} from './notification-engine.service';

describe('NotificationEngineService', () => {
    const now =
        new Date('2026-08-21T08:00:00.000Z');

    function harness() {
        const prisma = {
            notification_preferences: {
                findUnique:
                    jest.fn()
                        .mockResolvedValue(null),
            },
            notifications: {
                upsert:
                    jest.fn()
                        .mockResolvedValue({}),
            },
            work_items: {
                findMany:
                    jest.fn()
                        .mockResolvedValue([]),
            },
            certificates: {
                findMany:
                    jest.fn()
                        .mockResolvedValue([]),
            },
            certificate_status_histories: {
                findMany:
                    jest.fn()
                        .mockResolvedValue([]),
            },
        };
        const recipients = {
            resolveForWorkItem:
                jest.fn()
                    .mockResolvedValue([
                        'user-a',
                    ]),
            resolveRolesForProject:
                jest.fn()
                    .mockResolvedValue([
                        'coordinator-a',
                    ]),
        };
        const service =
            new NotificationEngineService(
                prisma as never,
                recipients as never,
            );
        const item = (
            dueAt: Date | null,
            overrides: Record<string, unknown> = {},
        ) => ({
            id: 'work-a',
            source_key: 'work-source-a',
            work_type: 'AUDIT_PLAN',
            action_code: 'audit_plan.prepare',
            title: 'Chuẩn bị kế hoạch đánh giá',
            description: null,
            entity_type: 'audit_plan',
            entity_id: '11111111-1111-1111-1111-111111111111',
            project_id: '22222222-2222-2222-2222-222222222222',
            audit_event_id: null,
            audit_plan_id: null,
            cycle_key: null,
            assigned_user_id: 'user-a',
            assigned_role: null,
            status: 'OPEN',
            priority: 'NORMAL',
            due_at: dueAt,
            available_at: null,
            completed_at: null,
            cancelled_at: null,
            completed_by: null,
            destination_path: '/projects/project-a?workspace=audit-plan',
            context_json: null,
            created_at: now,
            updated_at: now,
            ...overrides,
        });

        return {
            prisma,
            recipients,
            service,
            item,
        };
    }

    it.each([
        [7, '7D'],
        [3, '3D'],
        [1, '1D'],
    ])('creates a stable T-%s reminder source', async (days, threshold) => {
        const h = harness();
        await h.service.evaluateWorkItem(
            h.item(
                new Date(
                    now.getTime() +
                    days * 24 * 60 * 60 * 1000,
                ),
            ) as never,
            now,
        );

        expect(
            h.prisma.notifications.upsert,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    user_id_source_key_channel: {
                        user_id: 'user-a',
                        source_key:
                            `WORK_REMINDER:work-a:2026-08-${21 + days}:${threshold}`,
                        channel: 'IN_APP',
                    },
                },
            }),
        );
    });

    it.each([
        [-1, 'L1', 'WORK_OVERDUE'],
        [-3, 'L2', 'WORK_ESCALATED'],
        [-7, 'L3', 'WORK_ESCALATED'],
    ])('creates the current %s overdue event', async (days, level, category) => {
        const h = harness();
        await h.service.evaluateWorkItem(
            h.item(
                new Date(
                    now.getTime() +
                    days * 24 * 60 * 60 * 1000,
                ),
            ) as never,
            now,
        );
        const call =
            h.prisma.notifications.upsert
                .mock.calls[0][0];

        expect(call.create.source_key)
            .toContain(`:${level}`);
        expect(call.create.category)
            .toBe(category);
    });

    it('does not emit deadline messages for DONE work', async () => {
        const h = harness();
        await h.service.evaluateWorkItem(
            h.item(
                new Date(
                    now.getTime() -
                    10 * 24 * 60 * 60 * 1000,
                ),
                {
                    status: 'DONE',
                },
            ) as never,
            now,
        );

        expect(h.prisma.notifications.upsert)
            .not.toHaveBeenCalled();
    });

    it('does not emit deadline messages without due_at', async () => {
        const h = harness();
        await h.service.evaluateWorkItem(
            h.item(null) as never,
            now,
        );

        expect(h.prisma.notifications.upsert)
            .not.toHaveBeenCalled();
    });

    it('starts a new reminder sequence after a due-date change', async () => {
        const h = harness();
        await h.service.evaluateWorkItem(
            h.item(
                new Date('2026-08-28T08:00:00.000Z'),
            ) as never,
            now,
        );
        await h.service.evaluateWorkItem(
            h.item(
                new Date('2026-08-29T08:00:00.000Z'),
            ) as never,
            new Date('2026-08-22T08:00:00.000Z'),
        );
        const keys =
            h.prisma.notifications.upsert.mock.calls
                .map((call) =>
                    call[0].create.source_key,
                );

        expect(new Set(keys).size)
            .toBe(2);
    });

    it('uses the database compound key under concurrent delivery', async () => {
        const h = harness();
        const input = {
            sourceKey: 'WORK_ASSIGNED:work-a:user-a',
            category: 'WORK_ASSIGNED' as const,
            severity: 'NORMAL' as const,
            title: 'Công việc mới',
            message: 'Bạn có công việc mới.',
            recipientIds: ['user-a'],
        };

        await Promise.all([
            h.service.deliver(input),
            h.service.deliver(input),
        ]);
        const selectors =
            h.prisma.notifications.upsert.mock.calls
                .map((call) =>
                    call[0].where,
                );

        expect(selectors[0])
            .toEqual(selectors[1]);
    });

    it('deduplicates a multi-role recipient', async () => {
        const h = harness();
        await h.service.deliver({
            sourceKey: 'event-a',
            category: 'WORK_ASSIGNED',
            severity: 'NORMAL',
            title: 'Công việc',
            message: 'Nội dung',
            recipientIds: [
                'user-a',
                'user-a',
            ],
        });

        expect(h.prisma.notifications.upsert)
            .toHaveBeenCalledTimes(1);
    });

    it('honors a disabled non-critical preference', async () => {
        const h = harness();
        h.prisma.notification_preferences
            .findUnique.mockResolvedValue({
                enabled: false,
            });

        const result =
            await h.service.deliver({
                sourceKey: 'event-a',
                category: 'WORK_DUE_SOON',
                severity: 'WARNING',
                title: 'Nhắc hạn',
                message: 'Nội dung',
                recipientIds: ['user-a'],
            });

        expect(result.suppressed)
            .toBe(1);
    });

    it('cannot suppress a critical in-app operational message', async () => {
        const h = harness();
        h.prisma.notification_preferences
            .findUnique.mockResolvedValue({
                enabled: false,
            });

        await h.service.deliver({
            sourceKey: 'event-critical',
            category: 'WORK_ESCALATED',
            severity: 'CRITICAL',
            title: 'Cảnh báo',
            message: 'Nội dung',
            recipientIds: ['user-a'],
        });

        expect(h.prisma.notifications.upsert)
            .toHaveBeenCalledTimes(1);
    });

    it('notifies only current ACTIVE/SUSPENDED certificate versions', async () => {
        const h = harness();
        h.prisma.certificates.findMany.mockResolvedValue([{
            id: 'certificate-a',
            cert_number: 'CERT-001',
            status: 'active',
            expire_date:
                new Date('2026-09-20T08:00:00.000Z'),
            certificate_series: {
                project_id: 'project-a',
            },
        }]);

        await h.service.evaluateCertificateExpiry(now);

        expect(h.prisma.certificates.findMany)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: {
                            in: [
                                'active',
                                'suspended',
                            ],
                        },
                        superseded_by: {
                            none: {},
                        },
                    }),
                }),
            );
        expect(
            h.prisma.notifications.upsert
                .mock.calls[0][0]
                .create.source_key,
        ).toBe(
            'CERT_EXPIRY:certificate-a:2026-09-20:30D',
        );
    });

    it('does not copy internal status reasoning into the delivery context', async () => {
        const h = harness();
        h.prisma.certificate_status_histories.findMany
            .mockResolvedValue([{
                id: 'history-a',
                to_status: 'withdrawn',
                reason: 'internal deliberation',
                effective_date: now,
                certificates: {
                    id: 'certificate-a',
                    cert_number: 'CERT-001',
                    certificate_series: {
                        project_id: 'project-a',
                    },
                },
            }]);

        await h.service
            .evaluateCertificateStatusChanges(now);
        const delivery =
            h.prisma.notifications.upsert
                .mock.calls[0][0]
                .create;

        expect(delivery.context_json)
            .not.toContain('internal deliberation');
        expect(delivery.message)
            .not.toContain('internal deliberation');
    });
});
