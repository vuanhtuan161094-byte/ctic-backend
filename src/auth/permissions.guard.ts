import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

import {
    Reflector,
} from '@nestjs/core';

import {
    PERMISSIONS_KEY,
} from './permissions.decorator';

interface AuthorizedUser {
    roles?: string[];
    permissions?: string[];
}

interface AuthorizedRequest {
    user?: AuthorizedUser;
}

@Injectable()
export class PermissionsGuard
    implements CanActivate {
    constructor(
        private readonly reflector:
            Reflector,
    ) { }

    canActivate(
        context: ExecutionContext,
    ): boolean {
        const requiredPermissions =
            this.reflector.getAllAndOverride<
                string[]
            >(
                PERMISSIONS_KEY,
                [
                    context.getHandler(),
                    context.getClass(),
                ],
            );

        if (
            !requiredPermissions ||
            requiredPermissions.length ===
            0
        ) {
            return true;
        }

        const request =
            context
                .switchToHttp()
                .getRequest<AuthorizedRequest>();

        const user =
            request.user;

        if (!user) {
            throw new ForbiddenException(
                'Không tìm thấy thông tin tài khoản',
            );
        }

        const normalizedRoles =
            (
                user.roles ??
                []
            ).map(
                (role) =>
                    role
                        .trim()
                        .toUpperCase(),
            );

        /*
         * ADMIN luôn được phép truy cập,
         * không phụ thuộc danh sách permission.
         */
        if (
            normalizedRoles.includes(
                'ADMIN',
            )
        ) {
            return true;
        }

        const normalizedUserPermissions =
            (
                user.permissions ??
                []
            ).map(
                (permission) =>
                    permission
                        .trim()
                        .toLowerCase(),
            );

        const hasPermissions =
            requiredPermissions.every(
                (
                    requiredPermission,
                ) =>
                    normalizedUserPermissions.includes(
                        requiredPermission
                            .trim()
                            .toLowerCase(),
                    ),
            );

        if (!hasPermissions) {
            throw new ForbiddenException(
                'Tài khoản không có permission thực hiện thao tác này',
            );
        }

        return true;
    }
}