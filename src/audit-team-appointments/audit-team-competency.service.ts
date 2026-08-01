import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AuditTeamCompetencyCheckResult {
    appointment_id: string;
    appointment_number: string;
    management_system: string;
    standard_code: string;
    is_sufficient: boolean;
    required_members: number;
    qualified_members: number;
    members: Array<{
        member_id: string;
        expert_id: string;
        expert_name: string;
        team_role: string;
        required_competency_role: string | null;
        competency_status: string;
        competency_note: string;
        scopes: Array<{
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

    private normalize(
        value?: string | null,
    ): string {
        return value
            ?.trim()
            .toUpperCase() ?? '';
    }

    private resolveManagementSystem(
        standardName: string,
    ): string {
        const standard =
            this.normalize(
                standardName,
            );

        if (
            standard.includes(
                'ISO 9001',
            )
        ) {
            return 'QMS';
        }

        if (
            standard.includes(
                'ISO 14001',
            )
        ) {
            return 'EMS';
        }

        if (
            standard.includes(
                'ISO 45001',
            )
        ) {
            return 'OHSMS';
        }

        if (
            standard.includes(
                'ISO 27001',
            )
        ) {
            return 'ISMS';
        }

        if (
            standard.includes(
                'ISO 50001',
            )
        ) {
            return 'ENERGY';
        }

        throw new BadRequestException(
            `Chưa cấu hình hệ thống quản lý cho tiêu chuẩn ${standardName}`,
        );
    }

    private resolveRequiredRole(
        teamRole: string,
    ): string | null {
        const role =
            this.normalize(
                teamRole,
            );

        const roleMap:
            Record<string, string> = {
            TEAM_LEADER:
                'LEAD_AUDITOR',

            AUDITOR:
                'AUDITOR',

            TECHNICAL_EXPERT:
                'TECHNICAL_EXPERT',

            WITNESS_EVALUATOR:
                'WITNESS_EVALUATOR',
        };

        return roleMap[role] ?? null;
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
                                    standard_name:
                                        true,
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
                                    id:
                                        true,

                                    full_name:
                                        true,
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

        const standardCode =
            this.normalize(
                appointment
                    .audit_plans
                    .certification_projects
                    .standard_name,
            );

        const managementSystem =
            this.resolveManagementSystem(
                standardCode,
            );

        const memberResults:
            AuditTeamCompetencyCheckResult['members'] = [];

        for (
            const member
            of appointment.members
        ) {
            const requiredRole =
                this.resolveRequiredRole(
                    member.team_role,
                );

            if (!requiredRole) {
                const note =
                    'Vai trò này không yêu cầu năng lực độc lập để phát hành F.04';

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

            const competencies =
                await this.prisma.expert_competencies.findMany({
                    where: {
                        expert_id:
                            member.expert_id,

                        management_system:
                            managementSystem,

                        standard_code:
                            standardCode,

                        competency_role:
                            requiredRole,

                        approval_status:
                            'APPROVED',

                        effective_date: {
                            lte:
                                member.planned_start_date,
                        },

                        OR: [
                            {
                                expiry_date:
                                    null,
                            },
                            {
                                expiry_date: {
                                    gte:
                                        member.planned_end_date,
                                },
                            },
                        ],
                    },
                });

            const scopeResults =
                member.scopes.map(
                    (scope) => {
                        const iafCode =
                            this.normalize(
                                scope.iaf_code,
                            );

                        const naceCode =
                            this.normalize(
                                scope.nace_code,
                            );

                        const matchedCompetency =
                            competencies.find(
                                (
                                    competency,
                                ) => {
                                    const iafMatches =
                                        !iafCode ||
                                        this.normalize(
                                            competency.iaf_code,
                                        ) ===
                                        iafCode;

                                    const naceMatches =
                                        !naceCode ||
                                        (
                                            this.normalize(
                                                competency.scope_level,
                                            ) ===
                                            'NACE' &&
                                            this.normalize(
                                                competency.nace_code,
                                            ) ===
                                            naceCode
                                        );

                                    return (
                                        iafMatches &&
                                        naceMatches
                                    );
                                },
                            );

                        return {
                            iaf_code:
                                scope.iaf_code,

                            nace_code:
                                scope.nace_code,

                            qualified:
                                Boolean(
                                    matchedCompetency,
                                ),

                            competency_id:
                                matchedCompetency
                                    ?.id ?? null,
                        };
                    },
                );

            const qualifiedScopeCount =
                scopeResults.filter(
                    (scope) =>
                        scope.qualified,
                ).length;

            let competencyStatus:
                string;

            if (
                scopeResults.length ===
                0
            ) {
                competencyStatus =
                    'not_qualified';
            } else if (
                qualifiedScopeCount ===
                scopeResults.length
            ) {
                competencyStatus =
                    'qualified';
            } else if (
                qualifiedScopeCount >
                0
            ) {
                competencyStatus =
                    'partially_qualified';
            } else {
                competencyStatus =
                    'not_qualified';
            }

            const failedScopes =
                scopeResults.filter(
                    (scope) =>
                        !scope.qualified,
                );

            const competencyNote =
                competencyStatus ===
                    'qualified'
                    ? `Đủ năng lực ${requiredRole} cho ${standardCode}`
                    : scopeResults.length ===
                        0
                        ? 'Chưa phân công phạm vi IAF/NACE cho chuyên gia'
                        : `Chưa đủ năng lực cho: ${failedScopes
                            .map(
                                (scope) =>
                                    `IAF ${scope.iaf_code ?? '-'}, NACE ${scope.nace_code ?? '-'}`,
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
                    requiredRole,

                competency_status:
                    competencyStatus,

                competency_note:
                    competencyNote,

                scopes:
                    scopeResults,
            });
        }

        const requiredMembers =
            memberResults.filter(
                (member) =>
                    member.required_competency_role !==
                    null,
            );

        const qualifiedMembers =
            requiredMembers.filter(
                (member) =>
                    member.competency_status ===
                    'qualified',
            );

        const qualifiedTeamLeaders =
            memberResults.filter(
                (member) =>
                    this.normalize(
                        member.team_role,
                    ) ===
                    'TEAM_LEADER' &&
                    member.competency_status ===
                    'qualified',
            ).length;

        const isSufficient =
            requiredMembers.length >
            0 &&
            qualifiedMembers.length ===
            requiredMembers.length &&
            qualifiedTeamLeaders ===
            1;

        return {
            appointment_id:
                appointment.id,

            appointment_number:
                appointment.appointment_number,

            management_system:
                managementSystem,

            standard_code:
                standardCode,

            is_sufficient:
                isSufficient,

            required_members:
                requiredMembers.length,

            qualified_members:
                qualifiedMembers.length,

            members:
                memberResults,
        };
    }
}