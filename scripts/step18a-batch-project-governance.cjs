const fs = require('node:fs');

const governancePath = 'src/experts/expert-resource-governance.service.ts';
const governanceSpecPath = 'src/experts/expert-resource-governance.spec.ts';
const appointmentsPath = 'src/audit-team-appointments/audit-team-appointments.service.ts';
const appointmentsSpecPath = 'src/audit-team-appointments/audit-team-appointments-stage1-remote.spec.ts';

let governance = fs.readFileSync(governancePath, 'utf8');
let governanceSpec = fs.readFileSync(governanceSpecPath, 'utf8');
let appointments = fs.readFileSync(appointmentsPath, 'utf8');
let appointmentsSpec = fs.readFileSync(appointmentsSpecPath, 'utf8');

const oldManyQuery = `            this.prisma.audit_team_members.findMany({
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
`;
const newManyQuery = `            options.includeAssignments === false
                ? Promise.resolve([])
                : this.prisma.audit_team_members.findMany({
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
`;
if ((governance.split(oldManyQuery).length - 1) !== 1) {
    throw new Error('Expected exactly one evaluateMany assignment query block');
}
governance = governance.replace(oldManyQuery, newManyQuery);

const oldProjectBlock = `        if (isProjectContext) {
            const effectiveDate = plan.planned_start_date ?? new Date();
            for (const member of members) {
                const governance = await this.resourceGovernance.evaluate(
                    member.expert_id,
                    effectiveDate,
                    effectiveDate,
                    { customerId, includeAssignments: false },
                );
                const block = governance.reasons.find(
                    (reason) => reason.code === 'INDEPENDENCE_CONFLICT',
                );
                if (block) {
                    await this.resourceGovernance.recordAssignmentBlock(
                        member.expert_id,
                        plan.id,
                        actorId,
                        block,
                    );
                    throw new ConflictException(
                        \`${'${expertNameMap.get(member.expert_id) ?? \'Chuyên gia\'}'}: ${'${block.message}'}\`,
                    );
                }
            }
            return;
        }
`;
const newProjectBlock = `        if (isProjectContext) {
            const effectiveDate = plan.planned_start_date ?? new Date();
            const governanceByExpert = await this.resourceGovernance.evaluateMany(
                expertIds,
                effectiveDate,
                effectiveDate,
                { customerId, includeAssignments: false },
            );
            for (const member of members) {
                const governance = governanceByExpert.get(member.expert_id);
                const block = governance?.reasons.find(
                    (reason) => reason.code === 'INDEPENDENCE_CONFLICT',
                );
                if (block) {
                    await this.resourceGovernance.recordAssignmentBlock(
                        member.expert_id,
                        plan.id,
                        actorId,
                        block,
                    );
                    throw new ConflictException(
                        \`${'${expertNameMap.get(member.expert_id) ?? \'Chuyên gia\'}'}: ${'${block.message}'}\`,
                    );
                }
            }
            return;
        }
`;
if ((appointments.split(oldProjectBlock).length - 1) !== 1) {
    throw new Error('Expected exactly one project governance loop');
}
appointments = appointments.replace(oldProjectBlock, newProjectBlock);

const governanceAnchor = `    it('retries the complete cancellation transaction only for transient ENOTBEGUN', async () => {\n`;
const governanceTest = `    it('batches assignment-free evaluations without reading audit assignments', async () => {
        const prisma = createPrismaMock();
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluateMany(
            ['expert-1', 'expert-2'],
            '2026-09-03',
            '2026-09-03',
            { customerId: 'customer-a', includeAssignments: false },
        );

        expect(prisma.expert_availability_periods.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.expert_customer_conflicts.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.audit_team_members.findMany).not.toHaveBeenCalled();
        expect(Array.from(result.keys())).toEqual(['expert-1', 'expert-2']);
        expect(result.get('expert-1')?.assignments).toEqual([]);
        expect(result.get('expert-2')?.assignments).toEqual([]);
    });

`;
if (governanceSpec.includes('batches assignment-free evaluations without reading audit assignments')) {
    throw new Error('evaluateMany regression test already exists');
}
if ((governanceSpec.split(governanceAnchor).length - 1) !== 1) {
    throw new Error('Unexpected governance spec anchor');
}
governanceSpec = governanceSpec.replace(governanceAnchor, governanceTest + governanceAnchor);

const harnessOld = `        experts: {
            findUnique: jest.fn(),
        },
`;
const harnessNew = `        experts: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
`;
if ((appointmentsSpec.split(harnessOld).length - 1) !== 1) {
    throw new Error('Unexpected appointments harness shape');
}
appointmentsSpec = appointmentsSpec.replace(harnessOld, harnessNew);

const appointmentAnchor = `    it('keeps Stage 1 man-days exact while allowing multiple F04 members', () => {\n`;
const appointmentTest = `    it('batches project-team independence evaluation without per-member resource calls', async () => {
        const { prisma, service } = createHarness();
        prisma.experts.findMany.mockResolvedValue([
            {
                id: 'leader',
                full_name: 'Lead Auditor',
                status: 'active',
                profile_status: 'APPROVED',
                user_id: 'user-leader',
                user_account: { id: 'user-leader', status: 'active' },
            },
            {
                id: 'auditor',
                full_name: 'Auditor',
                status: 'active',
                profile_status: 'APPROVED',
                user_id: 'user-auditor',
                user_account: { id: 'user-auditor', status: 'active' },
            },
        ]);
        const governance = (service as any).resourceGovernance;
        jest.spyOn(governance, 'getProjectCustomerId').mockResolvedValue('customer-1');
        const evaluateSpy = jest.spyOn(governance, 'evaluate');
        const evaluateManySpy = jest.spyOn(governance, 'evaluateMany').mockResolvedValue(new Map([
            ['leader', { reasons: [] }],
            ['auditor', { reasons: [] }],
        ]));

        const effectiveDate = new Date('2026-09-10T00:00:00.000Z');
        await (service as any).validateMembers(
            [
                { expert_id: 'leader', team_role: 'TEAM_LEADER' },
                { expert_id: 'auditor', team_role: 'AUDITOR' },
            ],
            {
                id: 'project-team-plan',
                project_id: 'project-1',
                plan_code: 'DOSSIER-PRJ-1',
                audit_type: 'project_team',
                planned_start_date: effectiveDate,
                planned_end_date: effectiveDate,
                audit_event: null,
            },
            undefined,
            false,
            'admin-1',
        );

        expect(evaluateManySpy).toHaveBeenCalledTimes(1);
        expect(evaluateManySpy).toHaveBeenCalledWith(
            ['leader', 'auditor'],
            effectiveDate,
            effectiveDate,
            { customerId: 'customer-1', includeAssignments: false },
        );
        expect(evaluateSpy).not.toHaveBeenCalled();
    });

`;
if (appointmentsSpec.includes('batches project-team independence evaluation without per-member resource calls')) {
    throw new Error('Project governance regression test already exists');
}
if ((appointmentsSpec.split(appointmentAnchor).length - 1) !== 1) {
    throw new Error('Unexpected appointment spec anchor');
}
appointmentsSpec = appointmentsSpec.replace(appointmentAnchor, appointmentTest + appointmentAnchor);

fs.writeFileSync(governancePath, governance);
fs.writeFileSync(governanceSpecPath, governanceSpec);
fs.writeFileSync(appointmentsPath, appointments);
fs.writeFileSync(appointmentsSpecPath, appointmentsSpec);
