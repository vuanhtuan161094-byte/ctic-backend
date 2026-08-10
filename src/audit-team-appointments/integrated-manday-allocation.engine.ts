export const MANDAY_UNIT = 0.5;

export type AllocationTeamRole =
    | 'TEAM_LEADER'
    | 'AUDITOR'
    | 'TECHNICAL_EXPERT'
    | 'TRAINEE'
    | 'OBSERVER'
    | 'WITNESS_EVALUATOR'
    | string;

export interface IntegratedMandayProgramInput {
    programKey: string;
    programCode: string;
    managementSystem: string;
    preImsMandays: number;
}

export interface IntegratedMandayMemberInput {
    memberId: string;
    expertId: string;
    expertName: string;
    teamRole: AllocationTeamRole;
    competentProgramKeys: string[];
    maxStage2Units: number;
    mustReceiveMandays: boolean;
}

export interface IntegratedMandayAllocationInput {
    stage2Units: number;
    leadMemberId: string;
    programs: IntegratedMandayProgramInput[];
    members: IntegratedMandayMemberInput[];
}

export interface ProgramRequirementResult {
    programKey: string;
    programCode: string;
    managementSystem: string;
    preImsMandays: number;
    requiredUnits: number;
}

export interface MemberAllocationResult {
    memberId: string;
    expertId: string;
    expertName: string;
    teamRole: AllocationTeamRole;
    competentProgramKeys: string[];
    maxStage2Units: number;
    mustReceiveMandays: boolean;
    totalAllocatedUnits: number;
    programAllocatedUnits: Record<string, number>;
}

export interface IntegratedMandayAllocationSuccess {
    success: true;
    stage2Units: number;
    programRequirements: ProgramRequirementResult[];
    members: MemberAllocationResult[];
}

export type AllocationFailureCode =
    | 'PROGRAM_NOT_COVERED'
    | 'INSUFFICIENT_STAGE2_MD'
    | 'INSUFFICIENT_MEMBER_CAPACITY'
    | 'TOO_MANY_TEAM_MEMBERS'
    | 'LEAD_NOT_ALLOCATABLE'
    | 'NO_FEASIBLE_ALLOCATION';

export interface IntegratedMandayAllocationFailure {
    success: false;
    errorCode: AllocationFailureCode;
    message: string;
    details?: unknown;
}

export type IntegratedMandayAllocationResult =
    | IntegratedMandayAllocationSuccess
    | IntegratedMandayAllocationFailure;

interface MutableMember extends IntegratedMandayMemberInput {
    competentProgramKeySet: Set<string>;
    relevantCompetencyCount: number;
    totalAllocatedUnits: number;
    programAllocatedUnits: Record<string, number>;
    remainingCapacityUnits: number;
}

interface MutableProgram extends ProgramRequirementResult {
    remainingUnits: number;
}

interface FlowEdge {
    to: number;
    reverseIndex: number;
    capacity: number;
}

class DinicMaxFlow {
    private readonly graph: FlowEdge[][];

    constructor(private readonly nodeCount: number) {
        this.graph = Array.from({ length: nodeCount }, () => []);
    }

    addEdge(from: number, to: number, capacity: number): void {
        const forward: FlowEdge = {
            to,
            reverseIndex: this.graph[to].length,
            capacity,
        };
        const reverse: FlowEdge = {
            to: from,
            reverseIndex: this.graph[from].length,
            capacity: 0,
        };
        this.graph[from].push(forward);
        this.graph[to].push(reverse);
    }

    maxFlow(source: number, sink: number): number {
        let total = 0;
        const level = new Array<number>(this.nodeCount);

        while (this.buildLevels(source, sink, level)) {
            const nextEdge = new Array<number>(this.nodeCount).fill(0);
            while (true) {
                const pushed = this.sendFlow(
                    source,
                    sink,
                    Number.MAX_SAFE_INTEGER,
                    level,
                    nextEdge,
                );
                if (pushed <= 0) break;
                total += pushed;
            }
        }

        return total;
    }

    private buildLevels(source: number, sink: number, level: number[]): boolean {
        level.fill(-1);
        level[source] = 0;
        const queue: number[] = [source];

        for (let index = 0; index < queue.length; index += 1) {
            const node = queue[index];
            for (const edge of this.graph[node]) {
                if (edge.capacity > 0 && level[edge.to] < 0) {
                    level[edge.to] = level[node] + 1;
                    queue.push(edge.to);
                }
            }
        }

        return level[sink] >= 0;
    }

