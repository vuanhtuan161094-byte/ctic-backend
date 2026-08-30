function redactText(value: string) {
    return value
        .replace(/sqlserver:\/\/[^\s'"`]+/gi, 'sqlserver://<redacted>')
        .replace(/\b(?:password|pwd)\s*=\s*\{?[^;\s}]+\}?/gi, 'password=<redacted>')
        .replace(/\b(?:JWT_SECRET|DATABASE_URL|MIGRATION_DATABASE_URL|TEST_DATABASE_URL)\s*[=:]\s*[^\s,;]+/gi, '$1=<redacted>')
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer <redacted>');
}

export function safeErrorForLog(
    error: unknown,
) {
    if (error instanceof Error) {
        const candidate = error as Error & {
            code?: unknown;
        };

        return {
            name: candidate.name,
            code:
                typeof candidate.code === 'string'
                    ? candidate.code
                    : undefined,
            message: redactText(candidate.message),
            stack:
                candidate.stack
                    ? redactText(candidate.stack)
                    : undefined,
        };
    }

    if (typeof error === 'string') {
        return {
            message: redactText(error),
        };
    }

    return {
        message: 'Non-Error throwable',
    };
}
