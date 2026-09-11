import { BadRequestException } from '@nestjs/common';

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
        const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
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
                throw new BadRequestException(`${fieldName} không hợp lệ`);
            }
            return date;
        }
    }

    const sourceDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(sourceDate.getTime())) {
        throw new BadRequestException(`${fieldName} không hợp lệ`);
    }
    return new Date(Date.UTC(
        sourceDate.getUTCFullYear(),
        sourceDate.getUTCMonth(),
        sourceDate.getUTCDate(),
    ));
}

export function formatAuditDateOnly(value: Date): string {
    return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
}

export function isStage1AuditPlan(plan: AuditStagePlan): boolean {
    const value = `${plan.audit_type ?? ''} ${plan.audit_event?.event_type ?? ''}`.toLowerCase();
    return /stage\s*1|stage1|giai[_\s-]*doan[_\s-]*1|gđ1/.test(value);
}

export function isInitialStage2AuditPlan(plan: AuditStagePlan): boolean {
    const value = `${plan.audit_type ?? ''} ${plan.audit_event?.event_type ?? ''}`.toLowerCase();
    return /stage\s*2|stage2|giai[_\s-]*doan[_\s-]*2|gđ2/.test(value);
}

export function countsTowardAuditTeamMandays(teamRole?: string | null): boolean {
    return countsTowardAuditMandays(teamRole ?? '');
}

export function inclusiveAuditCalendarDays(startDate: Date, endDate: Date): number {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay) + 1;
}

export function numericAuditValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function isHalfDayIncrement(value: number): boolean {
    return Math.abs(value * 2 - Math.round(value * 2)) < 0.0001;
}

function requiredPlanMandays(plan: AuditPlanDateRange): number | null {
    return numericAuditValue(plan.audit_event?.planned_mandays);
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
        const countsTowardMandays = countsTowardAuditTeamMandays(member.team_role);
        const enteredValue = numericAuditValue(member.planned_mandays);
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
        const maximumMandays = inclusiveAuditCalendarDays(startDate, endDate);
        const enteredMandays = enteredValue ?? maximumMandays;

        if (enteredMandays < 0) {
            throw new BadRequestException('Ngày công không được nhỏ hơn 0');
        }
        if (!isHalfDayIncrement(enteredMandays)) {
            throw new BadRequestException('Ngày công phải được nhập theo bước 0,5 MD');
        }
        if (!isStage1 && enteredMandays > maximumMandays) {
            throw new BadRequestException(
                `Ngày công ${enteredMandays} MD vượt quá ${maximumMandays} ngày tham gia đã chọn`,
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
                ? `Chưa thể xác nhận: kế hoạch yêu cầu ${requiredMandays} MD nhưng mới bố trí ${allocatedMandays} MD`
                : `Chưa thể xác nhận: kế hoạch yêu cầu ${requiredMandays} MD nhưng đang bố trí vượt thành ${allocatedMandays} MD`,
        );
    }
}
