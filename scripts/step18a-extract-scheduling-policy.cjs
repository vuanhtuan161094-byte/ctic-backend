const fs = require('node:fs');

const mainPath = 'src/audit-team-appointments/audit-team-appointments.service.ts';
const policyPath = 'src/audit-team-appointments/audit-team-scheduling.policy.ts';
const specPath = 'src/audit-team-appointments/audit-team-scheduling.policy.spec.ts';
let source = fs.readFileSync(mainPath, 'utf8');

if (fs.existsSync(policyPath) || fs.existsSync(specPath)) {
  throw new Error('Scheduling policy target already exists');
}

const planStart = source.indexOf('interface PlanDateRange {');
const projectScopeStart = source.indexOf('interface ProjectScopeMemberInput {', planStart);
if (planStart < 0 || projectScopeStart < 0) throw new Error('PlanDateRange interface block not found');
source = source.slice(0, planStart) + source.slice(projectScopeStart);

const memberStart = source.indexOf('interface MemberDateInput {');
const injectableStart = source.indexOf('\n@Injectable()\n', memberStart);
if (memberStart < 0 || injectableStart < 0) throw new Error('MemberDateInput interface block not found');
source = source.slice(0, memberStart) + source.slice(injectableStart + 1);

const countsImport = "import { countsTowardAuditMandays } from './integrated-manday-allocation.engine';\n";
if (source.split(countsImport).length - 1 !== 1) throw new Error('Manday engine import mismatch');
source = source.replace(countsImport, '');

const policyImportAnchor = "import { AuditTeamReadinessService } from './audit-team-readiness.service';\n";
if (source.split(policyImportAnchor).length - 1 !== 1) throw new Error('Scheduling policy import anchor mismatch');
source = source.replace(policyImportAnchor, policyImportAnchor + `import {
    formatAuditDateOnly,
    isInitialStage2AuditPlan,
    isStage1AuditPlan,
    parseAuditDate,
    validateAuditMandayAllocation,
} from './audit-team-scheduling.policy';
import type {
    AuditMemberDateInput as MemberDateInput,
    AuditPlanDateRange as PlanDateRange,
} from './audit-team-scheduling.policy';
`);

const parseStart = source.indexOf('    private parseDate(');
const planMethodStart = source.indexOf('    private async getPlanOrThrow(', parseStart);
if (parseStart < 0 || planMethodStart < 0) throw new Error('parseDate block not found');
const parseWrapper = `    private parseDate(
        value: string | Date,
        fieldName: string,
    ) {
        return parseAuditDate(value, fieldName);
    }

`;
source = source.slice(0, parseStart) + parseWrapper + source.slice(planMethodStart);

const stageStart = source.indexOf('    private isStage1Plan(');
const projectMethodStart = source.indexOf('    private async getProjectOrThrow(', stageStart);
if (stageStart < 0 || projectMethodStart < 0) throw new Error('Stage/date helper block not found');
const stageWrappers = `    private isStage1Plan(
        plan: { audit_type?: string | null; audit_event?: { event_type?: string | null } | null },
    ): boolean {
        return isStage1AuditPlan(plan);
    }

    private isInitialStage2Plan(
        plan: { audit_type?: string | null; audit_event?: { event_type?: string | null } | null },
    ): boolean {
        return isInitialStage2AuditPlan(plan);
    }

`;
source = source.slice(0, stageStart) + stageWrappers + source.slice(projectMethodStart);

const formatStart = source.indexOf('    private formatDateOnly(');
const overlapStart = source.indexOf('    private async findScheduleOverlaps(', formatStart);
if (formatStart < 0 || overlapStart < 0) throw new Error('Manday helper block not found');
const mandayWrappers = `    private formatDateOnly(
        value: Date,
    ) {
        return formatAuditDateOnly(value);
    }

    private validateMandayAllocation(
        members: MemberDateInput[],
        plan: PlanDateRange & { audit_type?: string | null },
        strictTotal = false,
    ) {
        return validateAuditMandayAllocation(
            members,
            plan,
            strictTotal,
        );
    }

`;
source = source.slice(0, formatStart) + mandayWrappers + source.slice(overlapStart);

if (source.includes('this.countsTowardMandays(') || source.includes('this.numericValue(') || source.includes('this.inclusiveCalendarDays(') || source.includes('this.isHalfDayIncrement(') || source.includes('this.requiredPlanMandays(')) {
  throw new Error('Legacy manday helper references remain after extraction');
}

