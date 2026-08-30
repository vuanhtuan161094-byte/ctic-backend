import {
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';

import {
    PrismaService,
} from '../prisma/prisma.service';

import {
    DatabaseSchemaService,
} from '../prisma/database-schema.service';

import {
    assertStorageWritable,
    getStorageConfig,
} from '../common/storage-config';

import {
    getReleaseMetadata,
} from '../common/release-metadata';

export interface HealthStatusResponse {
    status: 'ok';
    service: string;
    version: string;
    environment: string;
    database: 'connected';
    storage: 'writable';
    database_schema: 'compatible';
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

export interface PublicReadinessResponse {
    status: 'ok';
    service: string;
    timestamp: string;
}

@Injectable()
export class HealthService {
    constructor(
        private readonly prisma:
            PrismaService,

        private readonly databaseSchema:
            DatabaseSchemaService,
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

        try {
            await this.databaseSchema
                .assertCompatible();
        } catch (error) {
            if (
                this.prisma
                    .isDatabaseUnavailableError(
                        error,
                    )
            ) {
                throw new ServiceUnavailableException(
                    'Cơ sở dữ liệu hiện không sẵn sàng',
                );
            }

            throw new ServiceUnavailableException(
                'Cơ sở dữ liệu chưa đồng bộ với phiên bản phần mềm',
            );
        }

        try {
            assertStorageWritable(
                getStorageConfig(),
            );
        } catch {
            throw new ServiceUnavailableException(
                'Kho lưu trữ hồ sơ hiện không sẵn sàng hoặc không có quyền ghi',
            );
        }

        const release =
            getReleaseMetadata();

        return {
            status: 'ok',

            service:
                'ctic-backend',

            version:
                release.version,

            environment:
                process.env.NODE_ENV ??
                'development',

            database:
                'connected',

            storage:
                'writable',

            database_schema:
                'compatible',

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

    async getPublicReadiness(): Promise<PublicReadinessResponse> {
        const readiness = await this.getReadiness();
        return {
            status: readiness.status,
            service: readiness.service,
            timestamp: readiness.timestamp,
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
