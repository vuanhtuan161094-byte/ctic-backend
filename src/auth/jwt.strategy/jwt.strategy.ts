import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import {
    ConfigService,
} from '@nestjs/config';

import {
    PassportStrategy,
} from '@nestjs/passport';

import {
    ExtractJwt,
    Strategy,
} from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';

import { resolveEffectivePermissionProfile } from '../effective-permissions';

interface JwtPayload {
    sub: string;
    username: string;
    email?: string;
    roles?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(
    Strategy,
) {
    constructor(
        configService:
            ConfigService,

        private readonly prisma:
            PrismaService,
    ) {
        super({
            jwtFromRequest:
                ExtractJwt.fromAuthHeaderAsBearerToken(),

            ignoreExpiration:
                false,

            secretOrKey:
                configService.getOrThrow<string>(
                    'JWT_SECRET',
                ),
        });
    }

    async validate(
        payload: JwtPayload,
    ) {
        const user =
            await this.prisma.users.findUnique({
                where: {
                    id:
                        payload.sub,
                },

                include: {
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
                        },
                    },
                },
            });

        if (!user) {
            throw new UnauthorizedException(
                'Tài khoản không tồn tại',
            );
        }

        const status =
            (
                user.status ??
                'active'
            )
                .trim()
                .toLowerCase();

        if (
            status !==
            'active'
        ) {
            throw new UnauthorizedException(
                'Tài khoản đã bị khóa hoặc ngừng hoạt động',
            );
        }

        if (
            user.locked_until &&
            user.locked_until >
            new Date()
        ) {
            throw new UnauthorizedException(
                'Tài khoản đang bị khóa tạm thời',
            );
        }

        const roles =
            user.user_roles.map(
                (userRole) =>
                    userRole
                        .roles
                        .role_name,
            );

        const basePermissions =
            user.user_roles.flatMap(
                (userRole) =>
                    userRole
                        .roles
                        .role_permissions
                        .map(
                            (
                                rolePermission,
                            ) =>
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

        const permissions =
            permissionProfile
                .effective_permissions;

        return {
            userId:
                user.id,

            username:
                user.username,

            email:
                user.email,

            roles,

            permissions,
        };
    }
}