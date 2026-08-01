import {
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';

import {
    PrismaService,
} from '../prisma/prisma.service';

export interface HealthStatusResponse {
    status: 'ok';
    service: string;
    version: string;
    environment: string;
    database: 'connected';
    response_time_ms: number;
    uptime_seconds: number;
    timestamp: string;
}

export interface LivenessResponse {
    status: 'ok';
    service: string;
    uptime_seconds: number;
    timestamp: string;
}

@Injectable()
export class HealthService {
    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    getLiveness():
        LivenessResponse {
        return {
            status: 'ok',

            service:
                'ctic-backend',

            uptime_seconds:
                Math.floor(
                    process.uptime(),
                ),

            timestamp:
                new Date()
                    .toISOString(),
        };
    }

    async getReadiness():
        Promise<HealthStatusResponse> {
        const startedAt =
            Date.now();

        try {
            await this.withTimeout(
                Promise.resolve(
                    this.prisma.$queryRaw`
                        SELECT 1
                        AS health_check
                    `,
                ),
                5000,
            );
        } catch {
            throw new ServiceUnavailableException(
                'Cơ sở dữ liệu hiện không sẵn sàng',
            );
        }

        return {
            status: 'ok',

            service:
                'ctic-backend',

            version:
                process.env
                    .npm_package_version ??
                '0.0.1',

            environment:
                process.env.NODE_ENV ??
                'development',

            database:
                'connected',

            response_time_ms:
                Date.now() -
                startedAt,

            uptime_seconds:
                Math.floor(
                    process.uptime(),
                ),

            timestamp:
                new Date()
                    .toISOString(),
        };
    }

    private async withTimeout<T>(
        operation: Promise<T>,
        timeoutMs: number,
    ): Promise<T> {
        let timeout:
            NodeJS.Timeout |
            undefined;

        const timeoutPromise =
            new Promise<T>(
                (
                    _resolve,
                    reject,
                ) => {
                    timeout =
                        setTimeout(
                            () => {
                                reject(
                                    new Error(
                                        'Health check timeout',
                                    ),
                                );
                            },
                            timeoutMs,
                        );
                },
            );

        try {
            return await Promise.race(
                [
                    operation,
                    timeoutPromise,
                ],
            );
        } finally {
            if (timeout) {
                clearTimeout(
                    timeout,
                );
            }
        }
    }
}