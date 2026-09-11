import { Injectable } from '@nestjs/common';

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
