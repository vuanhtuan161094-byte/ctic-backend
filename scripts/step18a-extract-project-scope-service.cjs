const fs = require('node:fs');

const mainPath = 'src/audit-team-appointments/audit-team-appointments.service.ts';
const modulePath = 'src/audit-team-appointments/audit-team-appointments.module.ts';
const servicePath = 'src/audit-team-appointments/audit-team-project-scope.service.ts';
const specPath = 'src/audit-team-appointments/audit-team-project-scope.service.spec.ts';

let source = fs.readFileSync(mainPath, 'utf8');
let moduleSource = fs.readFileSync(modulePath, 'utf8');

if (fs.existsSync(servicePath) || fs.existsSync(specPath)) {
  throw new Error('Project scope extraction target already exists');
}

const interfaceStart = source.indexOf('interface ProjectScopeMemberInput {');
const injectableStart = source.indexOf('\n@Injectable()\n', interfaceStart);
if (interfaceStart < 0 || injectableStart < 0) {
  throw new Error('ProjectScopeMemberInput block not found');
}
source = source.slice(0, interfaceStart) + source.slice(injectableStart + 1);

const importAnchor = "import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';\n";
if (source.split(importAnchor).length - 1 !== 1) throw new Error('Main import anchor mismatch');
source = source.replace(
  importAnchor,
  importAnchor + "import { AuditTeamProjectScopeService } from './audit-team-project-scope.service';\nimport type { ProjectScopeMemberInput } from './audit-team-project-scope.service';\n",
);

const propertyAnchor = '    private readonly programCompetencyService: AuditTeamProgramCompetencyService;\n';
if (source.split(propertyAnchor).length - 1 !== 1) throw new Error('Main property anchor mismatch');
source = source.replace(
  propertyAnchor,
  propertyAnchor + '    private readonly projectScopeService: AuditTeamProjectScopeService;\n',
);

const constructorAnchor = `        @Optional()\n        scheduleConflictService?:\n            AuditTeamScheduleConflictService,\n    ) {\n        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);\n        this.teamReadiness = new AuditTeamReadinessService(prisma);\n        this.programCompetencyService =\n            programCompetencyService ??\n            new AuditTeamProgramCompetencyService(prisma);\n        this.scheduleConflictService =\n            scheduleConflictService ??\n            new AuditTeamScheduleConflictService(prisma);\n    }\n`;
const constructorReplacement = `        @Optional()\n        scheduleConflictService?:\n            AuditTeamScheduleConflictService,\n\n        @Optional()\n        projectScopeService?:\n            AuditTeamProjectScopeService,\n    ) {\n        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);\n        this.teamReadiness = new AuditTeamReadinessService(prisma);\n        this.programCompetencyService =\n            programCompetencyService ??\n            new AuditTeamProgramCompetencyService(prisma);\n        this.scheduleConflictService =\n            scheduleConflictService ??\n            new AuditTeamScheduleConflictService(prisma);\n        this.projectScopeService =\n            projectScopeService ??\n            new AuditTeamProjectScopeService(prisma);\n    }\n`;
if (source.split(constructorAnchor).length - 1 !== 1) throw new Error('Main constructor anchor mismatch');
source = source.replace(constructorAnchor, constructorReplacement);

const blockStart = source.indexOf('    private async resolveMemberScopes(');
const blockEnd = source.indexOf('    private buildMemberCreateData(', blockStart);
if (blockStart < 0 || blockEnd < 0 || blockEnd <= blockStart) {
  throw new Error('Project scope method block not found');
}
const wrappers = `    private async resolveMemberScopes(\n        members: AuditTeamMemberDto[],\n        projectId: string,\n    ): Promise<AuditTeamMemberDto[]> {\n        return this.projectScopeService.resolveMemberScopes(\n            members,\n            projectId,\n        );\n    }\n\n    private async validateProjectScopeUsage(\n        projectId: string,\n        members: ProjectScopeMemberInput[],\n    ) {\n        return this.projectScopeService.validateProjectScopeUsage(\n            projectId,\n            members,\n        );\n    }\n\n`;
source = source.slice(0, blockStart) + wrappers + source.slice(blockEnd);

