import {
    ConfigService,
} from '@nestjs/config';
import {
    randomUUID,
} from 'node:crypto';

import {
    PrismaService,
} from '../src/prisma/prisma.service';
import {
    PersonalWorkspaceService,
} from '../src/personal-workspace/personal-workspace.service';
import {
    ResourceAccessService,
} from '../src/security/resource-access.service';
import {
    ActionAuthorizationService,
} from '../src/work-items/action-authorization.service';
import {
    WorkItemsService,
} from '../src/work-items/work-items.service';

jest.setTimeout(60_000);

function databaseName(
    url: string,
) {
    const part =
        url.split(';').find((item) =>
            /^(database|initial catalog)=/i
                .test(
                    item.trim(),
                ),
        );

    return part
        ?.slice(
            part.indexOf('=') + 1,
        )
        .replace(
            /^\{|\}$/g,
            '',
        ) ??
        '';
}

const testDatabaseUrl =
    process.env.TEST_DATABASE_URL
        ?.trim() ??
    '';
const configuredDatabaseName =
    databaseName(
        testDatabaseUrl,
    );
const safeTestDatabase =
    configuredDatabaseName
        .toLowerCase()
        .endsWith('_test') ||
    configuredDatabaseName
        .toLowerCase()
        .endsWith('_ci');

if (
    testDatabaseUrl &&
    !safeTestDatabase
) {
    throw new Error(
        `[WORK ITEM E2E SAFETY] Refusing non-test database ${configuredDatabaseName || '<missing>'}`,
    );
}

if (safeTestDatabase) {
    process.env.DATABASE_URL =
        testDatabaseUrl;
    process.env.NODE_ENV =
        'test';
}

const describeRealDatabase =
    safeTestDatabase
        ? describe
        : describe.skip;

