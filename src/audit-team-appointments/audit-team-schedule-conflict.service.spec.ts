import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamScheduleConflictService } from './audit-team-schedule-conflict.service';

function assignment(auditType: string, eventType?: string) {
    return {
        planned_start_date: new Date('2026-09-11T00:00:00.000Z'),
        planned_end_date: new Date('2026-09-11T00:00:00.000Z'),
        experts: { full_name: auditType },
        audit_team_appointments: {
            audit_plans: {
                id: `plan-${auditType}`,
                plan_code: `PLAN-${auditType}`,
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
