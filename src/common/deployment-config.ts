export type TrustProxyValue =
    boolean |
    number |
    string;

export interface DeploymentConfig {
    nodeEnv: string;
    isProduction: boolean;
    host: string;
    port: number;
    publicBaseUrl: string;
    corsOrigins: string[];
    allowPrivateNetworkOrigins: boolean;
    trustProxy: TrustProxyValue;
    swaggerEnabled: boolean;
}

function booleanValue(
    value: string | undefined,
    fallback: boolean,
) {
    if (!value) {
        return fallback;
    }

    const normalized =
        value.trim().toLowerCase();

    if (
        [
            '1',
            'true',
            'yes',
            'y',
            'on',
        ].includes(
            normalized,
        )
    ) {
        return true;
    }

    if (
        [
            '0',
            'false',
            'no',
            'n',
            'off',
        ].includes(
            normalized,
        )
    ) {
        return false;
    }

    return fallback;
}

function positivePort(
    value: string | undefined,
    fallback: number,
) {
    const parsed =
        Number(value);

    if (
        !Number.isInteger(
            parsed,
        ) ||
        parsed <= 0 ||
        parsed > 65535
    ) {
        return fallback;
    }

    return parsed;
}

function normalizeHttpBaseUrl(
    value: string,
    variableName: string,
) {
    let url: URL;

    try {
        url = new URL(
            value,
        );
    } catch {
        throw new Error(
            `${variableName} phải là URL hợp lệ, ví dụ https://api.example.com`,
        );
    }

    if (
        ![
            'http:',
            'https:',
        ].includes(
            url.protocol,
        )
    ) {
        throw new Error(
            `${variableName} chỉ hỗ trợ http:// hoặc https://`,
        );
    }

    url.pathname =
        url.pathname.replace(
            /\/+$/,
            '',
        );

    url.search = '';
    url.hash = '';

    return url
        .toString()
        .replace(
            /\/+$/,
            '',
        );
}

function normalizeOrigin(
    value: string,
) {
    const url =
        new URL(
            value,
        );

    if (
        ![
            'http:',
            'https:',
        ].includes(
            url.protocol,
        )
    ) {
        throw new Error(
            `CORS origin chỉ hỗ trợ http/https: ${value}`,
        );
    }

    return url.origin;
}

function parseCorsOrigins(
    raw: string | undefined,
) {
    if (!raw?.trim()) {
        return [];
    }

    const origins =
        raw
            .split(',')
            .map(
                (value) =>
                    value.trim(),
            )
            .filter(Boolean);

    if (
        origins.includes(
            '*',
        )
    ) {
        throw new Error(
            'CORS_ORIGINS không được dùng "*" khi credentials=true. Hãy khai báo từng origin cụ thể.',
        );
    }

    return Array.from(
        new Set(
            origins.map(
                (origin) =>
                    normalizeOrigin(
                        origin,
                    ),
            ),
        ),
    );
}

function parseTrustProxy(
    raw: string | undefined,
): TrustProxyValue {
    const value =
        raw?.trim();

    if (!value) {
        return false;
    }

    if (
        value.toLowerCase() ===
        'true'
    ) {
        return true;
    }

    if (
        value.toLowerCase() ===
        'false'
    ) {
        return false;
    }

    if (
        /^\d+$/.test(
            value,
        )
    ) {
        return Number(
            value,
        );
    }

    return value;
}

export function isPrivateNetworkOrigin(
    origin: string,
) {
    try {
        const url =
            new URL(
                origin,
            );

        const hostname =
            url.hostname
                .toLowerCase();

        if (
            hostname ===
                'localhost' ||
            hostname ===
                '127.0.0.1' ||
            hostname ===
                '::1'
        ) {
            return true;
        }

        if (
            /^10(?:\.\d{1,3}){3}$/.test(
                hostname,
            ) ||
            /^192\.168(?:\.\d{1,3}){2}$/.test(
                hostname,
            ) ||
            /^172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(
                hostname,
            )
        ) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

export function getDeploymentConfig(
    env: Record<string, string | undefined> =
        process.env,
): DeploymentConfig {
    const nodeEnv =
        env.NODE_ENV?.trim() ||
        'development';

    const isProduction =
        nodeEnv ===
        'production';

    const port =
        positivePort(
            env.PORT,
            3000,
        );

    const host =
        env.HOST?.trim() ||
        '0.0.0.0';

    const configuredPublicBaseUrl =
        env.PUBLIC_BASE_URL?.trim() ||
        env.PUBLIC_API_BASE_URL?.trim();

    if (
        isProduction &&
        !configuredPublicBaseUrl
    ) {
        throw new Error(
            'PUBLIC_BASE_URL là bắt buộc khi NODE_ENV=production để QR/link công khai không trỏ nhầm localhost.',
        );
    }

    const publicBaseUrl =
        normalizeHttpBaseUrl(
            configuredPublicBaseUrl ||
                `http://localhost:${port}`,
            'PUBLIC_BASE_URL',
        );

    if (
        isProduction &&
        [
            'localhost',
            '127.0.0.1',
            '::1',
        ].includes(
            new URL(
                publicBaseUrl,
            ).hostname,
        )
    ) {
        throw new Error(
            'PUBLIC_BASE_URL không được trỏ localhost khi NODE_ENV=production.',
        );
    }

    const corsOrigins =
        parseCorsOrigins(
            env.CORS_ORIGINS,
        );

    const frontendBaseUrl =
        env.FRONTEND_BASE_URL?.trim();

    if (frontendBaseUrl) {
        corsOrigins.push(
            normalizeOrigin(
                frontendBaseUrl,
            ),
        );
    }

    // Same-origin deployment vẫn hoạt động ngay cả khi người quản trị không khai báo CORS_ORIGINS.
    corsOrigins.push(
        new URL(
            publicBaseUrl,
        ).origin,
    );

    const uniqueCorsOrigins =
        Array.from(
            new Set(
                corsOrigins,
            ),
        );

    const allowPrivateNetworkOrigins =
        booleanValue(
            env.CORS_ALLOW_PRIVATE_NETWORK,
            !isProduction,
        );

    const swaggerEnabled =
        booleanValue(
            env.SWAGGER_ENABLED,
            !isProduction,
        );

    return {
        nodeEnv,
        isProduction,
        host,
        port,
        publicBaseUrl,
        corsOrigins:
            uniqueCorsOrigins,
        allowPrivateNetworkOrigins,
        trustProxy:
            parseTrustProxy(
                env.TRUST_PROXY,
            ),
        swaggerEnabled,
    };
}

export function isCorsOriginAllowed(
    origin: string | undefined,
    config: DeploymentConfig,
) {
    if (!origin) {
        return true;
    }

    let normalizedOrigin:
        string;

    try {
        normalizedOrigin =
            new URL(
                origin,
            ).origin;
    } catch {
        return false;
    }

    if (
        config.corsOrigins.includes(
            normalizedOrigin,
        )
    ) {
        return true;
    }

    return (
        config.allowPrivateNetworkOrigins &&
        isPrivateNetworkOrigin(
            normalizedOrigin,
        )
    );
}
