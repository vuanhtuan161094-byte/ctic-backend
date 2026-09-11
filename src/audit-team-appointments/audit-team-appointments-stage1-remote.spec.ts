import { BadRequestException } from '@nestjs/common';

import { AuditTeamAppointmentsService } from './audit-team-appointments.service';

function assignment(options: {
    id: string;
    auditType: string;
    eventType?: string;
    start: string;
    end: string;
}) {
    return {
        id: `member-${options.id}`,
        appointment_id: `appointment-${options.id}`,
        planned_start_date: new Date(`${options.start}T00:00:00.000Z`),
        planned_end_date: new Date(`${options.end}T00:00:00.000Z`),
        experts: {
            id: 'expert-1',
            full_name: 'Nguyen Van A',
        },
        audit_team_appointments: {
            appointment_number: `F04-${options.id}`,
            status: 'issued',
            audit_plans: {
                id: `plan-${options.id}`,
                plan_code: `PLAN-${options.id}`,
                project_id: `project-${options.id}`,
                audit_type: options.auditType,
                status: 'planned',
                planned_start_date: new Date(`${options.start}T00:00:00.000Z`),
                planned_end_date: new Date(`${options.end}T00:00:00.000Z`),
                audit_event: {
                    event_type: options.eventType ?? options.auditType,
                },
                certification_projects: {
                    id: `project-${options.id}`,
                    project_code: `PRJ-${options.id}`,
                    certification_applications: {
                        customers: {
                            company_name: `Customer ${options.id}`,
                        },
                    },
                },
            },
        },
    };
}

function createHarness() {
    const prisma = {
        experts: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        audit_team_members: {
            findMany: jest.fn(),
        },
    };

    return {
        prisma,
        service: new AuditTeamAppointmentsService(
            prisma as any,
            {} as any,
            {} as any,
        ),
    };
}

describe('AuditTeamAppointmentsService — GĐ1 remote workload', () => {
    it('returns Stage 1 dates as soft warnings while onsite dates remain hard busy dates', async () => {
        const { prisma, service } = createHarness();
        prisma.experts.findUnique.mockResolvedValue({
            id: 'expert-1',
            full_name: 'Nguyen Van A',
        });
        prisma.audit_team_members.findMany.mockResolvedValue([
            assignment({
                id: 'stage1',
                auditType: 'stage1',
                start: '2026-09-10',
                end: '2026-09-11',
            }),
            assignment({
                id: 'onsite',
                auditType: 'surveillance1',
                start: '2026-09-12',
                end: '2026-09-12',
            }),
        ]);

        const result = await service.getBusyDates(
            'expert-1',
            '2026-09-01',
            '2026-09-30',
        ) as any;

        expect(result.busy_dates).toEqual(['2026-09-12']);
        expect(result.warning_dates).toEqual(['2026-09-10', '2026-09-11']);
        expect(result.assignments).toHaveLength(1);
        expect(result.warning_assignments).toHaveLength(1);
        expect(result.warning_assignments[0].audit_type).toBe('stage1');
    });

    it('does not treat a Stage 1 overlap as a hard conflict for an onsite assignment', async () => {
        const { prisma, service } = createHarness();
        prisma.audit_team_members.findMany.mockResolvedValue([
            assignment({
                id: 'stage1',
                auditType: 'INITIAL_STAGE1',
                eventType: 'stage1',
                start: '2026-09-10',
                end: '2026-09-10',
            }),
        ]);

        const conflict = await (service as any).findConflict(
            'expert-1',
            new Date('2026-09-10T00:00:00.000Z'),
            new Date('2026-09-10T00:00:00.000Z'),
        );

        expect(conflict).toBeNull();
    });

    it('batches project-team independence evaluation without per-member resource calls', async () => {
        const { prisma, service } = createHarness();
        prisma.experts.findMany.mockResolvedValue([
            {
                id: 'leader',
                full_name: 'Lead Auditor',
                status: 'active',
                profile_status: 'APPROVED',
                user_id: 'user-leader',
                user_account: { id: 'user-leader', status: 'active' },
            },
            {
                id: 'auditor',
                full_name: 'Auditor',
                status: 'active',
                profile_status: 'APPROVED',
                user_id: 'user-auditor',
                user_account: { id: 'user-auditor', status: 'active' },
            },
        ]);
        const governance = (service as any).resourceGovernance;
        jest.spyOn(governance, 'getProjectCustomerId').mockResolvedValue('customer-1');
        const evaluateSpy = jest.spyOn(governance, 'evaluate');
        const evaluateManySpy = jest.spyOn(governance, 'evaluateMany').mockResolvedValue(new Map([
            ['leader', { reasons: [] }],
            ['auditor', { reasons: [] }],
        ]));

        const effectiveDate = new Date('2026-09-10T00:00:00.000Z');
        await (service as any).validateMembers(
            [
                { expert_id: 'leader', team_role: 'TEAM_LEADER' },
                { expert_id: 'auditor', team_role: 'AUDITOR' },
            ],
            {
                id: 'project-team-plan',
                project_id: 'project-1',
                plan_code: 'DOSSIER-PRJ-1',
                audit_type: 'project_team',
                planned_start_date: effectiveDate,
                planned_end_date: effectiveDate,
                audit_event: null,
            },
            undefined,
            false,
            'admin-1',
        );

        expect(evaluateManySpy).toHaveBeenCalledTimes(1);
        expect(evaluateManySpy).toHaveBeenCalledWith(
            ['leader', 'auditor'],
            effectiveDate,
            effectiveDate,
            { customerId: 'customer-1', includeAssignments: false },
        );
        expect(evaluateSpy).not.toHaveBeenCalled();
    });

    it('keeps Stage 1 man-days exact while allowing multiple F04 members', () => {
        const { service } = createHarness();
        const plan = {
            id: 'plan-stage1',
            project_id: 'project-1',
            plan_code: 'PLAN-S1',
            audit_type: 'stage1',
            planned_start_date: new Date('2026-09-10T00:00:00.000Z'),
            planned_end_date: new Date('2026-09-10T00:00:00.000Z'),
            audit_event: {
                planned_mandays: 10,
                event_type: 'stage1',
            },
        };
        const members = [
            {
                expert_id: 'leader',
                team_role: 'TEAM_LEADER',
                planned_start_date: '2026-09-10',
                planned_end_date: '2026-09-10',
                planned_mandays: 4,
            },
            {
                expert_id: 'auditor-b',
                team_role: 'AUDITOR',
                planned_start_date: '2026-09-10',
                planned_end_date: '2026-09-10',
                planned_mandays: 3,
            },
            {
                expert_id: 'auditor-c',
                team_role: 'AUDITOR',
                planned_start_date: '2026-09-10',
                planned_end_date: '2026-09-10',
                planned_mandays: 3,
            },
        ];

        expect(() => (service as any).validateMandayAllocation(
            members,
            plan,
            true,
        )).not.toThrow();

        expect(() => (service as any).validateMandayAllocation(
            [
                ...members.slice(0, 2),
                { ...members[2], planned_mandays: 3.5 },
            ],
            plan,
            true,
        )).toThrow(BadRequestException);
    });
});