const policy = `import { BadRequestException } from '@nestjs/common';

import { countsTowardAuditMandays } from './integrated-manday-allocation.engine';

export interface AuditPlanDateRange {
    id: string;
    project_id: string;
    plan_code: string | null;
    planned_start_date: Date | null;
    planned_end_date: Date | null;
    audit_event?: {
        planned_mandays: unknown;
        event_type?: string | null;
    } | null;
}

export interface AuditMemberDateInput {
    expert_id: string;
    team_role: string;
    planned_start_date?: string | Date;
    planned_end_date?: string | Date;
    planned_mandays?: number | string | null;
}

export type AuditStagePlan = {
    audit_type?: string | null;
    audit_event?: { event_type?: string | null } | null;
};

export function parseAuditDate(
    value: string | Date,
    fieldName: string,
): Date {
    if (typeof value === 'string') {
        const dateOnlyMatch = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
        if (dateOnlyMatch) {
            const year = Number(dateOnlyMatch[1]);
            const month = Number(dateOnlyMatch[2]);
            const day = Number(dateOnlyMatch[3]);
            const date = new Date(Date.UTC(year, month - 1, day));
            if (
                date.getUTCFullYear() !== year ||
                date.getUTCMonth() !== month - 1 ||
                date.getUTCDate() !== day
            ) {
                throw new BadRequestException(\`${'${fieldName}'} không hợp lệ\`);
            }
            return date;
        }
    }

    const sourceDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(sourceDate.getTime())) {
        throw new BadRequestException(\`${'${fieldName}'} không hợp lệ\`);
    }
    return new Date(Date.UTC(
        sourceDate.getUTCFullYear(),
        sourceDate.getUTCMonth(),
        sourceDate.getUTCDate(),
    ));
}

export function formatAuditDateOnly(value: Date): string {
    return \`${'${String(value.getUTCDate()).padStart(2, \'0\')}'}\/${'${String(value.getUTCMonth() + 1).padStart(2, \'0\')}'}\/${'${value.getUTCFullYear()}'}\`;
}

export function isStage1AuditPlan(plan: AuditStagePlan): boolean {
    const value = \`${'${plan.audit_type ?? \'\'}'} ${'${plan.audit_event?.event_type ?? \'\'}'}\`.toLowerCase();
    return /stage\\s*1|stage1|giai[_\\s-]*doan[_\\s-]*1|gđ1/.test(value);
}

export function isInitialStage2AuditPlan(plan: AuditStagePlan): boolean {
    const value = \`${'${plan.audit_type ?? \'\'}'} ${'${plan.audit_event?.event_type ?? \'\'}'}\`.toLowerCase();
    return /stage\\s*2|stage2|giai[_\\s-]*doan[_\\s-]*2|gđ2/.test(value);
}

function inclusiveCalendarDays(startDate: Date, endDate: Date): number {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay) + 1;
}

function numericValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function isHalfDayIncrement(value: number): boolean {
    return Math.abs(value * 2 - Math.round(value * 2)) < 0.0001;
}

function requiredPlanMandays(plan: AuditPlanDateRange): number | null {
    return numericValue(plan.audit_event?.planned_mandays);
}

export function validateAuditMandayAllocation(
    members: AuditMemberDateInput[],
    plan: AuditPlanDateRange & { audit_type?: string | null },
    strictTotal = false,
): void {
    const isProjectContext = plan.audit_type?.trim().toLowerCase() === 'project_team';
    const isStage1 = isStage1AuditPlan(plan);
    if (isProjectContext) return;

    let allocatedMandays = 0;
    for (const member of members) {
        const countsTowardMandays = countsTowardAuditMandays(member.team_role ?? '');
        const enteredValue = numericValue(member.planned_mandays);
        if (!countsTowardMandays) {
            if ((enteredValue ?? 0) > 0.001) {
                throw new BadRequestException(
                    'Chuyên gia kỹ thuật, quan sát viên, chuyên gia tập sự và vai trò hỗ trợ không được tính man-day',
                );
            }
            continue;
        }
        if (!member.planned_start_date || !member.planned_end_date) continue;

        const startDate = parseAuditDate(member.planned_start_date, 'Ngày bắt đầu phân công');
        const endDate = parseAuditDate(member.planned_end_date, 'Ngày kết thúc phân công');
        const maximumMandays = inclusiveCalendarDays(startDate, endDate);
        const enteredMandays = enteredValue ?? maximumMandays;

        if (enteredMandays < 0) {
            throw new BadRequestException('Ngày công không được nhỏ hơn 0');
        }
        if (!isHalfDayIncrement(enteredMandays)) {
            throw new BadRequestException('Ngày công phải được nhập theo bước 0,5 MD');
        }
        if (!isStage1 && enteredMandays > maximumMandays) {
            throw new BadRequestException(
                \`Ngày công ${'${enteredMandays}'} MD vượt quá ${'${maximumMandays}'} ngày tham gia đã chọn\`,
            );
        }
        allocatedMandays += enteredMandays;
    }

    const requiredMandays = requiredPlanMandays(plan);
    if (strictTotal && requiredMandays === null) {
        throw new BadRequestException(
            'Chưa thể ban hành: kỳ đánh giá chưa có man-day được phê duyệt trong chương trình',
        );
    }
    if (
        strictTotal &&
        requiredMandays !== null &&
        Math.abs(allocatedMandays - requiredMandays) > 0.001
    ) {
        throw new BadRequestException(
            allocatedMandays < requiredMandays
                ? \`Chưa thể xác nhận: kế hoạch yêu cầu ${'${requiredMandays}'} MD nhưng mới bố trí ${'${allocatedMandays}'} MD\`
                : \`Chưa thể xác nhận: kế hoạch yêu cầu ${'${requiredMandays}'} MD nhưng đang bố trí vượt thành ${'${allocatedMandays}'} MD\`,
        );
    }
}
`;

const spec = `import { BadRequestException } from '@nestjs/common';

import {
    formatAuditDateOnly,
    isInitialStage2AuditPlan,
    isStage1AuditPlan,
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
`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(policyPath, policy);
fs.writeFileSync(specPath, spec);
