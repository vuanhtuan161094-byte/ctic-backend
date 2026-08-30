import { AuditTeamAppointmentsService } from './audit-team-appointments.service';

describe('audit team appointment projection', () => {
    it('returns persisted program manday allocations with F.04 details', async () => {
        const findMany = jest.fn().mockResolvedValue([]);
        const service = new AuditTeamAppointmentsService(
            { audit_team_appointments: { findMany } } as never,
            {} as never,
            {} as never,
        );

        await service.findAll('plan-canonical');

        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            include: expect.objectContaining({
                program_manday_allocations: true,
            }),
        }));
    });
});
