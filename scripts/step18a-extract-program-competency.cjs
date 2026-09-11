const fs = require('node:fs');

const mainPath = 'src/audit-team-appointments/audit-team-appointments.service.ts';
const modulePath = 'src/audit-team-appointments/audit-team-appointments.module.ts';
const servicePath = 'src/audit-team-appointments/audit-team-program-competency.service.ts';
const specPath = 'src/audit-team-appointments/audit-team-program-competency.service.spec.ts';

let source = fs.readFileSync(mainPath, 'utf8');
let moduleSource = fs.readFileSync(modulePath, 'utf8');

if (fs.existsSync(servicePath) || fs.existsSync(specPath)) {
  throw new Error('Program competency extraction target already exists');
}

const interfaceStart = source.indexOf('interface ProgramAssignmentMemberInput {');
const injectableMarker = source.indexOf('\n@Injectable()\n', interfaceStart);
if (interfaceStart < 0 || injectableMarker < 0) {
  throw new Error('Program competency interfaces block not found');
}
source = source.slice(0, interfaceStart) + source.slice(injectableMarker + 1);

const methodStart = source.indexOf('    private projectProgramKey(');
const methodEnd = source.indexOf('    private async getProjectOrThrow(', methodStart);
if (methodStart < 0 || methodEnd < 0 || methodEnd <= methodStart) {
  throw new Error('Program competency method block not found');
}
source = source.slice(0, methodStart) + source.slice(methodEnd);

const acceptedImport = '    acceptedCompetencyRoles,\n';
if (!source.includes(acceptedImport)) throw new Error('acceptedCompetencyRoles import not found');
source = source.replace(acceptedImport, '');

const importAnchor = "import { AuditTeamCompetencyService } from './audit-team-competency.service';\n";
if (source.split(importAnchor).length - 1 !== 1) throw new Error('Competency import anchor mismatch');
source = source.replace(
  importAnchor,
  importAnchor + "import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';\n",
);

const propertyAnchor = '    private readonly resourceGovernance: ExpertResourceGovernanceService;\n';
if (source.split(propertyAnchor).length - 1 !== 1) throw new Error('Resource property anchor mismatch');
source = source.replace(
  propertyAnchor,
  propertyAnchor + '    private readonly programCompetencyService: AuditTeamProgramCompetencyService;\n',
);

const constructorAnchor = `        @Optional()\n        private readonly workItems?:\n            WorkItemsService,\n    ) {\n        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);\n        this.teamReadiness = new AuditTeamReadinessService(prisma);\n    }\n`;
const constructorReplacement = `        @Optional()\n        private readonly workItems?:\n            WorkItemsService,\n\n        @Optional()\n        programCompetencyService?:\n            AuditTeamProgramCompetencyService,\n    ) {\n        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);\n        this.teamReadiness = new AuditTeamReadinessService(prisma);\n        this.programCompetencyService =\n            programCompetencyService ??\n            new AuditTeamProgramCompetencyService(prisma);\n    }\n`;
if (source.split(constructorAnchor).length - 1 !== 1) throw new Error('Constructor anchor mismatch');
source = source.replace(constructorAnchor, constructorReplacement);

const allocationCalls = source.split('this.evaluatePlanProgramAllocation(').length - 1;
if (allocationCalls < 2) throw new Error(`Expected multiple allocation calls, got ${allocationCalls}`);
source = source.replaceAll(
  'this.evaluatePlanProgramAllocation(',
  'this.programCompetencyService.evaluatePlanProgramAllocation(',
);

const programCalls = source.split('this.getApprovedProjectPrograms(').length - 1;
if (programCalls !== 1) throw new Error(`Expected one remaining project-program call, got ${programCalls}`);
source = source.replace(
  'this.getApprovedProjectPrograms(',
  'this.programCompetencyService.getApprovedProjectPrograms(',
);

const moduleImportAnchor = "import { AuditTeamCompetencyService } from './audit-team-competency.service';\n";
if (moduleSource.split(moduleImportAnchor).length - 1 !== 1) throw new Error('Module import anchor mismatch');
moduleSource = moduleSource.replace(
  moduleImportAnchor,
  moduleImportAnchor + "import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';\n",
);
const providerAnchor = '    AuditTeamCompetencyService,\n';
if (moduleSource.split(providerAnchor).length - 1 < 2) throw new Error('Module provider/export anchors changed');
const providerIndex = moduleSource.indexOf(providerAnchor);
moduleSource = moduleSource.slice(0, providerIndex) + providerAnchor + '    AuditTeamProgramCompetencyService,\n' + moduleSource.slice(providerIndex + providerAnchor.length);

const extractedService = `import { BadRequestException, Injectable } from '@nestjs/common';

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
        return \`${'${normalizeCompetencyValue(managementSystem)}'}::${'${normalizeStandardCode(standardCode)}'}\`;
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
                ? \`Chưa có năng lực chương trình phù hợp: ${'${failedPrograms.join(\'; \')}'}\`
                : \`Đủ năng lực cho ${'${qualifiedProgramKeys.length}'} chương trình/tiêu chuẩn được giao\`;

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
                \`Chưa phân công đủ chương trình: ${'${missingPrograms.map((program) => program.standard_code).join(\'; \')}'}\`,
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
`;

const extractedSpec = `import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';

function createPrismaMock() {
    return {
        certification_project_scopes: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 'scope-1',
                    standard_code: 'ISO 9001:2015',
                    management_system: 'QMS',
                },
            ]),
        },
        audit_team_appointments: {
            findFirst: jest.fn().mockResolvedValue(null),
        },
        expert_competencies: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 'competency-1',
                    expert_id: 'expert-1',
                    competency_role: 'LEAD_AUDITOR',
                    management_system: 'QMS',
                    standard_code: 'ISO 9001:2015',
                },
            ]),
        },
        audit_team_members: {
            update: jest.fn().mockResolvedValue({}),
        },
    };
}

describe('AuditTeamProgramCompetencyService', () => {
    it('validates program coverage and lead-auditor capability without changing business rules', async () => {
        const prisma = createPrismaMock();
        const service = new AuditTeamProgramCompetencyService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluatePlanProgramAllocation(
            'project-1',
            new Date('2026-09-10T00:00:00.000Z'),
            [
                {
                    expert_id: 'expert-1',
                    team_role: 'TEAM_LEADER',
                    scopes: [{ project_scope_id: 'scope-1' }],
                },
            ],
        );

        expect(result).toEqual(expect.objectContaining({
            validation_level: 'program',
            is_sufficient: true,
            leader_qualified: true,
            required_programs: 1,
            covered_programs: 1,
        }));
        expect(result.members[0]).toEqual(expect.objectContaining({
            expert_id: 'expert-1',
            status: 'qualified',
        }));
    });

    it('preserves the issued project-team prerequisite when inheritance is required', async () => {
        const prisma = createPrismaMock();
        const service = new AuditTeamProgramCompetencyService(
            prisma as unknown as PrismaService,
        );

        await expect(service.evaluatePlanProgramAllocation(
            'project-1',
            new Date('2026-09-10T00:00:00.000Z'),
            [
                {
                    expert_id: 'expert-1',
                    team_role: 'TEAM_LEADER',
                    scopes: [{ project_scope_id: 'scope-1' }],
                },
            ],
            false,
            true,
        )).rejects.toBeInstanceOf(BadRequestException);
    });
});
`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(modulePath, moduleSource);
fs.writeFileSync(servicePath, extractedService);
fs.writeFileSync(specPath, extractedSpec);
