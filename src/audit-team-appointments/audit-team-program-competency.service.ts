import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { countsTowardAuditMandays } from './integrated-manday-allocation.engine';
import {
    acceptedCompetencyRoles,
    normalizeCompetencyValue,
    normalizeStandardCode,
} from './audit-team-competency.policy';

export interface ProgramAssignmentMemberInput {
    member_id?: string;
    expert_id: string;
    team_role: string;
    scopes: Array<{
        project_scope_id?: string | null;
    }>;
}

export interface ApprovedProjectProgram {
    key: string;
    standard_code: string;
    management_system: string;
    project_scope_ids: string[];
}

@Injectable()
export class AuditTeamProgramCompetencyService {
    private readonly projectTeamAuditType = 'project_team';

    constructor(private readonly prisma: PrismaService) {}

    private projectProgramKey(
        managementSystem?: string | null,
        standardCode?: string | null,
    ): string {
        return `${normalizeCompetencyValue(managementSystem)}::${normalizeStandardCode(standardCode)}`;
    }

    async getApprovedProjectPrograms(
        projectId: string,
    ): Promise<ApprovedProjectProgram[]> {
        const scopes = await this.prisma.certification_project_scopes.findMany({
            where: {
                project_id: projectId,
                status: 'APPROVED',
            },
            select: {
                id: true,
                standard_code: true,
                management_system: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        });

        if (!scopes.length) {
            throw new BadRequestException(
                'Hồ sơ chưa có tiêu chuẩn/chương trình chứng nhận được phê duyệt',
            );
        }

        const programMap = new Map<string, ApprovedProjectProgram>();
        for (const scope of scopes) {
            const key = this.projectProgramKey(
                scope.management_system,
                scope.standard_code,
            );
            const current = programMap.get(key);
            if (current) {
                current.project_scope_ids.push(scope.id);
                continue;
            }
            programMap.set(key, {
                key,
                standard_code: scope.standard_code,
                management_system: scope.management_system,
                project_scope_ids: [scope.id],
            });
        }
        return [...programMap.values()];
    }

    async evaluatePlanProgramAllocation(
        projectId: string,
        competenceDate: Date,
        members: ProgramAssignmentMemberInput[],
        updateMemberStatus = false,
        inheritProjectTeam = false,
    ) {
        const programs = await this.getApprovedProjectPrograms(projectId);
        const projectAppointment = inheritProjectTeam
            ? await this.prisma.audit_team_appointments.findFirst({
                where: {
                    status: 'issued',
                    audit_plans: {
                        project_id: projectId,
                        audit_type: this.projectTeamAuditType,
                    },
                },
                include: {
                    members: {
                        select: {
                            expert_id: true,
                            team_role: true,
                        },
                    },
                },
                orderBy: {
                    approved_at: 'desc',
                },
            })
            : null;

        if (inheritProjectTeam && !projectAppointment) {
            throw new BadRequestException(
                'Hồ sơ chưa có quyết định chỉ định đoàn cấp hồ sơ đã ban hành',
            );
        }

        const projectTeamRoleByExpertId = new Map<string, string>(
            (projectAppointment?.members ?? []).map((member) => [
                member.expert_id,
                normalizeCompetencyValue(member.team_role),
            ] as const),
        );
        const expertIds = Array.from(new Set(members.map((member) => member.expert_id)));
        const competencies = await this.prisma.expert_competencies.findMany({
            where: {
                expert_id: { in: expertIds },
                approval_status: 'APPROVED',
                effective_date: { lte: competenceDate },
                OR: [
                    { expiry_date: null },
                    { expiry_date: { gte: competenceDate } },
                ],
            },
        });

        const programByScopeId = new Map<string, ApprovedProjectProgram>();
        for (const program of programs) {
            for (const scopeId of program.project_scope_ids) {
                programByScopeId.set(scopeId, program);
            }
        }

        const coveredProgramKeys = new Set<string>();
        const errors: string[] = [];
        let leaderQualified = false;
        const memberResults: Array<{
            member_id?: string;
            expert_id: string;
            status: string;
            note: string;
            qualified_program_keys: string[];
        }> = [];

        for (const member of members) {
            if (inheritProjectTeam) {
                const inheritedRole = projectTeamRoleByExpertId.get(member.expert_id);
                if (!inheritedRole) {
                    errors.push('Có chuyên gia không thuộc đoàn đã được chỉ định ở cấp hồ sơ');
                    memberResults.push({
                        member_id: member.member_id,
                        expert_id: member.expert_id,
                        status: 'not_qualified',
                        note: 'Chuyên gia không thuộc quyết định chỉ định đoàn cấp hồ sơ',
                        qualified_program_keys: [],
                    });
                    continue;
                }
                if (inheritedRole !== normalizeCompetencyValue(member.team_role)) {
                    errors.push('Vai trò thành viên phải giữ nguyên theo quyết định chỉ định đoàn cấp hồ sơ');
                    memberResults.push({
                        member_id: member.member_id,
                        expert_id: member.expert_id,
                        status: 'not_qualified',
                        note: 'Vai trò khác với quyết định chỉ định đoàn cấp hồ sơ',
                        qualified_program_keys: [],
                    });
                    continue;
                }
            }

            const acceptedRoles = acceptedCompetencyRoles(member.team_role);
            if (!acceptedRoles.length) {
                memberResults.push({
                    member_id: member.member_id,
                    expert_id: member.expert_id,
                    status: 'not_required',
                    note: 'Vai trò hỗ trợ, không yêu cầu phân công chương trình đánh giá',
                    qualified_program_keys: [],
                });
                continue;
            }

            const assignedPrograms = Array.from(
                new Map(
                    member.scopes
                        .map((scope) => scope.project_scope_id ? programByScopeId.get(scope.project_scope_id) : undefined)
                        .filter((program): program is ApprovedProjectProgram => Boolean(program))
                        .map((program) => [program.key, program]),
                ).values(),
            );

            if (!assignedPrograms.length) {
                errors.push('Có thành viên chưa được phân công chương trình/tiêu chuẩn đánh giá');
                memberResults.push({
                    member_id: member.member_id,
                    expert_id: member.expert_id,
                    status: 'not_assigned',
                    note: 'Chưa được phân công chương trình/tiêu chuẩn đánh giá',
                    qualified_program_keys: [],
                });
                continue;
            }

            const expertCompetencies = competencies.filter(
                (competency) => competency.expert_id === member.expert_id,
            );
            const qualifiedProgramKeys: string[] = [];
            const failedPrograms: string[] = [];

            for (const program of assignedPrograms) {
                const matched = expertCompetencies.find((competency) =>
                    acceptedRoles.includes(normalizeCompetencyValue(competency.competency_role)) &&
                    normalizeCompetencyValue(competency.management_system) ===
                        normalizeCompetencyValue(program.management_system) &&
                    normalizeStandardCode(competency.standard_code) ===
                        normalizeStandardCode(program.standard_code),
                );

                if (matched) {
                    qualifiedProgramKeys.push(program.key);
                    if (countsTowardAuditMandays(member.team_role)) {
                        coveredProgramKeys.add(program.key);
                    }
                    if (
                        normalizeCompetencyValue(member.team_role) === 'TEAM_LEADER' &&
                        normalizeCompetencyValue(matched.competency_role) === 'LEAD_AUDITOR'
                    ) {
                        leaderQualified = true;
                    }
                } else {
                    failedPrograms.push(program.standard_code);
                }
            }

            const status = failedPrograms.length
                ? qualifiedProgramKeys.length ? 'partially_qualified' : 'not_qualified'
                : 'qualified';
            const note = failedPrograms.length
                ? `Chưa có năng lực chương trình phù hợp: ${failedPrograms.join('; ')}`
                : `Đủ năng lực cho ${qualifiedProgramKeys.length} chương trình/tiêu chuẩn được giao`;

            if (failedPrograms.length) {
                errors.push(note);
            }
            memberResults.push({
                member_id: member.member_id,
                expert_id: member.expert_id,
                status,
                note,
                qualified_program_keys: qualifiedProgramKeys,
            });
        }

        const missingPrograms = programs.filter(
            (program) => !coveredProgramKeys.has(program.key),
        );
        if (missingPrograms.length) {
            errors.push(
                `Chưa phân công đủ chương trình: ${missingPrograms.map((program) => program.standard_code).join('; ')}`,
            );
        }
        if (!leaderQualified) {
            errors.push(
                'Trưởng đoàn phải có năng lực LEAD_AUDITOR phù hợp với ít nhất một chương trình/tiêu chuẩn được giao',
            );
        }

        if (updateMemberStatus) {
            await Promise.all(
                memberResults
                    .filter((result) => result.member_id)
                    .map((result) => this.prisma.audit_team_members.update({
                        where: { id: result.member_id! },
                        data: {
                            competency_status: result.status,
                            competency_note: result.note,
                        },
                    })),
            );
        }

        if (errors.length) {
            throw new BadRequestException(Array.from(new Set(errors)).join('. '));
        }

        return {
            validation_level: 'program',
            is_sufficient: true,
            leader_qualified: leaderQualified,
            required_programs: programs.length,
            covered_programs: coveredProgramKeys.size,
            missing_programs: [],
            members: memberResults,
        };
    }
}
