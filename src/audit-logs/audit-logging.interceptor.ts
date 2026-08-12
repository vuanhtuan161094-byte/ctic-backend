import {
    CallHandler,
    ExecutionContext,
    HttpException,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';

import type {
    Response,
} from 'express';

import {
    from,
    Observable,
    throwError,
} from 'rxjs';

import {
    catchError,
    mergeMap,
} from 'rxjs/operators';

import {
    SecurityAuditService,
} from '../security/security-audit.service';
import {
    getActorUserId,
} from '../security/security-request';
import type {
    SecurityRequest,
} from '../security/security-request';

@Injectable()
export class AuditLoggingInterceptor
    implements NestInterceptor {
    constructor(
        private readonly securityAudit:
            SecurityAuditService,
    ) { }

    private shouldSkip(
        method: string,
        path: string,
    ) {
        if (
            [
                'HEAD',
                'OPTIONS',
            ].includes(method)
        ) {
            return true;
        }

        // Auth có security audit riêng để ghi được cả lần đăng nhập thất bại.
        // Audit log tự thân được bỏ qua để tránh vòng lặp ghi log.
        if (
            path.startsWith(
                '/auth',
            ) ||
            path.startsWith(
                '/audit-logs',
            ) ||
            path ===
                '/notifications/sync'
        ) {
            return true;
        }

        return false;
    }

    private getEntityId(
        response: unknown,
        request: SecurityRequest,
    ) {
        if (
            typeof response ===
                'object' &&
            response !== null &&
            'id' in response
        ) {
            const responseId =
                (
                    response as {
                        id?: unknown;
                    }
                ).id;

            if (
                typeof responseId ===
                    'string' &&
                this.isUuid(
                    responseId,
                )
            ) {
                return responseId;
            }
        }

        const parameterId =
            request.params?.id;

        if (
            typeof parameterId ===
                'string' &&
            this.isUuid(
                parameterId,
            )
        ) {
            return parameterId;
        }

        return null;
    }

    private isUuid(
        value: string,
    ) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        );
    }

    private statusCode(
        error: unknown,
    ) {
        return error instanceof
            HttpException
            ? error.getStatus()
            : 500;
    }

    private buildAction(
        method: string,
        path: string,
        request: SecurityRequest,
    ) {
        const routePath =
            request.route?.path;

        return `${method} ${
            routePath
                ? `${
                    request.baseUrl ??
                    ''
                }${String(
                    routePath,
                )}`
                : path
        }`.slice(0, 100);
    }

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request =
            context
                .switchToHttp()
                .getRequest<SecurityRequest>();

        const response =
            context
                .switchToHttp()
                .getResponse<Response>();

        const method =
            request.method
                .trim()
                .toUpperCase();

        const path =
            request.originalUrl
                .split('?')[0];

        if (
            this.shouldSkip(
                method,
                path,
            )
        ) {
            return next.handle();
        }

        const userId =
            getActorUserId(
                request,
            );

        if (!userId) {
            return next.handle();
        }

        const startedAt =
            Date.now();

        const action =
            this.buildAction(
                method,
                path,
                request,
            );

        const entityType =
            path
                .split('/')
                .filter(Boolean)[0]
                ?.replace(
                    /-/g,
                    '_',
                )
                .slice(0, 50) ??
            null;

        return next.handle().pipe(
            mergeMap(
                async (
                    result,
                ) => {
                    if (method === 'GET') {
                        return result;
                    }

                    await this.securityAudit.write({
                        userId,
                        action,
                        entityType,
                        entityId:
                            this.getEntityId(
                                result,
                                request,
                            ),
                        ipAddress:
                            request.ip,
                        userAgent:
                            request.get(
                                'user-agent',
                            ),
                        requestId:
                            request.requestId,
                        outcome:
                            'success',
                        statusCode:
                            response.statusCode,
                        durationMs:
                            Date.now() -
                            startedAt,
                    });

                    return result;
                },
            ),
            catchError(
                (error: unknown) => {
                    const statusCode =
                        this.statusCode(
                            error,
                        );

                    if (
                        method === 'GET' &&
                        statusCode !== 403
                    ) {
                        return throwError(
                            () => error,
                        );
                    }

                    return from(
                        this.securityAudit.write({
                            userId,
                            action,
                            entityType,
                            entityId:
                                this.getEntityId(
                                    null,
                                    request,
                                ),
                            ipAddress:
                                request.ip,
                            userAgent:
                                request.get(
                                    'user-agent',
                                ),
                            requestId:
                                request.requestId,
                            outcome:
                                'failure',
                            statusCode,
                            durationMs:
                                Date.now() -
                                startedAt,
                        }),
                    ).pipe(
                        mergeMap(
                            () =>
                                throwError(
                                    () =>
                                        error,
                                ),
                        ),
                    );
                },
            ),
        );
    }
}
