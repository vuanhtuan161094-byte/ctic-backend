import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
    allocateIntegratedMandays,
    countsTowardAuditMandays,
    MANDAY_UNIT,
    type IntegratedMandayAllocationSuccess,
    type ProgramRequirementResult,
} from './integrated-manday-allocation.engine';
import {
    AutoMandayAllocationDto,
    ManualMandayAllocationDto,
} from './dto/manday-allocation.dto';

interface CurrentProgramRequirement {
    programKey: string;
    programCode: string;
    managementSystem: string;
    preImsMandays: number;
    requiredUnits: number;
}

interface CurrentMemberAllocation {
    memberId: string;
    expertId: string;
    expertName: string;
    teamRole: string;
    maxStage2Units: number;
    mustReceiveMandays: boolean;
    competentProgramKeys: string[];
    programAllocatedUnits: Record<string, number>;
    totalAllocatedUnits: number;
}

interface AllocationSnapshot {
    calculationVersion: string;
    stage1Units: number;
    stage2Units: number;
    programRequirements: CurrentProgramRequirement[];
    members: CurrentMemberAllocation[];
}

@Injectable()
export class AuditMandayAllocationService {
    private readonly calculationVersion = 'IMS_ALLOCATION_V2';
    private readonly projectTeamAuditType = 'project_team';

    constructor(private readonly prisma: PrismaService) { }

    private normalize(value?: string | null): string {
        return value?.trim().toUpperCase() ?? '';
    }

    private normalizeStandardCode(value?: string | null): string {
        return this.normalize(value).replace(/[^A-Z0-9]/g, '');
    }

    private programKey(
        managementSystem?: string | null,
        standardCode?: string | null,
    ): string {
        return `${this.normalize(managementSystem)}::${this.normalizeStandardCode(standardCode)}`;
    }

