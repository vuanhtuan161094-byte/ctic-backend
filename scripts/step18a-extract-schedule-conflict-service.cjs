const fs = require('node:fs');

const mainPath = 'src/audit-team-appointments/audit-team-appointments.service.ts';
const modulePath = 'src/audit-team-appointments/audit-team-appointments.module.ts';
const servicePath = 'src/audit-team-appointments/audit-team-schedule-conflict.service.ts';
const specPath = 'src/audit-team-appointments/audit-team-schedule-conflict.service.spec.ts';

let source = fs.readFileSync(mainPath, 'utf8');
let moduleSource = fs.readFileSync(modulePath, 'utf8');

if (fs.existsSync(servicePath) || fs.existsSync(specPath)) {
  throw new Error('Schedule conflict extraction target already exists');
}

const importAnchor = "import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';\n";
if (source.split(importAnchor).length - 1 !== 1) throw new Error('Main import anchor mismatch');
source = source.replace(
  importAnchor,
  importAnchor + "import { AuditTeamScheduleConflictService } from './audit-team-schedule-conflict.service';\n",
);

const propertyAnchor = '    private readonly programCompetencyService: AuditTeamProgramCompetencyService;\n';
if (source.split(propertyAnchor).length - 1 !== 1) throw new Error('Main property anchor mismatch');
source = source.replace(
  propertyAnchor,
  propertyAnchor + '    private readonly scheduleConflictService: AuditTeamScheduleConflictService;\n',
);

const constructorAnchor = `        @Optional()\n        programCompetencyService?:\n            AuditTeamProgramCompetencyService,\n    ) {\n        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);\n        this.teamReadiness = new AuditTeamReadinessService(prisma);\n        this.programCompetencyService =\n            programCompetencyService ??\n            new AuditTeamProgramCompetencyService(prisma);\n    }\n`;
const constructorReplacement = `        @Optional()\n        programCompetencyService?:\n            AuditTeamProgramCompetencyService,\n\n        @Optional()\n        scheduleConflictService?:\n            AuditTeamScheduleConflictService,\n    ) {\n        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);\n        this.teamReadiness = new AuditTeamReadinessService(prisma);\n        this.programCompetencyService =\n            programCompetencyService ??\n            new AuditTeamProgramCompetencyService(prisma);\n        this.scheduleConflictService =\n            scheduleConflictService ??\n            new AuditTeamScheduleConflictService(prisma);\n    }\n`;
if (source.split(constructorAnchor).length - 1 !== 1) throw new Error('Main constructor anchor mismatch');
source = source.replace(constructorAnchor, constructorReplacement);

const conflictStart = source.indexOf('    private async findScheduleOverlaps(');
const validateStart = source.indexOf('    private async validateMembers(', conflictStart);
if (conflictStart < 0 || validateStart < 0 || validateStart <= conflictStart) {
  throw new Error('Schedule conflict method block not found');
}
const wrappers = `    private async findConflict(\n        expertId: string,\n        startDate: Date,\n        endDate: Date,\n        excludeAppointmentId?: string,\n    ) {\n        return this.scheduleConflictService.findConflict(\n            expertId,\n            startDate,\n            endDate,\n            excludeAppointmentId,\n        );\n    }\n\n    private async findStage1WarningConflicts(\n        expertId: string,\n        startDate: Date,\n        endDate: Date,\n        excludeAppointmentId?: string,\n    ) {\n        return this.scheduleConflictService.findStage1WarningConflicts(\n            expertId,\n            startDate,\n            endDate,\n            excludeAppointmentId,\n        );\n    }\n\n`;
source = source.slice(0, conflictStart) + wrappers + source.slice(validateStart);

const moduleImportAnchor = "import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';\n";
if (moduleSource.split(moduleImportAnchor).length - 1 !== 1) throw new Error('Module import anchor mismatch');
moduleSource = moduleSource.replace(
  moduleImportAnchor,
  moduleImportAnchor + "import { AuditTeamScheduleConflictService } from './audit-team-schedule-conflict.service';\n",
);
const providerAnchor = '    AuditTeamProgramCompetencyService,\n';
if (moduleSource.split(providerAnchor).length - 1 !== 1) throw new Error('Module provider anchor mismatch');
moduleSource = moduleSource.replace(
  providerAnchor,
  providerAnchor + '    AuditTeamScheduleConflictService,\n',
);