describeRealDatabase(
    'Phase 2.1/2.2 work and personal workspace (isolated real database)',
    () => {
        let prisma:
            PrismaService;
        let service:
            WorkItemsService;
        let personalWorkspace:
            PersonalWorkspaceService;
        const run =
            randomUUID()
                .replaceAll('-', '')
                .slice(0, 12);
        const ids = {
            userA:
                randomUUID(),
            userB:
                randomUUID(),
            customerA:
                randomUUID(),
            customerB:
                randomUUID(),
            applicationA:
                randomUUID(),
            applicationB:
                randomUUID(),
            projectA:
                randomUUID(),
            projectB:
                randomUUID(),
            planA:
                randomUUID(),
            programA:
                randomUUID(),
            eventA:
                randomUUID(),
            appointmentA:
                randomUUID(),
            memberA:
                randomUUID(),
            expertA:
                randomUUID(),
        };
        const sourcePrefix =
            `phase21-e2e:${run}`;

        async function assertTestDatabase() {
            const rows =
                await prisma.$queryRawUnsafe<
                    Array<{
                        database_name: string;
                    }>
                >(
                    'SELECT DB_NAME() AS database_name',
                );
            const actual =
                rows[0]?.database_name ??
                '';

            if (
                !actual
                    .toLowerCase()
                    .endsWith('_test') &&
                !actual
                    .toLowerCase()
                    .endsWith('_ci')
            ) {
                throw new Error(
                    `[WORK ITEM E2E SAFETY] Cleanup refused for ${actual || '<unknown>'}`,
                );
            }
        }

        async function cleanup() {
            await assertTestDatabase();
            await prisma.work_items.deleteMany({
                where: {
                    OR: [
                        {
                            source_key: {
                                startsWith:
                                    sourcePrefix,
                            },
                        },
                        {
                            project_id: {
                                in: [
                                    ids.projectA,
                                    ids.projectB,
                                ],
                            },
                        },
                    ],
                },
            });
            await prisma.customer_user_access_history.deleteMany({
                where: {
                    user_id: {
                        in: [
                            ids.userA,
                            ids.userB,
                        ],
                    },
                },
            });
            await prisma.customer_user_access.deleteMany({
                where: {
                    user_id: {
                        in: [
                            ids.userA,
                            ids.userB,
                        ],
                    },
                },
            });
            await prisma.audit_team_members.deleteMany({
                where: {
                    id:
                        ids.memberA,
                },
            });
            await prisma.audit_team_appointments.deleteMany({
                where: {
                    id:
                        ids.appointmentA,
                },
            });
            await prisma.audit_plans.deleteMany({
                where: {
                    id:
                        ids.planA,
                },
            });
            await prisma.audit_program_events.deleteMany({
                where: {
                    id:
                        ids.eventA,
                },
            });
            await prisma.audit_programs.deleteMany({
                where: {
                    id:
                        ids.programA,
                },
            });
            await prisma.certification_projects.deleteMany({
                where: {
                    id: {
                        in: [
                            ids.projectA,
                            ids.projectB,
                        ],
                    },
                },
            });
            await prisma.certification_applications.deleteMany({
                where: {
                    id: {
                        in: [
                            ids.applicationA,
                            ids.applicationB,
                        ],
                    },
                },
            });
            await prisma.customers.deleteMany({
                where: {
                    id: {
                        in: [
                            ids.customerA,
                            ids.customerB,
                        ],
                    },
                },
            });
            await prisma.experts.deleteMany({
                where: {
                    id:
                        ids.expertA,
                },
            });
            await prisma.users.deleteMany({
                where: {
                    id: {
                        in: [
                            ids.userA,
                            ids.userB,
                        ],
                    },
                },
            });
        }

        beforeAll(async () => {
            prisma =
                new PrismaService(
                    new ConfigService(),
                );
            await prisma.$connect();
            const resourceAccess =
                new ResourceAccessService(
                    prisma,
                );
            const authorization =
                new ActionAuthorizationService(
                    resourceAccess,
                );
            service =
                new WorkItemsService(
                    prisma,
                    authorization,
                    resourceAccess,
                );
            personalWorkspace =
                new PersonalWorkspaceService(
                    prisma,
                    service,
                );
            await cleanup();

            await prisma.users.createMany({
                data: [
                    {
                        id:
                            ids.userA,
                        username:
                            `p21_a_${run}`,
                        email:
                            `p21_a_${run}@example.test`,
                        password_hash:
                            'phase-2.1-e2e-not-a-login-secret',
                    },
                    {
                        id:
                            ids.userB,
                        username:
                            `p21_b_${run}`,
                        email:
                            `p21_b_${run}@example.test`,
                        password_hash:
                            'phase-2.1-e2e-not-a-login-secret',
                    },
                ],
            });
            await prisma.customers.createMany({
                data: [
                    {
                        id:
                            ids.customerA,
                        customer_code:
                            `P21A${run.slice(0, 7)}`,
                        company_name:
                            'Phase 2.1 Customer A',
                    },
                    {
                        id:
                            ids.customerB,
                        customer_code:
                            `P21B${run.slice(0, 7)}`,
                        company_name:
                            'Phase 2.1 Customer B',
                    },
                ],
            });
            await prisma.customer_user_access.createMany({
                data: [
                    {
                        customer_id:
                            ids.customerA,
                        user_id:
                            ids.userA,
                    },
                    {
                        customer_id:
                            ids.customerB,
                        user_id:
                            ids.userB,
                    },
                ],
            });
            await prisma.certification_applications.createMany({
                data: [
                    {
                        id:
                            ids.applicationA,
                        customer_id:
                            ids.customerA,
                        application_code:
                            `APP-P21-A-${run}`,
                        application_date:
                            new Date('2026-08-21'),
                        standard_name:
                            'ISO 9001:2015',
                        certification_scope:
                            'Scope A',
                        declaration_accepted:
                            true,
                    },
                    {
                        id:
                            ids.applicationB,
                        customer_id:
                            ids.customerB,
                        application_code:
                            `APP-P21-B-${run}`,
                        application_date:
                            new Date('2026-08-21'),
                        standard_name:
                            'ISO 14001:2015',
                        certification_scope:
                            'Scope B',
                        declaration_accepted:
                            true,
                    },
                ],
            });
            await prisma.certification_projects.createMany({
                data: [
                    {
                        id:
                            ids.projectA,
                        application_id:
                            ids.applicationA,
                        project_code:
                            `PRJ-P21-A-${run}`,
                    },
                    {
                        id:
                            ids.projectB,
                        application_id:
                            ids.applicationB,
                        project_code:
                            `PRJ-P21-B-${run}`,
                    },
                ],
            });
            await prisma.experts.create({
                data: {
                    id:
                        ids.expertA,
                    user_id:
                        ids.userA,
                    employee_code:
                        `P22${run.slice(0, 8)}`,
                    full_name:
                        'Phase 2.2 Auditor',
                },
            });
            await prisma.audit_programs.create({
                data: {
                    id:
                        ids.programA,
                    project_id:
                        ids.projectA,
                    program_code:
                        `PROGRAM-P22-${run}`,
                    program_year:
                        2026,
                    organization_name:
                        'Phase 2.2 Customer A',
                    standard_name:
                        'ISO 9001:2015',
                    certification_scope:
                        'Scope A',
                    certification_type:
                        'initial',
                    status:
                        'approved',
                },
            });
            await prisma.audit_program_events.create({
                data: {
                    id:
                        ids.eventA,
                    program_id:
                        ids.programA,
                    sequence_no:
                        1,
                    event_type:
                        'initial',
                    planned_start_date:
                        new Date('2026-10-01'),
                    planned_end_date:
                        new Date('2026-10-02'),
                    status:
                        'planned',
                },
            });
            await prisma.audit_plans.create({
                data: {
                    id:
                        ids.planA,
                    project_id:
                        ids.projectA,
                    audit_event_id:
                        ids.eventA,
                    plan_code:
                        `PLAN-P21-${run}`,
                    audit_type:
                        'surveillance1',
                    status:
                        'draft',
                    planned_start_date:
                        new Date('2026-10-01'),
                },
            });
        });

        afterAll(async () => {
            await cleanup();
            await prisma.$disconnect();
        });

        it('upserts a deterministic source once and never implicitly reopens DONE', async () => {
            const sourceKey =
                `${sourcePrefix}:idempotent`;
            const opened =
                await service.openWorkItem({
                    sourceKey,
                    workType:
                        'CAP_ACTION_OR_REVIEW',
                    actionCode:
                        'cap.respond',
                    title:
                        'Phản hồi CAP',
                    entityType:
                        'certification_project',
                    entityId:
                        ids.projectA,
                    projectId:
                        ids.projectA,
                    assignedRole:
                        'CUSTOMER',
                    destinationPath:
                        `/projects/${ids.projectA}?workspace=cap`,
                });
            const repeated =
                await service.openWorkItem({
                    sourceKey,
                    workType:
                        'CAP_ACTION_OR_REVIEW',
                    actionCode:
                        'cap.respond',
                    title:
                        'Phản hồi CAP đã cập nhật',
                    entityType:
                        'certification_project',
                    entityId:
                        ids.projectA,
                    projectId:
                        ids.projectA,
                    assignedRole:
                        'CUSTOMER',
                });

            expect(repeated.id)
                .toBe(opened.id);
            expect(
                await prisma.work_items.count({
                    where: {
                        source_key:
                            sourceKey,
                    },
                }),
            ).toBe(1);

            await service.completeWorkItem(
                {
                    sourceKey,
                },
                ids.userA,
            );
            const afterRepeat =
                await service.openWorkItem({
                    sourceKey,
                    workType:
                        'CAP_ACTION_OR_REVIEW',
                    actionCode:
                        'cap.respond',
                    title:
                        'Không được mở lại',
                    entityType:
                        'certification_project',
                    entityId:
                        ids.projectA,
                    projectId:
                        ids.projectA,
                    assignedRole:
                        'CUSTOMER',
                });

            expect(afterRepeat.status)
                .toBe('DONE');
        });

        it('filters CUSTOMER work by both assignment and customer resource scope', async () => {
            for (const [
                suffix,
                projectId,
            ] of [
                [
                    'a',
                    ids.projectA,
                ],
                [
                    'b',
                    ids.projectB,
                ],
            ] as const) {
                await service.openWorkItem({
                    sourceKey:
                        `${sourcePrefix}:scope:${suffix}`,
                    workType:
                        'CAP_ACTION_OR_REVIEW',
                    actionCode:
                        'cap.respond',
                    title:
                        `CAP ${suffix}`,
                    entityType:
                        'certification_project',
                    entityId:
                        projectId,
                    projectId,
                    assignedRole:
                        'CUSTOMER',
                    destinationPath:
                        `/projects/${projectId}?workspace=cap`,
                });
            }

            const mine =
                await service.getMyWork(
                    {
                        userId:
                            ids.userA,
                        roles: [
                            'CUSTOMER',
                        ],
                    },
                    {},
                );

            expect(
                mine.items.map((item) =>
                    item.project_id,
                ),
            ).toContain(
                ids.projectA,
            );
            expect(
                mine.items.map((item) =>
                    item.project_id,
                ),
            ).not.toContain(
                ids.projectB,
            );
            expect(
                mine.items.every((item) =>
                    item.can_execute,
                ),
            ).toBe(true);
        });

        it('keeps dry-run read-only and applies backfill idempotently', async () => {
            const before =
                await prisma.work_items.count();
            const dryRun =
                await service.reconcile(false);
            const afterDryRun =
                await prisma.work_items.count();

            expect(dryRun.mode)
                .toBe('dry-run');
            expect(
                dryRun.source_keys,
            ).toContain(
                `audit-team-issue:${ids.planA}`,
            );
            expect(afterDryRun)
                .toBe(before);

            await service.reconcile(true);
            await service.reconcile(true);

            expect(
                await prisma.work_items.count({
                    where: {
                        source_key:
                            `audit-team-issue:${ids.planA}`,
                    },
                }),
            ).toBe(1);
        });

        it('projects only assigned and scoped audit work into the personal workspace', async () => {
            await prisma.audit_team_appointments.create({
                data: {
                    id:
                        ids.appointmentA,
                    audit_plan_id:
                        ids.planA,
                    appointment_number:
                        `F04-P22-${run}`,
                    appointment_date:
                        new Date('2026-08-21'),
                    status:
                        'issued',
                    prepared_by:
                        ids.userA,
                },
            });
            await prisma.audit_team_members.create({
                data: {
                    id:
                        ids.memberA,
                    appointment_id:
                        ids.appointmentA,
                    expert_id:
                        ids.expertA,
                    team_role:
                        'AUDITOR',
                    planned_start_date:
                        new Date('2026-10-01'),
                    planned_end_date:
                        new Date('2026-10-02'),
                    assignment_status:
                        'assigned',
                },
            });
            await service.openWorkItem({
                sourceKey:
                    `${sourcePrefix}:workspace:a`,
                workType:
                    'AUDIT_EXECUTION',
                actionCode:
                    'audit.execute',
                title:
                    'Đánh giá hồ sơ A',
                entityType:
                    'audit_plan',
                entityId:
                    ids.planA,
                projectId:
                    ids.projectA,
                auditEventId:
                    ids.eventA,
                auditPlanId:
                    ids.planA,
                assignedUserId:
                    ids.userA,
                dueAt:
                    new Date('2026-10-01'),
                destinationPath:
                    `/projects/${ids.projectA}?workspace=audit-execution&audit_event_id=${ids.eventA}&audit_plan_id=${ids.planA}`,
                context: {
                    dossier_key:
                        'initial_certification',
                },
            });
            await service.openWorkItem({
                sourceKey:
                    `${sourcePrefix}:workspace:b`,
                workType:
                    'AUDIT_EXECUTION',
                actionCode:
                    'audit.execute',
                title:
                    'Hồ sơ B không được phép lộ',
                entityType:
                    'certification_project',
                entityId:
                    ids.projectB,
                projectId:
                    ids.projectB,
                assignedUserId:
                    ids.userA,
                destinationPath:
                    `/projects/${ids.projectB}?workspace=audit-execution`,
            });

            const projection =
                await personalWorkspace.getWorkspace({
                    userId:
                        ids.userA,
                    roles: [
                        'AUDITOR',
                    ],
                });

            expect(
                projection.priority_work_items
                    .map((item) => item.project_id),
            ).toContain(
                ids.projectA,
            );
            expect(
                projection.priority_work_items
                    .map((item) => item.project_id),
            ).not.toContain(
                ids.projectB,
            );
            expect(
                projection.calendar_items,
            ).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id:
                            `audit:${ids.eventA}`,
                        type:
                            'AUDIT',
                        role_in_event:
                            'AUDITOR',
                        destination_path:
                            expect.stringContaining(
                                `audit_plan_id=${ids.planA}`,
                            ),
                    }),
                    expect.objectContaining({
                        id:
                            expect.stringMatching(/^work:/),
                        type:
                            'WORK_DUE',
                    }),
                ]),
            );
        });
    },
);
