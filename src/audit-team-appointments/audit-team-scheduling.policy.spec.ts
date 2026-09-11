import { BadRequestException } from '@nestjs/common';

import {
    countsTowardAuditTeamMandays,
    formatAuditDateOnly,
    inclusiveAuditCalendarDays,
    isInitialStage2AuditPlan,
    isStage1AuditPlan,
    numericAuditValue,
    parseAuditDate,
    validateAuditMandayAllocation,
} from './audit-team-scheduling.policy';

describe('Audit-team scheduling policy', () => {
    it('normalizes date-only values in UTC and rejects impossible calendar dates', () => {
        expect(parseAuditDate('2026-09-11', 'Ngày')).toEqual(new Date('2026-09-11T00:00:00.000Z'));
        expect(formatAuditDateOnly(new Date('2026-09-11T00:00:00.000Z'))).toBe('11/09/2026');
        expect(() => parseAuditDate('2026-02-31', 'Ngày')).toThrow(BadRequestException);
    });

    it('preserves Stage 1 and Stage 2 recognition variants', () => {
        expect(isStage1AuditPlan({ audit_type: 'INITIAL_STAGE1' })).toBe(true);
        expect(isStage1AuditPlan({ audit_event: { event_type: 'gđ1' } })).toBe(true);
        expect(isInitialStage2AuditPlan({ audit_type: 'stage2' })).toBe(true);
        expect(isInitialStage2AuditPlan({ audit_event: { event_type: 'giai-doan-2' } })).toBe(true);
    });

    it('keeps shared persistence helpers deterministic', () => {
        expect(countsTowardAuditTeamMandays('TEAM_LEADER')).toBe(true);
        expect(numericAuditValue('1.5')).toBe(1.5);
        expect(inclusiveAuditCalendarDays(
            new Date('2026-09-10T00:00:00.000Z'),
            new Date('2026-09-11T00:00:00.000Z'),
        )).toBe(2);
    });

    it('enforces 0.5 MD increments and exact strict totals', () => {
        const plan = {
            id: 'plan-1',
            project_id: 'project-1',
            plan_code: 'PLAN-1',
            audit_type: 'surveillance',
            planned_start_date: new Date('2026-09-10T00:00:00.000Z'),
            planned_end_date: new Date('2026-09-11T00:00:00.000Z'),
            audit_event: { planned_mandays: 1.5, event_type: 'surveillance' },
        };
        expect(() => validateAuditMandayAllocation([
            {
                expert_id: 'expert-1',
                team_role: 'TEAM_LEADER',
                planned_start_date: '2026-09-10',
                planned_end_date: '2026-09-11',
                planned_mandays: 1.5,
            },
        ], plan, true)).not.toThrow();
        expect(() => validateAuditMandayAllocation([
            {
                expert_id: 'expert-1',
                team_role: 'TEAM_LEADER',
                planned_start_date: '2026-09-10',
                planned_end_date: '2026-09-11',
                planned_mandays: 1.25,
            },
        ], plan, false)).toThrow('Ngày công phải được nhập theo bước 0,5 MD');
    });

    it('preserves Stage 1 remote man-day behavior beyond calendar-day span', () => {
        const plan = {
            id: 'plan-stage1',
            project_id: 'project-1',
            plan_code: 'PLAN-S1',
            audit_type: 'stage1',
            planned_start_date: new Date('2026-09-10T00:00:00.000Z'),
            planned_end_date: new Date('2026-09-10T00:00:00.000Z'),
            audit_event: { planned_mandays: 4, event_type: 'stage1' },
        };
        expect(() => validateAuditMandayAllocation([
            {
                expert_id: 'expert-1',
                team_role: 'TEAM_LEADER',
                planned_start_date: '2026-09-10',
                planned_end_date: '2026-09-10',
                planned_mandays: 4,
            },
        ], plan, true)).not.toThrow();
    });
});
