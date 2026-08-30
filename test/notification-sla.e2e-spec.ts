import {
    ConfigService,
} from '@nestjs/config';
import {
    NotFoundException,
} from '@nestjs/common';
import {
    randomUUID,
} from 'node:crypto';

import {
    NotificationEngineService,
} from '../src/notifications/notification-engine.service';
import {
    NotificationsService,
} from '../src/notifications/notifications.service';
import {
    PrismaService,
} from '../src/prisma/prisma.service';

jest.setTimeout(60_000);

function databaseName(url: string) {
    const part =
        url.split(';').find((item) =>
            /^(database|initial catalog)=/i
                .test(item.trim()),
        );

    return part
        ?.slice(
            part.indexOf('=') + 1,
        )
        .replace(/^\{|\}$/g, '') ??
        '';
}

const testDatabaseUrl =
    process.env.TEST_DATABASE_URL
        ?.trim() ??
    '';
const configuredDatabaseName =
    databaseName(testDatabaseUrl);
const safeTestDatabase =
    configuredDatabaseName
        .toLowerCase()
        .endsWith('_test') ||
    configuredDatabaseName
        .toLowerCase()
        .endsWith('_ci');

if (
    testDatabaseUrl &&
    !safeTestDatabase
) {
    throw new Error(
        `[NOTIFICATION E2E SAFETY] Refusing non-test database ${configuredDatabaseName || '<missing>'}`,
    );
}

if (safeTestDatabase) {
    process.env.DATABASE_URL =
        testDatabaseUrl;
    process.env.NODE_ENV =
        'test';
}

const describeRealDatabase =
    safeTestDatabase
        ? describe
        : describe.skip;

