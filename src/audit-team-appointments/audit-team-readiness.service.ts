import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { countsTowardAuditMandays } from './integrated-manday-allocation.engine';

export type TeamReadinessReason = {
    code: string;
    severity: 'BLOCK' | 'WARNING';
    message: string;
    member_id?: string;
    expert_id?: string;
};

type CoverageMember = {
    member_id: string;
    expert_id: string;
    expert_name: string;
    team_role: string;
    blocked: boolean;
};

type CoverageCompetency = {
    id: string;
    expert_id: string;
    management_system: string;
    standard_code: string;
    competency_role: string;
    scope_level: string;
    iaf_code: string;
    nace_code: string | null;
};

type CoverageScope = {
    id: string;
    management_system: string;
    standard_code: string;
    iaf_code: string;
    nace_code: string;
    scope_description: string;
};

const normalize = (value?: string | null) => value?.trim().toUpperCase() ?? '';

const acceptedRoles = (teamRole: string): string[] => ({
    TEAM_LEADER: ['LEAD_AUDITOR', 'AUDITOR'],
    AUDITOR: ['AUDITOR', 'LEAD_AUDITOR'],
    TECHNICAL_EXPERT: ['TECHNICAL_EXPERT'],
    WITNESS_EVALUATOR: ['WITNESS_EVALUATOR', 'LEAD_AUDITOR', 'AUDITOR'],
}[normalize(teamRole)] ?? []);

export const competencyCoversScope = (
    competency: CoverageCompetency,
    scope: CoverageScope,
    teamRole: string,
) => acceptedRoles(teamRole).includes(normalize(competency.competency_role))
    && normalize(competency.management_system) === normalize(scope.management_system)
    && normalize(competency.standard_code) === normalize(scope.standard_code)
    && normalize(competency.iaf_code) === normalize(scope.iaf_code)
    && (
        normalize(competency.scope_level) !== 'NACE'
        || normalize(competency.nace_code) === normalize(scope.nace_code)
    );

export const buildCollectiveCoverage = (
    scopes: CoverageScope[],
    members: CoverageMember[],
    competencies: CoverageCompetency[],
) => scopes.map((scope) => {
    const programMembers = members.filter((member) => !member.blocked && competencies.some(
        (competency) => competency.expert_id === member.expert_id
            && acceptedRoles(member.team_role).includes(normalize(competency.competency_role))
            && normalize(competency.management_system) === normalize(scope.management_system)
            && normalize(competency.standard_code) === normalize(scope.standard_code),
    ));
    const coveredBy = members.flatMap((member) => {
        if (member.blocked) return [];
        const matchingCompetencies = competencies.filter(
            (competency) => competency.expert_id === member.expert_id
                && competencyCoversScope(competency, scope, member.team_role),
        );
        return matchingCompetencies.length ? [{
            ...member,
            competency_ids: matchingCompetencies.map((competency) => competency.id),
        }] : [];
    });
    return {
        project_scope_id: scope.id,
        management_system: scope.management_system,
        standard_code: scope.standard_code,
        iaf_code: scope.iaf_code,
        nace_code: scope.nace_code,
        scope_description: scope.scope_description,
        required: true,
        covered_by: coveredBy.map((member) => ({
            member_id: member.member_id,
            expert_id: member.expert_id,
            expert_name: member.expert_name,
            team_role: member.team_role,
            competency_ids: member.competency_ids,
        })),
        status: coveredBy.length ? 'COVERED' : programMembers.length ? 'PARTIAL' : 'MISSING',
    };
});

@Injectable()
export class AuditTeamReadinessService {
    constructor(private readonly prisma: PrismaService) {}

    private isStage1(plan: { audit_type?: string | null; audit_event?: { event_type?: string | null } | null }) {
        return /stage\s*1|stage1|giai[_\s-]*doan[_\s-]*1|gđ1/.test(
            `${plan.audit_type ?? ''} ${plan.audit_event?.event_type ?? ''}`.toLowerCase(),
        );
    }

    private isProjectTeam(plan: { audit_type?: string | null }) {
        return normalize(plan.audit_type) === 'PROJECT_TEAM';
    }

