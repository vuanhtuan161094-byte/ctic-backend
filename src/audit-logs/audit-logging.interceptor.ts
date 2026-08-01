import {
    CallHandler,
    ExecutionContext,
    Injectable,
    Logger,
    NestInterceptor,
} from '@nestjs/common';

import type {
    Request,
} from 'express';

import {
    Observable,
} from 'rxjs';

import {
    mergeMap,
} from 'rxjs/operators';

import { PrismaService } from '../prisma/prisma.service';

interface AuditRequest
    extends Request {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
    };
}

@Injectable()
export class AuditLoggingInterceptor
    implements NestInterceptor {
    private readonly logger =
        new Logger(
            AuditLoggingInterceptor.name,
        );

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private shouldSkip(
        method: string,
        path: string,
    ) {
        if (
            [
                'GET',
                'HEAD',
                'OPTIONS',
            ].includes(
                method,
            )
        ) {
            return true;
        }

        if (
            path.startsWith(
                '/auth',
            ) ||
            path.startsWith(
                '/audit-logs',
            ) ||
            path.startsWith(
                '/users',
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
        request: AuditRequest,
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

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request =
            context
                .switchToHttp()
                .getRequest<AuditRequest>();

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
            request.user?.id ??
            request.user?.userId ??
            request.user?.sub ??
            null;

        if (!userId) {
            return next.handle();
        }

        return next.handle().pipe(
            mergeMap(
                async (
                    response,
                ) => {
                    try {
                        const routePath =
                            request.route
                                ?.path;

                        const action =
                            `${method} ${routePath
                                    ? `${request.baseUrl ?? ''}${String(routePath)}`
                                    : path
                                }`.slice(
                                    0,
                                    100,
                                );

                        const entityType =
                            path
                                .split('/')
                                .filter(Boolean)[0]
                                ?.replace(
                                    /-/g,
                                    '_',
                                )
                                .slice(
                                    0,
                                    50,
                                ) ??
                            null;

                        const entityId =
                            this.getEntityId(
                                response,
                                request,
                            );

                        await this.prisma.audit_logs.create({
                            data: {
                                user_id:
                                    userId,

                                action,

                                entity_type:
                                    entityType,

                                entity_id:
                                    entityId,

                                ip_address:
                                    request.ip
                                        ?.slice(
                                            0,
                                            50,
                                        ) ??
                                    null,

                                user_agent:
                                    request
                                        .get(
                                            'user-agent',
                                        )
                                        ?.slice(
                                            0,
                                            255,
                                        ) ??
                                    null,
                            },
                        });
                    } catch (error) {
                        this.logger.error(
                            'Không thể ghi audit log',

                            error instanceof
                                Error
                                ? error.stack
                                : undefined,
                        );
                    }

                    return response;
                },
            ),
        );
    }
}