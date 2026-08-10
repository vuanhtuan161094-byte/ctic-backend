import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

import {
    getSecurityConfig,
} from './security-config';
import {
    SecurityAuditService,
} from './security-audit.service';
import type {
    SecurityRequest,
} from './security-request';

@Injectable()
export class PublicRegistrationGuard
    implements CanActivate {
    constructor(
        private readonly securityAudit:
            SecurityAuditService,
    ) { }

    async canActivate(
        context: ExecutionContext,
    ) {
        const security =
            getSecurityConfig();

        if (
            security.publicRegistrationEnabled
        ) {
            return true;
        }

        const request =
            context
                .switchToHttp()
                .getRequest<SecurityRequest>();

        await this.securityAudit.write({
            action:
                'AUTH_REGISTER_BLOCKED',
            outcome:
                'blocked',
            statusCode:
                403,
            ipAddress:
                request.ip,
            userAgent:
                request.get(
                    'user-agent',
                ),
            requestId:
                request.requestId,
        });

        throw new ForbiddenException(
            'Đăng ký tài khoản công khai đang tắt. Tài khoản nội bộ phải được tạo trong phần Quản trị người dùng.',
        );
    }
}
