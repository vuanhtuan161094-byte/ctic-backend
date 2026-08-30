import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateUserPermissionOverridesDto } from './dto/update-user-permission-overrides.dto';

import { resolveEffectivePermissionProfile } from '../auth/effective-permissions';

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
    private readonly supportedInternalRoles = new Set([
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    ]);
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

    private normalizePermissionName(
        value: string,
    ) {
        return value
            .trim()
            .toLowerCase();
    }

    private getRolePermissionNames(
        user: UserRecord,
    ) {
        return Array.from(
            new Set(
                user.user_roles.flatMap(
                    (userRole) =>
                        userRole
                            .roles
                            .role_permissions
                            .map(
                                (rolePermission) =>
                                    this.normalizePermissionName(
                                        rolePermission
                                            .permissions
                                            .permission_name,
                                    ),
                            ),
                ),
            ),
        ).sort();
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

        const unsupportedRoles = requestedRoleNames.filter(
            (roleName) => !this.supportedInternalRoles.has(roleName),
        );

        if (unsupportedRoles.length > 0) {
            throw new BadRequestException(
                unsupportedRoles.includes('CUSTOMER')
                    ? 'Vai trò CUSTOMER chỉ được cấp qua quy trình customer access Phase 3.2B'
                    : `Vai trò không thuộc authority được hỗ trợ trong code: ${unsupportedRoles.join(', ')}`,
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

    async getPermissionProfile(
        id: string,
    ) {
        const user =
            await this.prisma.users.findUnique({
                where: {
                    id,
                },

                select: {
                    id:
                        true,

                    user_roles: {
                        include: {
                            roles: {
                                include: {
                                    role_permissions: {
                                        include: {
                                            permissions:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },

                    permission_overrides: {
                        include: {
                            permission:
                                true,

                            changed_by_user: {
                                select: {
                                    id:
                                        true,

                                    username:
                                        true,

                                    full_name:
                                        true,
                                },
                            },
                        },

                        orderBy: [
                            {
                                effect:
                                    'asc',
                            },
                            {
                                updated_at:
                                    'desc',
                            },
                        ],
                    },
                },
            });

        if (!user) {
            throw new NotFoundException(
                'Không tìm thấy tài khoản',
            );
        }

        const roleNames =
            user.user_roles.map(
                (userRole) =>
                    this.normalizeRoleName(
                        userRole
                            .roles
                            .role_name,
                    ),
            );

        const basePermissions =
            user.user_roles.flatMap(
                (userRole) =>
                    userRole
                        .roles
                        .role_permissions
                        .map(
                            (rolePermission) =>
                                rolePermission
                                    .permissions
                                    .permission_name,
                        ),
            );

        const permissionProfile =
            resolveEffectivePermissionProfile(
                basePermissions,
                user.permission_overrides.map(
                    (override) => ({
                        permission_name:
                            override
                                .permission
                                .permission_name,

                        effect:
                            override.effect,
                    }),
                ),
            );

        const hasAdminRole =
            roleNames.includes(
                'ADMIN',
            );

        const hasUnsupportedRole =
            roleNames.some(
                (roleName) =>
                    !this.supportedInternalRoles.has(
                        roleName,
                    ),
            );

        return {
            user_id:
                user.id,

            role_names:
                roleNames,

            base_permissions:
                permissionProfile
                    .base_permissions,

            allow_overrides:
                user.permission_overrides
                    .filter(
                        (override) =>
                            override.effect ===
                            'ALLOW',
                    )
                    .map(
                        (override) => ({
                            permission_name:
                                override
                                    .permission
                                    .permission_name,

                            reason:
                                override.reason,

                            changed_at:
                                override.updated_at,

                            changed_by:
                                override.changed_by_user,
                        }),
                    ),

            deny_overrides:
                user.permission_overrides
                    .filter(
                        (override) =>
                            override.effect ===
                            'DENY',
                    )
                    .map(
                        (override) => ({
                            permission_name:
                                override
                                    .permission
                                    .permission_name,

                            reason:
                                override.reason,

                            changed_at:
                                override.updated_at,

                            changed_by:
                                override.changed_by_user,
                        }),
                    ),

            effective_permissions:
                permissionProfile
                    .effective_permissions,

            can_override:
                roleNames.length > 0 &&
                !hasAdminRole &&
                !hasUnsupportedRole,

            restriction_reason:
                hasAdminRole
                    ? 'Vai trò Quản trị viên sử dụng authority toàn phần và không áp dụng quyền ngoại lệ theo tài khoản.'
                    : hasUnsupportedRole
                        ? 'Tài khoản có vai trò legacy/khách hàng; quyền được quản trị theo quy trình chuyên biệt và không chỉnh tại đây.'
                        : roleNames.length === 0
                            ? 'Tài khoản chưa có vai trò nội bộ hợp lệ.'
                            : null,

            role_scope_note:
                'Quyền riêng chỉ tinh chỉnh quyền trong phạm vi vai trò và các ràng buộc phân tách nhiệm vụ hiện có; không thay thế vai trò nghiệp vụ.',
        };
    }

    async replacePermissionOverrides(
        id: string,
        dto: UpdateUserPermissionOverridesDto,
        actorUserId: string,
    ) {
        const currentUser =
            await this.getUserOrThrow(
                id,
            );

        const roleNames =
            currentUser.user_roles.map(
                (userRole) =>
                    this.normalizeRoleName(
                        userRole
                            .roles
                            .role_name,
                    ),
            );

        if (
            roleNames.includes(
                'ADMIN',
            )
        ) {
            throw new BadRequestException(
                'Không áp dụng quyền riêng cho vai trò Quản trị viên',
            );
        }

        const unsupportedRoles =
            roleNames.filter(
                (roleName) =>
                    !this.supportedInternalRoles.has(
                        roleName,
                    ),
            );

        if (
            roleNames.length === 0 ||
            unsupportedRoles.length > 0
        ) {
            throw new BadRequestException(
                'Chỉ có thể điều chỉnh quyền riêng cho tài khoản nội bộ thuộc authority hiện hành',
            );
        }

        const allowPermissions =
            Array.from(
                new Set(
                    dto.allow_permissions
                        .map(
                            (permission) =>
                                this.normalizePermissionName(
                                    permission,
                                ),
                        )
                        .filter(Boolean),
                ),
            ).sort();

        const denyPermissions =
            Array.from(
                new Set(
                    dto.deny_permissions
                        .map(
                            (permission) =>
                                this.normalizePermissionName(
                                    permission,
                                ),
                        )
                        .filter(Boolean),
                ),
            ).sort();

        const overlap =
            allowPermissions.filter(
                (permission) =>
                    denyPermissions.includes(
                        permission,
                    ),
            );

        if (overlap.length > 0) {
            throw new BadRequestException(
                `Một quyền không thể đồng thời được cấp thêm và thu hồi: ${overlap.join(', ')}`,
            );
        }

        const basePermissions =
            this.getRolePermissionNames(
                currentUser,
            );

        const redundantAllows =
            allowPermissions.filter(
                (permission) =>
                    basePermissions.includes(
                        permission,
                    ),
            );

        if (redundantAllows.length > 0) {
            throw new BadRequestException(
                `Quyền đã có sẵn từ vai trò, không cần cấp riêng: ${redundantAllows.join(', ')}`,
            );
        }

        const invalidDenies =
            denyPermissions.filter(
                (permission) =>
                    !basePermissions.includes(
                        permission,
                    ),
            );

        if (invalidDenies.length > 0) {
            throw new BadRequestException(
                `Chỉ có thể thu hồi quyền đang được cấp từ vai trò: ${invalidDenies.join(', ')}`,
            );
        }

        const requestedPermissions =
            Array.from(
                new Set([
                    ...allowPermissions,
                    ...denyPermissions,
                ]),
            );

        const permissionRecords =
            requestedPermissions.length > 0
                ? await this.prisma.permissions.findMany({
                    where: {
                        permission_name: {
                            in:
                                requestedPermissions,
                        },
                    },
                })
                : [];

        const permissionMap =
            new Map(
                permissionRecords.map(
                    (permission) => [
                        this.normalizePermissionName(
                            permission.permission_name,
                        ),
                        permission,
                    ],
                ),
            );

        const missingPermissions =
            requestedPermissions.filter(
                (permission) =>
                    !permissionMap.has(
                        permission,
                    ),
            );

        if (missingPermissions.length > 0) {
            throw new BadRequestException(
                `Không tìm thấy quyền: ${missingPermissions.join(', ')}`,
            );
        }

        const reason =
            dto.reason
                .trim();

        if (reason.length < 3) {
            throw new BadRequestException(
                'Lý do điều chỉnh quyền tối thiểu 3 ký tự',
            );
        }

        const beforeOverrides =
            await this.prisma.user_permission_overrides.findMany({
                where: {
                    user_id:
                        id,
                },

                include: {
                    permission:
                        true,
                },
            });

        const beforeProfile =
            resolveEffectivePermissionProfile(
                basePermissions,
                beforeOverrides.map(
                    (override) => ({
                        permission_name:
                            override
                                .permission
                                .permission_name,

                        effect:
                            override.effect,
                    }),
                ),
            );

        const afterOverrides = [
            ...allowPermissions.map(
                (permission) => ({
                    permission_name:
                        permission,

                    effect:
                        'ALLOW',
                }),
            ),
            ...denyPermissions.map(
                (permission) => ({
                    permission_name:
                        permission,

                    effect:
                        'DENY',
                }),
            ),
        ];

        const afterProfile =
            resolveEffectivePermissionProfile(
                basePermissions,
                afterOverrides,
            );

        await this.prisma.$transaction(
            async (transaction) => {
                await transaction.user_permission_overrides.deleteMany({
                    where: {
                        user_id:
                            id,
                    },
                });

                if (afterOverrides.length > 0) {
                    await transaction.user_permission_overrides.createMany({
                        data:
                            afterOverrides.map(
                                (override) => ({
                                    user_id:
                                        id,

                                    permission_id:
                                        permissionMap.get(
                                            override.permission_name,
                                        )!.id,

                                    effect:
                                        override.effect,

                                    reason,

                                    changed_by:
                                        actorUserId,
                                }),
                            ),
                    });
                }

                await transaction.audit_logs.create({
                    data: {
                        user_id:
                            actorUserId,

                        action:
                            'USER_PERMISSION_OVERRIDES_UPDATED',

                        entity_type:
                            'user',

                        entity_id:
                            id,

                        details_json: JSON.stringify({
                            reason,
                            before: {
                                allow_permissions:
                                    beforeProfile.allow_overrides,
                                deny_permissions:
                                    beforeProfile.deny_overrides,
                                effective_permissions:
                                    beforeProfile.effective_permissions,
                            },
                            after: {
                                allow_permissions:
                                    afterProfile.allow_overrides,
                                deny_permissions:
                                    afterProfile.deny_overrides,
                                effective_permissions:
                                    afterProfile.effective_permissions,
                            },
                        }),
                    },
                });
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            },
        );

        return this.getPermissionProfile(
            id,
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

                assignable:
                    this.supportedInternalRoles.has(
                        this.normalizeRoleName(
                            role.role_name,
                        ),
                    ),
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
        throw new ForbiddenException(
            'Danh mục vai trò là system invariant được quản trị trong code; không thể tạo role tại runtime',
        );
        /* istanbul ignore next -- legacy implementation retained for schema compatibility */
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
        throw new ForbiddenException(
            'Danh mục permission là system invariant được quản trị trong code; không thể tạo permission tại runtime',
        );
        /* istanbul ignore next -- legacy implementation retained for schema compatibility */
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
        throw new ForbiddenException(
            'Permission projection của role là system invariant được quản trị trong code',
        );
        /* istanbul ignore next -- legacy implementation retained for schema compatibility */
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

                                details_json: JSON.stringify({
                                    before: null,
                                    after: {
                                        status: 'active',
                                        roles: roles.map((role) => this.normalizeRoleName(role.role_name)),
                                    },
                                }),
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
        const currentUser = await this.getUserOrThrow(
            id,
        );

        const data: {
            username?: string;
            email?: string;
            full_name?: string | null;
            status?: string;
            locked_until?: Date | null;
            failed_login_count?: number;
        } = {};

        if (
            dto.username !==
            undefined
        ) {
            const username =
                dto.username.trim();

            const existingUsername =
                await this.prisma.users.findFirst({
                    where: {
                        username,

                        id: {
                            not:
                                id,
                        },
                    },
                });

            if (existingUsername) {
                throw new ConflictException(
                    'Username đã được sử dụng',
                );
            }

            data.username =
                username;
        }

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
                    'Username hoặc email đã được sử dụng',
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
                    const isCurrentAdmin = currentUser.user_roles.some(
                        ({ roles }) => this.normalizeRoleName(roles.role_name) === 'ADMIN',
                    );
                    const disablesAccount = dto.status !== undefined && dto.status !== 'active';

                    if (isCurrentAdmin && disablesAccount) {
                        const activeAdmins = await transaction.users.findMany({
                            where: {
                                status: 'active',
                                user_roles: { some: { roles: { role_name: 'admin' } } },
                            },
                            select: { id: true, locked_until: true },
                        });
                        const otherActiveAdmins = activeAdmins.filter(
                            (admin) => admin.id !== id && (!admin.locked_until || admin.locked_until <= new Date()),
                        );
                        if (otherActiveAdmins.length === 0) {
                            throw new BadRequestException('Không thể vô hiệu hóa hoặc khóa ADMIN hoạt động cuối cùng');
                        }
                    }

                    await transaction.users.update({
                        where: {
                            id,
                        },

                        data,
                    });

                    if (disablesAccount) {
                        await transaction.user_sessions.updateMany({
                            where: { user_id: id, revoked: false },
                            data: { revoked: true },
                        });
                    }

                    const expertData: {
                        full_name?: string;
                        email?: string;
                    } = {};

                    if (
                        dto.full_name !==
                        undefined &&
                        dto.full_name.trim()
                    ) {
                        expertData.full_name =
                            dto.full_name.trim();
                    }

                    if (
                        data.email !==
                        undefined
                    ) {
                        expertData.email =
                            data.email;
                    }

                    if (
                        Object.keys(
                            expertData,
                        ).length > 0
                    ) {
                        await transaction.experts.updateMany({
                            where: {
                                user_id:
                                    id,
                            },

                            data: {
                                ...expertData,
                                updated_at:
                                    new Date(),
                            },
                        });
                    }

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

                                details_json: JSON.stringify({
                                    before: {
                                        username: currentUser.username,
                                        email: currentUser.email,
                                        full_name: currentUser.full_name,
                                        status: this.formatUser(currentUser).status,
                                    },
                                    after: {
                                        username: data.username ?? currentUser.username,
                                        email: data.email ?? currentUser.email,
                                        full_name: data.full_name === undefined ? currentUser.full_name : data.full_name,
                                        status: dto.status ?? this.formatUser(currentUser).status,
                                    },
                                }),
                        },
                    });
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            );
        } catch (error) {
            if (
                this.hasErrorCode(
                    error,
                    'P2002',
                )
            ) {
                throw new ConflictException(
                    'Username hoặc email đã được sử dụng',
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
        const currentUser = await this.getUserOrThrow(
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
                const currentRoleNames = currentUser.user_roles.map(
                    ({ roles: currentRole }) => this.normalizeRoleName(currentRole.role_name),
                );
                const removesAdmin = currentRoleNames.includes('ADMIN') && !roles.some(
                    (role) => this.normalizeRoleName(role.role_name) === 'ADMIN',
                );
                if (removesAdmin && (currentUser.status ?? 'active').toLowerCase() === 'active') {
                    const activeAdmins = await transaction.users.findMany({
                        where: {
                            status: 'active',
                            user_roles: { some: { roles: { role_name: 'admin' } } },
                        },
                        select: { id: true, locked_until: true },
                    });
                    const otherActiveAdmins = activeAdmins.filter(
                        (admin) => admin.id !== id && (!admin.locked_until || admin.locked_until <= new Date()),
                    );
                    if (otherActiveAdmins.length === 0) {
                        throw new BadRequestException('Không thể thu hồi vai trò của ADMIN hoạt động cuối cùng');
                    }
                }

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

                const newRoleNames =
                    roles.map(
                        (role) =>
                            this.normalizeRoleName(
                                role.role_name,
                            ),
                    );

                const existingOverrides =
                    await transaction.user_permission_overrides.findMany({
                        where: {
                            user_id:
                                id,
                        },

                        include: {
                            permission:
                                true,
                        },
                    });

                let removedPermissionOverrides: string[] = [];

                if (
                    existingOverrides.length > 0
                ) {
                    if (
                        newRoleNames.includes(
                            'ADMIN',
                        )
                    ) {
                        removedPermissionOverrides =
                            existingOverrides.map(
                                (override) =>
                                    override
                                        .permission
                                        .permission_name,
                            );

                        await transaction.user_permission_overrides.deleteMany({
                            where: {
                                user_id:
                                    id,
                            },
                        });
                    } else {
                        const rolePermissionRows =
                            await transaction.role_permissions.findMany({
                                where: {
                                    role_id: {
                                        in:
                                            roles.map(
                                                (role) =>
                                                    role.id,
                                            ),
                                    },
                                },

                                include: {
                                    permissions:
                                        true,
                                },
                            });

                        const newBasePermissionSet =
                            new Set(
                                rolePermissionRows.map(
                                    (row) =>
                                        this.normalizePermissionName(
                                            row
                                                .permissions
                                                .permission_name,
                                        ),
                                ),
                            );

                        const redundantOverrides =
                            existingOverrides.filter(
                                (override) => {
                                    const permissionName =
                                        this.normalizePermissionName(
                                            override
                                                .permission
                                                .permission_name,
                                        );

                                    return override.effect ===
                                        'ALLOW'
                                        ? newBasePermissionSet.has(
                                            permissionName,
                                        )
                                        : !newBasePermissionSet.has(
                                            permissionName,
                                        );
                                },
                            );

                        removedPermissionOverrides =
                            redundantOverrides.map(
                                (override) =>
                                    override
                                        .permission
                                        .permission_name,
                            );

                        if (
                            redundantOverrides.length > 0
                        ) {
                            await transaction.user_permission_overrides.deleteMany({
                                where: {
                                    user_id:
                                        id,

                                    permission_id: {
                                        in:
                                            redundantOverrides.map(
                                                (override) =>
                                                    override.permission_id,
                                            ),
                                    },
                                },
                            });
                        }
                    }
                }

                await transaction.user_sessions.updateMany({
                    where: { user_id: id, revoked: false },
                    data: { revoked: true },
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

                            details_json: JSON.stringify({
                                before: {
                                    roles:
                                        currentRoleNames,
                                },
                                after: {
                                    roles:
                                        newRoleNames,
                                    removed_permission_overrides:
                                        removedPermissionOverrides,
                                },
                            }),
                    },
                });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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
