import {
    Injectable,
} from '@nestjs/common';

import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    ResourceAccessService,
} from '../security/resource-access.service';

interface WorkRecipientContext {
    assigned_user_id?: string | null;
    assigned_role?: string | null;
    project_id?: string | null;
    entity_type: string;
    entity_id: string;
}

@Injectable()
export class NotificationRecipientService {
    constructor(
        private readonly prisma:
            PrismaService,
        private readonly resourceAccess:
            ResourceAccessService,
    ) { }

    private async canAccess(
        user: {
            id: string;
            roles: string[];
        },
        resource: Pick<
            WorkRecipientContext,
            | 'project_id'
            | 'entity_type'
            | 'entity_id'
        >,
    ) {
        if (resource.project_id) {
            const allowed =
                await this.resourceAccess
                    .filterProjectIds(
                        [resource.project_id],
                        {
                            userId:
                                user.id,
                            roles:
                                user.roles,
                        },
                    );

            return allowed.length === 1;
        }

        const allowed =
            await this.resourceAccess
                .filterEntities(
                    [{
                        entity_type:
                            resource.entity_type,
                        entity_id:
                            resource.entity_id,
                    }],
                    {
                        userId:
                            user.id,
                        roles:
                            user.roles,
                    },
                );

        return allowed.length === 1;
    }

    private async activeUsers(
        input: {
            userIds?: string[];
            roles?: string[];
        },
    ) {
        const normalizedRoles =
            input.roles?.map((role) =>
                role
                    .trim()
                    .toUpperCase(),
            ) ?? [];

        const users =
            await this.prisma.users.findMany({
                where: {
                    status: 'active',
                    ...(input.userIds
                        ? {
                            id: {
                                in:
                                    input.userIds,
                            },
                        }
                        : {}),
                    ...(normalizedRoles.length > 0
                        ? {
                            user_roles: {
                                some: {
                                    roles: {
                                        role_name: {
                                            in:
                                                normalizedRoles,
                                        },
                                    },
                                },
                            },
                        }
                        : {}),
                },
                select: {
                    id: true,
                    user_roles: {
                        select: {
                            roles: {
                                select: {
                                    role_name:
                                        true,
                                },
                            },
                        },
                    },
                },
            });

        return users.map((user) => ({
            id:
                user.id,
            roles:
                user.user_roles.map(
                    (entry) =>
                        entry.roles.role_name
                            .trim()
                            .toUpperCase(),
                ),
        }));
    }

    async resolveForWorkItem(
        item: WorkRecipientContext,
        escalationRoles: readonly string[] = [],
    ) {
        const roles =
            Array.from(
                new Set([
                    ...(item.assigned_role
                        ? [item.assigned_role]
                        : []),
                    ...escalationRoles,
                ].map((role) =>
                    role
                        .trim()
                        .toUpperCase(),
                )),
            );
        const [
            assignedUsers,
            queueUsers,
        ] = await Promise.all([
            item.assigned_user_id
                ? this.activeUsers({
                    userIds: [
                        item.assigned_user_id,
                    ],
                })
                : [],
            roles.length > 0
                ? this.activeUsers({
                    roles,
                })
                : [],
        ]);
        const candidates =
            Array.from(
                new Map([
                    ...assignedUsers,
                    ...queueUsers,
                ].map((user) => [
                    user.id,
                    user,
                ])).values(),
            );
        const access =
            await Promise.all(
                candidates.map(async (user) => ({
                    user,
                    allowed:
                        await this.canAccess(
                            user,
                            item,
                        ),
                })),
            );

        return access
            .filter((entry) =>
                entry.allowed,
            )
            .map((entry) =>
                entry.user.id,
            );
    }

    async resolveRolesForProject(
        projectId: string,
        roles: readonly string[],
    ) {
        const users =
            await this.activeUsers({
                roles:
                    [...roles],
            });
        const access =
            await Promise.all(
                users.map(async (user) => ({
                    user,
                    allowed:
                        (
                            await this.resourceAccess
                                .filterProjectIds(
                                    [projectId],
                                    {
                                        userId:
                                            user.id,
                                        roles:
                                            user.roles,
                                    },
                                )
                        ).length === 1,
                })),
            );

        return Array.from(
            new Set(
                access
                    .filter((entry) =>
                        entry.allowed,
                    )
                    .map((entry) =>
                        entry.user.id,
                    ),
            ),
        );
    }
}