    private memberLabel(member: { experts: { full_name: string | null; employee_code: string | null }; expert_id: string }) {
        return member.experts.full_name?.trim() || member.experts.employee_code || member.expert_id;
    }

    async evaluate(appointmentId: string) {
        const appointment = await this.prisma.audit_team_appointments.findUnique({
            where: { id: appointmentId },
            include: {
                audit_plans: {
                    include: {
                        audit_event: { select: { event_type: true, planned_mandays: true } },
                        certification_projects: {
                            select: {
                                id: true,
                                certification_applications: { select: { customer_id: true } },
                            },
                        },
                    },
                },
                members: {
                    orderBy: { created_at: 'asc' },
                    include: {
                        experts: {
                            select: {
                                id: true,
                                full_name: true,
                                employee_code: true,
                                status: true,
                                profile_status: true,
                                user_account: { select: { status: true } },
                            },
                        },
                        scopes: true,
                        program_mandays: true,
                    },
                },
                program_manday_requirements: true,
                program_manday_allocations: true,
            },
        });
        if (!appointment) {
            throw new NotFoundException('Không tìm thấy quyết định chỉ định đoàn đánh giá');
        }
        if (!appointment.members.length) {
            return this.emptyResult(appointment);
        }

        const expertIds = appointment.members.map((member) => member.expert_id);
        const rangeStart = new Date(Math.min(...appointment.members.map((member) => member.planned_start_date.getTime())));
        const rangeEnd = new Date(Math.max(...appointment.members.map((member) => member.planned_end_date.getTime())));
        const customerId = appointment.audit_plans.certification_projects.certification_applications.customer_id;

        const [projectScopes, competencies, availability, conflicts, assignments] = await Promise.all([
            this.prisma.certification_project_scopes.findMany({
                where: { project_id: appointment.audit_plans.project_id, status: 'APPROVED' },
                include: {
                    isic_nace_mapping: { include: { target_code: true } },
                    nace_iaf_mapping: { include: { iaf_scope: true } },
                },
                orderBy: { created_at: 'asc' },
            }),
            this.prisma.expert_competencies.findMany({
                where: {
                    expert_id: { in: expertIds },
                    approval_status: 'APPROVED',
                    suspended_at: null,
                    effective_date: { lte: rangeEnd },
                    OR: [{ expiry_date: null }, { expiry_date: { gte: rangeStart } }],
                },
            }),
            this.prisma.expert_availability_periods.findMany({
                where: {
                    expert_id: { in: expertIds },
                    status: 'ACTIVE',
                    start_datetime: { lte: rangeEnd },
                    end_datetime: { gte: rangeStart },
                },
                select: {
                    expert_id: true,
                    availability_type: true,
                    start_datetime: true,
                    end_datetime: true,
                },
            }),
            this.prisma.expert_customer_conflicts.findMany({
                where: {
                    expert_id: { in: expertIds },
                    customer_id: customerId,
                    declaration_status: 'ACTIVE',
                    valid_from: { lte: rangeEnd },
                    OR: [{ valid_to: null }, { valid_to: { gte: rangeStart } }],
                },
                select: {
                    expert_id: true,
                    independence_status: true,
                    valid_from: true,
                    valid_to: true,
                },
            }),
            this.prisma.audit_team_members.findMany({
                where: {
                    expert_id: { in: expertIds },
                    appointment_id: { not: appointmentId },
                    assignment_status: { not: 'cancelled' },
                    planned_start_date: { lte: rangeEnd },
                    planned_end_date: { gte: rangeStart },
                    audit_team_appointments: { status: { in: ['draft', 'issued'] } },
                },
                include: {
                    audit_team_appointments: {
                        include: {
                            audit_plans: {
                                select: {
                                    audit_type: true,
                                    audit_event: { select: { event_type: true } },
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        const reasons: TeamReadinessReason[] = [];
        const eligibleMemberIds = new Set<string>();
        const scheduleApplies = !this.isProjectTeam(appointment.audit_plans);
        const memberResults = appointment.members.map((member) => {
            const memberReasons: TeamReadinessReason[] = [];
            const overlaps = (start: Date, end: Date) => start <= member.planned_end_date && end >= member.planned_start_date;
            const push = (code: string, severity: 'BLOCK' | 'WARNING', message: string) => memberReasons.push({
                code,
                severity,
                message,
                member_id: member.id,
                expert_id: member.expert_id,
            });
            if (
                normalize(member.experts.status) !== 'ACTIVE'
                || normalize(member.experts.profile_status) !== 'APPROVED'
                || normalize(member.experts.user_account?.status) !== 'ACTIVE'
            ) push('EXPERT_NOT_ACTIVE', 'BLOCK', `${this.memberLabel(member)} không còn hồ sơ chuyên gia hợp lệ.`);

            const effectiveCompetencies = competencies.filter((item) => item.expert_id === member.expert_id
                && item.effective_date <= member.planned_start_date
                && (!item.expiry_date || item.expiry_date >= member.planned_end_date));
            if (!acceptedRoles(member.team_role).length) {
                // Support roles do not contribute competence and are still valid team members.
            } else if (!effectiveCompetencies.some((item) => acceptedRoles(member.team_role).includes(normalize(item.competency_role)))) {
                push('ROLE_COMPETENCY_MISSING', 'BLOCK', `${this.memberLabel(member)} không có năng lực còn hiệu lực cho vai trò được phân công.`);
            }

            if (scheduleApplies) {
                for (const period of availability.filter((item) => item.expert_id === member.expert_id
                    && overlaps(item.start_datetime, item.end_datetime))) {
                    if (['UNAVAILABLE', 'LEAVE', 'OTHER_COMMITMENT'].includes(normalize(period.availability_type))) {
                        push(normalize(period.availability_type), 'BLOCK', `${this.memberLabel(member)} không sẵn sàng trong thời gian phân công.`);
                    }
                }
            }
            for (const conflict of conflicts.filter((item) => item.expert_id === member.expert_id
                && conflictOverlaps(item.valid_from, item.valid_to, member.planned_start_date, member.planned_end_date))) {
                if (normalize(conflict.independence_status) === 'PROHIBITED') {
                    push('INDEPENDENCE_CONFLICT', 'BLOCK', `${this.memberLabel(member)} bị cấm phân công đối với khách hàng.`);
                } else if (normalize(conflict.independence_status) === 'RESTRICTED') {
                    push('INDEPENDENCE_RESTRICTED', 'WARNING', `${this.memberLabel(member)} có hạn chế độc lập cần xem xét.`);
                }
            }
            if (scheduleApplies) {
                const overlappingAssignments = assignments.filter((item) => item.expert_id === member.expert_id
                    && overlaps(item.planned_start_date, item.planned_end_date));
                if (overlappingAssignments.some((item) => {
                    const plan = item.audit_team_appointments.audit_plans;
                    return !this.isProjectTeam(plan) && !this.isStage1(plan);
                })) push('DATE_CONFLICT', 'BLOCK', `${this.memberLabel(member)} đã có phân công onsite giao thời gian.`);
                if (overlappingAssignments.some((item) => this.isStage1(item.audit_team_appointments.audit_plans))) {
                    push('REMOTE_WORKLOAD', 'WARNING', `${this.memberLabel(member)} có workload Giai đoạn 1 từ xa giao thời gian.`);
                }
            }
            reasons.push(...memberReasons);
            if (!memberReasons.some((reason) => reason.severity === 'BLOCK')) eligibleMemberIds.add(member.id);
            return {
                member_id: member.id,
                expert_id: member.expert_id,
                expert_name: this.memberLabel(member),
                team_role: member.team_role,
                eligible: !memberReasons.some((reason) => reason.severity === 'BLOCK'),
                reasons: memberReasons,
            };
        });

        const coverageScopes: CoverageScope[] = projectScopes.map((scope) => ({
            id: scope.id,
            management_system: scope.management_system,
            standard_code: scope.standard_code,
            iaf_code: scope.nace_iaf_mapping.iaf_scope.iaf_code,
            nace_code: scope.isic_nace_mapping.target_code.code,
            scope_description: scope.scope_description,
        }));
        const coverageMembers: CoverageMember[] = appointment.members.map((member) => ({
            member_id: member.id,
            expert_id: member.expert_id,
            expert_name: this.memberLabel(member),
            team_role: member.team_role,
            blocked: !eligibleMemberIds.has(member.id),
        }));
        const effectiveCoverageCompetencies: CoverageCompetency[] = competencies.filter((competency) => appointment.members.some(
            (member) => member.expert_id === competency.expert_id
                && competency.effective_date <= member.planned_start_date
                && (!competency.expiry_date || competency.expiry_date >= member.planned_end_date),
        ));
        const scopeMatrix = buildCollectiveCoverage(coverageScopes, coverageMembers, effectiveCoverageCompetencies);
        const programMap = new Map<string, { management_system: string; standard_code: string; required_scope_ids: string[]; covered_by: Map<string, CoverageMember> }>();
        for (const row of scopeMatrix) {
            const key = `${normalize(row.management_system)}::${normalize(row.standard_code)}`;
            const current = programMap.get(key) ?? {
                management_system: row.management_system,
                standard_code: row.standard_code,
                required_scope_ids: [],
                covered_by: new Map<string, CoverageMember>(),
            };
            current.required_scope_ids.push(row.project_scope_id);
            for (const covered of row.covered_by) {
                const source = coverageMembers.find((member) => member.member_id === covered.member_id);
                if (source) current.covered_by.set(source.member_id, source);
            }
            programMap.set(key, current);
        }
        const programMatrix = [...programMap.entries()].map(([programKey, program]) => ({
            program_key: programKey,
            management_system: program.management_system,
            standard_code: program.standard_code,
            required_scope_ids: program.required_scope_ids,
            covered_by: [...program.covered_by.values()].map((member) => ({
                member_id: member.member_id,
                expert_id: member.expert_id,
                expert_name: member.expert_name,
                team_role: member.team_role,
            })),
            status: program.required_scope_ids.every((id) => scopeMatrix.find((row) => row.project_scope_id === id)?.status === 'COVERED')
                ? 'COVERED'
                : program.covered_by.size ? 'PARTIAL' : 'MISSING',
        }));

        const leaders = appointment.members.filter((member) => normalize(member.team_role) === 'TEAM_LEADER');
        const leaderQualified = leaders.length === 1 && eligibleMemberIds.has(leaders[0].id)
            && effectiveCoverageCompetencies.some((competency) => competency.expert_id === leaders[0].expert_id
                && normalize(competency.competency_role) === 'LEAD_AUDITOR');
        if (leaders.length !== 1) reasons.push({ code: 'LEADER_COUNT_INVALID', severity: 'BLOCK', message: 'Đoàn phải có đúng 01 trưởng đoàn.' });
        else if (!leaderQualified) reasons.push({ code: 'LEADER_NOT_QUALIFIED', severity: 'BLOCK', message: 'Trưởng đoàn không có năng lực Lead Auditor còn hiệu lực.' });
        for (const row of scopeMatrix.filter((item) => item.status !== 'COVERED')) {
            reasons.push({
                code: row.status === 'PARTIAL' ? 'SCOPE_PARTIALLY_COVERED' : 'SCOPE_NOT_COVERED',
                severity: 'BLOCK',
                message: `Chưa bao phủ đủ ${row.standard_code} · IAF ${row.iaf_code} · NACE ${row.nace_code}.`,
            });
        }

        const requiredMandays = Number(appointment.audit_plans.audit_event?.planned_mandays ?? 0);
        const stage1 = this.isStage1(appointment.audit_plans);
        const allocatedMandays = stage1
            ? appointment.members.filter((member) => countsTowardAuditMandays(member.team_role))
                .reduce((sum, member) => sum + Number(member.planned_mandays ?? 0), 0)
            : appointment.program_manday_allocations.reduce((sum, item) => sum + item.manday_units * 0.5, 0);
        const projectedRequired = stage1
            ? requiredMandays
            : appointment.program_manday_requirements.reduce((sum, item) => sum + item.required_units * 0.5, 0) || requiredMandays;
        const mandayBalanced = this.isProjectTeam(appointment.audit_plans)
            || projectedRequired > 0 && Math.abs(allocatedMandays - projectedRequired) < 0.001;
        if (!mandayBalanced) reasons.push({
            code: 'MANDAY_NOT_BALANCED',
            severity: 'BLOCK',
            message: `Man-day yêu cầu ${projectedRequired} MD, hiện phân bổ ${allocatedMandays} MD.`,
        });

        const technicalRequired = appointment.members.some((member) => member.scopes.some(
            (scope) => normalize(scope.coverage_type) === 'SUPPORTED_BY_TECHNICAL_EXPERT',
        ));
        const technicalCovered = !technicalRequired || appointment.members.some((member) =>
            normalize(member.team_role) === 'TECHNICAL_EXPERT'
            && eligibleMemberIds.has(member.id)
            && effectiveCoverageCompetencies.some((competency) => competency.expert_id === member.expert_id
                && normalize(competency.competency_role) === 'TECHNICAL_EXPERT'),
        );
        if (!technicalCovered) reasons.push({ code: 'TECHNICAL_EXPERTISE_MISSING', severity: 'BLOCK', message: 'Yêu cầu hỗ trợ chuyên gia kỹ thuật chưa được đáp ứng.' });

        const blockingReasons = reasons.filter((reason) => reason.severity === 'BLOCK');
        return {
            appointment_id: appointment.id,
            appointment_number: appointment.appointment_number,
            derived_at: new Date(),
            ready_to_issue: blockingReasons.length === 0,
            summary: {
                required_scopes: scopeMatrix.length,
                covered_scopes: scopeMatrix.filter((row) => row.status === 'COVERED').length,
                required_programs: programMatrix.length,
                covered_programs: programMatrix.filter((row) => row.status === 'COVERED').length,
                leader_qualified: leaderQualified,
                technical_expertise_required: technicalRequired,
                technical_expertise_covered: technicalCovered,
                manday_balanced: mandayBalanced,
                blocking_reason_count: blockingReasons.length,
                warning_count: reasons.filter((reason) => reason.severity === 'WARNING').length,
            },
            coverage_matrix: scopeMatrix,
            program_matrix: programMatrix,
            members: memberResults,
            manday: {
                algorithm: 'EXISTING_MANDAY_ALLOCATION',
                required_mandays: projectedRequired,
                allocated_mandays: allocatedMandays,
                difference_mandays: allocatedMandays - projectedRequired,
                balanced: mandayBalanced,
            },
            reasons: dedupeReasons(reasons),
        };
    }

    async assertReadyForIssue(appointmentId: string) {
        const readiness = await this.evaluate(appointmentId);
        if (!readiness.ready_to_issue) {
            throw new BadRequestException({
                code: 'AUDIT_TEAM_NOT_READY',
                message: 'Đoàn đánh giá chưa đáp ứng đầy đủ điều kiện ban hành.',
                readiness,
            });
        }
        return readiness;
    }

    private emptyResult(appointment: { id: string; appointment_number: string }) {
        return {
            appointment_id: appointment.id,
            appointment_number: appointment.appointment_number,
            derived_at: new Date(),
            ready_to_issue: false,
            summary: {
                required_scopes: 0,
                covered_scopes: 0,
                required_programs: 0,
                covered_programs: 0,
                leader_qualified: false,
                technical_expertise_required: false,
                technical_expertise_covered: true,
                manday_balanced: false,
                blocking_reason_count: 1,
                warning_count: 0,
            },
            coverage_matrix: [],
            program_matrix: [],
            members: [],
            manday: {
                algorithm: 'EXISTING_MANDAY_ALLOCATION',
                required_mandays: 0,
                allocated_mandays: 0,
                difference_mandays: 0,
                balanced: false,
            },
            reasons: [{ code: 'TEAM_EMPTY', severity: 'BLOCK', message: 'Đoàn đánh giá chưa có thành viên.' }],
        };
    }
}

const conflictOverlaps = (start: Date, end: Date | null, memberStart: Date, memberEnd: Date) =>
    start <= memberEnd && (!end || end >= memberStart);

const dedupeReasons = (reasons: TeamReadinessReason[]) => [...new Map(
    reasons.map((reason) => [`${reason.code}:${reason.member_id ?? ''}:${reason.message}`, reason]),
).values()];
