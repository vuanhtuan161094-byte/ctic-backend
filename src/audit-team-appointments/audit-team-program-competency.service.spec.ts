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
    it.each([
        ['LEAD_AUDITOR', 'AUDITOR', 'qualified'],
        ['AUDITOR', 'TEAM_LEADER', 'not_qualified'],
    ])('assignment maps competency %s to %s as %s', async (competencyRole, teamRole, status) => {
        const prisma = createPrismaMock();
        prisma.expert_competencies.findMany.mockResolvedValue([{ id: 'c1', expert_id: 'expert-1',
            competency_role: competencyRole, management_system: 'QMS', standard_code: 'ISO 9001:2015' },
            { id: 'c2', expert_id: 'leader', competency_role: 'LEAD_AUDITOR', management_system: 'QMS', standard_code: 'ISO 9001:2015' }]);
        const service = new AuditTeamProgramCompetencyService(prisma as unknown as PrismaService);
        const work = service.evaluatePlanProgramAllocation('project-1', new Date('2026-09-10'),
            [{ expert_id: 'expert-1', team_role: teamRole, scopes: [{ project_scope_id: 'scope-1' }] },
             { expert_id: 'leader', team_role: 'TEAM_LEADER', scopes: [{ project_scope_id: 'scope-1' }] }]);
        if (status === 'not_qualified') await expect(work).rejects.toBeInstanceOf(BadRequestException);
        else expect((await work).members[0].status).toBe(status);
    });
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
        expect(prisma.expert_competencies.findMany).toHaveBeenCalledWith({
            where: { expert_id: { in: ['expert-1'] }, approval_status: 'APPROVED',
                effective_date: { lte: new Date('2026-09-10T00:00:00.000Z') },
                OR: [{ expiry_date: null }, { expiry_date: { gte: new Date('2026-09-10T00:00:00.000Z') } }] },
        });
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
