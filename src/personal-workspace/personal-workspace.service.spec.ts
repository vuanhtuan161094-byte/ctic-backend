import {
    PersonalWorkspaceService,
    dedupeCalendarItems,
    resolveWorkspacePersonas,
} from './personal-workspace.service';

describe('PersonalWorkspaceService', () => {
    const prisma = {
        users: {
            findUnique:
                jest.fn(),
        },
        audit_team_members: {
            findMany:
                jest.fn(),
        },
        audit_team_appointments: {
            findMany:
                jest.fn(),
        },
        audit_program_events: {
            findMany:
                jest.fn(),
        },
        certificates: {
            count:
                jest.fn(),
        },
    };
    const workItems = {
        getMyWork:
            jest.fn(),
    };
    let service:
        PersonalWorkspaceService;

    const work = (
        overrides: Record<string, unknown> = {},
    ) => ({
        id:
            'work-1',
        work_type:
            'AUDIT_EXECUTION',
        title:
            'Thực hiện đánh giá',
        description:
            null,
        project_id:
            'project-1',
        project_code:
            'PRJ-1',
        organization_name:
            'Khách hàng A',
        audit_event_id:
            'event-1',
        audit_plan_id:
            'plan-1',
        cycle_key:
            'initial_certification',
        assigned_user_id:
            'user-1',
        assigned_role:
            null,
        assignee:
            'Người dùng',
        status:
            'OPEN',
        priority:
            'NORMAL',
        due_at:
            null,
        is_overdue:
            false,
        destination_path:
            '/projects/project-1?workspace=audit-execution&audit_plan_id=plan-1',
        context: {
            dossier_key:
                'initial_certification',
        },
        can_execute:
            true,
        created_at:
            new Date('2026-08-01T00:00:00Z'),
        updated_at:
            new Date('2026-08-01T00:00:00Z'),
        completed_at:
            null,
        ...overrides,
    });

    const membership = (
        teamRole = 'TEAM_LEADER',
        eventId = 'event-1',
    ) => ({
        team_role:
            teamRole,
        audit_team_appointments: {
            audit_plans: {
                id:
                    'plan-1',
                project_id:
                    'project-1',
                planned_start_date:
                    new Date('2026-09-01T00:00:00Z'),
                planned_end_date:
                    new Date('2026-09-02T00:00:00Z'),
                status:
                    'issued',
                audit_event: {
                    id:
                        eventId,
                    event_type:
                        'initial',
                    status:
                        'planned',
                    planned_start_date:
                        new Date('2026-09-01T00:00:00Z'),
                    planned_end_date:
                        new Date('2026-09-02T00:00:00Z'),
                },
                certification_projects: {
                    project_code:
                        'PRJ-1',
                    certification_applications: {
                        customers: {
                            company_name:
                                'Khách hàng A',
                        },
                    },
                },
            },
        },
    });

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.users.findUnique.mockResolvedValue({
            id:
                'user-1',
            username:
                'user',
            full_name:
                'Người dùng',
            email:
                'user@example.com',
        });
        prisma.audit_team_members.findMany
            .mockResolvedValue([]);
        prisma.audit_team_appointments.findMany
            .mockResolvedValue([]);
        prisma.audit_program_events.findMany
            .mockResolvedValue([]);
        prisma.certificates.count
            .mockResolvedValue(0);
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [],
            }),
        );
        service =
            new PersonalWorkspaceService(
                prisma as any,
                workItems as any,
            );
    });

    const workspace = (
        roles: string[],
    ) => service.getWorkspace({
        userId:
            'user-1',
        roles,
    });

    it('normalizes and orders multi-role personas without duplication', () => {
        expect(
            resolveWorkspacePersonas([
                'auditor',
                'ADMIN',
                'auditor',
            ]),
        ).toEqual([
            'ADMIN',
            'AUDITOR',
        ]);
    });

    it('returns coordinator KPIs without reviewer queue', async () => {
        const result =
            await workspace([
                'COORDINATOR',
            ]);
        const keys =
            result.role_kpis.map((item) =>
                item.key,
            );

        expect(keys).toContain('f04_pending');
        expect(keys).not.toContain('open_reviews');
    });

    it('returns assigned-audit KPIs for Lead Auditor', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(
            new Date('2026-09-01T12:00:00+07:00'),
        );

        try {
            prisma.audit_team_members.findMany
                .mockResolvedValue([
                    membership(),
                ]);

            const result =
                await workspace([
                    'LEAD_AUDITOR',
                ]);

            expect(result.role_kpis)
                .toContainEqual(
                    expect.objectContaining({
                        key:
                            'assigned_audits',
                        value:
                            1,
                    }),
                );
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not return unrelated audit to unassigned Lead Auditor', async () => {
        const result =
            await workspace([
                'LEAD_AUDITOR',
            ]);

        expect(result.calendar_items)
            .toEqual([]);
    });

    it('returns only membership-backed audit to Auditor', async () => {
        prisma.audit_team_members.findMany
            .mockResolvedValue([
                membership('AUDITOR'),
            ]);

        const result =
            await workspace([
                'AUDITOR',
            ]);

        expect(result.calendar_items)
            .toHaveLength(1);
        expect(result.calendar_items[0].role_in_event)
            .toBe('AUDITOR');
    });

    it('returns only membership-backed audit to Technical Expert', async () => {
        prisma.audit_team_members.findMany
            .mockResolvedValue([
                membership('TECHNICAL_EXPERT'),
            ]);

        const result =
            await workspace([
                'TECHNICAL_EXPERT',
            ]);

        expect(result.calendar_items[0].role_in_event)
            .toBe('TECHNICAL_EXPERT');
    });

    it('gives reviewer review KPIs and no coordinator KPI', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work({
                                work_type:
                                    'TECHNICAL_REVIEW',
                            }),
                        ],
            }),
        );

        const result =
            await workspace([
                'TECHNICAL_REVIEWER',
            ]);
        const keys =
            result.role_kpis.map((item) =>
                item.key,
            );

        expect(keys).toContain('open_reviews');
        expect(keys).not.toContain('f04_pending');
        expect(result.calendar_items.filter((item) => item.type === 'AUDIT'))
            .toEqual([]);
    });

    it('gives Decision Maker decision and certificate KPIs', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work({
                                work_type:
                                    'CERTIFICATION_DECISION',
                            }),
                            work({
                                id:
                                    'work-2',
                                work_type:
                                    'CERTIFICATE_ISSUE',
                            }),
                        ],
            }),
        );

        const result =
            await workspace([
                'DECISION_MAKER',
            ]);
        const keys =
            result.role_kpis.map((item) =>
                item.key,
            );

        expect(keys).toEqual(
            expect.arrayContaining([
                'pending_decisions',
                'certificates_awaiting_issue',
            ]),
        );
    });

    it('uses the already server-scoped durable work projection', async () => {
        await workspace([
            'AUDITOR',
        ]);

        expect(workItems.getMyWork)
            .toHaveBeenCalledWith(
                {
                    userId:
                        'user-1',
                    roles: [
                        'AUDITOR',
                    ],
                },
                {
                    limit:
                        '200',
                },
            );
    });

    it('calculates OPEN and IN_PROGRESS from durable work items', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work(),
                            work({
                                id:
                                    'work-2',
                                status:
                                    'IN_PROGRESS',
                            }),
                        ],
            }),
        );

        const result =
            await workspace([
                'AUDITOR',
            ]);

        expect(result.work_summary.open)
            .toBe(1);
        expect(result.work_summary.in_progress)
            .toBe(1);
    });

    it('calculates overdue count from durable work items', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work({
                                is_overdue:
                                    true,
                            }),
                        ],
            }),
        );

        expect((await workspace(['AUDITOR'])).work_summary.overdue)
            .toBe(1);
    });

    it('calculates due-soon count using the seven-day window', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work({
                                due_at:
                                    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
                            }),
                        ],
            }),
        );

        expect((await workspace(['AUDITOR'])).work_summary.due_soon)
            .toBe(1);
    });

    it('orders overdue before urgent and normal work', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work({
                                id:
                                    'urgent',
                                priority:
                                    'URGENT',
                            }),
                            work({
                                id:
                                    'overdue',
                                is_overdue:
                                    true,
                                priority:
                                    'NORMAL',
                            }),
                        ],
            }),
        );

        expect((await workspace(['AUDITOR'])).priority_work_items[0].id)
            .toBe('overdue');
    });

    it('normalizes work deadline calendar type', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work({
                                work_type:
                                    'TECHNICAL_REVIEW',
                                due_at:
                                    new Date('2026-09-03T00:00:00Z'),
                            }),
                        ],
            }),
        );

        expect((await workspace(['TECHNICAL_REVIEWER'])).calendar_items[0].type)
            .toBe('REVIEW_DUE');
    });

    it('deduplicates one audit for a multi-role membership', async () => {
        prisma.audit_team_members.findMany
            .mockResolvedValue([
                membership('TEAM_LEADER'),
                membership('AUDITOR'),
            ]);

        const result =
            await workspace([
                'LEAD_AUDITOR',
                'AUDITOR',
            ]);
        const audits =
            result.calendar_items.filter((item) => item.type === 'AUDIT');

        expect(audits).toHaveLength(1);
        expect(audits[0].role_in_event)
            .toBe('AUDITOR, TEAM_LEADER');
    });

    it('preserves exact audit destination and dossier context', async () => {
        prisma.audit_team_members.findMany
            .mockResolvedValue([
                membership(),
            ]);

        const item =
            (await workspace(['LEAD_AUDITOR'])).calendar_items[0];

        expect(item.destination_path)
            .toContain('audit_event_id=event-1&audit_plan_id=plan-1');
        expect(item.context)
            .toEqual(
                expect.objectContaining({
                    dossier_key:
                        'initial_certification',
                }),
            );
    });

    it('deduplicates work items for a multi-role dashboard', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? []
                        : [
                            work(),
                        ],
            }),
        );

        const result =
            await workspace([
                'LEAD_AUDITOR',
                'AUDITOR',
            ]);

        expect(result.priority_work_items)
            .toHaveLength(1);
    });

    it('returns valid intentional empty projections', async () => {
        const result =
            await workspace([
                'STAFF',
            ]);

        expect(result.priority_work_items)
            .toEqual([]);
        expect(result.calendar_items)
            .toEqual([]);
        expect(result.exceptions)
            .toEqual([]);
        expect(result.recent_records)
            .toEqual([]);
    });

    it('does not use notification or audit-log task sources', async () => {
        const result =
            await workspace([
                'ADMIN',
            ]);

        expect(result.meta.data_sources)
            .not.toEqual(
                expect.arrayContaining([
                    'notifications',
                    'audit_logs',
                ]),
            );
    });

    it('uses only completed work already returned by the scoped work service for recency', async () => {
        workItems.getMyWork.mockImplementation(
            async (_actor, query) => ({
                items:
                    query.status === 'DONE'
                        ? [
                            work({
                                id:
                                    'safe-record',
                                status:
                                    'DONE',
                                completed_at:
                                    new Date('2026-08-10T00:00:00Z'),
                            }),
                        ]
                        : [],
            }),
        );

        const result =
            await workspace([
                'AUDITOR',
            ]);

        expect(result.recent_records.map((item) => item.id))
            .toEqual([
                'work:safe-record',
            ]);
    });

    it('dedupe helper preserves separate work and audit identities', () => {
        const date =
            new Date('2026-09-01T00:00:00Z');
        const base = {
            title:
                'Item',
            start:
                date,
            end:
                null,
            all_day:
                true,
            project_id:
                'project-1',
            project_code:
                'PRJ-1',
            organization_name:
                'A',
            role_in_event:
                null,
            status:
                'OPEN',
            destination_path:
                '/projects/project-1',
            context:
                null,
        };

        expect(
            dedupeCalendarItems([
                {
                    ...base,
                    id:
                        'audit:1',
                    type:
                        'AUDIT',
                },
                {
                    ...base,
                    id:
                        'work:1',
                    type:
                        'WORK_DUE',
                },
            ]),
        ).toHaveLength(2);
    });
});
