import {
    isAbsolute,
    relative,
    resolve,
} from 'node:path';

import type {
    DeploymentConfig,
} from './deployment-config';

import type {
    SecurityConfig,
} from '../security/security-config';

export interface ProductionReadinessEnvironmentResult {
    warnings: string[];
}

const SUPPORTED_NODE_ENVIRONMENTS = new Set([
    'development',
    'test',
    'production',
]);

const TEST_ONLY_ENVIRONMENT_KEYS = [
    'TEST_DATABASE_URL',
    'P09_CREATE_LOCAL_TEST_DATABASE',
    'P09_RECOVER_FAILED_MIGRATION',
    'P09_RECOVER_CERTIFICATE_LIFECYCLE_MIGRATION',
    'P09_DISABLE_NOTIFICATION_SCHEDULER',
];

function configured(
    env: Record<string, string | undefined>,
    name: string,
) {
    return Boolean(
        env[name]?.trim(),
    );
}

function extractSqlServerDatabaseName(
    databaseUrl: string,
) {
    if (!/^sqlserver:\/\//i.test(databaseUrl)) {
        return '';
    }

    const body = databaseUrl.replace(
        /^sqlserver:\/\//i,
        '',
    );

    for (const part of body.split(';')) {
        const separator = part.indexOf('=');
        if (separator <= 0) {
            continue;
        }

        const key = part
            .slice(0, separator)
            .trim()
            .toLowerCase();

        if (
            key === 'database' ||
            key === 'initial catalog'
        ) {
            return part
                .slice(separator + 1)
                .replace(/^\{(.*)\}$/s, '$1')
                .trim();
        }
    }

    return '';
}

function isInsideDirectory(
    candidate: string,
    parent: string,
) {
    const rel = relative(
        resolve(parent),
        resolve(candidate),
    );

    return (
        rel === '' ||
        (
            !rel.startsWith('..') &&
            !isAbsolute(rel)
        )
    );
}

export function validateRuntimeEnvironment(
    input: {
        deployment: DeploymentConfig;
        security: SecurityConfig;
        env?: Record<string, string | undefined>;
        cwd?: string;
    },
): ProductionReadinessEnvironmentResult {
    const env =
        input.env ??
        process.env;

    const cwd =
        input.cwd ??
        process.cwd();

    const nodeEnv =
        input.deployment.nodeEnv;

    if (
        !SUPPORTED_NODE_ENVIRONMENTS.has(
            nodeEnv,
        )
    ) {
        throw new Error(
            `NODE_ENV không hợp lệ: ${nodeEnv}. Chỉ hỗ trợ development, test hoặc production.`,
        );
    }

    if (!input.deployment.isProduction) {
        return {
            warnings: [],
        };
    }

    const databaseUrl =
        env.DATABASE_URL?.trim() ??
        '';

    if (!databaseUrl) {
        throw new Error(
            'DATABASE_URL là bắt buộc khi NODE_ENV=production.',
        );
    }

    const databaseName =
        extractSqlServerDatabaseName(
            databaseUrl,
        );

    if (
        /_(?:test|ci)$/i.test(
            databaseName,
        )
    ) {
        throw new Error(
            'Production không được khởi động với DATABASE_URL trỏ database _test/_ci.',
        );
    }

    for (const key of TEST_ONLY_ENVIRONMENT_KEYS) {
        if (
            configured(
                env,
                key,
            )
        ) {
            throw new Error(
                `${key} là biến test-only và không được tồn tại khi NODE_ENV=production.`,
            );
        }
    }

    if (
        configured(
            env,
            'MIGRATION_DATABASE_URL',
        )
    ) {
        throw new Error(
            'MIGRATION_DATABASE_URL không được đưa vào tiến trình backend production. Hãy giữ credential migration trong bước deploy/.env.migration riêng.',
        );
    }

    if (
        !input.security.securityHeadersEnabled
    ) {
        throw new Error(
            'SECURITY_HEADERS_ENABLED không được tắt trong production.',
        );
    }

    const storageRoot =
        env.STORAGE_ROOT?.trim() ??
        '';

    if (!storageRoot) {
        throw new Error(
            'STORAGE_ROOT là bắt buộc trong production và phải trỏ tới kho dữ liệu bền vững.',
        );
    }

    if (
        !isAbsolute(
            storageRoot,
        )
    ) {
        throw new Error(
            'STORAGE_ROOT production phải là đường dẫn tuyệt đối, không dùng ./uploads hoặc thư mục tương đối.',
        );
    }

    if (
        isInsideDirectory(
            storageRoot,
            cwd,
        )
    ) {
        throw new Error(
            'STORAGE_ROOT production không được nằm bên trong thư mục deploy/source của ứng dụng.',
        );
    }

    const appVersion =
        env.APP_VERSION?.trim() ??
        '';

    if (!appVersion) {
        throw new Error(
            'APP_VERSION là bắt buộc trong production để release/health có định danh phiên bản rõ ràng.',
        );
    }

    const warnings: string[] = [];

    if (
        input.deployment.publicBaseUrl.startsWith(
            'http://',
        )
    ) {
        warnings.push(
            'PUBLIC_BASE_URL production đang dùng HTTP. Chỉ chấp nhận khi TLS được terminate ở reverse proxy hoặc trong mạng nội bộ đã kiểm soát.',
        );
    }

    if (
        input.deployment.swaggerEnabled
    ) {
        warnings.push(
            'Swagger đang được bật trong production; chỉ nên bật khi endpoint được bảo vệ/giới hạn ở tầng reverse proxy.',
        );
    }

    if (
        input.security.publicRegistrationEnabled
    ) {
        warnings.push(
            'Public registration đang được bật trong production; xác nhận đây là quyết định triển khai có chủ đích.',
        );
    }

    return {
        warnings,
    };
}
