import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

interface UserRecord {
    id: string;
    username: string;
    email: string;
    full_name: string | null;
    status: string | null;
    failed_login_count: number | null;
    locked_until: Date | null;
    created_at: Date;

    user_roles: Array<{
        roles: {
            id: string;
            role_name: string;
            description: string | null;

            role_permissions: Array<{
                permissions: {
                    permission_name: string;
                };
            }>;
        };
    }>;
}

@Injectable()
export class UsersService {
    private readonly userSelect = {
        id: true,
        username: true,
        email: true,
        full_name: true,
        status: true,
        failed_login_count: true,
        locked_until: true,
        created_at: true,

        user_roles: {
            include: {
                roles: {
                    include: {
                        role_permissions: {
                            include: {
                                permissions: true,
                            },
                        },
                    },
                },
            },
        },
    } as const;

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private normalizeRoleName(
        value: string,
    ) {
        return value
            .trim()
            .toUpperCase();
    }

    private formatUser(
        user: UserRecord,
    ) {
        const isLocked =
            Boolean(
                user.locked_until &&
                user.locked_until >
                new Date(),
            );

        return {
            id:
                user.id,

            username:
                user.username,

            email:
                user.email,

            full_name:
                user.full_name,

            status:
                isLocked
                    ? 'locked'
                    : user.status ??
                    'active',

            failed_login_count:
                user.failed_login_count ?? 0,

            locked_until:
                user.locked_until,

            created_at:
                user.created_at,

            roles:
                user.user_roles.map(
                    (userRole) => ({
                        id:
                            userRole.roles.id,

                        role_name:
                            userRole.roles.role_name,

                        description:
                            userRole.roles.description,

                        permissions:
                            userRole.roles.role_permissions.map(
                                (
                                    rolePermission,
                                ) =>
                                    rolePermission
                                        .permissions
                                        .permission_name,
                            ),
                    }),
                ),
        };
    }
    private async getUserOrThrow(
        id: string,
    ) {
        const user =
            await this.prisma.users.findUnique({
                where: {
                    id,
                },

                select:
                    this.userSelect,
            });

        if (!user) {
            throw new NotFoundException(
                'Không tìm thấy tài khoản',
            );
        }

        return user;
    }

    private async getRolesOrThrow(
        roleNames: string[],
    ) {
        const requestedRoleNames =
            Array.from(
                new Set(
                    roleNames
                        .map(
                            (roleName) =>
                                this.normalizeRoleName(
                                    roleName,
                                ),
                        )
                        .filter(Boolean),
                ),
            );

        if (
            requestedRoleNames.length ===
            0
        ) {
            throw new BadRequestException(
                'Phải chọn ít nhất một vai trò',
            );
        }

        const availableRoles =
            await this.prisma.roles.findMany();

        const availableRoleMap =
            new Map(
                availableRoles.map(
                    (role) => [
                        this.normalizeRoleName(
                            role.role_name,
                        ),

                        role,
                    ],
                ),
            );

        const missingRoles =
            requestedRoleNames.filter(
                (roleName) =>
                    !availableRoleMap.has(
                        roleName,
                    ),
            );

        if (
            missingRoles.length > 0
        ) {
            throw new BadRequestException(
                `Không tìm thấy vai trò: ${missingRoles.join(', ')}`,
            );
        }

        return requestedRoleNames.map(
            (roleName) =>
                availableRoleMap.get(
                    roleName,
                )!,
        );
    }

    private hasErrorCode(
        error: unknown,
        code: string,
    ) {
        return (
            typeof error ===
            'object' &&
            error !== null &&
            'code' in error &&
            (
                error as {
                    code?: unknown;
                }
            ).code === code
        );
    }

    async findAll(
        search?: string,
        status?: string,
        role?: string,
    ) {
        const normalizedSearch =
            search?.trim();

        const normalizedStatus =
            status
                ?.trim()
                .toLowerCase();

        const users =
            await this.prisma.users.findMany({
                where: {
                    status:
                        normalizedStatus ||
                        undefined,

                    OR:
                        normalizedSearch
                            ? [
                                {
                                    username: {
                                        contains:
                                            normalizedSearch,
                                    },
                                },
                                {
                                    email: {
                                        contains:
                                            normalizedSearch,
                                    },
                                },
                                {
                                    full_name: {
                                        contains:
                                            normalizedSearch,
                                    },
                                },
                            ]
                            : undefined,
                },

                orderBy: {
                    created_at:
                        'desc',
                },

                select:
                    this.userSelect,
            });

        const formattedUsers =
            users.map(
                (user) =>
                    this.formatUser(
                        user,
                    ),
            );

        if (!role?.trim()) {
            return formattedUsers;
        }

        const normalizedRole =
            this.normalizeRoleName(
                role,
            );

        return formattedUsers.filter(
            (user) =>
                user.roles.some(
                    (userRole) =>
                        this.normalizeRoleName(
                            userRole.role_name,
                        ) ===
                        normalizedRole,
                ),
        );
    }

