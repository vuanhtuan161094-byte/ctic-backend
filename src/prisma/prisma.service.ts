import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';

import {
    ConfigService,
} from '@nestjs/config';

import {
    PrismaMssql,
} from '@prisma/adapter-mssql';

import {
    PrismaClient,
} from '@prisma/client';

type MssqlAdapterConfig = {
    server: string;
    port: number;
    database?: string;
    user?: string;
    password?: string;
    connectionTimeout: number;
    requestTimeout: number;
    pool: {
        max: number;
        min: number;
        idleTimeoutMillis: number;
    };
    options: {
        encrypt: boolean;
        trustServerCertificate: boolean;
        packetSize: number;
        enableArithAbort: boolean;
    };
};

function splitConnectionParts(value: string) {
    const parts: string[] = [];
    let current = '';
    let braceDepth = 0;

    for (const character of value) {
        if (character === '{') {
            braceDepth += 1;
        } else if (
            character === '}' &&
            braceDepth > 0
        ) {
            braceDepth -= 1;
        }

        if (
            character === ';' &&
            braceDepth === 0
        ) {
            parts.push(current);
            current = '';
            continue;
        }

        current += character;
    }

    if (current) {
        parts.push(current);
    }

    return parts;
}

function unwrapConnectionValue(value: string) {
    const trimmed = value.trim();
    if (
        trimmed.startsWith('{') &&
        trimmed.endsWith('}')
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function parseBoolean(
    value: string | undefined,
    fallback: boolean,
) {
    if (value === undefined) {
        return fallback;
    }

    return [
        '1',
        'true',
        'yes',
        'y',
        'on',
    ].includes(
        value.trim().toLowerCase(),
    );
}

function positiveInteger(
    value: string | undefined,
    fallback: number,
) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : fallback;
}

function boundedPositiveInteger(
    value: string | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(
        maximum,
        Math.max(
            minimum,
            Math.floor(parsed),
        ),
    );
}

function wait(
    milliseconds: number,
) {
    return new Promise<void>(
        (resolve) =>
            setTimeout(
                resolve,
                milliseconds,
            ),
    );
}

function buildMssqlConfig(
    databaseUrl: string,
    configService: ConfigService,
): MssqlAdapterConfig {
    const withoutScheme =
        databaseUrl.replace(
            /^sqlserver:\/\//i,
            '',
        );

    const parts = splitConnectionParts(
        withoutScheme,
    );

    const hostPart =
        parts.shift()?.trim() ||
        'localhost:1433';

    const lastColon =
        hostPart.lastIndexOf(':');

    const server =
        lastColon > 0
            ? hostPart.slice(0, lastColon)
            : hostPart;

    const parsedPort =
        lastColon > 0
            ? Number(
                hostPart.slice(
                    lastColon + 1,
                ),
            )
            : 1433;

    const parameters =
        new Map<string, string>();

    for (const part of parts) {
        const separator =
            part.indexOf('=');

        if (separator <= 0) {
            continue;
        }

        parameters.set(
            part
                .slice(0, separator)
                .trim()
                .toLowerCase(),
            unwrapConnectionValue(
                part.slice(
                    separator + 1,
                ),
            ),
        );
    }

    const database =
        parameters.get('database') ??
        parameters.get(
            'initial catalog',
        );

    const user =
        parameters.get('user') ??
        parameters.get('username') ??
        parameters.get('uid');

    const password =
        parameters.get('password') ??
        parameters.get('pwd');

    const encrypt =
        parseBoolean(
            parameters.get(
                'encrypt',
            ),
            true,
        );

    // SQL Server's normal TDS packet size is 4096 bytes. Values above
    // 32767 are invalid, and encrypted connections have a lower ceiling.
    // Fall back to the interoperable default instead of allowing an invalid
    // environment value to destabilize login/query processing.
    const requestedPacketSize =
        positiveInteger(
            configService.get<string>(
                'DB_PACKET_SIZE',
            ),
            4_096,
        );
    const maximumPacketSize =
        encrypt
            ? 16_383
            : 32_767;
    const packetSize =
        requestedPacketSize >= 512 &&
        requestedPacketSize <= maximumPacketSize
            ? requestedPacketSize
            : 4_096;

    return {
        server,
        port:
            Number.isFinite(parsedPort) &&
            parsedPort > 0
                ? parsedPort
                : 1433,
        database,
        user,
        password,
        connectionTimeout:
            positiveInteger(
                configService.get<string>(
                    'DB_CONNECTION_TIMEOUT_MS',
                ),
                15_000,
            ),
        requestTimeout:
            positiveInteger(
                configService.get<string>(
                    'DB_REQUEST_TIMEOUT_MS',
                ),
                120_000,
            ),
        pool: {
            max:
                positiveInteger(
                    configService.get<string>(
                        'DB_POOL_MAX',
                    ),
                    10,
                ),
            min: 0,
            idleTimeoutMillis:
                positiveInteger(
                    configService.get<string>(
                        'DB_POOL_IDLE_TIMEOUT_MS',
                    ),
                    300_000,
                ),
        },
        options: {
            encrypt,
            trustServerCertificate:
                parseBoolean(
                    parameters.get(
                        'trustservercertificate',
                    ),
                    false,
                ),
            packetSize,
            enableArithAbort: true,
        },
    };
}

@Injectable()
export class PrismaService
    extends PrismaClient
    implements
    OnModuleInit,
    OnModuleDestroy {
    private healthTimer:
        ReturnType<typeof setInterval> |
        null = null;

    private reconnectPromise:
        Promise<void> |
        null = null;

    private readonly databaseServer: string;

    private readonly databasePort: number;

    private readonly databaseName?: string;

    private readonly startupMaxAttempts: number;

    private readonly startupRetryDelayMs: number;

    private readonly startupMaxRetryDelayMs: number;

    private readonly reconnectMaxAttempts: number;

    private readonly reconnectRetryDelayMs: number;

    constructor(
        configService:
            ConfigService,
    ) {
        const databaseUrl =
            configService.get<string>(
                'DATABASE_URL',
            );

        if (!databaseUrl) {
            throw new Error(
                'Thiếu biến môi trường DATABASE_URL',
            );
        }

        const adapterConfig =
            buildMssqlConfig(
                databaseUrl,
                configService,
            );

        const startupMaxAttempts =
            boundedPositiveInteger(
                configService.get<string>(
                    'DB_STARTUP_MAX_ATTEMPTS',
                ),
                5,
                1,
                30,
            );

        const startupRetryDelayMs =
            boundedPositiveInteger(
                configService.get<string>(
                    'DB_STARTUP_RETRY_DELAY_MS',
                ),
                2_500,
                250,
                60_000,
            );

        const startupMaxRetryDelayMs =
            boundedPositiveInteger(
                configService.get<string>(
                    'DB_STARTUP_MAX_RETRY_DELAY_MS',
                ),
                10_000,
                startupRetryDelayMs,
                120_000,
            );

        const reconnectMaxAttempts =
            boundedPositiveInteger(
                configService.get<string>(
                    'DB_RECONNECT_MAX_ATTEMPTS',
                ),
                4,
                1,
                20,
            );

        const reconnectRetryDelayMs =
            boundedPositiveInteger(
                configService.get<string>(
                    'DB_RECONNECT_RETRY_DELAY_MS',
                ),
                2_000,
                250,
                60_000,
            );

        const adapter =
            new PrismaMssql(
                adapterConfig as any,
            );

        super({
            adapter,
        });

        this.databaseServer =
            adapterConfig.server;
        this.databasePort =
            adapterConfig.port;
        this.databaseName =
            adapterConfig.database;
        this.startupMaxAttempts =
            startupMaxAttempts;
        this.startupRetryDelayMs =
            startupRetryDelayMs;
        this.startupMaxRetryDelayMs =
            startupMaxRetryDelayMs;
        this.reconnectMaxAttempts =
            reconnectMaxAttempts;
        this.reconnectRetryDelayMs =
            reconnectRetryDelayMs;
    }

    private findErrorCode(
        error: unknown,
        depth = 0,
    ): string {
        if (
            depth > 6 ||
            typeof error !== 'object' ||
            error === null
        ) {
            return '';
        }

        const candidate =
            error as Record<string, unknown>;

        for (const key of [
            'code',
            'originalCode',
        ]) {
            const code =
                candidate[key];

            if (typeof code === 'string') {
                return code.toUpperCase();
            }
        }

        for (const key of [
            'originalError',
            'cause',
            'meta',
            'driverAdapterError',
        ]) {
            const nested =
                this.findErrorCode(
                    candidate[key],
                    depth + 1,
                );

            if (nested) {
                return nested;
            }
        }

        return '';
    }

    private collectErrorMessage(
        error: unknown,
        depth = 0,
    ): string {
        if (
            depth > 5 ||
            typeof error !== 'object' ||
            error === null
        ) {
            return '';
        }

        const candidate =
            error as Record<string, unknown>;

        const ownMessage =
            typeof candidate.message === 'string'
                ? candidate.message
                : '';

        const nested =
            [
                'originalError',
                'cause',
                'meta',
                'driverAdapterError',
            ]
                .map((key) =>
                    this.collectErrorMessage(
                        candidate[key],
                        depth + 1,
                    ),
                )
                .filter(Boolean)
                .join(' ');

        return `${ownMessage} ${nested}`
            .trim()
            .toLowerCase();
    }

    isDatabaseAuthenticationError(
        error: unknown,
    ) {
        const code =
            this.findErrorCode(error);
        const message =
            this.collectErrorMessage(error);

        return [
            'P1000',
            'ELOGIN',
        ].includes(code) ||
            message.includes('login failed') ||
            message.includes('authentication failed');
    }

    isDatabaseUnavailableError(
        error: unknown,
    ) {
        const code =
            this.findErrorCode(error);
        const message =
            this.collectErrorMessage(error);

        return [
            'P1001',
            'P1002',
            'P2024',
            'ETIMEOUT',
            'ECONNREFUSED',
            'ECONNRESET',
            'ECONNCLOSED',
            'ESOCKET',
            'EINVALIDSTATE',
        ].includes(code) ||
            message.includes('failed to connect') ||
            message.includes('connection timeout') ||
            message.includes('connect timeout') ||
            message.includes('connection refused') ||
            message.includes('connection lost') ||
            message.includes('connection closed') ||
            message.includes('loggedin state') ||
            message.includes('final state');
    }

    isRecoverableDriverError(
        error: unknown,
    ) {
        return this.isDatabaseUnavailableError(
            error,
        );
    }

    getDatabaseEndpointLabel() {
        const database =
            this.databaseName
                ? `/${this.databaseName}`
                : '';

        return `${this.databaseServer}:${this.databasePort}${database}`;
    }

    private async resetConnection() {
        try {
            await this.$disconnect();
        } catch {
            // Pool có thể đã ở Final/Closed; bỏ qua để lần sau tạo kết nối mới.
        }
    }

    private retryDelay(
        attempt: number,
        baseDelayMs: number,
        maxDelayMs: number,
    ) {
        return Math.min(
            maxDelayMs,
            baseDelayMs *
                Math.max(
                    1,
                    2 ** (attempt - 1),
                ),
        );
    }

    async probeConnection() {
        await this.$connect();
        await this.$queryRawUnsafe(
            'SELECT 1 AS connection_ok',
        );
    }

    async waitForDatabaseReady(
        options?: {
            maxAttempts?: number;
        },
    ) {
        const maxAttempts =
            options?.maxAttempts ??
            this.startupMaxAttempts;

        let lastError:
            unknown;

        for (
            let attempt = 1;
            attempt <= maxAttempts;
            attempt += 1
        ) {
            try {
                await this.probeConnection();

                if (attempt > 1) {
                    console.log(
                        `SQL Server available after ${attempt} startup attempts: ${this.getDatabaseEndpointLabel()}`,
                    );
                }

                return;
            } catch (error) {
                lastError = error;

                if (
                    this.isDatabaseAuthenticationError(
                        error,
                    )
                ) {
                    const authenticationError =
                        new Error(
                            `Không thể đăng nhập SQL Server ${this.getDatabaseEndpointLabel()}. Kiểm tra user/password trong DATABASE_URL.`,
                        );

                    Object.assign(
                        authenticationError,
                        {
                            code: 'DB_AUTHENTICATION_FAILED',
                            cause: error,
                        },
                    );

                    throw authenticationError;
                }

                if (
                    !this.isDatabaseUnavailableError(
                        error,
                    )
                ) {
                    throw error;
                }

                await this.resetConnection();

                if (attempt >= maxAttempts) {
                    break;
                }

                const delayMs =
                    this.retryDelay(
                        attempt,
                        this.startupRetryDelayMs,
                        this.startupMaxRetryDelayMs,
                    );

                console.warn(
                    `[Database] SQL Server chưa sẵn sàng tại ${this.getDatabaseEndpointLabel()} (lần ${attempt}/${maxAttempts}). Thử lại sau ${delayMs} ms...`,
                );

                await wait(delayMs);
            }
        }

        const unavailableError =
            new Error(
                `Không thể kết nối SQL Server ${this.getDatabaseEndpointLabel()} sau ${maxAttempts} lần thử. Kiểm tra SQL Server service, TCP/IP, cổng trong DATABASE_URL và firewall.`,
            );

        Object.assign(
            unavailableError,
            {
                code: 'DB_UNAVAILABLE',
                cause: lastError,
            },
        );

        throw unavailableError;
    }

    async recoverConnection() {
        if (this.reconnectPromise) {
            return this.reconnectPromise;
        }

        this.reconnectPromise =
            (async () => {
                let lastError:
                    unknown;

                for (
                    let attempt = 1;
                    attempt <= this.reconnectMaxAttempts;
                    attempt += 1
                ) {
                    try {
                        await this.resetConnection();

                        if (attempt > 1) {
                            await wait(
                                this.retryDelay(
                                    attempt - 1,
                                    this.reconnectRetryDelayMs,
                                    15_000,
                                ),
                            );
                        }

                        await this.probeConnection();

                        console.log(
                            `Prisma SQL Server connection recovered (${this.getDatabaseEndpointLabel()})`,
                        );

                        return;
                    } catch (error) {
                        lastError = error;

                        if (
                            this.isDatabaseAuthenticationError(
                                error,
                            ) ||
                            !this.isDatabaseUnavailableError(
                                error,
                            )
                        ) {
                            throw error;
                        }

                        console.error(
                            `SQL Server reconnect attempt ${attempt}/${this.reconnectMaxAttempts} failed`,
                        );
                    }
                }

                const unavailableError =
                    new Error(
                        `Không thể khôi phục kết nối SQL Server ${this.getDatabaseEndpointLabel()}.`,
                    );

                Object.assign(
                    unavailableError,
                    {
                        code: 'DB_UNAVAILABLE',
                        cause: lastError,
                    },
                );

                throw unavailableError;
            })()
                .finally(() => {
                    this.reconnectPromise =
                        null;
                });

        return this.reconnectPromise;
    }

    private async checkConnection() {
        try {
            await this.$queryRawUnsafe(
                'SELECT 1 AS connection_ok',
            );
        } catch (error) {
            if (
                this.isRecoverableDriverError(
                    error,
                )
            ) {
                try {
                    await this.recoverConnection();
                } catch (reconnectError) {
                    console.error(
                        'SQL Server reconnect failed:',
                        reconnectError,
                    );
                }
                return;
            }

            console.error(
                'SQL Server health check failed:',
                error,
            );
        }
    }

    async onModuleInit():
        Promise<void> {
        // main.ts đã chạy startup preflight trước khi mở HTTP port.
        // Lặp lại một probe ngắn ở lifecycle để bắt trường hợp SQL vừa rớt giữa preflight và app.listen().
        await this.waitForDatabaseReady({
            maxAttempts: Math.min(
                2,
                this.startupMaxAttempts,
            ),
        });

        console.log(
            `Prisma connected (${this.getDatabaseEndpointLabel()})`,
        );

        this.healthTimer =
            setInterval(
                () => {
                    void this.checkConnection();
                },
                120_000,
            );

        this.healthTimer.unref?.();
    }

    async onModuleDestroy():
        Promise<void> {
        if (this.healthTimer) {
            clearInterval(
                this.healthTimer,
            );
            this.healthTimer = null;
        }

        await this.$disconnect();
    }
}
