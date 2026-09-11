import { BadRequestException } from '@nestjs/common';

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