    async findOne(
        id: string,
    ) {
        const user =
            await this.getUserOrThrow(
                id,
            );

        return this.formatUser(
            user,
        );
    }

    async findRoles() {
        const roles =
            await this.prisma.roles.findMany({
                orderBy: {
                    role_name:
                        'asc',
                },

                include: {
                    role_permissions: {
                        include: {
                            permissions:
                                true,
                        },
                    },

                    _count: {
                        select: {
                            user_roles:
                                true,
                        },
                    },
                },
            });

        return roles.map(
            (role) => ({
                id:
                    role.id,

                role_name:
                    role.role_name,

                description:
                    role.description,

                user_count:
                    role._count.user_roles,

                permissions:
                    role.role_permissions
                        .map(
                            (
                                rolePermission,
                            ) =>
                                rolePermission
                                    .permissions
                                    .permission_name,
                        )
                        .sort(),
            }),
        );
    }
    async findPermissions() {
        return this.prisma.permissions.findMany({
            orderBy: {
                permission_name:
                    'asc',
            },

            select: {
                id:
                    true,

                permission_name:
                    true,

                _count: {
                    select: {
                        role_permissions:
                            true,
                    },
                },
            },
        });
    }

    async createRole(
        dto: CreateRoleDto,
        actorUserId: string,
    ) {
        const roleName =
            dto.role_name
                .trim()
                .toLowerCase();

        const roles =
            await this.prisma.roles.findMany({
                select: {
                    id:
                        true,

                    role_name:
                        true,
                },
            });

        const existingRole =
            roles.find(
                (role) =>
                    this.normalizeRoleName(
                        role.role_name,
                    ) ===
                    this.normalizeRoleName(
                        roleName,
                    ),
            );

        if (existingRole) {
            throw new ConflictException(
                'Role đã tồn tại',
            );
        }

        try {
            const role =
                await this.prisma.$transaction(
                    async (
                        transaction,
                    ) => {
                        const createdRole =
                            await transaction.roles.create({
                                data: {
                                    role_name:
                                        roleName,

                                    description:
                                        dto.description
                                            ?.trim() ||
                                        null,
                                },
                            });

                        await transaction.audit_logs.create({
                            data: {
                                user_id:
                                    actorUserId,

                                action:
                                    'ROLE_CREATED',

                                entity_type:
                                    'role',

                                entity_id:
                                    createdRole.id,
                            },
                        });

                        return createdRole;
                    },
                );

            return {
                ...role,

                user_count:
                    0,

                permissions:
                    [],
            };
        } catch (error) {
            if (
                this.hasErrorCode(
                    error,
                    'P2002',
                )
            ) {
                throw new ConflictException(
                    'Role đã tồn tại',
                );
            }

            throw error;
        }
    }

    async createPermission(
        dto: CreatePermissionDto,
        actorUserId: string,
    ) {
        const permissionName =
            dto.permission_name
                .trim()
                .toLowerCase();

        const existingPermission =
            await this.prisma.permissions.findFirst({
                where: {
                    permission_name:
                        permissionName,
                },
            });

        if (existingPermission) {
            return existingPermission;
        }

        try {
            return await this.prisma.$transaction(
                async (
                    transaction,
                ) => {
                    const permission =
                        await transaction.permissions.create({
                            data: {
                                permission_name:
                                    permissionName,
                            },
                        });

                    await transaction.audit_logs.create({
                        data: {
                            user_id:
                                actorUserId,

                            action:
                                'PERMISSION_CREATED',

                            entity_type:
                                'permission',

                            entity_id:
                                permission.id,
                        },
                    });

                    return permission;
                },
            );
        } catch (error) {
            if (
                this.hasErrorCode(
                    error,
                    'P2002',
                )
            ) {
                throw new ConflictException(
                    'Permission đã tồn tại',
                );
            }

            throw error;
        }
    }

