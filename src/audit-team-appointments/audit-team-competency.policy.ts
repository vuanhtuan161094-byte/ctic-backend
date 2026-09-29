const COMPETENCY_ROLES_BY_TEAM_ROLE: Readonly<Record<string, readonly string[]>> = {
    TEAM_LEADER: ['LEAD_AUDITOR'],
    AUDITOR: ['AUDITOR', 'LEAD_AUDITOR'],
    TECHNICAL_EXPERT: ['TECHNICAL_EXPERT'],
    WITNESS_EVALUATOR: ['WITNESS_EVALUATOR', 'LEAD_AUDITOR', 'AUDITOR'],
};

export function normalizeCompetencyValue(
    value?: string | null,
): string {
    return value
        ?.trim()
        .toUpperCase() ?? '';
}

export function normalizeStandardCode(
    value?: string | null,
): string {
    return normalizeCompetencyValue(value)
        .replace(/[^A-Z0-9]/g, '');
}

export function acceptedCompetencyRoles(
    teamRole: string,
): string[] {
    const normalizedRole = normalizeCompetencyValue(teamRole);
    return [...(COMPETENCY_ROLES_BY_TEAM_ROLE[normalizedRole] ?? [])];
}
