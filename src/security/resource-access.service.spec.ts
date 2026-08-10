import {
    ForbiddenException,
} from '@nestjs/common';

import type {
    Prisma,
} from '@prisma/client';

import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    ResourceAccessService,
} from './resource-access.service';

type DatabaseMock = {
    customer_user_access: {
        findMany: jest.Mock;
        findFirst: jest.Mock;
    };
    audit_plans: {
        findUnique: jest.Mock;
    };
    audit_findings: {
        findUnique: jest.Mock;
    };
    corrective_actions: {
        findUnique: jest.Mock;
    };
};

const customerActor = {
    userId:
        'user-a',
    roles: [
        'CUSTOMER',
    ],
};

function createDatabaseMock(): DatabaseMock {
    return {
        customer_user_access: {
            findMany:
                jest.fn(),
            findFirst:
                jest.fn(),
        },
        audit_plans: {
            findUnique:
                jest.fn(),
        },
        audit_findings: {
            findUnique:
                jest.fn(),
        },
        corrective_actions: {
            findUnique:
                jest.fn(),
        },
    };
}

function createService(
    database: DatabaseMock,
) {
    return new ResourceAccessService(
        database as unknown as
            PrismaService,
    );
}

describe(
    'ResourceAccessService customer ownership',
    () => {
        let database:
            DatabaseMock;
        let service:
            ResourceAccessService;

        beforeEach(() => {
            database =
                createDatabaseMock();
            service =
                createService(
                    database,
                );
        });

        it(
            'denies a customer without an active mapping',
            async () => {
                database
                    .customer_user_access
                    .findFirst
                    .mockResolvedValue(
                        null,
                    );

                await expect(
                    service.assertCustomerAccess(
                        'customer-a',
                        customerActor,
                    ),
                ).rejects.toBeInstanceOf(
                    ForbiddenException,
                );
            },
        );

        it(
            'requires active mapping and active customer status',
            async () => {
                database
                    .customer_user_access
                    .findFirst
                    .mockResolvedValue(
                        null,
                    );

                await expect(
                    service.assertCustomerAccess(
                        'customer-a',
                        customerActor,
                    ),
                ).rejects.toBeInstanceOf(
                    ForbiddenException,
                );

                expect(
                    database
                        .customer_user_access
                        .findFirst,
                ).toHaveBeenCalledWith({
                    where: {
                        user_id:
                            'user-a',
                        customer_id:
                            'customer-a',
                        status:
                            'active',
                        customer: {
                            is: {
                                status:
                                    'active',
                            },
                        },
                    },
                    select: {
                        id:
                            true,
                    },
                });
            },
        );

        it(
            'allows an active customer mapping',
            async () => {
                database
                    .customer_user_access
                    .findFirst
                    .mockResolvedValue({
                        id:
                            'mapping-a',
                    });

                await expect(
                    service.assertCustomerAccess(
                        'customer-a',
                        customerActor,
                    ),
                ).resolves.toBe(
                    'customer-a',
                );
            },
        );

        it(
            'returns only active mapped customer ids',
            async () => {
                database
                    .customer_user_access
                    .findMany
                    .mockResolvedValue([
                        {
                            customer_id:
                                'customer-a',
                        },
                        {
                            customer_id:
                                'customer-b',
                        },
                    ]);

                await expect(
                    service.getAccessibleCustomerIds(
                        customerActor,
                    ),
                ).resolves.toEqual(
                    new Set([
                        'customer-a',
                        'customer-b',
                    ]),
                );
            },
        );

        it(
            'resolves an audit plan through project and application',
            async () => {
                database
                    .audit_plans
                    .findUnique
                    .mockResolvedValue({
                        certification_projects: {
                            certification_applications: {
                                customer_id:
                                    'customer-a',
                            },
                        },
                    });

                await expect(
                    service.resolveCustomerIdForEntity({
                        entity_type:
                            'audit_plan',
                        entity_id:
                            'plan-a',
                    }),
                ).resolves.toBe(
                    'customer-a',
                );
            },
        );

        it(
            'resolves an audit finding through its report chain',
            async () => {
                database
                    .audit_findings
                    .findUnique
                    .mockResolvedValue({
                        reports: {
                            audit_plans: {
                                certification_projects: {
                                    certification_applications: {
                                        customer_id:
                                            'customer-a',
                                    },
                                },
                            },
                        },
                    });

                await expect(
                    service.resolveCustomerIdForEntity({
                        entity_type:
                            'audit_finding',
                        entity_id:
                            'finding-a',
                    }),
                ).resolves.toBe(
                    'customer-a',
                );
            },
        );

        it(
            'resolves a corrective action through its finding chain',
            async () => {
                database
                    .corrective_actions
                    .findUnique
                    .mockResolvedValue({
                        audit_findings: {
                            reports: {
                                audit_plans: {
                                    certification_projects: {
                                        certification_applications: {
                                            customer_id:
                                                'customer-a',
                                        },
                                    },
                                },
                            },
                        },
                    });

                await expect(
                    service.resolveCustomerIdForEntity({
                        entity_type:
                            'corrective_action',
                        entity_id:
                            'action-a',
                    }),
                ).resolves.toBe(
                    'customer-a',
                );
            },
        );

        it(
            'denies an entity owned by another customer',
            async () => {
                database
                    .audit_findings
                    .findUnique
                    .mockResolvedValue({
                        reports: {
                            audit_plans: {
                                certification_projects: {
                                    certification_applications: {
                                        customer_id:
                                            'customer-b',
                                    },
                                },
                            },
                        },
                    });
                database
                    .customer_user_access
                    .findFirst
                    .mockResolvedValue(
                        null,
                    );

                await expect(
                    service.assertCustomerEntityAccess(
                        {
                            entity_type:
                                'audit_finding',
                            entity_id:
                                'finding-b',
                        },
                        customerActor,
                    ),
                ).rejects.toBeInstanceOf(
                    ForbiddenException,
                );
            },
        );

        it(
            'uses a supplied transaction client without duplicating queries',
            async () => {
                const transaction =
                    createDatabaseMock();

                transaction
                    .customer_user_access
                    .findFirst
                    .mockResolvedValue({
                        id:
                            'mapping-a',
                    });

                await expect(
                    service.assertCustomerAccess(
                        'customer-a',
                        customerActor,
                        transaction as unknown as
                            Prisma.TransactionClient,
                    ),
                ).resolves.toBe(
                    'customer-a',
                );

                expect(
                    transaction
                        .customer_user_access
                        .findFirst,
                ).toHaveBeenCalledTimes(
                    1,
                );
                expect(
                    database
                        .customer_user_access
                        .findFirst,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            'keeps internal authorization separate from customer ownership',
            async () => {
                await expect(
                    service.getAccessibleProjectIds({
                        userId:
                            'admin-a',
                        roles: [
                            'ADMIN',
                        ],
                    }),
                ).resolves.toBeNull();

                await expect(
                    service.assertCustomerAccess(
                        'customer-a',
                        {
                            userId:
                                'admin-a',
                            roles: [
                                'ADMIN',
                            ],
                        },
                    ),
                ).rejects.toBeInstanceOf(
                    ForbiddenException,
                );
            },
        );

        it(
            'denies unsupported or unresolvable resources',
            async () => {
                await expect(
                    service.assertCustomerEntityAccess(
                        {
                            entity_type:
                                'report',
                            entity_id:
                                'report-a',
                        },
                        customerActor,
                    ),
                ).rejects.toBeInstanceOf(
                    ForbiddenException,
                );
            },
        );
    },
);