    async replaceRolePermissions(
        roleId: string,
        dto: UpdateRolePermissionsDto,
        actorUserId: string,
    ) {
        const role =
            await this.prisma.roles.findUnique({
                where: {
                    id:
                        roleId,
                },
            });

        if (!role) {
            throw new NotFoundException(
                'Không tìm thấy role',
            );
        }

        const requestedNames =
            Array.from(
                new Set(
                    dto.permission_names
                        .map(
                            (
                                permissionName,
                            ) =>
                                permissionName
                                    .trim()
                                    .toLowerCase(),
                        )
                        .filter(Boolean),
                ),
            );

        const permissions =
            requestedNames.length > 0
                ? await this.prisma.permissions.findMany({
                    where: {
                        permission_name: {
                            in:
                                requestedNames,
                        },
                    },
                })
                : [];

        const permissionMap =
            new Map(
                permissions.map(
                    (permission) => [
                        permission
                            .permission_name
                            .trim()
                            .toLowerCase(),

                        permission,
                    ],
                ),
            );

        const missingPermissions =
            requestedNames.filter(
                (permissionName) =>
                    !permissionMap.has(
                        permissionName,
                    ),
            );

        if (
            missingPermissions.length > 0
        ) {
            throw new BadRequestException(
                `Không tìm thấy permission: ${missingPermissions.join(', ')}`,
            );
        }

        await this.prisma.$transaction(
            async (
                transaction,
            ) => {
                await transaction.role_permissions.deleteMany({
                    where: {
                        role_id:
                            roleId,
                    },
                });

                if (
                    permissions.length > 0
                ) {
                    await transaction.role_permissions.createMany({
                        data:
                            permissions.map(
                                (
                                    permission,
                                ) => ({
                                    role_id:
                                        roleId,

                                    permission_id:
                                        permission.id,
                                }),
                            ),
                    });
                }

                await transaction.audit_logs.create({
                    data: {
                        user_id:
                            actorUserId,

                        action:
                            'ROLE_PERMISSIONS_UPDATED',

                        entity_type:
                            'role',

                        entity_id:
                            roleId,
                    },
                });
            },
        );

        const updatedRole =
            await this.prisma.roles.findUnique({
                where: {
                    id:
                        roleId,
                },

                include: {
                    role_permissions: {
                        include: {
                            permissions:
                                true,
                        },
                    },

                    _count: {
                        select: {
                            user_roles:
                                true,
                        },
                    },
                },
            });

        return {
            id:
                updatedRole!.id,

            role_name:
                updatedRole!.role_name,

            description:
                updatedRole!.description,

            user_count:
                updatedRole!._count
                    .user_roles,

            permissions:
                updatedRole!
                    .role_permissions
                    .map(
                        (
                            rolePermission,
                        ) =>
                            rolePermission
                                .permissions
                                .permission_name,
                    )
                    .sort(),
        };
    }
    async create(
        dto: CreateUserDto,
        actorUserId: string,
    ) {
        const username =
            dto.username.trim();

        const email =
            dto.email
                .trim()
                .toLowerCase();

        const existingUser =
            await this.prisma.users.findFirst({
                where: {
                    OR: [
                        {
                            username,
                        },
                        {
                            email,
                        },
                    ],
                },
            });

        if (existingUser) {
            throw new ConflictException(
                'Username hoặc email đã tồn tại',
            );
        }

        const roles =
            await this.getRolesOrThrow(
                dto.role_names,
            );

        const passwordHash =
            await bcrypt.hash(
                dto.password,
                10,
            );

        try {
            const userId =
                await this.prisma.$transaction(
                    async (
                        transaction,
                    ) => {
                        const user =
                            await transaction.users.create({
                                data: {
                                    username,
                                    email,

                                    password_hash:
                                        passwordHash,

                                    full_name:
                                        dto.full_name
                                            ?.trim() ||
                                        null,

                                    status:
                                        'active',
                                },
                            });

                        await transaction.user_roles.createMany({
                            data:
                                roles.map(
                                    (role) => ({
                                        user_id:
                                            user.id,

                                        role_id:
                                            role.id,
                                    }),
                                ),
                        });

                        await transaction.audit_logs.create({
                            data: {
                                user_id:
                                    actorUserId,

                                action:
                                    'USER_CREATED',

                                entity_type:
                                    'user',

                                entity_id:
                                    user.id,
                            },
                        });

                        return user.id;
                    },
                );

            return this.findOne(
                userId,
            );
        } catch (error) {
            if (
                this.hasErrorCode(
                    error,
                    'P2002',
                )
            ) {
                throw new ConflictException(
                    'Username hoặc email đã tồn tại',
                );
            }

            throw error;
        }
    }

