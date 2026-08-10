import {
    SetMetadata,
} from '@nestjs/common';

export const SECURITY_RATE_LIMIT_KEY =
    'security_rate_limit_profile';

export type SecurityRateLimitProfile =
    'login' |
    'public_certificate';

export const SecurityRateLimit =
    (
        profile: SecurityRateLimitProfile,
    ) =>
        SetMetadata(
            SECURITY_RATE_LIMIT_KEY,
            profile,
        );
