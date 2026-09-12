import {
    ValidationPipe,
} from '@nestjs/common';

import { NestFactory } from '@nestjs/core';

import { randomUUID } from 'crypto';

import {
    DocumentBuilder,
    SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';

import {
    getDeploymentConfig,
    isCorsOriginAllowed,
} from './common/deployment-config';

import {
    GlobalExceptionFilter,
} from './common/filters/global-exception.filter';

import {
    safeErrorForLog,
} from './common/safe-error-log';

import {
    getPlatformBranding,
} from './common/platform-branding';

import {
    ensureStorageLayout,
} from './common/storage-config';

import {
    getSecurityConfig,
    validateSecurityEnvironment,
} from './security/security-config';

import {
    validateRuntimeEnvironment,
} from './common/production-readiness';

import {
    PrismaService,
} from './prisma/prisma.service';

import {
    DatabaseSchemaService,
} from './prisma/database-schema.service';

async function bootstrap() {
    // NestFactory.create() khởi tạo ConfigModule.forRoot(), vì vậy .env đã được
    // nạp trước khi đọc cấu hình deployment/storage.
    const app =
        await NestFactory.create(
            AppModule,
        );

    const deployment =
        getDeploymentConfig();

    const security =
        getSecurityConfig();

    validateSecurityEnvironment(
        deployment.isProduction,
    );

    const productionReadiness =
        validateRuntimeEnvironment({
            deployment,
            security,
        });

    const storage =
        ensureStorageLayout();

    const expressApp =
        app
            .getHttpAdapter()
            .getInstance() as {
                set: (
                    name: string,
                    value: unknown,
                ) => void;
                disable: (
                    name: string,
                ) => void;
            };

    expressApp.set(
        'trust proxy',
        deployment.trustProxy,
    );

    expressApp.disable(
        'x-powered-by',
    );

    app.use((
        request: {
            headers: Record<string, string | string[] | undefined>;
            requestId?: string;
        },
        response: {
            setHeader: (name: string, value: string) => void;
        },
        next: () => void,
    ) => {
        const providedRequestId =
            typeof request.headers['x-request-id'] === 'string'
                ? request.headers['x-request-id'].trim()
                : '';

        const requestId =
            /^[A-Za-z0-9._:-]{8,100}$/.test(
                providedRequestId,
            )
                ? providedRequestId
                : randomUUID();

        request.requestId =
            requestId;

        response.setHeader(
            'X-Request-Id',
            requestId,
        );

        if (
            security.securityHeadersEnabled
        ) {
            response.setHeader(
                'X-Content-Type-Options',
                'nosniff',
            );
            response.setHeader(
                'X-Frame-Options',
                'SAMEORIGIN',
            );
            response.setHeader(
                'Referrer-Policy',
                'no-referrer',
            );
            response.setHeader(
                'Permissions-Policy',
                'camera=(), microphone=(), geolocation=()',
            );
            response.setHeader(
                'X-Permitted-Cross-Domain-Policies',
                'none',
            );

            if (
                deployment.isProduction &&
                deployment.publicBaseUrl.startsWith('https://')
            ) {
                response.setHeader(
                    'Strict-Transport-Security',
                    'max-age=15552000',
                );
            }
        }

        next();
    });

    app.useGlobalFilters(
        new GlobalExceptionFilter(),
    );

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            validationError: {
                target: false,
                value: false,
            },
        }),
    );

    app.enableCors({
        origin: (
            origin,
            callback,
        ) => {
            if (
                isCorsOriginAllowed(
                    origin,
                    deployment,
                )
            ) {
                callback(null, true);
                return;
            }

            callback(
                new Error(
                    `Origin ${origin} is not allowed by CORS`,
                ),
                false,
            );
        },
        credentials: true,
    });

    app.enableShutdownHooks();

    const prisma =
        app.get(
            PrismaService,
        );

    const databaseSchema =
        app.get(
            DatabaseSchemaService,
        );

    // Startup preflight: SQL Server có thể chậm khởi động sau reboot/service restart.
    // Chờ có giới hạn và retry thay vì chết ngay ở lần kết nối đầu tiên.
    await prisma
        .waitForDatabaseReady();

    // Chỉ kiểm schema sau khi database thực sự reachable. Nếu code/Prisma Client
    // mới hơn database, backend fail-fast trước khi mở cổng HTTP để tránh P2022 ở từng API.
    await databaseSchema
        .assertCompatible();

    process.on(
        'uncaughtException',
        (error) => {
            if (
                prisma.isRecoverableDriverError(
                    error,
                )
            ) {
                console.error(
                    'SQL Server connection entered an invalid state. Recovering connection pool...',
                    safeErrorForLog(
                        error,
                    ),
                );

                void prisma
                    .recoverConnection()
                    .catch(
                        (reconnectError) =>
                            console.error(
                                'SQL Server automatic recovery failed:',
                                safeErrorForLog(
                                    reconnectError,
                                ),
                            ),
                    );
                return;
            }

            console.error(
                'Uncaught exception:',
                safeErrorForLog(
                    error,
                ),
            );

            process.exitCode = 1;
            setTimeout(
                () => process.exit(1),
                100,
            ).unref();
        },
    );

    process.on(
        'unhandledRejection',
        (reason) => {
            console.error(
                'Unhandled promise rejection:',
                safeErrorForLog(
                    reason,
                ),
            );

            process.exitCode = 1;
            setTimeout(
                () => process.exit(1),
                100,
            ).unref();
        },
    );

    const platformBranding =
        getPlatformBranding();

    if (
        deployment.swaggerEnabled
    ) {
        const swaggerConfig =
            new DocumentBuilder()
                .setTitle(
                    platformBranding.platformTitle,
                )
                .setDescription(
                    'API quản lý quy trình chứng nhận hệ thống quản lý quy tr├¼nh chß╗⌐ng nhß║¡n',
                )
                .setVersion('1.0')
                .addBearerAuth(
                    {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat:
                            'JWT',
                        description:
                            'Nhập access_token nhận được từ POST /auth/login',
                    },
                    'jwt',
                )
                .build();

        const swaggerDocument =
            SwaggerModule
                .createDocument(
                    app,
                    swaggerConfig,
                );

        swaggerDocument.security =
            [
                {
                    jwt: [],
                },
            ];

        const publicSwaggerPaths =
            [
                '/auth/',
                '/health',
                '/public/',
            ];

        for (const [
            path,
            pathItem,
        ] of Object.entries(
            swaggerDocument.paths,
        )) {
            const isPublicPath =
                publicSwaggerPaths.some(
                    (prefix) =>
                        path.startsWith(
                            prefix,
                        ),
                );

            if (
                !isPublicPath ||
                !pathItem
            ) {
                continue;
            }

            for (const operation of Object.values(
                pathItem,
            )) {
                if (
                    operation &&
                    typeof operation ===
                        'object' &&
                    'responses' in
                        operation
                ) {
                    operation.security =
                        [];
                }
            }
        }

        SwaggerModule.setup(
            'api-docs',
            app,
            swaggerDocument,
            {
                customSiteTitle:
                    platformBranding.swaggerSiteTitle,

                swaggerOptions: {
                    persistAuthorization:
                        true,

                    displayRequestDuration:
                        true,

                    filter:
                        true,

                    tagsSorter:
                        'alpha',

                    operationsSorter:
                        'alpha',
                },
            },
        );
    }

    await app.listen(
        deployment.port,
        deployment.host,
    );

    console.log(
        `Server running on http://${deployment.host}:${deployment.port}`,
    );

    console.log(
        `Public API base URL: ${deployment.publicBaseUrl}`,
    );

    console.log(
        deployment.isProduction
            ? 'Storage provider: LOCAL_FILESYSTEM (persistent root configured)'
            : `Storage root: ${storage.rootDirectory}`,
    );

    console.log(
        `Security headers: ${security.securityHeadersEnabled ? 'enabled' : 'disabled'}`,
    );

    console.log(
        `Public registration: ${security.publicRegistrationEnabled ? 'enabled' : 'disabled'}`,
    );

    console.log(
        `CORS origins: ${deployment.corsOrigins.join(', ') || '(none)'}`,
    );

    if (
        deployment.allowPrivateNetworkOrigins
    ) {
        console.log(
            'CORS private-network origins: enabled',
        );
    }

    const publicHostname =
        new URL(
            deployment.publicBaseUrl,
        ).hostname;

    if (
        deployment.allowPrivateNetworkOrigins &&
        [
            'localhost',
            '127.0.0.1',
            '::1',
        ].includes(
            publicHostname,
        )
    ) {
        console.warn(
            'WARNING: PUBLIC_BASE_URL đang trỏ localhost trong khi cho phép truy cập LAN. QR/link công khai sẽ không dùng được trên máy khác. Hãy chạy: npm run env:lan -- --host=<IP_LAN>',
        );
    }

    if (
        deployment.swaggerEnabled
    ) {
        console.log(
            `API documentation: ${deployment.publicBaseUrl}/api-docs`,
        );
    }

    for (const warning of productionReadiness.warnings) {
        console.warn(
            `[PRODUCTION READINESS] ${warning}`,
        );
    }
}

void bootstrap()
    .catch((error) => {
        const candidate =
            error as {
                code?: string;
                message?: string;
                stack?: string;
            };

        if (
            candidate?.code ===
                'DB_UNAVAILABLE' ||
            candidate?.code ===
                'DB_AUTHENTICATION_FAILED'
        ) {
            console.error(
                `[FATAL] ${candidate.message ?? 'Database không sẵn sàng'}`,
            );
            console.error(
                '[FATAL] Chạy "npm run db:preflight" để kiểm tra kết nối hoặc "npm run db:recover:local" nếu SQL Server nằm trên chính máy Windows này.',
            );
        } else {
            console.error(
                '[FATAL] Backend không thể khởi động:',
                safeErrorForLog(
                    error,
                ),
            );
        }

        process.exit(1);
    });
