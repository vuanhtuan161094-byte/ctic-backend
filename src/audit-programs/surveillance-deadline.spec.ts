import { BadRequestException } from '@nestjs/common';
import { AuditProgramsService } from './audit-programs.service';
import { firstSurveillanceDeadline, isFirstSurveillanceEvent } from './surveillance-deadline';

describe('P.09 first-surveillance 12-month deadline', () => {
    it('calculates calendar anniversaries including leap-day clamping', () => {
        expect(firstSurveillanceDeadline(new Date('2026-01-31T00:00:00Z')).toISOString().slice(0, 10))
            .toBe('2027-01-31');
        expect(firstSurveillanceDeadline(new Date('2024-02-29T00:00:00Z')).toISOString().slice(0, 10))
            .toBe('2025-02-28');
        expect(isFirstSurveillanceEvent('surveillance_1')).toBe(true);
        expect(isFirstSurveillanceEvent('surveillance2')).toBe(false);
    });

    function harness(decision: Date | null = new Date('2026-02-28T00:00:00Z')) {
        const prisma = {
            certification_decisions: {
                findFirst: jest.fn().mockResolvedValue(decision ? { decision_date: decision } : null),
            },
        };
        const service = new AuditProgramsService(prisma as never) as AuditProgramsService & {
            assertFirstSurveillanceDeadline(
                projectId: string,
                events: Array<{event_type: string; planned_start_date?: Date | string | null}>,
            ): Promise<void>;
        };
        return { service, prisma };
    }

    it('allows the anniversary and rejects the next calendar day', async () => {
        const { service, prisma } = harness();
        await expect(service.assertFirstSurveillanceDeadline('project-1', [{
            event_type: 'surveillance1', planned_start_date: '2027-02-28',
        }])).resolves.toBeUndefined();
        await expect(service.assertFirstSurveillanceDeadline('project-1', [{
            event_type: 'surveillance1', planned_start_date: '2027-03-01',
        }])).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.certification_decisions.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    project_id: 'project-1',
                    status: 'issued',
                    decision_result: 'approved',
                    decision_type: { in: ['GRANT', 'RECERTIFY'] },
                }),
            }),
        );
    });

    it('does not block surveillance year 2 or draft planning without prior decision', async () => {
        const { service, prisma } = harness(null);
        await expect(service.assertFirstSurveillanceDeadline('project-1', [{
            event_type: 'surveillance1', planned_start_date: '2029-01-01',
        }])).resolves.toBeUndefined();
        await expect(service.assertFirstSurveillanceDeadline('project-1', [{
            event_type: 'surveillance2', planned_start_date: '2030-01-01',
        }])).resolves.toBeUndefined();
        expect(prisma.certification_decisions.findFirst).toHaveBeenCalledTimes(1);
    });

    it('cannot be bypassed using client form_data or an unapproved exception flag', async () => {
        const { service } = harness();
        await expect(service.assertFirstSurveillanceDeadline('project-1', [{
            event_type: 'surveillance1',
            planned_start_date: '2027-03-01',
            form_data: { qmr_approved: true, ignore_deadline: true },
        } as any])).rejects.toThrow('cần phê duyệt QMR');
    });
});
