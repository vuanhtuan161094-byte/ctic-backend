import {
    ValidationPipe,
} from '@nestjs/common';

import { NestFactory } from '@nestjs/core';

import {
    DocumentBuilder,
    SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';

import {
    GlobalExceptionFilter,
} from './common/filters/global-exception.filter';

async function bootstrap() {
    const app =
        await NestFactory.create(
            AppModule,
        );

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

    const allowedOrigins =
        (
            process.env.CORS_ORIGINS ??
            'http://localhost:5173,http://localhost:3001'
        )
            .split(',')
            .map(
                (origin) =>
                    origin.trim(),
            )
            .filter(Boolean);

    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
    });

    app.enableShutdownHooks();

    const swaggerEnabled =
        process.env
            .SWAGGER_ENABLED ===
        'true' ||
        process.env.NODE_ENV !==
        'production';

    if (swaggerEnabled) {
        const swaggerConfig =
            new DocumentBuilder()
                .setTitle(
                    'CTIC Certification Management Platform',
                )
                .setDescription(
                    'API quản lý quy trình chứng nhận hệ thống quản lý P.09',
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
                    'CTIC CMP API',

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

    const port =
        Number(
            process.env.PORT ??
            3000,
        );

    await app.listen(port);

    console.log(
        `Server running on http://localhost:${port}`,
    );

    if (swaggerEnabled) {
        console.log(
            `API documentation: http://localhost:${port}/api-docs`,
        );
    }
}

void bootstrap();