    async update(
        id: string,
        dto: UpdateUserDto,
        actorUserId: string,
    ) {
        await this.getUserOrThrow(
            id,
        );

        const data: {
            email?: string;
            full_name?: string | null;
            status?: string;
            locked_until?: Date | null;
            failed_login_count?: number;
        } = {};

        if (
            dto.email !==
            undefined
        ) {
            const email =
                dto.email
                    .trim()
                    .toLowerCase();

            const existingEmail =
                await this.prisma.users.findFirst({
                    where: {
                        email,

                        id: {
                            not:
                                id,
                        },
                    },
                });

            if (existingEmail) {
                throw new ConflictException(
                    'Email đã được sử dụng',
                );
            }

            data.email =
                email;
        }

        if (
            dto.full_name !==
            undefined
        ) {
            data.full_name =
                dto.full_name.trim() ||
                null;
        }

        if (
            dto.status !==
            undefined
        ) {
            const requestedStatus =
                dto.status
                    .trim()
                    .toLowerCase();

            if (
                ![
                    'active',
                    'inactive',
                    'locked',
                ].includes(
                    requestedStatus,
                )
            ) {
                throw new BadRequestException(
                    'Trạng thái tài khoản không hợp lệ',
                );
            }

            if (
                actorUserId === id &&
                requestedStatus !==
                'active'
            ) {
                throw new BadRequestException(
                    'Không thể tự khóa hoặc ngừng tài khoản đang đăng nhập',
                );
            }

            if (
                requestedStatus ===
                'locked'
            ) {
                /*
                 * locked là trạng thái nghiệp vụ.
                 * Database vẫn lưu active và dùng
                 * locked_until để khóa truy cập.
                 */
                data.status =
                    'active';

                data.locked_until =
                    new Date(
                        '2099-12-31T23:59:59.000Z',
                    );
            } else {
                data.status =
                    requestedStatus;

                data.locked_until =
                    null;

                data.failed_login_count =
                    0;
            }
        }
        try {
            await this.prisma.$transaction(
                async (
                    transaction,
                ) => {
                    await transaction.users.update({
                        where: {
                            id,
                        },

                        data,
                    });

                    await transaction.audit_logs.create({
                        data: {
                            user_id:
                                actorUserId,

                            action:
                                'USER_UPDATED',

                            entity_type:
                                'user',

                            entity_id:
                                id,
                        },
                    });
                },
            );
        } catch (error) {
            if (
                this.hasErrorCode(
                    error,
                    'P2002',
                )
            ) {
                throw new ConflictException(
                    'Email đã được sử dụng',
                );
            }

            throw error;
        }

        return this.findOne(
            id,
        );
    }

    async replaceRoles(
        id: string,
        dto: UpdateUserRolesDto,
        actorUserId: string,
    ) {
        await this.getUserOrThrow(
            id,
        );

        const roles =
            await this.getRolesOrThrow(
                dto.role_names,
            );

        if (
            actorUserId === id &&
            !roles.some(
                (role) =>
                    this.normalizeRoleName(
                        role.role_name,
                    ) === 'ADMIN',
            )
        ) {
            throw new BadRequestException(
                'Không thể tự thu hồi quyền ADMIN của tài khoản đang đăng nhập',
            );
        }

        await this.prisma.$transaction(
            async (
                transaction,
            ) => {
                await transaction.user_roles.deleteMany({
                    where: {
                        user_id:
                            id,
                    },
                });

                await transaction.user_roles.createMany({
                    data:
                        roles.map(
                            (role) => ({
                                user_id:
                                    id,

                                role_id:
                                    role.id,
                            }),
                        ),
                });

                await transaction.audit_logs.create({
                    data: {
                        user_id:
                            actorUserId,

                        action:
                            'USER_ROLES_UPDATED',

                        entity_type:
                            'user',

                        entity_id:
                            id,
                    },
                });
            },
        );

        return this.findOne(
            id,
        );
    }

    async resetPassword(
        id: string,
        dto: ResetUserPasswordDto,
        actorUserId: string,
    ) {
        await this.getUserOrThrow(
            id,
        );

        const passwordHash =
            await bcrypt.hash(
                dto.new_password,
                10,
            );

        await this.prisma.$transaction(
            async (
                transaction,
            ) => {
                await transaction.users.update({
                    where: {
                        id,
                    },

                    data: {
                        password_hash:
                            passwordHash,

                        failed_login_count:
                            0,

                        locked_until:
                            null,
                    },
                });

                await transaction.user_sessions.updateMany({
                    where: {
                        user_id:
                            id,

                        revoked:
                            false,
                    },

                    data: {
                        revoked:
                            true,
                    },
                });

                await transaction.audit_logs.create({
                    data: {
                        user_id:
                            actorUserId,

                        action:
                            'USER_PASSWORD_RESET',

                        entity_type:
                            'user',

                        entity_id:
                            id,
                    },
                });
            },
        );

        return {
            message:
                'Đã đặt lại mật khẩu tài khoản',

            user_id:
                id,
        };
    }
}