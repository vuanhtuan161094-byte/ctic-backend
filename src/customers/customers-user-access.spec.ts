import {
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import {
    PERMISSIONS_KEY,
} from '../auth/permissions.decorator';
import {
    ROLES_KEY,
} from '../auth/roles.decorator';
import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    CustomersController,
} from './customers.controller';
import {
    CustomersService,
} from './customers.service';

type DatabaseMock = {
    customers: {
        findUnique: jest.Mock;
    };
    users: {
        findUnique: jest.Mock;
    };
    customer_user_access: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        upsert: jest.Mock;
        update: jest.Mock;
    };
    $transaction: jest.Mock;
};

const customerId =
    '11111111-1111-4111-8111-111111111111';
const targetUserId =
    '22222222-2222-4222-8222-222222222222';
const actorUserId =
    '33333333-3333-4333-8333-333333333333';

function accessMapping(
    status = 'active',
) {
    return {
        id: '44444444-4444-4444-8444-444444444444',
        customer_id: customerId,
        user_id: targetUserId,
        status,
        created_at: new Date('2026-08-10T10:00:00.000Z'),
        updated_at: new Date('2026-08-10T10:00:00.000Z'),
        user: {
            id: targetUserId,
            email: 'customer@example.com',
            full_name: 'Example Customer User',
            status: 'active',
        },
    };
}

