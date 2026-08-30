import {
    NotFoundException,
} from '@nestjs/common';

import {
    NotificationsService,
} from './notifications.service';

describe('NotificationsService ownership', () => {
    function harness() {
        const prisma = {
            notifications: {
                findFirst:
                    jest.fn(),
                findMany:
                    jest.fn()
                        .mockResolvedValue([]),
                update:
                    jest.fn(),
                updateMany:
                    jest.fn()
                        .mockResolvedValue({
                            count: 0,
                        }),
                count:
                    jest.fn()
                        .mockResolvedValue(0),
            },
            notification_preferences: {
                findMany:
                    jest.fn()
                        .mockResolvedValue([]),
                upsert:
                    jest.fn(),
            },
        };
        const service =
            new NotificationsService(
                prisma as never,
                {
                    evaluateNotifications:
                        jest.fn(),
                } as never,
            );

        return {
            prisma,
            service,
        };
    }

    it('cannot mark another user notification as read', async () => {
        const h = harness();
        h.prisma.notifications.findFirst
            .mockResolvedValue(null);

        await expect(
            h.service.markRead(
                'notification-b',
                'user-a',
            ),
        ).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(
            h.prisma.notifications.findFirst,
        ).toHaveBeenCalledWith({
            where: {
                id: 'notification-b',
                user_id: 'user-a',
            },
        });
    });

    it('marks only the owner notification as read', async () => {
        const h = harness();
        h.prisma.notifications.findFirst
            .mockResolvedValue({
                id: 'notification-a',
                status: 'unread',
            });
        h.prisma.notifications.update
            .mockResolvedValue({
                id: 'notification-a',
                status: 'read',
            });

        await h.service.markRead(
            'notification-a',
            'user-a',
        );

        expect(h.prisma.notifications.update)
            .toHaveBeenCalledWith({
                where: {
                    id: 'notification-a',
                },
                data: {
                    status: 'read',
                    read_at:
                        expect.any(Date),
                },
            });
    });

    it('marks all unread deliveries only for the current user', async () => {
        const h = harness();
        await h.service.markAllRead('user-a');

        expect(
            h.prisma.notifications.updateMany,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    user_id: 'user-a',
                    status: 'unread',
                },
            }),
        );
    });

    it('counts unread notifications only for the current user', async () => {
        const h = harness();
        await h.service.getUnreadSummary('user-a');

        for (
            const call
            of h.prisma.notifications.count
                .mock.calls
        ) {
            expect(call[0].where.user_id)
                .toBe('user-a');
        }
    });

    it('filters personal notification deliveries by owner and channel', async () => {
        const h = harness();
        await h.service.findForUser(
            'user-a',
            {
                status: 'unread',
                category:
                    'WORK_DUE_SOON',
                severity:
                    'WARNING',
            },
        );

        expect(
            h.prisma.notifications.findMany,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    user_id: 'user-a',
                    channel: 'IN_APP',
                    status: 'unread',
                    category:
                        'WORK_DUE_SOON',
                    severity:
                        'WARNING',
                }),
            }),
        );
    });
});
