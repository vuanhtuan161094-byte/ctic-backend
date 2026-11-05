import { AuditProgramsService } from './audit-programs.service';
import type { AuditProgramEventDto } from './dto/create-audit-program.dto';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditProgramsService annual cycle progression', () => {
    const service = new AuditProgramsService({} as PrismaService);
    const cycleService = service as unknown as {
        getNextEvents(events: Array<{ event_type: string }>): AuditProgramEventDto[];
    };

    const nextEventType = (eventTypes: string[]) =>
        cycleService.getNextEvents(
            eventTypes.map((event_type) => ({ event_type })),
        )[0]?.event_type;

    it('adds first-year surveillance after Stage 1 and Stage 2', () => {
        expect(nextEventType(['stage1', 'stage2'])).toBe('surveillance1');
    });

    it('advances a programme that already contains first-year surveillance', () => {
        expect(nextEventType(['stage1', 'stage2', 'surveillance1'])).toBe('surveillance2');
    });

    it('schedules recertification after second-year surveillance even when initial stages remain', () => {
        expect(nextEventType(['stage1', 'stage2', 'surveillance1', 'surveillance2'])).toBe('recertification');
    });

    it('starts the next three-year cycle after recertification', () => {
        expect(nextEventType(['stage1', 'stage2', 'surveillance1', 'surveillance2', 'recertification']))
            .toBe('surveillance1');
    });
});
