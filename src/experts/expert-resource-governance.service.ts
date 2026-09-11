import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import type { expert_customer_conflicts, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
    CancelExpertResourceRecordDto,
    CreateExpertAvailabilityDto,
    CreateExpertCustomerConflictDto,
    ReviewExpertCustomerConflictDto,
} from './dto/expert-resource-governance.dto';

export type ResourceEligibilityReason = {
    code: string;
    message: string;
    severity: 'BLOCK' | 'WARNING';
};

export type ResourceEvaluationOptions = {
    customerId?: string | null;
    excludeAppointmentId?: string;
    includeAssignments?: boolean;
};

export class ExpertResourceGovernanceService {
    constructor(private readonly prisma: PrismaService) {}

    private transactionNotBegun(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;
        const candidate = error as { code?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
        if (String(candidate.code ?? '').toUpperCase() === 'ENOTBEGUN') return true;
        if (typeof candidate.message === 'string' && candidate.message.toLowerCase().includes('transaction has not begun')) return true;
        return this.transactionNotBegun(candidate.cause) || this.transactionNotBegun(candidate.meta);
    }

    private async retryTransaction<T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                return await this.prisma.$transaction(callback);
            } catch (error) {
                if (!this.transactionNotBegun(error) || attempt === 2) throw error;
            }
        }
        throw new Error('Không thể hoàn tất transaction nguồn lực chuyên gia');
    }

    private nullableText(value?: string | null) {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private parseBoundary(value: string | Date, fieldName: string, end = false) {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                throw new BadRequestException(`${fieldName} không hợp lệ`);
            }
            return value;
        }

        const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
            const result = new Date(Date.UTC(
                Number(dateOnly[1]),
                Number(dateOnly[2]) - 1,
                Number(dateOnly[3]),
                end ? 23 : 0,
                end ? 59 : 0,
                end ? 59 : 0,
                end ? 999 : 0,
            ));
            if (
                result.getUTCFullYear() !== Number(dateOnly[1]) ||
                result.getUTCMonth() !== Number(dateOnly[2]) - 1 ||
                result.getUTCDate() !== Number(dateOnly[3])
            ) {
                throw new BadRequestException(`${fieldName} không hợp lệ`);
            }
            return result;
        }

        const result = new Date(value);
        if (Number.isNaN(result.getTime())) {
            throw new BadRequestException(`${fieldName} không hợp lệ`);
        }
        return result;
    }

    private parseDateOnly(value: string, fieldName: string) {
        const result = this.parseBoundary(value, fieldName);
        return new Date(Date.UTC(
            result.getUTCFullYear(),
            result.getUTCMonth(),
            result.getUTCDate(),
        ));
    }

    private validateRange(start: Date, end: Date) {
        if (end < start) {
            throw new BadRequestException(
                'Thời điểm kết thúc phải bằng hoặc sau thời điểm bắt đầu',
            );
        }
    }

    private isStage1Plan(
        plan: { audit_type?: string | null; audit_event?: { event_type?: string | null } | null },
    ) {
        const value = `${plan.audit_type ?? ''} ${plan.audit_event?.event_type ?? ''}`.toLowerCase();
        return /stage\s*1|stage1|giai[_\s-]*doan[_\s-]*1|gđ1/.test(value);
    }

    private isProjectContext(plan: { audit_type?: string | null }) {
        return plan.audit_type?.trim().toLowerCase() === 'project_team';
    }

    private inclusiveDays(start: Date, end: Date) {
        const startDay = Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth(),
            start.getUTCDate(),
        );
        const endDay = Date.UTC(
            end.getUTCFullYear(),
            end.getUTCMonth(),
            end.getUTCDate(),
        );
        return Math.floor((endDay - startDay) / 86_400_000) + 1;
    }

    private clippedDays(
        itemStart: Date,
        itemEnd: Date,
        requestedStart: Date,
        requestedEnd: Date,
    ) {
        const start = itemStart > requestedStart ? itemStart : requestedStart;
        const end = itemEnd < requestedEnd ? itemEnd : requestedEnd;
        return end < start ? 0 : this.inclusiveDays(start, end);
    }

    async getProjectCustomerId(projectId: string) {
        const project = await this.prisma.certification_projects.findUnique({
            where: { id: projectId },
            select: {
                certification_applications: {
                    select: { customer_id: true },
                },
            },
        });
        if (!project) {
            throw new NotFoundException('Không tìm thấy hồ sơ chứng nhận');
        }
        return project.certification_applications.customer_id;
    }

    async evaluate(
        expertId: string,
        startValue: string | Date,
        endValue: string | Date,
        options: ResourceEvaluationOptions = {},
    ) {
        const startDate = this.parseBoundary(startValue, 'Thời gian bắt đầu');
        const endDate = this.parseBoundary(endValue, 'Thời gian kết thúc', true);
        this.validateRange(startDate, endDate);

        const includeAssignments = options.includeAssignments !== false;
        const [periods, conflicts, assignments] = await Promise.all([
            this.prisma.expert_availability_periods?.findMany({
                where: {
                    expert_id: expertId,
                    status: 'ACTIVE',
                    start_datetime: { lte: endDate },
                    end_datetime: { gte: startDate },
                },
                orderBy: { start_datetime: 'asc' },
            }) ?? Promise.resolve([]),
            options.customerId
                ? this.prisma.expert_customer_conflicts?.findMany({
                    where: {
                        expert_id: expertId,
                        customer_id: options.customerId,
                        declaration_status: 'ACTIVE',
                        valid_from: { lte: endDate },
                        OR: [
                            { valid_to: null },
                            { valid_to: { gte: startDate } },
                        ],
                    },
                    orderBy: { declared_at: 'desc' },
                }) ?? Promise.resolve([])
                : Promise.resolve([]),
            includeAssignments
                ? this.prisma.audit_team_members.findMany({
                    where: {
                        expert_id: expertId,
                        assignment_status: { not: 'cancelled' },
                        planned_start_date: { lte: endDate },
                        planned_end_date: { gte: startDate },
                        audit_team_appointments: {
                            status: { in: ['draft', 'issued'] },
                            ...(options.excludeAppointmentId
                                ? { id: { not: options.excludeAppointmentId } }
                                : {}),
                        },
                    },
                    include: {
                        audit_team_appointments: {
                            include: {
                                audit_plans: {
                                    select: {
                                        id: true,
                                        plan_code: true,
                                        audit_type: true,
                                        project_id: true,
                                        audit_event: {
                                            select: { event_type: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { planned_start_date: 'asc' },
                })
                : Promise.resolve([]),
        ]);
        const evaluatedAssignments = includeAssignments ? assignments : [];

        const reasons: ResourceEligibilityReason[] = [];
        for (const period of periods) {
            if (period.availability_type === 'UNAVAILABLE') {
                reasons.push({
                    code: 'UNAVAILABLE',
                    message: 'Chuyên gia không sẵn sàng trong khoảng thời gian yêu cầu.',
                    severity: 'BLOCK',
                });
            } else if (period.availability_type === 'LEAVE') {
                reasons.push({
                    code: 'LEAVE',
                    message: 'Khoảng thời gian yêu cầu giao với lịch nghỉ của chuyên gia.',
                    severity: 'BLOCK',
                });
            } else if (period.availability_type === 'OTHER_COMMITMENT') {
                reasons.push({
                    code: 'OTHER_COMMITMENT',
                    message: 'Chuyên gia có cam kết công việc khác trong khoảng thời gian này.',
                    severity: 'BLOCK',
                });
            }
        }

        for (const conflict of conflicts) {
            if (conflict.independence_status === 'PROHIBITED') {
                reasons.push({
                    code: 'INDEPENDENCE_CONFLICT',
                    message: 'Chuyên gia đang bị cấm phân công đối với khách hàng này.',
                    severity: 'BLOCK',
                });
            } else if (conflict.independence_status === 'RESTRICTED') {
                reasons.push({
                    code: 'INDEPENDENCE_RESTRICTED',
                    message: 'Chuyên gia có hạn chế độc lập cần được xem xét trước khi phân công.',
                    severity: 'WARNING',
                });
            }
        }

        const normalAssignments = evaluatedAssignments.filter((assignment) => {
            const plan = assignment.audit_team_appointments.audit_plans;
            return !this.isProjectContext(plan) && !this.isStage1Plan(plan);
        });
        const remoteAssignments = evaluatedAssignments.filter((assignment) =>
            this.isStage1Plan(assignment.audit_team_appointments.audit_plans),
        );
        if (normalAssignments.length) {
            reasons.push({
                code: 'DATE_CONFLICT',
                message: 'Chuyên gia đã có phân công đánh giá giao với khoảng thời gian yêu cầu.',
                severity: 'BLOCK',
            });
        }
        if (remoteAssignments.length) {
            reasons.push({
                code: 'REMOTE_WORKLOAD',
                message: 'Chuyên gia có workload Giai đoạn 1 từ xa trong khoảng thời gian này.',
                severity: 'WARNING',
            });
        }

        const assignedMandays = evaluatedAssignments.reduce((sum, assignment) => {
            const value = assignment.planned_mandays === null
                ? this.clippedDays(
                    assignment.planned_start_date,
                    assignment.planned_end_date,
                    startDate,
                    endDate,
                )
                : Number(assignment.planned_mandays);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        const occupiedDateKeys = new Set<string>();
        for (const assignment of normalAssignments) {
            const clippedStart = assignment.planned_start_date > startDate
                ? assignment.planned_start_date
                : startDate;
            const clippedEnd = assignment.planned_end_date < endDate
                ? assignment.planned_end_date
                : endDate;
            const cursor = new Date(Date.UTC(
                clippedStart.getUTCFullYear(),
                clippedStart.getUTCMonth(),
                clippedStart.getUTCDate(),
            ));
            while (cursor <= clippedEnd) {
                occupiedDateKeys.add(cursor.toISOString().slice(0, 10));
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
        }

        return {
            eligible: !reasons.some((reason) => reason.severity === 'BLOCK'),
            reasons,
            requested_period: {
                start_datetime: startDate,
                end_datetime: endDate,
            },
            availability_periods: periods,
            independence_conflicts: conflicts,
            assignments: evaluatedAssignments.map((assignment) => ({
                id: assignment.id,
                appointment_id: assignment.appointment_id,
                plan_id: assignment.audit_team_appointments.audit_plans.id,
                plan_code: assignment.audit_team_appointments.audit_plans.plan_code,
                audit_type: assignment.audit_team_appointments.audit_plans.audit_type,
                start_date: assignment.planned_start_date,
                end_date: assignment.planned_end_date,
                planned_mandays: assignment.planned_mandays,
                workload_type: this.isStage1Plan(
                    assignment.audit_team_appointments.audit_plans,
                ) ? 'REMOTE_WARNING' : 'OCCUPIED',
            })),
            workload: {
                assigned_mandays: assignedMandays,
                engagement_count: new Set(
                    evaluatedAssignments.map((assignment) => assignment.appointment_id),
                ).size,
                occupied_days: occupiedDateKeys.size,
                overlapping_assignments: normalAssignments.length,
                remote_workload_assignments: remoteAssignments.length,
                other_commitments: periods.filter(
                    (period) => period.availability_type === 'OTHER_COMMITMENT',
                ).length,
                other_commitment_days: periods
                    .filter((period) => period.availability_type === 'OTHER_COMMITMENT')
                    .reduce((sum, period) => sum + this.clippedDays(
                        period.start_datetime,
                        period.end_datetime,
                        startDate,
                        endDate,
                    ), 0),
                unavailable_days: periods
                    .filter((period) => period.availability_type === 'UNAVAILABLE')
                    .reduce((sum, period) => sum + this.clippedDays(
                        period.start_datetime,
                        period.end_datetime,
                        startDate,
                        endDate,
                    ), 0),
                leave_days: periods
                    .filter((period) => period.availability_type === 'LEAVE')
                    .reduce((sum, period) => sum + this.clippedDays(
                        period.start_datetime,
                        period.end_datetime,
                        startDate,
                        endDate,
                    ), 0),
                capacity_threshold_mandays: null,
                capacity_exceeded: false,
            },
        };
    }

    async evaluateMany(
        expertIds: string[],
        startValue: string | Date,
        endValue: string | Date,
        options: Omit<ResourceEvaluationOptions, 'excludeAppointmentId'> & {
            excludeAppointmentId?: string;
        } = {},
    ) {
        const startDate = this.parseBoundary(startValue, 'Thời gian bắt đầu');
        const endDate = this.parseBoundary(endValue, 'Thời gian kết thúc', true);
        this.validateRange(startDate, endDate);
        if (!expertIds.length) return new Map<string, Awaited<ReturnType<ExpertResourceGovernanceService['evaluate']>>>();

        const conflictQuery: Promise<expert_customer_conflicts[]> = options.customerId
            ? this.prisma.expert_customer_conflicts.findMany({
                where: {
                    expert_id: { in: expertIds },
                    customer_id: options.customerId,
                    declaration_status: 'ACTIVE',
                    valid_from: { lte: endDate },
                    OR: [{ valid_to: null }, { valid_to: { gte: startDate } }],
                },
                orderBy: { declared_at: 'desc' },
            })
            : Promise.resolve([]);
        const [periods, conflicts, assignments] = await Promise.all([
            this.prisma.expert_availability_periods.findMany({
                where: {
                    expert_id: { in: expertIds },
                    status: 'ACTIVE',
                    start_datetime: { lte: endDate },
                    end_datetime: { gte: startDate },
                },
                orderBy: { start_datetime: 'asc' },
            }),
            conflictQuery,
            this.prisma.audit_team_members.findMany({
                where: {
                    expert_id: { in: expertIds },
                    assignment_status: { not: 'cancelled' },
                    planned_start_date: { lte: endDate },
                    planned_end_date: { gte: startDate },
                    audit_team_appointments: {
                        status: { in: ['draft', 'issued'] },
                        ...(options.excludeAppointmentId ? { id: { not: options.excludeAppointmentId } } : {}),
                    },
                },
                include: {
                    audit_team_appointments: {
                        include: {
                            audit_plans: {
                                select: {
                                    id: true,
                                    plan_code: true,
                                    audit_type: true,
                                    project_id: true,
                                    audit_event: { select: { event_type: true } },
                                },
                            },
                        },
                    },
                },
                orderBy: { planned_start_date: 'asc' },
            }),
        ]);

        const result = new Map<string, Awaited<ReturnType<ExpertResourceGovernanceService['evaluate']>>>();
        for (const expertId of expertIds) {
            const expertPeriods = periods.filter((item) => item.expert_id === expertId);
            const expertConflicts = conflicts.filter((item) => item.expert_id === expertId);
            const expertAssignments = options.includeAssignments === false
                ? []
                : assignments.filter((item) => item.expert_id === expertId);
            const reasons: ResourceEligibilityReason[] = [];
            for (const period of expertPeriods) {
                const type = period.availability_type;
                if (type === 'UNAVAILABLE') reasons.push({ code: type, severity: 'BLOCK', message: 'Chuyên gia không sẵn sàng trong khoảng thời gian yêu cầu.' });
                if (type === 'LEAVE') reasons.push({ code: type, severity: 'BLOCK', message: 'Khoảng thời gian yêu cầu giao với lịch nghỉ của chuyên gia.' });
                if (type === 'OTHER_COMMITMENT') reasons.push({ code: type, severity: 'BLOCK', message: 'Chuyên gia có cam kết công việc khác trong khoảng thời gian này.' });
            }
            for (const conflict of expertConflicts) {
                if (conflict.independence_status === 'PROHIBITED') reasons.push({ code: 'INDEPENDENCE_CONFLICT', severity: 'BLOCK', message: 'Chuyên gia đang bị cấm phân công đối với khách hàng này.' });
                if (conflict.independence_status === 'RESTRICTED') reasons.push({ code: 'INDEPENDENCE_RESTRICTED', severity: 'WARNING', message: 'Chuyên gia có hạn chế độc lập cần được xem xét trước khi phân công.' });
            }
            const normalAssignments = expertAssignments.filter((item) => {
                const plan = item.audit_team_appointments.audit_plans;
                return !this.isProjectContext(plan) && !this.isStage1Plan(plan);
            });
            const remoteAssignments = expertAssignments.filter((item) => this.isStage1Plan(item.audit_team_appointments.audit_plans));
            if (normalAssignments.length) reasons.push({ code: 'DATE_CONFLICT', severity: 'BLOCK', message: 'Chuyên gia đã có phân công đánh giá giao với khoảng thời gian yêu cầu.' });
            if (remoteAssignments.length) reasons.push({ code: 'REMOTE_WORKLOAD', severity: 'WARNING', message: 'Chuyên gia có workload Giai đoạn 1 từ xa trong khoảng thời gian này.' });
            const assignedMandays = expertAssignments.reduce((sum, item) => {
                const value = item.planned_mandays === null
                    ? this.clippedDays(item.planned_start_date, item.planned_end_date, startDate, endDate)
                    : Number(item.planned_mandays);
                return sum + (Number.isFinite(value) ? value : 0);
            }, 0);
            const occupied = new Set<string>();
            for (const item of normalAssignments) {
                const cursor = new Date(item.planned_start_date > startDate ? item.planned_start_date : startDate);
                const last = item.planned_end_date < endDate ? item.planned_end_date : endDate;
                while (cursor <= last) {
                    occupied.add(cursor.toISOString().slice(0, 10));
                    cursor.setUTCDate(cursor.getUTCDate() + 1);
                }
            }
            result.set(expertId, {
                eligible: !reasons.some((reason) => reason.severity === 'BLOCK'),
                reasons,
                requested_period: { start_datetime: startDate, end_datetime: endDate },
                availability_periods: expertPeriods,
                independence_conflicts: expertConflicts,
                assignments: expertAssignments.map((item) => ({
                    id: item.id,
                    appointment_id: item.appointment_id,
                    plan_id: item.audit_team_appointments.audit_plans.id,
                    plan_code: item.audit_team_appointments.audit_plans.plan_code,
                    audit_type: item.audit_team_appointments.audit_plans.audit_type,
                    start_date: item.planned_start_date,
                    end_date: item.planned_end_date,
                    planned_mandays: item.planned_mandays,
                    workload_type: this.isStage1Plan(item.audit_team_appointments.audit_plans) ? 'REMOTE_WARNING' : 'OCCUPIED',
                })),
                workload: {
                    assigned_mandays: assignedMandays,
                    engagement_count: new Set(expertAssignments.map((item) => item.appointment_id)).size,
                    occupied_days: occupied.size,
                    overlapping_assignments: normalAssignments.length,
                    remote_workload_assignments: remoteAssignments.length,
                    other_commitments: expertPeriods.filter((item) => item.availability_type === 'OTHER_COMMITMENT').length,
                    other_commitment_days: expertPeriods.filter((item) => item.availability_type === 'OTHER_COMMITMENT').reduce((sum, item) => sum + this.clippedDays(item.start_datetime, item.end_datetime, startDate, endDate), 0),
                    unavailable_days: expertPeriods.filter((item) => item.availability_type === 'UNAVAILABLE').reduce((sum, item) => sum + this.clippedDays(item.start_datetime, item.end_datetime, startDate, endDate), 0),
                    leave_days: expertPeriods.filter((item) => item.availability_type === 'LEAVE').reduce((sum, item) => sum + this.clippedDays(item.start_datetime, item.end_datetime, startDate, endDate), 0),
                    capacity_threshold_mandays: null,
                    capacity_exceeded: false,
                },
            });
        }
        return result;
    }

    async listCustomers() {
        return this.prisma.customers.findMany({
            where: { status: 'active' },
            select: {
                id: true,
                customer_code: true,
                company_name: true,
            },
            orderBy: { company_name: 'asc' },
        });
    }

    async getOverview(
        expertId: string,
        startValue?: string,
        endValue?: string,
        includeSensitiveDetails = false,
    ) {
        const expert = await this.prisma.experts.findUnique({
            where: { id: expertId },
            select: { id: true, full_name: true, status: true },
        });
        if (!expert) throw new NotFoundException('Không tìm thấy chuyên gia');

        const today = new Date();
        const future = new Date(today);
        future.setUTCDate(future.getUTCDate() + 90);
        const startDate = startValue
            ? this.parseBoundary(startValue, 'Ngày bắt đầu')
            : today;
        const endDate = endValue
            ? this.parseBoundary(endValue, 'Ngày kết thúc', true)
            : future;
        this.validateRange(startDate, endDate);

        const [availability, conflicts, actions, evaluation] = await Promise.all([
            this.prisma.expert_availability_periods.findMany({
                where: { expert_id: expertId },
                orderBy: { created_at: 'desc' },
            }),
            this.prisma.expert_customer_conflicts.findMany({
                where: { expert_id: expertId },
                orderBy: { declared_at: 'desc' },
            }),
            this.prisma.expert_resource_actions.findMany({
                where: { expert_id: expertId },
                orderBy: { created_at: 'desc' },
                take: 200,
            }),
            this.evaluate(expertId, startDate, endDate),
        ]);

        const customerIds = [...new Set(conflicts.map((item) => item.customer_id))];
        const actorIds = [...new Set([
            ...conflicts.flatMap((item) => [
                item.declared_by,
                item.reviewed_by,
                item.cancelled_by,
            ]),
            ...actions.map((item) => item.actor_id),
        ].filter((value): value is string => Boolean(value)))];
        const [customers, actors] = await Promise.all([
            this.prisma.customers.findMany({
                where: { id: { in: customerIds } },
                select: { id: true, customer_code: true, company_name: true },
            }),
            this.prisma.users.findMany({
                where: { id: { in: actorIds } },
                select: { id: true, username: true, full_name: true },
            }),
        ]);
        const customerMap = new Map(customers.map((item) => [item.id, item]));
        const actorMap = new Map(actors.map((item) => [item.id, item]));
        const projectedAvailability = includeSensitiveDetails
            ? availability
            : availability.map((item) => ({
                id: item.id,
                availability_type: item.availability_type,
                start_datetime: item.start_datetime,
                end_datetime: item.end_datetime,
                status: item.status,
            }));
        const projectedConflicts = includeSensitiveDetails
            ? conflicts.map((item) => ({
                ...item,
                customer: customerMap.get(item.customer_id) ?? null,
                declared_by_user: actorMap.get(item.declared_by) ?? null,
                reviewed_by_user: item.reviewed_by
                    ? actorMap.get(item.reviewed_by) ?? null
                    : null,
            }))
            : conflicts.map((item) => ({
                id: item.id,
                customer_id: item.customer_id,
                valid_from: item.valid_from,
                valid_to: item.valid_to,
                declaration_status: item.declaration_status,
                independence_status: item.independence_status,
                customer: customerMap.get(item.customer_id) ?? null,
            }));

        return {
            expert,
            requested_period: evaluation.requested_period,
            workload: evaluation.workload,
            workload_assignments: evaluation.assignments,
            availability_periods: projectedAvailability,
            independence_conflicts: projectedConflicts,
            action_history: includeSensitiveDetails
                ? actions.map((item) => ({
                    ...item,
                    actor: item.actor_id ? actorMap.get(item.actor_id) ?? null : null,
                }))
                : [],
        };
    }

    async createAvailability(
        expertId: string,
        dto: CreateExpertAvailabilityDto,
        actorId: string,
    ) {
        const expert = await this.prisma.experts.findUnique({ where: { id: expertId } });
        if (!expert) throw new NotFoundException('Không tìm thấy chuyên gia');
        const startDate = this.parseBoundary(dto.start_datetime, 'Thời gian bắt đầu');
        const endDate = this.parseBoundary(dto.end_datetime, 'Thời gian kết thúc', true);
        this.validateRange(startDate, endDate);

        return this.retryTransaction(async (tx) => {
            const record = await tx.expert_availability_periods.create({
                data: {
                    expert_id: expertId,
                    start_datetime: startDate,
                    end_datetime: endDate,
                    availability_type: dto.availability_type,
                    reason: this.nullableText(dto.reason),
                    note: this.nullableText(dto.note),
                    created_by: actorId,
                },
            });
            await tx.expert_resource_actions.create({
                data: {
                    expert_id: expertId,
                    entity_type: 'expert_availability',
                    entity_id: record.id,
                    action_type: 'AVAILABILITY_CREATED',
                    reason: record.reason,
                    snapshot_json: JSON.stringify(record),
                    actor_id: actorId,
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'EXPERT_AVAILABILITY_CREATED',
                    entity_type: 'expert_availability',
                    entity_id: record.id,
                    outcome: 'success',
                },
            });
            return record;
        });
    }

    async cancelAvailability(
        expertId: string,
        recordId: string,
        dto: CancelExpertResourceRecordDto,
        actorId: string,
    ) {
        const existing = await this.prisma.expert_availability_periods.findFirst({
            where: { id: recordId, expert_id: expertId },
        });
        if (!existing) throw new NotFoundException('Không tìm thấy lịch nguồn lực');
        if (existing.status === 'CANCELLED') return existing;

        return this.retryTransaction(async (tx) => {
            const record = await tx.expert_availability_periods.update({
                where: { id: recordId },
                data: {
                    status: 'CANCELLED',
                    cancelled_by: actorId,
                    cancelled_at: new Date(),
                    cancellation_reason: dto.reason.trim(),
                },
            });
            await tx.expert_resource_actions.create({
                data: {
                    expert_id: expertId,
                    entity_type: 'expert_availability',
                    entity_id: record.id,
                    action_type: 'AVAILABILITY_CANCELLED',
                    reason: dto.reason.trim(),
                    snapshot_json: JSON.stringify(record),
                    actor_id: actorId,
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'EXPERT_AVAILABILITY_CANCELLED',
                    entity_type: 'expert_availability',
                    entity_id: record.id,
                    outcome: 'success',
                },
            });
            return record;
        });
    }

    async declareConflict(
        expertId: string,
        dto: CreateExpertCustomerConflictDto,
        actorId: string,
    ) {
        const [expert, customer] = await Promise.all([
            this.prisma.experts.findUnique({ where: { id: expertId } }),
            this.prisma.customers.findUnique({ where: { id: dto.customer_id } }),
        ]);
        if (!expert) throw new NotFoundException('Không tìm thấy chuyên gia');
        if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
        const validFrom = this.parseDateOnly(dto.valid_from, 'Ngày bắt đầu hiệu lực');
        const validTo = dto.valid_to
            ? this.parseDateOnly(dto.valid_to, 'Ngày kết thúc hiệu lực')
            : null;
        if (validTo) this.validateRange(validFrom, validTo);

        return this.retryTransaction(async (tx) => {
            const record = await tx.expert_customer_conflicts.create({
                data: {
                    expert_id: expertId,
                    customer_id: dto.customer_id,
                    conflict_type: dto.conflict_type,
                    description: dto.description.trim(),
                    risk_level: dto.risk_level ?? null,
                    valid_from: validFrom,
                    valid_to: validTo,
                    declared_by: actorId,
                },
            });
            await tx.expert_resource_actions.create({
                data: {
                    expert_id: expertId,
                    entity_type: 'expert_customer_conflict',
                    entity_id: record.id,
                    action_type: 'CONFLICT_DECLARED',
                    reason: record.description,
                    snapshot_json: JSON.stringify(record),
                    actor_id: actorId,
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'EXPERT_CONFLICT_DECLARED',
                    entity_type: 'expert_customer_conflict',
                    entity_id: record.id,
                    outcome: 'success',
                },
            });
            return record;
        });
    }

    async reviewConflict(
        expertId: string,
        conflictId: string,
        dto: ReviewExpertCustomerConflictDto,
        actorId: string,
    ) {
        const existing = await this.prisma.expert_customer_conflicts.findFirst({
            where: { id: conflictId, expert_id: expertId },
        });
        if (!existing) throw new NotFoundException('Không tìm thấy khai báo xung đột');
        if (existing.declaration_status !== 'ACTIVE') {
            throw new ConflictException('Không thể review khai báo đã hủy');
        }

        return this.retryTransaction(async (tx) => {
            const record = await tx.expert_customer_conflicts.update({
                where: { id: conflictId },
                data: {
                    independence_status: dto.independence_status,
                    reviewed_by: actorId,
                    reviewed_at: new Date(),
                    review_note: dto.review_note.trim(),
                    mitigation_justification: this.nullableText(
                        dto.mitigation_justification,
                    ),
                },
            });
            await tx.expert_resource_actions.create({
                data: {
                    expert_id: expertId,
                    entity_type: 'expert_customer_conflict',
                    entity_id: record.id,
                    action_type: 'CONFLICT_REVIEWED',
                    reason: dto.review_note.trim(),
                    snapshot_json: JSON.stringify(record),
                    actor_id: actorId,
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: `EXPERT_INDEPENDENCE_${dto.independence_status}`,
                    entity_type: 'expert_customer_conflict',
                    entity_id: record.id,
                    outcome: 'success',
                },
            });
            return record;
        });
    }

    async cancelConflict(
        expertId: string,
        conflictId: string,
        dto: CancelExpertResourceRecordDto,
        actorId: string,
    ) {
        const existing = await this.prisma.expert_customer_conflicts.findFirst({
            where: { id: conflictId, expert_id: expertId },
        });
        if (!existing) throw new NotFoundException('Không tìm thấy khai báo xung đột');
        if (existing.declaration_status === 'CANCELLED') return existing;

        return this.retryTransaction(async (tx) => {
            const record = await tx.expert_customer_conflicts.update({
                where: { id: conflictId },
                data: {
                    declaration_status: 'CANCELLED',
                    cancelled_by: actorId,
                    cancelled_at: new Date(),
                    cancellation_reason: dto.reason.trim(),
                },
            });
            await tx.expert_resource_actions.create({
                data: {
                    expert_id: expertId,
                    entity_type: 'expert_customer_conflict',
                    entity_id: record.id,
                    action_type: 'CONFLICT_CANCELLED',
                    reason: dto.reason.trim(),
                    snapshot_json: JSON.stringify(record),
                    actor_id: actorId,
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'EXPERT_CONFLICT_CANCELLED',
                    entity_type: 'expert_customer_conflict',
                    entity_id: record.id,
                    outcome: 'success',
                },
            });
            return record;
        });
    }

    async recordAssignmentBlock(
        expertId: string,
        planId: string,
        actorId: string | undefined,
        reason: ResourceEligibilityReason,
    ) {
        try {
            await this.prisma.$transaction([
                this.prisma.expert_resource_actions.create({
                    data: {
                        expert_id: expertId,
                        entity_type: 'audit_plan',
                        entity_id: planId,
                        action_type: 'ASSIGNMENT_BLOCKED',
                        reason: `${reason.code}: ${reason.message}`,
                        snapshot_json: JSON.stringify(reason),
                        actor_id: actorId ?? null,
                    },
                }),
                this.prisma.audit_logs.create({
                    data: {
                        user_id: actorId ?? null,
                        action: `ASSIGNMENT_BLOCKED_${reason.code}`.slice(0, 100),
                        entity_type: 'audit_plan',
                        entity_id: planId,
                        outcome: 'blocked',
                        status_code: 409,
                    },
                }),
            ]);
        } catch {
            // The assignment is still blocked even if audit persistence is unavailable.
        }
    }
}
