import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
    acceptedCompetencyRoles,
    normalizeCompetencyValue,
    normalizeStandardCode,
} from './audit-team-competency.policy';

export interface AuditTeamCompetencyCheckResult {
    appointment_id: string;
    appointment_number: string;
    management_system: string;
    standard_code: string;
    is_sufficient: boolean;
    required_members: number;
    qualified_members: number;
    required_scopes: number;
    covered_scopes: number;
    leader_qualified: boolean;
    missing_scopes: Array<{
        project_scope_id: string;
        standard_code: string;
        management_system: string;
        iaf_code: string | null;
        nace_code: string | null;
    }>;
    members: Array<{
        member_id: string;
        expert_id: string;
        expert_name: string;
        team_role: string;
        required_competency_role: string | null;
        competency_status: string;
        competency_note: string;
        scopes: Array<{
            project_scope_id?: string | null;
            standard_code?: string | null;
            management_system?: string | null;
            iaf_code: string | null;
            nace_code: string | null;
            qualified: boolean;
            competency_id: string | null;
        }>;
    }>;
}

@Injectable()
export class AuditTeamCompetencyService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private competencyMatchesScope(
        competency: {
            management_system: string;
            standard_code: string;
            competency_role: string;
            scope_level: string;
            iaf_code: string;
            nace_code: string | null;
        },
        projectScope: {
            management_system: string;
            standard_code: string;
            isic_nace_mapping: {
                target_code: {
                    code: string;
                };
            };
            nace_iaf_mapping: {
                iaf_scope: {
                    iaf_code: string;
                };
            };
        },
        acceptedRoles?: string[],
    ) {
        const roleMatches =
            !acceptedRoles ||
            acceptedRoles.includes(
                normalizeCompetencyValue(
                    competency.competency_role,
                ),
            );

        const managementSystemMatches =
            normalizeCompetencyValue(
                competency.management_system,
            ) ===
            normalizeCompetencyValue(
                projectScope.management_system,
            );

        const standardMatches =
            normalizeCompetencyValue(
                competency.standard_code,
            ) ===
            normalizeCompetencyValue(
                projectScope.standard_code,
            );

        const iafMatches =
            normalizeCompetencyValue(
                competency.iaf_code,
            ) ===
            normalizeCompetencyValue(
                projectScope
                    .nace_iaf_mapping
                    .iaf_scope
                    .iaf_code,
            );

        const naceMatches =
            normalizeCompetencyValue(
                competency.scope_level,
            ) !== 'NACE' ||
            normalizeCompetencyValue(
                competency.nace_code,
            ) ===
            normalizeCompetencyValue(
                projectScope
                    .isic_nace_mapping
                    .target_code
                    .code,
            );

        return (
            roleMatches &&
            managementSystemMatches &&
            standardMatches &&
            iafMatches &&
            naceMatches
        );
    }

    private projectScopeLabel(
        projectScope: {
            standard_code: string;
            isic_nace_mapping: {
                target_code: {
                    code: string;
                };
            };
            nace_iaf_mapping: {
                iaf_scope: {
                    iaf_code: string;
                };
            };
        },
    ) {
        return `${projectScope.standard_code} · IAF ${projectScope.nace_iaf_mapping.iaf_scope.iaf_code} · NACE ${projectScope.isic_nace_mapping.target_code.code}`;
    }

    async getProjectExpertSuitability(
        projectId: string,
    ) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id:
                        projectId,
                },
                select: {
                    id: true,
                    project_code: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ chứng nhận',
            );
        }

        const projectScopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    project_id:
                        projectId,
                    status:
                        'APPROVED',
                },
                include: {
                    isic_nace_mapping: {
                        include: {
                            target_code:
                                true,
                        },
                    },
                    nace_iaf_mapping: {
                        include: {
                            iaf_scope:
                                true,
                        },
                    },
                },
                orderBy: {
                    created_at:
                        'asc',
                },
            });

        const today =
            new Date();

        const experts =
            await this.prisma.experts.findMany({
                where: {
                    status:
                        'active',
                },
                include: {
                    competencies: {
                        where: {
                            approval_status:
                                'APPROVED',
                            effective_date: {
                                lte:
                                    today,
                            },
                            OR: [
                                {
                                    expiry_date:
                                        null,
                                },
                                {
                                    expiry_date: {
                                        gte:
                                            today,
                                    },
                                },
                            ],
                        },
                    },
                },
            });

        const options =
            experts.map(
                (expert) => {
                    const coveredScopes =
                        projectScopes.filter(
                            (scope) =>
                                expert.competencies.some(
                                    (competency) =>
                                        this.competencyMatchesScope(
                                            competency,
                                            scope,
                                            [
                                                'LEAD_AUDITOR',
                                                'AUDITOR',
                                                'TECHNICAL_EXPERT',
                                                'WITNESS_EVALUATOR',
                                            ],
                                        ),
                                ),
                        );

                    const leadScopes =
                        projectScopes.filter(
                            (scope) =>
                                expert.competencies.some(
                                    (competency) =>
                                        this.competencyMatchesScope(
                                            competency,
                                            scope,
                                            [
                                                'LEAD_AUDITOR',
                                            ],
                                        ),
                                ),
                        );

                    return {
                        expert_id:
                            expert.id,
                        full_name:
                            expert.full_name,
                        email:
                            expert.email,
                        employee_code:
                            expert.employee_code,
                        is_relevant:
                            coveredScopes.length > 0,
                        can_lead:
                            leadScopes.length > 0,
                        covered_scope_ids:
                            coveredScopes.map(
                                (scope) =>
                                    scope.id,
                            ),
                        covered_standards:
                            Array.from(
                                new Set(
                                    coveredScopes.map(
                                        (scope) =>
                                            scope.standard_code,
                                    ),
                                ),
                            ),
                        covered_scope_labels:
                            coveredScopes.map(
                                (scope) =>
                                    this.projectScopeLabel(
                                        scope,
                                    ),
                            ),
                        coverage_count:
                            coveredScopes.length,
                        required_scope_count:
                            projectScopes.length,
                    };
                },
            )
                .sort(
                    (
                        left,
                        right,
                    ) =>
                        Number(
                            right.is_relevant,
                        ) -
                        Number(
                            left.is_relevant,
                        ) ||
                        right.coverage_count -
                        left.coverage_count ||
                        left.full_name.localeCompare(
                            right.full_name,
                            'vi',
                        ),
                );

        return {
            project_id:
                project.id,
            project_code:
                project.project_code,
            required_scope_count:
                projectScopes.length,
            experts:
                options,
        };
    }

    async checkAppointment(
        appointmentId: string,
    ): Promise<AuditTeamCompetencyCheckResult> {
        const appointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    id:
                        appointmentId,
                },
                include: {
                    audit_plans: {
                        include: {
                            certification_projects: {
                                select: {
                                    id: true,
                                    standard_name: true,
                                },
                            },
                        },
                    },
                    members: {
                        orderBy: {
                            created_at:
                                'asc',
                        },
                        include: {
                            experts: {
                                select: {
                                    id: true,
                                    full_name: true,
                                },
                            },
                            scopes:
                                true,
                        },
                    },
                },
            });

        if (!appointment) {
            throw new NotFoundException(
                'Không tìm thấy quyết định chỉ định đoàn đánh giá',
            );
        }

        const projectId =
            appointment.audit_plans.project_id;

        const projectScopes =
            await this.prisma.certification_project_scopes.findMany({
                where: {
                    project_id:
                        projectId,
                    status:
                        'APPROVED',
                },
                include: {
                    isic_nace_mapping: {
                        include: {
                            target_code:
                                true,
                        },
                    },
                    nace_iaf_mapping: {
                        include: {
                            iaf_scope:
                                true,
                        },
                    },
                },
            });

        if (!projectScopes.length) {
            throw new BadRequestException(
                'Hồ sơ chưa có phạm vi ISIC/NACE/IAF được phê duyệt',
            );
        }

        const expertIds =
            appointment.members.map(
                (member) =>
                    member.expert_id,
            );

        const competencies =
            await this.prisma.expert_competencies.findMany({
                where: {
                    expert_id: {
                        in:
                            expertIds,
                    },
                    approval_status:
                        'APPROVED',
                    effective_date: {
                        lte:
                            appointment.appointment_date,
                    },
                    OR: [
                        {
                            expiry_date:
                                null,
                        },
                        {
                            expiry_date: {
                                gte:
                                    appointment.appointment_date,
                            },
                        },
                    ],
                },
            });

        const projectScopeMap =
            new Map(
                projectScopes.map(
                    (scope) => [
                        scope.id,
                        scope,
                    ],
                ),
            );

        const memberResults:
            AuditTeamCompetencyCheckResult['members'] = [];

        const memberCoverage =
            new Map<string, Set<string>>();

        for (const member of appointment.members) {
            const acceptedRoles =
                acceptedCompetencyRoles(
                    member.team_role,
                );

            if (!acceptedRoles.length) {
                const note =
                    'Vai trò hỗ trợ, không dùng để xác nhận năng lực phạm vi của đoàn';

                await this.prisma.audit_team_members.update({
                    where: {
                        id:
                            member.id,
                    },
                    data: {
                        competency_status:
                            'not_required',
                        competency_note:
                            note,
                    },
                });

                memberResults.push({
                    member_id:
                        member.id,
                    expert_id:
                        member.expert_id,
                    expert_name:
                        member.experts.full_name,
                    team_role:
                        member.team_role,
                    required_competency_role:
                        null,
                    competency_status:
                        'not_required',
                    competency_note:
                        note,
                    scopes:
                        [],
                });

                continue;
            }

            const expertCompetencies =
                competencies.filter(
                    (competency) =>
                        competency.expert_id ===
                        member.expert_id,
                );

            const assignedProjectScopes =
                member.scopes.flatMap(
                    (memberScope) => {
                        if (
                            memberScope.project_scope_id &&
                            projectScopeMap.has(
                                memberScope.project_scope_id,
                            )
                        ) {
                            return [
                                projectScopeMap.get(
                                    memberScope.project_scope_id,
                                )!,
                            ];
                        }

                        return projectScopes.filter(
                            (projectScope) =>
                                normalizeCompetencyValue(
                                    projectScope
                                        .nace_iaf_mapping
                                        .iaf_scope
                                        .iaf_code,
                                ) ===
                                normalizeCompetencyValue(
                                    memberScope.iaf_code,
                                ) &&
                                normalizeCompetencyValue(
                                    projectScope
                                        .isic_nace_mapping
                                        .target_code
                                        .code,
                                ) ===
                                normalizeCompetencyValue(
                                    memberScope.nace_code,
                                ),
                        );
                    },
                );

            const uniqueAssignedScopes =
                Array.from(
                    new Map(
                        assignedProjectScopes.map(
                            (scope) => [
                                scope.id,
                                scope,
                            ],
                        ),
                    ).values(),
                );

            const scopeResults =
                uniqueAssignedScopes.map(
                    (projectScope) => {
                        const matchedCompetency =
                            expertCompetencies.find(
                                (competency) =>
                                    this.competencyMatchesScope(
                                        competency,
                                        projectScope,
                                        acceptedRoles,
                                    ),
                            );

                        if (matchedCompetency) {
                            const current =
                                memberCoverage.get(
                                    projectScope.id,
                                ) ??
                                new Set<string>();

                            current.add(
                                member.id,
                            );

                            memberCoverage.set(
                                projectScope.id,
                                current,
                            );
                        }

                        return {
                            project_scope_id:
                                projectScope.id,
                            standard_code:
                                projectScope.standard_code,
                            management_system:
                                projectScope.management_system,
                            iaf_code:
                                projectScope
                                    .nace_iaf_mapping
                                    .iaf_scope
                                    .iaf_code,
                            nace_code:
                                projectScope
                                    .isic_nace_mapping
                                    .target_code
                                    .code,
                            qualified:
                                Boolean(
                                    matchedCompetency,
                                ),
                            competency_id:
                                matchedCompetency
                                    ?.id ??
                                null,
                        };
                    },
                );

            const qualifiedScopeCount =
                scopeResults.filter(
                    (scope) =>
                        scope.qualified,
                ).length;

            const competencyStatus =
                scopeResults.length === 0
                    ? 'not_assigned'
                    : qualifiedScopeCount ===
                        scopeResults.length
                        ? 'qualified'
                        : qualifiedScopeCount > 0
                            ? 'partially_qualified'
                            : 'not_qualified';

            const failedScopes =
                scopeResults.filter(
                    (scope) =>
                        !scope.qualified,
                );

            const competencyNote =
                competencyStatus ===
                    'qualified'
                    ? `Đủ năng lực cho ${qualifiedScopeCount} phạm vi được giao`
                    : competencyStatus ===
                        'not_assigned'
                        ? 'Chưa giao phạm vi cho thành viên; hệ thống đánh giá theo độ bao phủ tổng thể của đoàn'
                        : `Chưa phù hợp với phạm vi được giao: ${failedScopes
                            .map(
                                (scope) =>
                                    `${scope.standard_code} · IAF ${scope.iaf_code ?? '-'} · NACE ${scope.nace_code ?? '-'}`,
                            )
                            .join('; ')}`;

            await this.prisma.audit_team_members.update({
                where: {
                    id:
                        member.id,
                },
                data: {
                    competency_status:
                        competencyStatus,
                    competency_note:
                        competencyNote,
                },
            });

            memberResults.push({
                member_id:
                    member.id,
                expert_id:
                    member.expert_id,
                expert_name:
                    member.experts.full_name,
                team_role:
                    member.team_role,
                required_competency_role:
                    acceptedRoles.join('/'),
                competency_status:
                    competencyStatus,
                competency_note:
                    competencyNote,
                scopes:
                    scopeResults,
            });
        }

        const teamLeader =
            appointment.members.find(
                (member) =>
                    normalizeCompetencyValue(
                        member.team_role,
                    ) ===
                    'TEAM_LEADER',
            );

        const leaderQualified =
            Boolean(
                teamLeader &&
                projectScopes.some(
                    (projectScope) =>
                        competencies.some(
                            (competency) =>
                                competency.expert_id ===
                                teamLeader.expert_id &&
                                this.competencyMatchesScope(
                                    competency,
                                    projectScope,
                                    [
                                        'LEAD_AUDITOR',
                                    ],
                                ),
                        ),
                ),
            );

        const missingProjectScopes =
            projectScopes.filter(
                (projectScope) =>
                    !(memberCoverage.get(
                        projectScope.id,
                    )?.size),
            );

        return {
            appointment_id:
                appointment.id,
            appointment_number:
                appointment.appointment_number,
            management_system:
                Array.from(
                    new Set(
                        projectScopes.map(
                            (scope) =>
                                scope.management_system,
                        ),
                    ),
                ).join(' + '),
            standard_code:
                Array.from(
                    new Set(
                        projectScopes.map(
                            (scope) =>
                                scope.standard_code,
                        ),
                    ),
                ).join(' + '),
            is_sufficient:
                leaderQualified &&
                missingProjectScopes.length ===
                0,
            required_members:
                projectScopes.length,
            qualified_members:
                projectScopes.length -
                missingProjectScopes.length,
            required_scopes:
                projectScopes.length,
            covered_scopes:
                projectScopes.length -
                missingProjectScopes.length,
            leader_qualified:
                leaderQualified,
            missing_scopes:
                missingProjectScopes.map(
                    (scope) => ({
                        project_scope_id:
                            scope.id,
                        standard_code:
                            scope.standard_code,
                        management_system:
                            scope.management_system,
                        iaf_code:
                            scope
                                .nace_iaf_mapping
                                .iaf_scope
                                .iaf_code,
                        nace_code:
                            scope
                                .isic_nace_mapping
                                .target_code
                                .code,
                    }),
                ),
            members:
                memberResults,
        };
    }
}
