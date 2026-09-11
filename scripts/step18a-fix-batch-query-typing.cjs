const fs = require('node:fs');

const path = 'src/experts/expert-resource-governance.service.ts';
let source = fs.readFileSync(path, 'utf8');

const generatedBlock = `            options.includeAssignments === false
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

if ((source.split(generatedBlock).length - 1) !== 1) {
    throw new Error('Expected exactly one generated evaluateMany assignment branch');
}
source = source.replace(generatedBlock, '            assignmentQuery,\n');

const promiseAllAnchor = `        const [periods, conflicts, assignments] = await Promise.all([\n`;
if ((source.split(promiseAllAnchor).length - 1) < 2) {
    throw new Error('Expected evaluate and evaluateMany Promise.all anchors');
}

const evaluateManyStart = source.indexOf('    async evaluateMany(');
if (evaluateManyStart < 0) throw new Error('evaluateMany not found');
const promiseAllIndex = source.indexOf(promiseAllAnchor, evaluateManyStart);
if (promiseAllIndex < 0) throw new Error('evaluateMany Promise.all anchor not found');

const helper = `        const loadAssignments = () =>
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
            });
        const assignmentQuery: Promise<Awaited<ReturnType<typeof loadAssignments>>> =
            options.includeAssignments === false
                ? Promise.resolve([])
                : loadAssignments();
`;

source = source.slice(0, promiseAllIndex) + helper + source.slice(promiseAllIndex);
fs.writeFileSync(path, source);