describeRealDatabase(
    'Phase 2.3 notification/SLA engine (isolated real database)',
    () => {
        let prisma:
            PrismaService;
        let engine:
            NotificationEngineService;
        let notifications:
            NotificationsService;
        const ids = {
            userA:
                randomUUID(),
            userB:
                randomUUID(),
            workItem:
                randomUUID(),
            entity:
                randomUUID(),
        };
        const prefix =
            `phase23-e2e:${randomUUID()}`;
        const now =
            new Date('2026-08-21T08:00:00.000Z');

        async function assertTestDatabase() {
            const rows =
                await prisma.$queryRawUnsafe<
                    Array<{
                        database_name: string;
                    }>
                >(
                    'SELECT DB_NAME() AS database_name',
                );
            const actual =
                rows[0]?.database_name ??
                '';

            if (
                !actual
                    .toLowerCase()
                    .endsWith('_test') &&
                !actual
                    .toLowerCase()
                    .endsWith('_ci')
            ) {
                throw new Error(
                    `[NOTIFICATION E2E SAFETY] Cleanup refused for ${actual || '<unknown>'}`,
                );
            }
        }

        async function cleanup() {
            await assertTestDatabase();
            await prisma.notifications.deleteMany({
                where: {
                    OR: [
                        {
                            source_key: {
                                startsWith:
                                    prefix,
                            },
                        },
                        {
                            work_item_id:
                                ids.workItem,
                        },
                    ],
                },
            });
            await prisma.work_items.deleteMany({
                where: {
                    id:
                        ids.workItem,
                },
            });
            await prisma.users.deleteMany({
                where: {
                    id: {
                        in: [
                            ids.userA,
                            ids.userB,
                        ],
                    },
                },
            });
        }

        beforeAll(async () => {
            prisma =
                new PrismaService(
                    new ConfigService(),
                );
            await prisma.$connect();
            await cleanup();
            await prisma.users.createMany({
                data: [
                    {
                        id: ids.userA,
                        username:
                            `p23_a_${ids.userA.slice(0, 8)}`,
                        email:
                            `p23_a_${ids.userA.slice(0, 8)}@example.test`,
                        password_hash:
                            'phase-2.3-e2e-not-a-login-secret',
                    },
                    {
                        id: ids.userB,
                        username:
                            `p23_b_${ids.userB.slice(0, 8)}`,
                        email:
                            `p23_b_${ids.userB.slice(0, 8)}@example.test`,
                        password_hash:
                            'phase-2.3-e2e-not-a-login-secret',
                    },
                ],
            });
            await prisma.work_items.create({
                data: {
                    id:
                        ids.workItem,
                    source_key:
                        `${prefix}:work`,
                    work_type:
                        'AUDIT_PLAN',
                    action_code:
                        'audit_plan.prepare',
                    title:
                        'Chuẩn bị kế hoạch đánh giá',
                    entity_type:
                        'audit_plan',
                    entity_id:
                        ids.entity,
                    assigned_user_id:
                        ids.userA,
                    status:
                        'OPEN',
                    due_at:
                        new Date(
                            now.getTime() +
                            7 * 24 * 60 * 60 * 1000,
                        ),
                    destination_path:
                        `/projects/${ids.entity}?workspace=audit-plan`,
                },
            });
            const recipientResolver = {
                resolveForWorkItem:
                    jest.fn()
                        .mockResolvedValue([
                            ids.userA,
                        ]),
                resolveRolesForProject:
                    jest.fn()
                        .mockResolvedValue([]),
            };
            engine =
                new NotificationEngineService(
                    prisma,
                    recipientResolver as never,
                );
            notifications =
                new NotificationsService(
                    prisma,
                    engine,
                );
        });

        afterAll(async () => {
            await cleanup();
            await prisma.$disconnect();
        });

        it('enforces idempotency during concurrent T-7 evaluation', async () => {
            const item =
                await prisma.work_items.findUniqueOrThrow({
                    where: {
                        id:
                            ids.workItem,
                    },
                });

            await Promise.all([
                engine.evaluateWorkItem(
                    item,
                    now,
                ),
                engine.evaluateWorkItem(
                    item,
                    now,
                ),
            ]);

            await expect(
                prisma.notifications.count({
                    where: {
                        user_id:
                            ids.userA,
                        source_key: {
                            startsWith:
                                `WORK_REMINDER:${ids.workItem}`,
                        },
                    },
                }),
            ).resolves.toBe(1);
        });

        it('creates a new sequence for a revised deadline and stops after DONE', async () => {
            const revisedDue =
                new Date('2026-08-29T08:00:00.000Z');
            const revised =
                await prisma.work_items.update({
                    where: {
                        id:
                            ids.workItem,
                    },
                    data: {
                        due_at:
                            revisedDue,
                    },
                });

            await engine.evaluateWorkItem(
                revised,
                new Date('2026-08-22T08:00:00.000Z'),
            );
            await expect(
                prisma.notifications.count({
                    where: {
                        user_id:
                            ids.userA,
                        work_item_id:
                            ids.workItem,
                    },
                }),
            ).resolves.toBe(2);

            const done =
                await prisma.work_items.update({
                    where: {
                        id:
                            ids.workItem,
                    },
                    data: {
                        status:
                            'DONE',
                        completed_at:
                            now,
                    },
                });
            await engine.evaluateWorkItem(
                done,
                new Date('2026-09-10T08:00:00.000Z'),
            );
            await expect(
                prisma.notifications.count({
                    where: {
                        user_id:
                            ids.userA,
                        work_item_id:
                            ids.workItem,
                    },
                }),
            ).resolves.toBe(2);
        });

        it('prevents cross-user read access and keeps unread counts personal', async () => {
            const delivery =
                await prisma.notifications.create({
                    data: {
                        user_id:
                            ids.userB,
                        source_key:
                            `${prefix}:customer-b`,
                        notification_type:
                            'work_assigned',
                        category:
                            'WORK_ASSIGNED',
                        severity:
                            'NORMAL',
                        title:
                            'Customer B work',
                        message:
                            'Customer B only',
                    },
                });

            await expect(
                notifications.markRead(
                    delivery.id,
                    ids.userA,
                ),
            ).rejects.toBeInstanceOf(
                NotFoundException,
            );
            const [
                summaryA,
                summaryB,
            ] = await Promise.all([
                notifications.getUnreadSummary(
                    ids.userA,
                ),
                notifications.getUnreadSummary(
                    ids.userB,
                ),
            ]);

            expect(summaryA.total)
                .toBe(2);
            expect(summaryB.total)
                .toBe(1);
        });
    },
);
