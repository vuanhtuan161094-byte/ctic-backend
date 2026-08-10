import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import {
    Reflector,
} from '@nestjs/core';
import type {
    Response,
} from 'express';

import {
    getSecurityConfig,
} from './security-config';
import {
    SECURITY_RATE_LIMIT_KEY,
    SecurityRateLimitProfile,
} from './security-rate-limit.decorator';
import {
    SecurityRateLimitService,
} from './security-rate-limit.service';
import type {
    SecurityRequest,
} from './security-request';

@Injectable()
export class SecurityRateLimitGuard
    implements CanActivate {
    constructor(
        private readonly reflector:
            Reflector,

        private readonly rateLimiter:
            SecurityRateLimitService,
    ) { }

    private clientIp(
        request: SecurityRequest,
    ) {
        return (
            request.ip ||
            request.socket?.remoteAddress ||
            'unknown'
        )
            .trim()
            .toLowerCase()
            .slice(0, 100);
    }

    private normalizeUsername(
        request: SecurityRequest,
    ) {
        const body =
            request.body as
                | {
                    username?: unknown;
                }
                | undefined;

        if (
            typeof body?.username !==
            'string'
        ) {
            return '(missing)';
        }

        return body.username
            .trim()
            .toLowerCase()
            .slice(0, 100) ||
            '(empty)';
    }

    private reject(
        response: Response,
        retryAfterSeconds: number,
    ): never {
        response.setHeader(
            'Retry-After',
            String(
                retryAfterSeconds,
            ),
        );

        throw new HttpException(
            'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }

    canActivate(
        context: ExecutionContext,
    ) {
        const profile =
            this.reflector.getAllAndOverride<
                SecurityRateLimitProfile
            >(
                SECURITY_RATE_LIMIT_KEY,
                [
                    context.getHandler(),
                    context.getClass(),
                ],
            );

        if (!profile) {
            return true;
        }

        const request =
            context
                .switchToHttp()
                .getRequest<SecurityRequest>();

        const response =
            context
                .switchToHttp()
                .getResponse<Response>();

        const security =
            getSecurityConfig();

        const ip =
            this.clientIp(request);

        if (
            profile ===
            'login'
        ) {
            const username =
                this.normalizeUsername(
                    request,
                );

            const principalResult =
                this.rateLimiter.consume(
                    `login:principal:${ip}:${username}`,
                    security.loginRateLimitMaxAttempts,
                    security.loginRateLimitWindowMs,
                    security.rateLimitMaxEntries,
                );

            if (
                !principalResult.allowed
            ) {
                this.reject(
                    response,
                    principalResult.retryAfterSeconds,
                );
            }

            const ipResult =
                this.rateLimiter.consume(
                    `login:ip:${ip}`,
                    security.loginRateLimitMaxAttemptsPerIp,
                    security.loginRateLimitWindowMs,
                    security.rateLimitMaxEntries,
                );

            if (!ipResult.allowed) {
                this.reject(
                    response,
                    ipResult.retryAfterSeconds,
                );
            }

            response.setHeader(
                'X-RateLimit-Remaining',
                String(
                    Math.min(
                        principalResult.remaining,
                        ipResult.remaining,
                    ),
                ),
            );

            return true;
        }

        const publicResult =
            this.rateLimiter.consume(
                `public-certificate:ip:${ip}`,
                security.publicCertificateRateLimitMaxRequests,
                security.publicCertificateRateLimitWindowMs,
                security.rateLimitMaxEntries,
            );

        if (!publicResult.allowed) {
            this.reject(
                response,
                publicResult.retryAfterSeconds,
            );
        }

        response.setHeader(
            'X-RateLimit-Remaining',
            String(
                publicResult.remaining,
            ),
        );

        return true;
    }
}