function createDatabaseMock(): DatabaseMock {
    const database: DatabaseMock = {
        customers: {
            findUnique: jest.fn(),
        },
        users: {
            findUnique: jest.fn(),
        },
        customer_user_access: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    database.$transaction.mockImplementation(
        async (
            callback: (
                transaction: DatabaseMock,
            ) => Promise<unknown>,
        ) => callback(database),
    );

    return database;
}

function createService(
    database: DatabaseMock,
) {
    return new CustomersService(
        database as unknown as
            PrismaService,
    );
}

describe(
    'P.09 customer user access administration',
    () => {
        let database: DatabaseMock;
        let service: CustomersService;

        beforeEach(() => {
            database = createDatabaseMock();
            service = createService(database);

            database.customers.findUnique
                .mockResolvedValue({
                    id: customerId,
                    status: 'active',
                });
            database.users.findUnique
                .mockResolvedValue({
                    id: targetUserId,
                    status: 'active',
                    user_roles: [
                        {
                            roles: {
                                role_name: 'CUSTOMER',
                            },
                        },
                    ],
                });
        });

        it(
            'lists mappings with a safe user allowlist',
            async () => {
                const mapping =
                    accessMapping();
                database.customer_user_access.findMany
                    .mockResolvedValue([
                        mapping,
                    ]);

                await expect(
                    service.findUserAccess(
                        customerId,
                    ),
                ).resolves.toEqual([
                    mapping,
                ]);

                const query =
                    database.customer_user_access
                        .findMany.mock.calls[0][0];

                expect(query.select.user.select)
                    .toEqual({
                        id: true,
                        email: true,
                        full_name: true,
                        status: true,
                    });
                expect(query.select.user.select)
                    .not.toHaveProperty(
                        'password_hash',
                    );
            },
        );

        it(
            'creates active access and records the actor',
            async () => {
                const mapping =
                    accessMapping();
                database.customer_user_access.findUnique
                    .mockResolvedValue(null);
                database.customer_user_access.upsert
                    .mockResolvedValue(mapping);

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).resolves.toEqual(mapping);

                expect(
                    database.customer_user_access.upsert,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({
                        create: expect.objectContaining({
                            customer_id: customerId,
                            user_id: targetUserId,
                            status: 'active',
                            created_by: actorUserId,
                        }),
                    }),
                );
            },
        );

        it(
            'reactivates a revoked mapping without overwriting created_by',
            async () => {
                database.customer_user_access.findUnique
                    .mockResolvedValue(
                        accessMapping('revoked'),
                    );
                database.customer_user_access.upsert
                    .mockResolvedValue(
                        accessMapping(),
                    );

                await service.assignUserAccess(
                    customerId,
                    targetUserId,
                    actorUserId,
                );

                const query =
                    database.customer_user_access
                        .upsert.mock.calls[0][0];
                expect(query.update)
                    .toEqual({
                        status: 'active',
                    });
                expect(query.update)
                    .not.toHaveProperty(
                        'created_by',
                    );
            },
        );

        it(
            'returns an active mapping idempotently',
            async () => {
                const mapping =
                    accessMapping();
                database.customer_user_access.findUnique
                    .mockResolvedValue(mapping);

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).resolves.toEqual(mapping);
                expect(
                    database.customer_user_access.upsert,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            'resolves a concurrent create conflict idempotently',
            async () => {
                const mapping =
                    accessMapping();
                database.customer_user_access.findUnique
                    .mockResolvedValueOnce(null)
                    .mockResolvedValueOnce(mapping);
                database.customer_user_access.upsert
                    .mockRejectedValue({
                        code: 'P2002',
                    });

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).resolves.toEqual(mapping);
            },
        );

        it(
            'rejects a missing target user',
            async () => {
                database.users.findUnique
                    .mockResolvedValue(null);

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).rejects.toBeInstanceOf(
                    NotFoundException,
                );
            },
        );

        it(
            'rejects an inactive target user',
            async () => {
                database.users.findUnique
                    .mockResolvedValue({
                        id: targetUserId,
                        status: 'inactive',
                        user_roles: [],
                    });

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).rejects.toBeInstanceOf(
                    BadRequestException,
                );
            },
        );

        it(
            'rejects a target user without the CUSTOMER role',
            async () => {
                database.users.findUnique
                    .mockResolvedValue({
                        id: targetUserId,
                        status: 'active',
                        user_roles: [
                            {
                                roles: {
                                    role_name: 'ADMIN',
                                },
                            },
                        ],
                    });

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).rejects.toBeInstanceOf(
                    BadRequestException,
                );
            },
        );

        it(
            'rejects a missing customer',
            async () => {
                database.customers.findUnique
                    .mockResolvedValue(null);

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).rejects.toBeInstanceOf(
                    NotFoundException,
                );
            },
        );

        it(
            'rejects an inactive customer',
            async () => {
                database.customers.findUnique
                    .mockResolvedValue({
                        id: customerId,
                        status: 'inactive',
                    });

                await expect(
                    service.assignUserAccess(
                        customerId,
                        targetUserId,
                        actorUserId,
                    ),
                ).rejects.toBeInstanceOf(
                    BadRequestException,
                );
            },
        );

        it(
            'soft-revokes an active mapping',
            async () => {
                database.customer_user_access.findUnique
                    .mockResolvedValue(
                        accessMapping(),
                    );
                database.customer_user_access.update
                    .mockResolvedValue(
                        accessMapping('revoked'),
                    );

                await expect(
                    service.revokeUserAccess(
                        customerId,
                        targetUserId,
                    ),
                ).resolves.toEqual(
                    accessMapping('revoked'),
                );
                expect(
                    database.customer_user_access.update,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: {
                            status: 'revoked',
                        },
                    }),
                );
            },
        );

        it(
            'returns 404 semantics when the mapping does not exist',
            async () => {
                database.customer_user_access.findUnique
                    .mockResolvedValue(null);

                await expect(
                    service.revokeUserAccess(
                        customerId,
                        targetUserId,
                    ),
                ).rejects.toBeInstanceOf(
                    NotFoundException,
                );
            },
        );

        it(
            'requires ADMIN and customers.manage on every endpoint',
            () => {
                const handlers = [
                    CustomersController.prototype
                        .findUserAccess,
                    CustomersController.prototype
                        .assignUserAccess,
                    CustomersController.prototype
                        .revokeUserAccess,
                ];

                for (const handler of handlers) {
                    expect(
                        Reflect.getMetadata(
                            ROLES_KEY,
                            handler,
                        ),
                    ).toEqual([
                        'ADMIN',
                    ]);
                    expect(
                        Reflect.getMetadata(
                            PERMISSIONS_KEY,
                            handler,
                        ),
                    ).toEqual([
                        'customers.manage',
                    ]);
                }
            },
        );
    },
);