    private sendFlow(
        node: number,
        sink: number,
        available: number,
        level: number[],
        nextEdge: number[],
    ): number {
        if (node === sink) return available;

        for (
            ;
            nextEdge[node] < this.graph[node].length;
            nextEdge[node] += 1
        ) {
            const edge = this.graph[node][nextEdge[node]];
            if (edge.capacity <= 0 || level[edge.to] !== level[node] + 1) {
                continue;
            }

            const pushed = this.sendFlow(
                edge.to,
                sink,
                Math.min(available, edge.capacity),
                level,
                nextEdge,
            );
            if (pushed > 0) {
                edge.capacity -= pushed;
                this.graph[edge.to][edge.reverseIndex].capacity += pushed;
                return pushed;
            }
        }

        return 0;
    }
}

function normalizeUnits(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function roleRank(teamRole: AllocationTeamRole): number {
    const role = String(teamRole).trim().toUpperCase();
    if (role === 'AUDITOR') return 0;
    if (role === 'TEAM_LEADER') return 1;
    return 2;
}

export function countsTowardAuditMandays(teamRole: AllocationTeamRole): boolean {
    const role = String(teamRole).trim().toUpperCase();
    return role === 'TEAM_LEADER' || role === 'AUDITOR';
}

export function allocateProgramRequirementUnits(
    programs: IntegratedMandayProgramInput[],
    stage2Units: number,
): ProgramRequirementResult[] {
    const normalizedStage2Units = normalizeUnits(stage2Units);
    if (!programs.length) return [];
    if (normalizedStage2Units < programs.length) {
        throw new Error(
            'Không thể phân bổ Giai đoạn 2: tổng man-day không đủ để bố trí tối thiểu 0,5 MD cho mỗi chương trình.',
        );
    }

    const remainingUnits = normalizedStage2Units - programs.length;
    const positiveTotalWeight = programs.reduce(
        (sum, program) => sum + Math.max(0, Number(program.preImsMandays) || 0),
        0,
    );

    const weighted = programs.map((program) => {
        const safeWeight = Math.max(0, Number(program.preImsMandays) || 0);
        const weight = positiveTotalWeight > 0
            ? safeWeight / positiveTotalWeight
            : 1 / programs.length;
        const rawExtraUnits = remainingUnits * weight;
        const baseExtraUnits = Math.floor(rawExtraUnits);
        return {
            program,
            requiredUnits: 1 + baseExtraUnits,
            remainder: rawExtraUnits - baseExtraUnits,
        };
    });

    let unassigned = normalizedStage2Units - weighted.reduce(
        (sum, item) => sum + item.requiredUnits,
        0,
    );

    const ranked = [...weighted].sort((left, right) => {
        if (Math.abs(right.remainder - left.remainder) > 1e-12) {
            return right.remainder - left.remainder;
        }
        return left.program.programKey.localeCompare(right.program.programKey);
    });

    for (let index = 0; unassigned > 0; index = (index + 1) % ranked.length) {
        ranked[index].requiredUnits += 1;
        unassigned -= 1;
    }

    const requiredByKey = new Map(
        weighted.map((item) => [item.program.programKey, item.requiredUnits]),
    );

    return programs.map((program) => ({
        programKey: program.programKey,
        programCode: program.programCode,
        managementSystem: program.managementSystem,
        preImsMandays: Math.max(0, Number(program.preImsMandays) || 0),
        requiredUnits: requiredByKey.get(program.programKey) ?? 1,
    }));
}

function isRemainderFeasible(
    programs: MutableProgram[],
    members: MutableMember[],
): boolean {
    const remainingTotal = programs.reduce(
        (sum, program) => sum + program.remainingUnits,
        0,
    );
    if (remainingTotal === 0) return true;

    const totalCapacity = members.reduce(
        (sum, member) => sum + member.remainingCapacityUnits,
        0,
    );
    if (totalCapacity < remainingTotal) return false;

    const source = 0;
    const programOffset = 1;
    const memberOffset = programOffset + programs.length;
    const sink = memberOffset + members.length;
    const flow = new DinicMaxFlow(sink + 1);

    programs.forEach((program, programIndex) => {
        if (program.remainingUnits <= 0) return;
        flow.addEdge(source, programOffset + programIndex, program.remainingUnits);
        members.forEach((member, memberIndex) => {
            if (
                member.remainingCapacityUnits > 0 &&
                member.competentProgramKeySet.has(program.programKey)
            ) {
                flow.addEdge(
                    programOffset + programIndex,
                    memberOffset + memberIndex,
                    Math.min(program.remainingUnits, member.remainingCapacityUnits),
                );
            }
        });
    });

    members.forEach((member, memberIndex) => {
        if (member.remainingCapacityUnits > 0) {
            flow.addEdge(
                memberOffset + memberIndex,
                sink,
                member.remainingCapacityUnits,
            );
        }
    });

    return flow.maxFlow(source, sink) === remainingTotal;
}

function allocateOneUnit(
    program: MutableProgram,
    member: MutableMember,
): void {
    program.remainingUnits -= 1;
    member.remainingCapacityUnits -= 1;
    member.totalAllocatedUnits += 1;
    member.programAllocatedUnits[program.programKey] =
        (member.programAllocatedUnits[program.programKey] ?? 0) + 1;
}

function undoOneUnit(
    program: MutableProgram,
    member: MutableMember,
): void {
    program.remainingUnits += 1;
    member.remainingCapacityUnits += 1;
    member.totalAllocatedUnits -= 1;
    member.programAllocatedUnits[program.programKey] =
        (member.programAllocatedUnits[program.programKey] ?? 0) - 1;
}

function preallocateMandatoryMembers(
    programs: MutableProgram[],
    members: MutableMember[],
    leadMemberId: string,
): boolean {
    const mandatory = members
        .filter((member) => member.mustReceiveMandays)
        .sort((left, right) => {
            const leftLead = left.memberId === leadMemberId ? 0 : 1;
            const rightLead = right.memberId === leadMemberId ? 0 : 1;
            if (leftLead !== rightLead) return leftLead - rightLead;
            if (left.relevantCompetencyCount !== right.relevantCompetencyCount) {
                return left.relevantCompetencyCount - right.relevantCompetencyCount;
            }
            return left.expertId.localeCompare(right.expertId);
        });

    const recurse = (index: number): boolean => {
        if (index >= mandatory.length) {
            return isRemainderFeasible(programs, members);
        }

        const member = mandatory[index];
        if (member.totalAllocatedUnits >= 1) return recurse(index + 1);
        if (member.remainingCapacityUnits < 1) return false;

        const candidatePrograms = programs
            .filter(
                (program) =>
                    program.remainingUnits > 0 &&
                    member.competentProgramKeySet.has(program.programKey),
            )
            .sort((left, right) => {
                const eligibleLeft = members.filter(
                    (candidate) =>
                        candidate.remainingCapacityUnits > 0 &&
                        candidate.competentProgramKeySet.has(left.programKey),
                ).length;
                const eligibleRight = members.filter(
                    (candidate) =>
                        candidate.remainingCapacityUnits > 0 &&
                        candidate.competentProgramKeySet.has(right.programKey),
                ).length;
                if (eligibleLeft !== eligibleRight) return eligibleLeft - eligibleRight;
                if (left.remainingUnits !== right.remainingUnits) {
                    return right.remainingUnits - left.remainingUnits;
                }
                return left.programCode.localeCompare(right.programCode);
            });

        for (const program of candidatePrograms) {
            allocateOneUnit(program, member);
            if (isRemainderFeasible(programs, members) && recurse(index + 1)) {
                return true;
            }
            undoOneUnit(program, member);
        }

        return false;
    };

    return recurse(0);
}

function chooseNextProgram(
    programs: MutableProgram[],
    members: MutableMember[],
): MutableProgram | undefined {
    return programs
        .filter((program) => program.remainingUnits > 0)
        .sort((left, right) => {
            const eligibleLeft = members.filter(
                (member) =>
                    member.remainingCapacityUnits > 0 &&
                    member.competentProgramKeySet.has(left.programKey),
            ).length;
            const eligibleRight = members.filter(
                (member) =>
                    member.remainingCapacityUnits > 0 &&
                    member.competentProgramKeySet.has(right.programKey),
            ).length;
            if (eligibleLeft !== eligibleRight) return eligibleLeft - eligibleRight;
            if (left.remainingUnits !== right.remainingUnits) {
                return right.remainingUnits - left.remainingUnits;
            }
            return left.programCode.localeCompare(right.programCode);
        })[0];
}

function allocateRemainingUnits(
    programs: MutableProgram[],
    members: MutableMember[],
): boolean {
    const activeMembers = members.filter((member) => member.maxStage2Units > 0);
    const totalUnits = programs.reduce((sum, item) => sum + item.requiredUnits, 0);
    const softTargetUnits = Math.ceil(totalUnits / Math.max(1, activeMembers.length));

    while (programs.some((program) => program.remainingUnits > 0)) {
        const program = chooseNextProgram(programs, members);
        if (!program) return false;

        const candidates = members
            .filter(
                (member) =>
                    member.remainingCapacityUnits > 0 &&
                    member.competentProgramKeySet.has(program.programKey),
            )
            .sort((left, right) => {
                const leftAfterOne = left.totalAllocatedUnits + 1;
                const rightAfterOne = right.totalAllocatedUnits + 1;
                const leftWithinTarget = leftAfterOne <= softTargetUnits ? 0 : 1;
                const rightWithinTarget = rightAfterOne <= softTargetUnits ? 0 : 1;
                if (leftWithinTarget !== rightWithinTarget) {
                    return leftWithinTarget - rightWithinTarget;
                }

                const leftHasProgram = (left.programAllocatedUnits[program.programKey] ?? 0) > 0 ? 0 : 1;
                const rightHasProgram = (right.programAllocatedUnits[program.programKey] ?? 0) > 0 ? 0 : 1;
                if (leftHasProgram !== rightHasProgram) {
                    return leftHasProgram - rightHasProgram;
                }

                if (left.totalAllocatedUnits !== right.totalAllocatedUnits) {
                    return left.totalAllocatedUnits - right.totalAllocatedUnits;
                }
                if (left.relevantCompetencyCount !== right.relevantCompetencyCount) {
                    return left.relevantCompetencyCount - right.relevantCompetencyCount;
                }
                const roleDifference = roleRank(left.teamRole) - roleRank(right.teamRole);
                if (roleDifference !== 0) return roleDifference;
                return left.expertId.localeCompare(right.expertId);
            });

        let assigned = false;
        for (const candidate of candidates) {
            const chunkOptions = [2, 1].filter(
                (chunk) =>
                    chunk <= program.remainingUnits &&
                    chunk <= candidate.remainingCapacityUnits,
            );

            for (const chunk of chunkOptions) {
                for (let unit = 0; unit < chunk; unit += 1) {
                    allocateOneUnit(program, candidate);
                }
                if (isRemainderFeasible(programs, members)) {
                    assigned = true;
                    break;
                }
                for (let unit = 0; unit < chunk; unit += 1) {
                    undoOneUnit(program, candidate);
                }
            }

            if (assigned) break;
        }

        if (!assigned) return false;
    }

    return true;
}

export function allocateIntegratedMandays(
    input: IntegratedMandayAllocationInput,
): IntegratedMandayAllocationResult {
    const stage2Units = normalizeUnits(input.stage2Units);
    const countingMembers = input.members.filter((member) =>
        countsTowardAuditMandays(member.teamRole),
    );
    const lead = countingMembers.find((member) => member.memberId === input.leadMemberId);

    if (!lead || String(lead.teamRole).trim().toUpperCase() !== 'TEAM_LEADER') {
        return {
            success: false,
            errorCode: 'LEAD_NOT_ALLOCATABLE',
            message: 'Không xác định được trưởng đoàn đủ điều kiện nhận man-day Giai đoạn 2.',
        };
    }

    if (stage2Units < input.programs.length) {
        return {
            success: false,
            errorCode: 'INSUFFICIENT_STAGE2_MD',
            message: 'Không thể phân bổ Giai đoạn 2: tổng man-day không đủ để bố trí tối thiểu 0,5 MD cho mỗi chương trình.',
            details: {
                stage2Units,
                programCount: input.programs.length,
            },
        };
    }

    const mandatoryCount = countingMembers.filter((member) => member.mustReceiveMandays).length;
    if (stage2Units < mandatoryCount) {
        return {
            success: false,
            errorCode: 'TOO_MANY_TEAM_MEMBERS',
            message: 'Số lượng thành viên chính thức lớn hơn khả năng phân bổ man-day Giai đoạn 2.',
            details: {
                stage2Units,
                mandatoryMemberCount: mandatoryCount,
            },
        };
    }

    let requirements: ProgramRequirementResult[];
    try {
        requirements = allocateProgramRequirementUnits(input.programs, stage2Units);
    } catch (error) {
        return {
            success: false,
            errorCode: 'INSUFFICIENT_STAGE2_MD',
            message: error instanceof Error ? error.message : 'Không thể xác định hạn mức man-day chương trình.',
        };
    }

    const programs: MutableProgram[] = requirements.map((program) => ({
        ...program,
        remainingUnits: program.requiredUnits,
    }));
    const programKeySet = new Set(programs.map((program) => program.programKey));

    const members: MutableMember[] = countingMembers.map((member) => {
        const competentProgramKeys = Array.from(new Set(
            member.competentProgramKeys.filter((key) => programKeySet.has(key)),
        ));
        const maxStage2Units = normalizeUnits(member.maxStage2Units);
        return {
            ...member,
            competentProgramKeys,
            competentProgramKeySet: new Set(competentProgramKeys),
            relevantCompetencyCount: competentProgramKeys.length,
            maxStage2Units,
            remainingCapacityUnits: maxStage2Units,
            totalAllocatedUnits: 0,
            programAllocatedUnits: Object.fromEntries(
                programs.map((program) => [program.programKey, 0]),
            ),
        };
    });

    for (const program of programs) {
        const eligible = members.filter((member) =>
            member.competentProgramKeySet.has(program.programKey),
        );
        if (!eligible.length) {
            return {
                success: false,
                errorCode: 'PROGRAM_NOT_COVERED',
                message: `Không thể phân bổ: chương trình ${program.programCode} chưa có thành viên đủ năng lực.`,
                details: { programKey: program.programKey },
            };
        }
        const eligibleCapacity = eligible.reduce(
            (sum, member) => sum + member.maxStage2Units,
            0,
        );
        if (eligibleCapacity < program.requiredUnits) {
            return {
                success: false,
                errorCode: 'INSUFFICIENT_MEMBER_CAPACITY',
                message: `Không thể phân bổ ${program.programCode}: chương trình yêu cầu ${(program.requiredUnits * MANDAY_UNIT).toFixed(1)} MD nhưng các thành viên đủ năng lực chỉ có thể nhận ${(eligibleCapacity * MANDAY_UNIT).toFixed(1)} MD.`,
                details: {
                    programKey: program.programKey,
                    requiredUnits: program.requiredUnits,
                    eligibleCapacityUnits: eligibleCapacity,
                },
            };
        }
    }

    const totalCapacity = members.reduce((sum, member) => sum + member.maxStage2Units, 0);
    if (totalCapacity < stage2Units) {
        return {
            success: false,
            errorCode: 'INSUFFICIENT_MEMBER_CAPACITY',
            message: `Không thể phân bổ: Giai đoạn 2 yêu cầu ${(stage2Units * MANDAY_UNIT).toFixed(1)} MD nhưng tổng khả năng tham gia của đoàn chỉ là ${(totalCapacity * MANDAY_UNIT).toFixed(1)} MD.`,
            details: { stage2Units, totalCapacityUnits: totalCapacity },
        };
    }

    if (!isRemainderFeasible(programs, members)) {
        return {
            success: false,
            errorCode: 'NO_FEASIBLE_ALLOCATION',
            message: 'Không tồn tại phương án phân bổ phù hợp đồng thời năng lực chương trình và giới hạn thời gian của từng thành viên.',
        };
    }

    if (!preallocateMandatoryMembers(programs, members, input.leadMemberId)) {
        const mutableLead = members.find((member) => member.memberId === input.leadMemberId);
        const leadMissing = !mutableLead || mutableLead.totalAllocatedUnits < 1;
        return {
            success: false,
            errorCode: leadMissing
                ? 'LEAD_NOT_ALLOCATABLE'
                : 'NO_FEASIBLE_ALLOCATION',
            message: leadMissing
                ? 'Không thể bố trí tối thiểu 0,5 MD Giai đoạn 2 cho trưởng đoàn trong chương trình mà trưởng đoàn có năng lực.'
                : 'Không thể bố trí tối thiểu 0,5 MD cho toàn bộ thành viên chính thức mà vẫn bảo đảm tổng từng chương trình.',
        };
    }

    if (!allocateRemainingUnits(programs, members)) {
        return {
            success: false,
            errorCode: 'NO_FEASIBLE_ALLOCATION',
            message: 'Không thể hoàn tất phân bổ man-day mà vẫn duy trì phương án hợp lệ.',
        };
    }

    const actualTotal = members.reduce((sum, member) => sum + member.totalAllocatedUnits, 0);
    if (actualTotal !== stage2Units) {
        return {
            success: false,
            errorCode: 'NO_FEASIBLE_ALLOCATION',
            message: 'Tổng man-day Giai đoạn 2 được phân bổ không khớp.',
            details: { expectedUnits: stage2Units, actualUnits: actualTotal },
        };
    }

    return {
        success: true,
        stage2Units,
        programRequirements: requirements,
        members: members.map((member) => ({
            memberId: member.memberId,
            expertId: member.expertId,
            expertName: member.expertName,
            teamRole: member.teamRole,
            competentProgramKeys: [...member.competentProgramKeys],
            maxStage2Units: member.maxStage2Units,
            mustReceiveMandays: member.mustReceiveMandays,
            totalAllocatedUnits: member.totalAllocatedUnits,
            programAllocatedUnits: { ...member.programAllocatedUnits },
        })),
    };
}
