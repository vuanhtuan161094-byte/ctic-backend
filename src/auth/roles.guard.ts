import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ForbiddenException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from './roles.decorator';


@Injectable()
export class RolesGuard implements CanActivate {

    constructor(
        private reflector: Reflector,
    ) { }


    canActivate(
        context: ExecutionContext,
    ): boolean {

        const requiredRoles = this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [
                context.getHandler(),
                context.getClass(),
            ],
        );


        // API không yêu cầu role
        if (!requiredRoles) {
            return true;
        }


        const request = context.switchToHttp().getRequest();

        const user = request.user;


        if (!user) {
            throw new ForbiddenException(
                'Không tìm thấy thông tin user',
            );
        }


        const normalizedUserRoles = user.roles?.map(
            (role: string) => role.trim().toUpperCase(),
        ) ?? [];

        const hasRole = requiredRoles.some(
            (role) => normalizedUserRoles.includes(
                role.trim().toUpperCase(),
            ),
        );


        if (!hasRole) {
            throw new ForbiddenException(
                'Bạn không có quyền thực hiện thao tác này',
            );
        }


        return true;
    }
}
