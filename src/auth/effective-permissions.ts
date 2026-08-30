export type PermissionOverrideEffect = 'ALLOW' | 'DENY';

export interface PermissionOverrideInput {
    permission_name: string;
    effect: string;
}

export interface EffectivePermissionProfile {
    base_permissions: string[];
    allow_overrides: string[];
    deny_overrides: string[];
    effective_permissions: string[];
}

function normalizePermission(value: string) {
    return value
        .trim()
        .toLowerCase();
}

export function resolveEffectivePermissionProfile(
    basePermissions: string[],
    overrides: PermissionOverrideInput[],
): EffectivePermissionProfile {
    const base = Array.from(
        new Set(
            basePermissions
                .map(normalizePermission)
                .filter(Boolean),
        ),
    ).sort();

    const allow = Array.from(
        new Set(
            overrides
                .filter(
                    (override) =>
                        override.effect
                            .trim()
                            .toUpperCase() ===
                        'ALLOW',
                )
                .map(
                    (override) =>
                        normalizePermission(
                            override.permission_name,
                        ),
                )
                .filter(Boolean),
        ),
    ).sort();

    const deny = Array.from(
        new Set(
            overrides
                .filter(
                    (override) =>
                        override.effect
                            .trim()
                            .toUpperCase() ===
                        'DENY',
                )
                .map(
                    (override) =>
                        normalizePermission(
                            override.permission_name,
                        ),
                )
                .filter(Boolean),
        ),
    ).sort();

    const effective = new Set([
        ...base,
        ...allow,
    ]);

    for (const permission of deny) {
        effective.delete(permission);
    }

    return {
        base_permissions:
            base,

        allow_overrides:
            allow,

        deny_overrides:
            deny,

        effective_permissions:
            Array.from(
                effective,
            ).sort(),
    };
}
