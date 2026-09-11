import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamMemberDto } from './dto/create-audit-team-appointment.dto';

export interface ProjectScopeMemberInput {
    team_role: string;
    scopes: Array<{
        project_scope_id: string | null;
    }>;
}

@Injectable()
export class AuditTeamProjectScopeService {
    constructor(private readonly prisma: PrismaService) {}

    async resolveMemberScopes(
        members: AuditTeamMemberDto[],
        projectId: string,
    ): Promise<AuditTeamMemberDto[]> {
        const projectScopeIds = Array.from(
            new Set(
                members.flatMap(
                    (member) =>
                        member.scopes
                            ?.map((scope) => scope.project_scope_id)
                            .filter((id): id is string => Boolean(id)) ?? [],
                ),
            ),
        );

        if (projectScopeIds.length === 0) {
            return members;
        }

        const projectScopes = await this.prisma.certification_project_scopes.findMany({
            where: {
                id: { in: projectScopeIds },
                project_id: projectId,
                status: 'APPROVED',
            },
            include: {
                isic_nace_mapping: {
                    include: {
                        source_code: true,
                        target_code: true,
                    },
                },
                nace_iaf_mapping: {
                    include: {
                        nace_code: true,
                        iaf_scope: true,
                    },
                },
            },
        });

        if (projectScopes.length !== projectScopeIds.length) {
            throw new BadRequestException(
                'Có phạm vi chưa được phê duyệt hoặc không thuộc dự án này',
            );
        }

        const projectScopeMap = new Map(
            projectScopes.map((scope) => [scope.id, scope]),
        );

        return members.map((member) => ({
            ...member,
            scopes:
                member.scopes?.map((scope) => {
                    if (!scope.project_scope_id) {
                        return scope;
                    }

                    const projectScope = projectScopeMap.get(scope.project_scope_id);
                    if (!projectScope) {
                        throw new BadRequestException(
                            'Không tìm thấy phạm vi dự án đã được phê duyệt',
                        );
                    }

                    return {
                        ...scope,
                        iaf_code: projectScope.nace_iaf_mapping.iaf_scope.iaf_code,
                        nace_code: projectScope.isic_nace_mapping.target_code.code,
                        activity_description:
                            scope.activity_description?.trim() ||
                            projectScope.scope_description,
                    };
                }) ?? [],
        }));
    }

    async validateProjectScopeUsage(
        projectId: string,
        members: ProjectScopeMemberInput[],
    ): Promise<void> {
        const approvedScopes = await this.prisma.certification_project_scopes.findMany({
            where: {
                project_id: projectId,
                status: 'APPROVED',
            },
            include: {
                isic_nace_mapping: {
                    include: {
                        target_code: true,
                    },
                },
                nace_iaf_mapping: {
                    include: {
                        iaf_scope: true,
                    },
                },
            },
        });

        if (approvedScopes.length === 0) {
            throw new BadRequestException(
                'Dự án chưa có phạm vi ISIC/NACE/IAF được phê duyệt',
            );
        }

        const approvedScopeIds = new Set(approvedScopes.map((scope) => scope.id));
        const selectedScopeIds = new Set(
            members.flatMap((member) =>
                member.scopes
                    .map((scope) => scope.project_scope_id)
                    .filter((scopeId): scopeId is string => Boolean(scopeId)),
            ),
        );

        const invalidScopeId = [...selectedScopeIds].find(
            (scopeId) => !approvedScopeIds.has(scopeId),
        );
        if (invalidScopeId) {
            throw new BadRequestException(
                'Có phạm vi phân công không thuộc danh sách phạm vi đã duyệt của hồ sơ',
            );
        }

        const missingScopes = approvedScopes.filter(
            (scope) => !selectedScopeIds.has(scope.id),
        );
        if (missingScopes.length) {
            const missingLabels = missingScopes.map(
                (scope) =>
                    `${scope.standard_code} · IAF ${scope.nace_iaf_mapping.iaf_scope.iaf_code} · NACE ${scope.isic_nace_mapping.target_code.code}`,
            );
            throw new BadRequestException(
                `Tổng thể đoàn chưa bao phủ đầy đủ phạm vi đã duyệt: ${missingLabels.join('; ')}`,
            );
        }
    }
}
