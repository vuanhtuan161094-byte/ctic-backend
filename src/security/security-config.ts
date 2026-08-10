export interface SecurityConfig {
    publicRegistrationEnabled: boolean;
    loginRateLimitWindowMs: number;
    loginRateLimitMaxAttempts: number;
    loginRateLimitMaxAttemptsPerIp: number;
    publicCertificateRateLimitWindowMs: number;
    publicCertificateRateLimitMaxRequests: number;
    rateLimitMaxEntries: number;
    securityHeadersEnabled: boolean;
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
        ].includes(normalized)
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
        ].includes(normalized)
    ) {
        return false;
    }

    return fallback;
}

function positiveInteger(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
) {
    const parsed = Number(value);

    if (
        !Number.isInteger(parsed) ||
        parsed < min ||
        parsed > max
    ) {
        return fallback;
    }

    return parsed;
}

export function getSecurityConfig(
    env: Record<string, string | undefined> =
        process.env,
): SecurityConfig {
    const loginWindowSeconds =
        positiveInteger(
            env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
            15 * 60,
            10,
            24 * 60 * 60,
        );

    const publicCertificateWindowSeconds =
        positiveInteger(
            env.PUBLIC_CERT_RATE_LIMIT_WINDOW_SECONDS,
            60,
            1,
            60 * 60,
        );

    const loginMaxAttempts =
        positiveInteger(
            env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
            10,
            1,
            1000,
        );

    return {
        // Tài khoản nội bộ phải được tạo qua module Quản trị người dùng.
        // Endpoint /auth/register chỉ bật khi quản trị viên chủ động cấu hình.
        publicRegistrationEnabled:
            booleanValue(
                env.PUBLIC_REGISTRATION_ENABLED,
                false,
            ),

        loginRateLimitWindowMs:
            loginWindowSeconds * 1000,

        loginRateLimitMaxAttempts:
            loginMaxAttempts,

        // Chặn một IP quét hàng loạt username khác nhau để né bucket theo tài khoản.
        loginRateLimitMaxAttemptsPerIp:
            positiveInteger(
                env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
                Math.max(
                    50,
                    loginMaxAttempts * 5,
                ),
                1,
                10000,
            ),

        publicCertificateRateLimitWindowMs:
            publicCertificateWindowSeconds * 1000,

        publicCertificateRateLimitMaxRequests:
            positiveInteger(
                env.PUBLIC_CERT_RATE_LIMIT_MAX_REQUESTS,
                120,
                1,
                100000,
            ),

        rateLimitMaxEntries:
            positiveInteger(
                env.RATE_LIMIT_MAX_ENTRIES,
                10000,
                100,
                1000000,
            ),

        securityHeadersEnabled:
            booleanValue(
                env.SECURITY_HEADERS_ENABLED,
                true,
            ),
    };
}


export function validateSecurityEnvironment(
    isProduction: boolean,
    env: Record<string, string | undefined> = process.env,
) {
    const secret =
        env.JWT_SECRET?.trim() ??
        '';

    if (!secret) {
        throw new Error(
            'JWT_SECRET là bắt buộc để ký access token.',
        );
    }

    if (
        isProduction &&
        (
            secret.length < 32 ||
            /CHANGE_THIS|YOUR_SECRET|SECRET_HERE/i.test(
                secret,
            )
        )
    ) {
        throw new Error(
            'JWT_SECRET production phải là chuỗi ngẫu nhiên tối thiểu 32 ký tự và không được dùng giá trị mẫu.',
        );
    }

    const ttl =
        Number(
            env.JWT_ACCESS_TTL_SECONDS ??
            '28800',
        );

    if (
        isProduction &&
        (
            !Number.isInteger(ttl) ||
            ttl < 300 ||
            ttl > 86400
        )
    ) {
        throw new Error(
            'JWT_ACCESS_TTL_SECONDS production phải nằm trong khoảng 300-86400 giây.',
        );
    }
}