const moduleImportAnchor = "import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';\n";
if (moduleSource.split(moduleImportAnchor).length - 1 !== 1) throw new Error('Module import anchor mismatch');
moduleSource = moduleSource.replace(
  moduleImportAnchor,
  moduleImportAnchor + "import { AuditTeamProjectScopeService } from './audit-team-project-scope.service';\n",
);
const providerAnchor = '    AuditTeamProgramCompetencyService,\n';
if (moduleSource.split(providerAnchor).length - 1 !== 1) throw new Error('Module provider anchor mismatch');
moduleSource = moduleSource.replace(
  providerAnchor,
  providerAnchor + '    AuditTeamProjectScopeService,\n',
);

const extractedService = `import { BadRequestException, Injectable } from '@nestjs/common';

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
                    \`${'${scope.standard_code}'} · IAF ${'${scope.nace_iaf_mapping.iaf_scope.iaf_code}'} · NACE ${'${scope.isic_nace_mapping.target_code.code}'}\`,
            );
            throw new BadRequestException(
                \`Tổng thể đoàn chưa bao phủ đầy đủ phạm vi đã duyệt: ${'${missingLabels.join(\'; \')}'}\`,
            );
        }
    }
}
`;

const extractedSpec = `import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamProjectScopeService } from './audit-team-project-scope.service';

function approvedScope(id = 'scope-1') {
    return {
        id,
        standard_code: 'ISO 9001:2015',
        scope_description: 'Manufacturing',
        isic_nace_mapping: {
            source_code: { code: '2220', revision: '4', title_vi: null, title_en: 'Manufacture' },
            target_code: { code: '22.20', revision: '2', title_vi: null, title_en: 'Manufacture' },
        },
        nace_iaf_mapping: {
            nace_code: { code: '22.20' },
            iaf_scope: { iaf_code: '14', iaf_name: 'Rubber and plastic products' },
        },
    };
}

describe('AuditTeamProjectScopeService', () => {
    it('returns members unchanged when no project scope ids are selected', async () => {
        const findMany = jest.fn();
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany },
        } as unknown as PrismaService);
        const members = [{
            expert_id: 'expert-1',
            team_role: 'TEAM_LEADER',
            scopes: [],
        }] as any;

        await expect(service.resolveMemberScopes(members, 'project-1')).resolves.toBe(members);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('hydrates approved project-scope classification fields without replacing explicit activity text', async () => {
        const findMany = jest.fn().mockResolvedValue([approvedScope()]);
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany },
        } as unknown as PrismaService);
        const members = [{
            expert_id: 'expert-1',
            team_role: 'TEAM_LEADER',
            scopes: [{
                project_scope_id: 'scope-1',
                iaf_code: null,
                nace_code: null,
                activity_description: 'Assembly',
            }],
        }] as any;

        const result = await service.resolveMemberScopes(members, 'project-1');
        expect(result[0].scopes?.[0]).toEqual(expect.objectContaining({
            project_scope_id: 'scope-1',
            iaf_code: '14',
            nace_code: '22.20',
            activity_description: 'Assembly',
        }));
    });

    it('rejects scopes that are not approved for the project', async () => {
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany: jest.fn().mockResolvedValue([]) },
        } as unknown as PrismaService);
        const members = [{
            expert_id: 'expert-1',
            team_role: 'TEAM_LEADER',
            scopes: [{ project_scope_id: 'scope-missing' }],
        }] as any;

        await expect(service.resolveMemberScopes(members, 'project-1'))
            .rejects.toThrow('Có phạm vi chưa được phê duyệt hoặc không thuộc dự án này');
    });

    it('requires the team to cover every approved project scope', async () => {
        const scopes = [approvedScope('scope-1'), approvedScope('scope-2')];
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany: jest.fn().mockResolvedValue(scopes) },
        } as unknown as PrismaService);

        await expect(service.validateProjectScopeUsage('project-1', [{
            team_role: 'TEAM_LEADER',
            scopes: [{ project_scope_id: 'scope-1' }],
        }])).rejects.toThrow('Tổng thể đoàn chưa bao phủ đầy đủ phạm vi đã duyệt');
    });

    it('accepts full approved project-scope coverage', async () => {
        const scopes = [approvedScope('scope-1'), approvedScope('scope-2')];
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany: jest.fn().mockResolvedValue(scopes) },
        } as unknown as PrismaService);

        await expect(service.validateProjectScopeUsage('project-1', [{
            team_role: 'TEAM_LEADER',
            scopes: [
                { project_scope_id: 'scope-1' },
                { project_scope_id: 'scope-2' },
            ],
        }])).resolves.toBeUndefined();
    });
});
`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(modulePath, moduleSource);
fs.writeFileSync(servicePath, extractedService);
fs.writeFileSync(specPath, extractedSpec);
