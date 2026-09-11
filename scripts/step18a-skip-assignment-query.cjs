const fs = require('node:fs');

const servicePath = 'src/experts/expert-resource-governance.service.ts';
const specPath = 'src/experts/expert-resource-governance.spec.ts';

let service = fs.readFileSync(servicePath, 'utf8');
let spec = fs.readFileSync(specPath, 'utf8');

const oldBlock = `            this.prisma.audit_team_members.findMany({
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
                }),
`;

const newBlock = `            includeAssignments
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
`;

const occurrences = service.split(oldBlock).length - 1;
if (occurrences !== 1) {
    throw new Error(`Expected exactly one assignment query block, got ${occurrences}`);
}
service = service.replace(oldBlock, newBlock);

const anchor = `    it('retries the complete cancellation transaction only for transient ENOTBEGUN', async () => {\n`;
const test = `    it('skips assignment reads when assignment details are explicitly excluded', async () => {
        const prisma = createPrismaMock();
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-09-03',
            '2026-09-03',
            { includeAssignments: false },
        );

        expect(prisma.audit_team_members.findMany).not.toHaveBeenCalled();
        expect(result.assignments).toEqual([]);
        expect(result.workload.assigned_mandays).toBe(0);
        expect(result.workload.engagement_count).toBe(0);
    });

`;

if (spec.includes('skips assignment reads when assignment details are explicitly excluded')) {
    throw new Error('Optimization regression test already exists');
}
const anchorOccurrences = spec.split(anchor).length - 1;
if (anchorOccurrences !== 1) {
    throw new Error(`Expected exactly one spec anchor, got ${anchorOccurrences}`);
}
spec = spec.replace(anchor, test + anchor);

fs.writeFileSync(servicePath, service);
fs.writeFileSync(specPath, spec);