const extractedService = `import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { normalizeCompetencyValue } from './audit-team-competency.policy';
import { isStage1AuditPlan } from './audit-team-scheduling.policy';

@Injectable()
export class AuditTeamScheduleConflictService {
    private readonly projectTeamAuditType = 'project_team';

    constructor(private readonly prisma: PrismaService) {}

    private async findScheduleOverlaps(
        expertId: string,
        startDate: Date,
        endDate: Date,
        excludeAppointmentId?: string,
    ) {
        return this.prisma.audit_team_members.findMany({
            where: {
                expert_id: expertId,
                assignment_status: { not: 'cancelled' },
                planned_start_date: { lte: endDate },
                planned_end_date: { gte: startDate },
                audit_team_appointments: {
                    status: { in: ['draft', 'issued'] },
                    ...(excludeAppointmentId
                        ? { id: { not: excludeAppointmentId } }
                        : {}),
                },
            },
            orderBy: {
                planned_start_date: 'asc',
            },
            include: {
                experts: true,
                audit_team_appointments: {
                    include: {
                        audit_plans: {
                            select: {
                                id: true,
                                plan_code: true,
                                project_id: true,
                                audit_type: true,
                                status: true,
                                planned_start_date: true,
                                planned_end_date: true,
                                audit_event: {
                                    select: {
                                        event_type: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    async findConflict(
        expertId: string,
        startDate: Date,
        endDate: Date,
        excludeAppointmentId?: string,
    ) {
        const overlaps = await this.findScheduleOverlaps(
            expertId,
            startDate,
            endDate,
            excludeAppointmentId,
        );

        return overlaps.find((assignment) => {
            const plan = assignment.audit_team_appointments.audit_plans;
            if (
                normalizeCompetencyValue(plan.audit_type) ===
                normalizeCompetencyValue(this.projectTeamAuditType)
            ) {
                return false;
            }
            return !isStage1AuditPlan(plan);
        }) ?? null;
    }

    async findStage1WarningConflicts(
        expertId: string,
        startDate: Date,
        endDate: Date,
        excludeAppointmentId?: string,
    ) {
        const overlaps = await this.findScheduleOverlaps(
            expertId,
            startDate,
            endDate,
            excludeAppointmentId,
        );

        return overlaps.filter((assignment) =>
            isStage1AuditPlan(
                assignment.audit_team_appointments.audit_plans,
            ),
        );
    }
}
`;

const extractedSpec = `import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamScheduleConflictService } from './audit-team-schedule-conflict.service';

function assignment(auditType: string, eventType?: string) {
    return {
        planned_start_date: new Date('2026-09-11T00:00:00.000Z'),
        planned_end_date: new Date('2026-09-11T00:00:00.000Z'),
        experts: { full_name: auditType },
        audit_team_appointments: {
            audit_plans: {
                id: \`plan-${'${auditType}'}\`,
                plan_code: \`PLAN-${'${auditType}'}\`,
                project_id: 'project-1',
                audit_type: auditType,
                status: 'approved',
                planned_start_date: new Date('2026-09-11T00:00:00.000Z'),
                planned_end_date: new Date('2026-09-11T00:00:00.000Z'),
                audit_event: eventType ? { event_type: eventType } : null,
            },
        },
    };
}

describe('AuditTeamScheduleConflictService', () => {
    it('ignores project context and Stage 1 when resolving hard schedule conflicts', async () => {
        const findMany = jest.fn().mockResolvedValue([
            assignment('project_team'),
            assignment('stage1'),
            assignment('surveillance'),
        ]);
        const service = new AuditTeamScheduleConflictService({
            audit_team_members: { findMany },
        } as unknown as PrismaService);

        const result = await service.findConflict(
            'expert-1',
            new Date('2026-09-11T00:00:00.000Z'),
            new Date('2026-09-12T00:00:00.000Z'),
            'appointment-current',
        );

        expect(result?.audit_team_appointments.audit_plans.audit_type).toBe('surveillance');
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                expert_id: 'expert-1',
                audit_team_appointments: expect.objectContaining({
                    id: { not: 'appointment-current' },
                }),
            }),
        }));
    });

    it('returns only Stage 1 overlaps as soft warnings', async () => {
        const findMany = jest.fn().mockResolvedValue([
            assignment('project_team'),
            assignment('surveillance'),
            assignment('INITIAL_STAGE1'),
            assignment('other', 'gđ1'),
        ]);
        const service = new AuditTeamScheduleConflictService({
            audit_team_members: { findMany },
        } as unknown as PrismaService);

        const result = await service.findStage1WarningConflicts(
            'expert-1',
            new Date('2026-09-11T00:00:00.000Z'),
            new Date('2026-09-12T00:00:00.000Z'),
        );

        expect(result).toHaveLength(2);
        expect(result.map((item) => item.audit_team_appointments.audit_plans.audit_type))
            .toEqual(['INITIAL_STAGE1', 'other']);
    });
});
`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(modulePath, moduleSource);
fs.writeFileSync(servicePath, extractedService);
fs.writeFileSync(specPath, extractedSpec);