    private numberValue(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private isHalfDay(value: number): boolean {
        return Math.abs(value * 2 - Math.round(value * 2)) < 0.0001;
    }

    private inclusiveDays(start: Date, end: Date): number {
        const day = 24 * 60 * 60 * 1000;
        const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
        return Math.floor((endUtc - startUtc) / day) + 1;
    }

    private isStage1(auditType?: string | null, eventType?: string | null): boolean {
        const value = `${auditType ?? ''} ${eventType ?? ''}`.toLowerCase();
        return /stage\s*1|stage1|giai[_\s-]*doan[_\s-]*1|gđ1/.test(value);
    }

    private isInitialStage2(auditType?: string | null, eventType?: string | null): boolean {
        const value = `${auditType ?? ''} ${eventType ?? ''}`.toLowerCase();
        return /stage\s*2|stage2|giai[_\s-]*doan[_\s-]*2|gđ2/.test(value);
    }

    private async getContext(appointmentId: string) {
        const appointment = await this.prisma.audit_team_appointments.findUnique({
            where: { id: appointmentId },
            include: {
                audit_plans: {
                    include: {
                        audit_event: true,
                        certification_projects: {
                            include: {
                                industry_scopes: {
                                    where: { status: 'APPROVED' },
                                    orderBy: { created_at: 'asc' },
                                },
                            },
                        },
                    },
                },
                members: {
                    orderBy: { created_at: 'asc' },
                    include: {
                        experts: true,
                        scopes: {
                            include: { project_scope: true },
                        },
                        program_mandays: true,
                    },
                },
                program_manday_requirements: {
                    orderBy: { created_at: 'asc' },
                },
                manday_allocation_versions: {
                    orderBy: { version_no: 'desc' },
                    take: 10,
                    include: {
                        created_by_user: {
                            select: {
                                id: true,
                                username: true,
                                full_name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!appointment) {
            throw new NotFoundException('Không tìm thấy phân công đoàn đánh giá');
        }

        return appointment;
    }

    private assertAllocationApplicable(appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>) {
        const plan = appointment.audit_plans;
        if (this.normalize(plan.audit_type) === this.normalize(this.projectTeamAuditType)) {
            throw new BadRequestException(
                'Ma trận man-day chương trình chỉ áp dụng tại từng cuộc đánh giá, không áp dụng cho chỉ định đoàn cấp hồ sơ.',
            );
        }
        if (this.isStage1(plan.audit_type, plan.audit_event?.event_type)) {
            throw new BadRequestException(
                'Giai đoạn 1 không chia man-day theo chương trình. Man-day được phân trực tiếp cho trưởng đoàn và đánh giá viên tham gia.',
            );
        }
        if (appointment.status !== 'draft') {
            throw new BadRequestException(
                'Chỉ được phân bổ hoặc điều chỉnh man-day khi phân công đang ở trạng thái draft.',
            );
        }
    }

    private buildPrograms(
        appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>,
        dto?: AutoMandayAllocationDto,
    ) {
        const map = new Map<string, {
            programKey: string;
            programCode: string;
            managementSystem: string;
            preImsMandays: number;
        }>();
        const currentWeightMap = new Map<string, number>(
            appointment.program_manday_requirements.map((item) => [
                item.program_key,
                Number(item.pre_ims_mandays),
            ]),
        );
        const suppliedWeightMap = new Map<string, number>(
            (dto?.program_weights ?? []).map((item) => [
                item.program_key,
                Math.max(0, Number(item.pre_ims_mandays) || 0),
            ]),
        );

        for (const scope of appointment.audit_plans.certification_projects.industry_scopes) {
            const key = this.programKey(scope.management_system, scope.standard_code);
            if (map.has(key)) continue;
            map.set(key, {
                programKey: key,
                programCode: scope.standard_code,
                managementSystem: scope.management_system,
                preImsMandays: suppliedWeightMap.get(key)
                    ?? currentWeightMap.get(key)
                    ?? 0,
            });
        }

        if (!map.size) {
            throw new BadRequestException(
                'Hồ sơ chưa có chương trình/tiêu chuẩn đã được phê duyệt.',
            );
        }

        const unknownWeight = [...suppliedWeightMap.keys()].find((key) => !map.has(key));
        if (unknownWeight) {
            throw new BadRequestException(
                `Trọng số man-day chứa chương trình không thuộc hồ sơ: ${unknownWeight}`,
            );
        }

        return [...map.values()];
    }

    private buildMembers(
        appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>,
        programKeys: Set<string>,
    ) {
        return appointment.members.map((member) => {
            const teamRole = this.normalize(member.team_role);
            const counting = countsTowardAuditMandays(teamRole);
            const competentProgramKeys = Array.from(new Set(
                member.scopes
                    .map((scope) => scope.project_scope
                        ? this.programKey(
                            scope.project_scope.management_system,
                            scope.project_scope.standard_code,
                        )
                        : null)
                    .filter((key): key is string => Boolean(key && programKeys.has(key))),
            ));
            const plannedMandays = this.numberValue(member.planned_mandays);
            const maxStage2Units = counting
                ? Math.max(0, Math.round(plannedMandays / MANDAY_UNIT))
                : 0;

            return {
                memberId: member.id,
                expertId: member.expert_id,
                expertName: member.experts.full_name?.trim() || member.experts.employee_code || member.expert_id,
                teamRole,
                competentProgramKeys,
                maxStage2Units,
                mustReceiveMandays: counting,
            };
        });
    }

    private requiredStage2Units(
        appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>,
    ): number {
        const mandays = this.numberValue(appointment.audit_plans.audit_event?.planned_mandays);
        if (mandays <= 0) {
            throw new BadRequestException(
                'Kỳ đánh giá chưa có man-day được phê duyệt trong chương trình.',
            );
        }
        if (!this.isHalfDay(mandays)) {
            throw new BadRequestException(
                'Man-day của kỳ đánh giá phải là bội số của 0,5 MD trước khi phân bổ.',
            );
        }
        return Math.round(mandays / MANDAY_UNIT);
    }


    private assignedStage2Units(
        appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>,
    ): number {
        return appointment.members.reduce((sum, member) => {
            if (!countsTowardAuditMandays(this.normalize(member.team_role))) return sum;
            const mandays = this.numberValue(member.planned_mandays);
            if (mandays <= 0) return sum;
            if (!this.isHalfDay(mandays)) {
                throw new BadRequestException(
                    `${member.experts.full_name?.trim() || member.experts.employee_code || member.expert_id} có ngày công không theo bước 0,5 MD.`,
                );
            }
            return sum + Math.round(mandays / MANDAY_UNIT);
        }, 0);
    }

    private allocationTargetStage2Units(
        appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>,
    ): number {
        const requiredUnits = this.requiredStage2Units(appointment);
        const assignedUnits = this.assignedStage2Units(appointment);
        if (assignedUnits < requiredUnits) {
            throw new BadRequestException(
                `Chưa đủ man-day để phân bổ: kế hoạch yêu cầu tối thiểu ${(requiredUnits * MANDAY_UNIT).toFixed(1)} MD nhưng đoàn mới bố trí ${(assignedUnits * MANDAY_UNIT).toFixed(1)} MD.`,
            );
        }
        return assignedUnits;
    }

    private async approvedStage1Units(projectId: string): Promise<number> {
        const calculation = await this.prisma.manday_calculations.findFirst({
            where: {
                project_id: projectId,
                status: 'approved',
            },
            orderBy: { version_no: 'desc' },
            select: { stage1_mandays: true },
        });
        const mandays = this.numberValue(calculation?.stage1_mandays);
        return this.isHalfDay(mandays)
            ? Math.round(mandays / MANDAY_UNIT)
            : 0;
    }

    private async stage1UnitsForPlan(
        plan: {
            project_id: string;
            audit_type?: string | null;
            audit_event?: { event_type?: string | null } | null;
        },
    ): Promise<number> {
        if (!this.isInitialStage2(plan.audit_type, plan.audit_event?.event_type)) {
            return 0;
        }
        return this.approvedStage1Units(plan.project_id);
    }

    private snapshotFromContext(
        appointment: Awaited<ReturnType<AuditMandayAllocationService['getContext']>>,
        stage1Units: number,
        stage2Units: number,
    ): AllocationSnapshot | null {
        if (!appointment.program_manday_requirements.length) return null;

        const requirements: CurrentProgramRequirement[] = appointment.program_manday_requirements.map((item) => ({
            programKey: item.program_key,
            programCode: item.standard_code,
            managementSystem: item.management_system,
            preImsMandays: Number(item.pre_ims_mandays),
            requiredUnits: item.required_units,
        }));
        const requirementKeys = new Set(requirements.map((item) => item.programKey));

        const members: CurrentMemberAllocation[] = appointment.members.map((member) => {
            const programAllocatedUnits = Object.fromEntries(
                requirements.map((program) => [program.programKey, 0]),
            );
            for (const row of member.program_mandays) {
                if (requirementKeys.has(row.program_key)) {
                    programAllocatedUnits[row.program_key] = row.manday_units;
                }
            }
            const teamRole = this.normalize(member.team_role);
            const competentProgramKeys = Array.from(new Set(
                member.scopes
                    .map((scope) => scope.project_scope
                        ? this.programKey(
                            scope.project_scope.management_system,
                            scope.project_scope.standard_code,
                        )
                        : null)
                    .filter((key): key is string => Boolean(key && requirementKeys.has(key))),
            ));
            return {
                memberId: member.id,
                expertId: member.expert_id,
                expertName: member.experts.full_name?.trim() || member.experts.employee_code || member.expert_id,
                teamRole,
                maxStage2Units: countsTowardAuditMandays(teamRole)
                    ? Math.max(0, Math.round(this.numberValue(member.planned_mandays) / MANDAY_UNIT))
                    : 0,
                mustReceiveMandays: countsTowardAuditMandays(teamRole),
                competentProgramKeys,
                programAllocatedUnits,
                totalAllocatedUnits: Object.values(programAllocatedUnits).reduce((sum, units) => sum + units, 0),
            };
        });

        return {
            calculationVersion: this.calculationVersion,
            stage1Units,
            stage2Units,
            programRequirements: requirements,
            members,
        };
    }

    private snapshotFromEngine(
        result: IntegratedMandayAllocationSuccess,
        stage1Units: number,
    ): AllocationSnapshot {
        return {
            calculationVersion: this.calculationVersion,
            stage1Units,
            stage2Units: result.stage2Units,
            programRequirements: result.programRequirements.map((program) => ({
                programKey: program.programKey,
                programCode: program.programCode,
                managementSystem: program.managementSystem,
                preImsMandays: program.preImsMandays,
                requiredUnits: program.requiredUnits,
            })),
            members: result.members.map((member) => ({
                memberId: member.memberId,
                expertId: member.expertId,
                expertName: member.expertName,
                teamRole: String(member.teamRole),
                maxStage2Units: member.maxStage2Units,
                mustReceiveMandays: member.mustReceiveMandays,
                competentProgramKeys: [...member.competentProgramKeys],
                programAllocatedUnits: member.programAllocatedUnits,
                totalAllocatedUnits: member.totalAllocatedUnits,
            })),
        };
    }

    private validateSnapshot(
        snapshot: AllocationSnapshot,
        contextMembers: ReturnType<AuditMandayAllocationService['buildMembers']>,
    ): void {
        const memberById = new Map<string, (typeof contextMembers)[number]>(
            contextMembers.map((member) => [member.memberId, member]),
        );
        const programByKey = new Map(snapshot.programRequirements.map((program) => [program.programKey, program]));
        const programTotals = new Map<string, number>(
            snapshot.programRequirements.map((program) => [program.programKey, 0]),
        );
        let grandTotal = 0;
        let leadAllocated = false;

        for (const member of snapshot.members) {
            const contextMember = memberById.get(member.memberId);
            if (!contextMember) {
                throw new BadRequestException('Phân bổ chứa thành viên không còn thuộc đoàn đánh giá.');
            }
            const counting = countsTowardAuditMandays(contextMember.teamRole);
            let rowTotal = 0;
            for (const [programKey, rawUnits] of Object.entries(member.programAllocatedUnits)) {
                const units = Number(rawUnits);
                if (!Number.isInteger(units) || units < 0) {
                    throw new BadRequestException('Man-day chương trình phải được lưu theo đơn vị 0,5 MD và không được âm.');
                }
                if (!programByKey.has(programKey)) {
                    throw new BadRequestException(`Chương trình ${programKey} không còn thuộc hồ sơ.`);
                }
                if (units > 0 && !counting) {
                    throw new BadRequestException('Chuyên gia kỹ thuật, quan sát viên, chuyên gia tập sự và vai trò hỗ trợ không được tính man-day.');
                }
                if (units > 0 && !contextMember.competentProgramKeys.includes(programKey)) {
                    throw new BadRequestException(
                        `${contextMember.expertName} không có năng lực chương trình được phân man-day.`,
                    );
                }
                rowTotal += units;
                programTotals.set(programKey, (programTotals.get(programKey) ?? 0) + units);
            }
            if (rowTotal !== contextMember.maxStage2Units) {
                throw new BadRequestException(
                    `${contextMember.expertName} đã bố trí ${(contextMember.maxStage2Units * MANDAY_UNIT).toFixed(1)} MD nhưng ma trận đang phân ${(rowTotal * MANDAY_UNIT).toFixed(1)} MD. Mọi man-day đã bố trí phải được gắn trực tiếp với chương trình.`,
                );
            }
            if (contextMember.mustReceiveMandays && rowTotal < 1) {
                throw new BadRequestException(
                    `${contextMember.expertName} là thành viên chính thức nên phải nhận tối thiểu 0,5 MD.`,
                );
            }
            if (this.normalize(contextMember.teamRole) === 'TEAM_LEADER' && rowTotal >= 1) {
                leadAllocated = true;
            }
            grandTotal += rowTotal;
        }

        for (const program of snapshot.programRequirements) {
            const actual = programTotals.get(program.programKey) ?? 0;
            if (actual !== program.requiredUnits) {
                throw new BadRequestException(
                    `${program.programCode} yêu cầu ${(program.requiredUnits * MANDAY_UNIT).toFixed(1)} MD nhưng đang phân ${(actual * MANDAY_UNIT).toFixed(1)} MD.`,
                );
            }
        }
        if (grandTotal !== snapshot.stage2Units) {
            throw new BadRequestException(
                `Giai đoạn 2 yêu cầu ${(snapshot.stage2Units * MANDAY_UNIT).toFixed(1)} MD nhưng đang phân ${(grandTotal * MANDAY_UNIT).toFixed(1)} MD.`,
            );
        }
        if (!leadAllocated) {
            throw new BadRequestException('Trưởng đoàn phải nhận tối thiểu 0,5 MD Giai đoạn 2 trong một chương trình phù hợp.');
        }
    }

    private async persistSnapshot(
        appointmentId: string,
        snapshot: AllocationSnapshot,
        mode: 'AUTO' | 'MANUAL_OVERRIDE',
        userId: string,
        before: AllocationSnapshot | null,
        changeReason?: string,
    ) {
        const nextVersion = await this.prisma.audit_manday_allocation_versions.findFirst({
            where: { appointment_id: appointmentId },
            orderBy: { version_no: 'desc' },
            select: { version_no: true },
        });
        const versionNo = (nextVersion?.version_no ?? 0) + 1;

        await this.prisma.$transaction(async (transaction) => {
            await transaction.audit_member_program_mandays.deleteMany({
                where: { appointment_id: appointmentId },
            });
            await transaction.audit_program_manday_requirements.deleteMany({
                where: { appointment_id: appointmentId },
            });

            await transaction.audit_program_manday_requirements.createMany({
                data: snapshot.programRequirements.map((program) => ({
                    appointment_id: appointmentId,
                    program_key: program.programKey,
                    management_system: program.managementSystem,
                    standard_code: program.programCode,
                    pre_ims_mandays: program.preImsMandays,
                    required_units: program.requiredUnits,
                })),
            });

            const memberRows = snapshot.members.flatMap((member) =>
                Object.entries(member.programAllocatedUnits)
                    .filter(([, units]) => units > 0)
                    .map(([programKey, units]) => {
                        const program = snapshot.programRequirements.find((item) => item.programKey === programKey)!;
                        return {
                            appointment_id: appointmentId,
                            member_id: member.memberId,
                            program_key: programKey,
                            management_system: program.managementSystem,
                            standard_code: program.programCode,
                            manday_units: units,
                        };
                    }),
            );
            if (memberRows.length) {
                await transaction.audit_member_program_mandays.createMany({ data: memberRows });
            }

            for (const member of snapshot.members) {
                await transaction.audit_team_members.update({
                    where: { id: member.memberId },
                    data: {
                        planned_mandays: member.totalAllocatedUnits * MANDAY_UNIT,
                    },
                });
            }

            await transaction.audit_manday_allocation_versions.create({
                data: {
                    appointment_id: appointmentId,
                    version_no: versionNo,
                    calculation_version: snapshot.calculationVersion,
                    stage1_units: snapshot.stage1Units,
                    stage2_units: snapshot.stage2Units,
                    allocation_mode: mode,
                    before_json: before ? JSON.stringify(before) : null,
                    after_json: JSON.stringify(snapshot),
                    change_reason: changeReason?.trim() || null,
                    created_by: userId,
                },
            });

            await transaction.audit_logs.create({
                data: {
                    user_id: userId,
                    action: mode === 'AUTO'
                        ? 'AUTO_ALLOCATE_AUDIT_MANDAYS'
                        : 'MANUAL_OVERRIDE_AUDIT_MANDAYS',
                    entity_type: 'audit_team_appointment',
                    entity_id: appointmentId,
                },
            });
        });
    }

    async getCurrent(appointmentId: string) {
        const appointment = await this.getContext(appointmentId);
        const plan = appointment.audit_plans;
        const projectContext = this.normalize(plan.audit_type) === this.normalize(this.projectTeamAuditType);
        const stage1 = this.isStage1(plan.audit_type, plan.audit_event?.event_type);
        const requiredStage2Units = projectContext || stage1
            ? 0
            : this.requiredStage2Units(appointment);
        const allocationTargetStage2Units = projectContext || stage1
            ? 0
            : this.assignedStage2Units(appointment);
        const stage1Units = await this.stage1UnitsForPlan(plan);
        const snapshot = this.snapshotFromContext(appointment, stage1Units, allocationTargetStage2Units);
        const programs = this.buildPrograms(appointment);
        const members = this.buildMembers(appointment, new Set(programs.map((program) => program.programKey)));

        const requirementByKey = new Map(
            (snapshot?.programRequirements ?? []).map((item) => [item.programKey, item]),
        );
        const actualProgramTotals = new Map<string, number>();
        for (const member of snapshot?.members ?? []) {
            for (const [key, units] of Object.entries(member.programAllocatedUnits)) {
                actualProgramTotals.set(key, (actualProgramTotals.get(key) ?? 0) + units);
            }
        }
        const memberSnapshotById = new Map(
            (snapshot?.members ?? []).map((member) => [member.memberId, member]),
        );

        const responsePrograms = programs.map((program) => {
            const requirement = requirementByKey.get(program.programKey);
            const actualUnits = actualProgramTotals.get(program.programKey) ?? 0;
            return {
                program_key: program.programKey,
                program_code: program.programCode,
                management_system: program.managementSystem,
                pre_ims_mandays: requirement?.preImsMandays ?? program.preImsMandays,
                required_units: requirement?.requiredUnits ?? 0,
                required_mandays: (requirement?.requiredUnits ?? 0) * MANDAY_UNIT,
                allocated_units: actualUnits,
                allocated_mandays: actualUnits * MANDAY_UNIT,
                difference_units: actualUnits - (requirement?.requiredUnits ?? 0),
            };
        });

        const responseMembers = members.map((member) => {
            const current = memberSnapshotById.get(member.memberId);
            const programAllocations = Object.fromEntries(
                programs.map((program) => [
                    program.programKey,
                    current?.programAllocatedUnits[program.programKey] ?? 0,
                ]),
            );
            const totalUnits = Object.values(programAllocations).reduce((sum, units) => sum + Number(units), 0);
            return {
                member_id: member.memberId,
                expert_id: member.expertId,
                expert_name: member.expertName,
                team_role: member.teamRole,
                counts_toward_mandays: countsTowardAuditMandays(member.teamRole),
                must_receive_mandays: member.mustReceiveMandays,
                max_stage2_units: member.maxStage2Units,
                max_stage2_mandays: member.maxStage2Units * MANDAY_UNIT,
                competent_program_keys: member.competentProgramKeys,
                program_allocations: Object.fromEntries(
                    Object.entries(programAllocations).map(([key, units]) => [key, Number(units) * MANDAY_UNIT]),
                ),
                total_stage2_units: totalUnits,
                total_stage2_mandays: totalUnits * MANDAY_UNIT,
            };
        });

        const allocatedUnits = responseMembers.reduce((sum, member) => sum + member.total_stage2_units, 0);
        const programBalanced = responsePrograms.every((program) => program.difference_units === 0);
        const memberValid = responseMembers.every((member) =>
            !member.counts_toward_mandays
                ? member.total_stage2_units === 0
                : member.total_stage2_units >= 1 && member.total_stage2_units === member.max_stage2_units,
        );
        const minimumSatisfied = allocationTargetStage2Units >= requiredStage2Units;

        return {
            appointment_id: appointmentId,
            appointment_status: appointment.status,
            allocation_applicable: !projectContext && !stage1,
            is_stage1: stage1,
            calculation_version: snapshot?.calculationVersion ?? this.calculationVersion,
            stage1_units: stage1Units,
            stage1_mandays: stage1Units * MANDAY_UNIT,
            stage2_units: requiredStage2Units,
            stage2_mandays: requiredStage2Units * MANDAY_UNIT,
            allocation_target_stage2_units: allocationTargetStage2Units,
            allocation_target_stage2_mandays: allocationTargetStage2Units * MANDAY_UNIT,
            allocated_stage2_units: allocatedUnits,
            allocated_stage2_mandays: allocatedUnits * MANDAY_UNIT,
            difference_units: allocatedUnits - allocationTargetStage2Units,
            difference_mandays: (allocatedUnits - allocationTargetStage2Units) * MANDAY_UNIT,
            plan_difference_units: allocatedUnits - requiredStage2Units,
            plan_difference_mandays: (allocatedUnits - requiredStage2Units) * MANDAY_UNIT,
            balanced: Boolean(snapshot)
                && minimumSatisfied
                && allocatedUnits === allocationTargetStage2Units
                && programBalanced
                && memberValid,
            programs: responsePrograms,
            members: responseMembers,
            latest_version: appointment.manday_allocation_versions[0] ?? null,
            history: appointment.manday_allocation_versions,
            stage1_note: stage1
                ? 'Giai đoạn 1 không chia theo chương trình. Trưởng đoàn chịu trách nhiệm chính; đánh giá viên có thể tham gia và nhận man-day. Tổng man-day của các vai trò được tính phải khớp man-day Giai đoạn 1.'
                : null,
        };
    }

    async autoAllocate(
        appointmentId: string,
        dto: AutoMandayAllocationDto,
        userId: string,
        changeReason = 'Hệ thống tự động phân bổ theo năng lực chương trình và thời gian tham gia.',
    ) {
        const appointment = await this.getContext(appointmentId);
        this.assertAllocationApplicable(appointment);
        const programs = this.buildPrograms(appointment, dto);
        const stage2Units = this.allocationTargetStage2Units(appointment);
        const members = this.buildMembers(appointment, new Set(programs.map((program) => program.programKey)));
        const lead = members.find((member) => this.normalize(member.teamRole) === 'TEAM_LEADER');
        if (!lead) {
            throw new BadRequestException('Không xác định được trưởng đoàn đánh giá.');
        }
        const result = allocateIntegratedMandays({
            stage2Units,
            leadMemberId: lead.memberId,
            programs,
            members,
        });
        if (!result.success) {
            throw new BadRequestException({
                errorCode: result.errorCode,
                message: result.message,
                details: result.details ?? null,
            });
        }

        const stage1Units = await this.stage1UnitsForPlan(appointment.audit_plans);
        const before = this.snapshotFromContext(appointment, stage1Units, stage2Units);
        const snapshot = this.snapshotFromEngine(result, stage1Units);
        this.validateSnapshot(snapshot, members);
        await this.persistSnapshot(
            appointmentId,
            snapshot,
            'AUTO',
            userId,
            before,
            changeReason,
        );
        return this.getCurrent(appointmentId);
    }

    async manualOverride(
        appointmentId: string,
        dto: ManualMandayAllocationDto,
        userId: string,
    ) {
        const appointment = await this.getContext(appointmentId);
        this.assertAllocationApplicable(appointment);
        const stage2Units = this.allocationTargetStage2Units(appointment);
        const stage1Units = await this.stage1UnitsForPlan(appointment.audit_plans);
        const before = this.snapshotFromContext(appointment, stage1Units, stage2Units);
        if (!before) {
            throw new BadRequestException(
                'Chưa có đề xuất tự động. Hãy bấm “Tự động phân bổ” trước khi chỉnh sửa thủ công.',
            );
        }

        const programs = this.buildPrograms(appointment);
        const contextMembers = this.buildMembers(appointment, new Set(programs.map((program) => program.programKey)));
        const memberById = new Map<string, (typeof contextMembers)[number]>(
            contextMembers.map((member) => [member.memberId, member]),
        );
        const programKeySet = new Set(before.programRequirements.map((program) => program.programKey));
        const cells = new Map<string, number>();

        for (const cell of dto.allocations) {
            const member = memberById.get(cell.member_id);
            if (!member) throw new BadRequestException('Có thành viên không còn thuộc đoàn đánh giá.');
            if (!programKeySet.has(cell.program_key)) throw new BadRequestException('Có chương trình không còn thuộc phân bổ hiện hành.');
            if (!this.isHalfDay(cell.mandays)) {
                throw new BadRequestException('Mỗi ô man-day phải là bội số của 0,5 MD.');
            }
            const key = `${cell.member_id}::${cell.program_key}`;
            if (cells.has(key)) throw new BadRequestException('Một ô man-day bị gửi lặp lại.');
            const units = Math.round(cell.mandays / MANDAY_UNIT);
            if (units > 0 && !countsTowardAuditMandays(member.teamRole)) {
                throw new BadRequestException('Chuyên gia kỹ thuật, quan sát viên và chuyên gia tập sự không được tính man-day.');
            }
            if (units > 0 && !member.competentProgramKeys.includes(cell.program_key)) {
                throw new BadRequestException(`${member.expertName} không có năng lực chương trình được chỉnh sửa.`);
            }
            cells.set(key, units);
        }

        const snapshot: AllocationSnapshot = {
            calculationVersion: this.calculationVersion,
            stage1Units,
            stage2Units,
            programRequirements: before.programRequirements,
            members: contextMembers.map((member) => {
                const programAllocatedUnits = Object.fromEntries(
                    before.programRequirements.map((program) => [
                        program.programKey,
                        cells.get(`${member.memberId}::${program.programKey}`) ?? 0,
                    ]),
                );
                return {
                    memberId: member.memberId,
                    expertId: member.expertId,
                    expertName: member.expertName,
                    teamRole: member.teamRole,
                    maxStage2Units: member.maxStage2Units,
                    mustReceiveMandays: member.mustReceiveMandays,
                    competentProgramKeys: member.competentProgramKeys,
                    programAllocatedUnits,
                    totalAllocatedUnits: Object.values(programAllocatedUnits).reduce((sum, units) => sum + Number(units), 0),
                };
            }),
        };

        this.validateSnapshot(snapshot, contextMembers);
        await this.persistSnapshot(
            appointmentId,
            snapshot,
            'MANUAL_OVERRIDE',
            userId,
            before,
            dto.change_reason,
        );
        return this.getCurrent(appointmentId);
    }

    async restoreAutoProposal(appointmentId: string, userId: string) {
        const latestAuto = await this.prisma.audit_manday_allocation_versions.findFirst({
            where: {
                appointment_id: appointmentId,
                allocation_mode: 'AUTO',
            },
            orderBy: { version_no: 'desc' },
            select: { after_json: true },
        });
        if (!latestAuto) {
            throw new BadRequestException('Chưa có đề xuất tự động để khôi phục.');
        }
        let snapshot: AllocationSnapshot;
        try {
            snapshot = JSON.parse(latestAuto.after_json) as AllocationSnapshot;
        } catch {
            throw new BadRequestException('Không đọc được phiên bản đề xuất tự động trước đó.');
        }
        return this.autoAllocate(
            appointmentId,
            {
                program_weights: snapshot.programRequirements.map((program) => ({
                    program_key: program.programKey,
                    pre_ims_mandays: program.preImsMandays,
                })),
            },
            userId,
            'Khôi phục đề xuất tự động gần nhất.',
        );
    }

    async clearCurrentAllocation(appointmentId: string, transaction?: any) {
        const client = transaction ?? this.prisma;
        await client.audit_member_program_mandays.deleteMany({
            where: { appointment_id: appointmentId },
        });
        await client.audit_program_manday_requirements.deleteMany({
            where: { appointment_id: appointmentId },
        });
    }

    async ensureAllocationForIssue(
        appointmentId: string,
        userId: string,
    ): Promise<void> {
        const current = await this.getCurrent(appointmentId);
        if (!current.allocation_applicable || current.balanced) return;

        await this.autoAllocate(
            appointmentId,
            {
                program_weights: current.programs.map((program) => ({
                    program_key: program.program_key,
                    pre_ims_mandays: program.pre_ims_mandays,
                })),
            },
            userId,
            'Tự động đồng bộ ma trận man-day trước khi ban hành phân công.',
        );
    }

    async validateForIssue(appointmentId: string): Promise<void> {
        const appointment = await this.getContext(appointmentId);
        const plan = appointment.audit_plans;
        if (this.normalize(plan.audit_type) === this.normalize(this.projectTeamAuditType)) return;

        const requiredMandays = this.numberValue(plan.audit_event?.planned_mandays);
        if (requiredMandays <= 0 || !this.isHalfDay(requiredMandays)) {
            throw new BadRequestException('Kỳ đánh giá chưa có man-day hợp lệ được phê duyệt.');
        }

        if (this.isStage1(plan.audit_type, plan.audit_event?.event_type)) {
            const leaders = appointment.members.filter(
                (member) => this.normalize(member.team_role) === 'TEAM_LEADER',
            );
            if (leaders.length !== 1) {
                throw new BadRequestException('Giai đoạn 1 phải có đúng 01 trưởng đoàn.');
            }

            let allocatedMandays = 0;
            for (const member of appointment.members) {
                const mandays = this.numberValue(member.planned_mandays);
                const role = this.normalize(member.team_role);
                const counting = countsTowardAuditMandays(role);

                if (!counting) {
                    if (mandays > 0.001) {
                        throw new BadRequestException(
                            'Chuyên gia kỹ thuật, quan sát viên, chuyên gia tập sự và vai trò hỗ trợ không được tính man-day Giai đoạn 1.',
                        );
                    }
                    continue;
                }

                if (mandays < MANDAY_UNIT - 0.001) {
                    throw new BadRequestException(
                        `${member.experts.full_name?.trim() || member.experts.employee_code || member.expert_id} tham gia Giai đoạn 1 nên phải được phân tối thiểu 0,5 MD.`,
                    );
                }
                allocatedMandays += mandays;
            }

            const leaderMandays = this.numberValue(leaders[0].planned_mandays);
            if (leaderMandays < MANDAY_UNIT - 0.001) {
                throw new BadRequestException(
                    'Trưởng đoàn phải trực tiếp tham gia tối thiểu 0,5 MD tại Giai đoạn 1.',
                );
            }

            if (allocatedMandays + 0.001 < requiredMandays) {
                throw new BadRequestException(
                    `Chưa thể ban hành: Giai đoạn 1 yêu cầu tối thiểu ${requiredMandays} MD nhưng mới bố trí ${allocatedMandays} MD.`,
                );
            }
            return;
        }

        const requiredStage2Units = this.requiredStage2Units(appointment);
        const stage2Units = this.assignedStage2Units(appointment);
        if (stage2Units < requiredStage2Units) {
            throw new BadRequestException(
                `Chưa thể ban hành: kế hoạch yêu cầu tối thiểu ${(requiredStage2Units * MANDAY_UNIT).toFixed(1)} MD nhưng đoàn mới bố trí ${(stage2Units * MANDAY_UNIT).toFixed(1)} MD.`,
            );
        }
        const stage1Units = await this.stage1UnitsForPlan(plan);
        const snapshot = this.snapshotFromContext(appointment, stage1Units, stage2Units);
        if (!snapshot) {
            throw new BadRequestException(
                'Chưa thể ban hành: chưa có ma trận man-day theo Thành viên + Chương trình. Hãy bấm “Tự động phân bổ”.',
            );
        }
        const programs = this.buildPrograms(appointment);
        const members = this.buildMembers(appointment, new Set(programs.map((program) => program.programKey)));
        this.validateSnapshot(snapshot, members);
    }
}
