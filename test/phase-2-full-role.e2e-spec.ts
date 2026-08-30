import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DelegationsService } from '../src/delegations/delegations.service';
import { NotificationEngineService } from '../src/notifications/notification-engine.service';
import { NotificationRecipientService } from '../src/notifications/notification-recipient.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResourceAccessService } from '../src/security/resource-access.service';
import { TechnicalReviewsService } from '../src/technical-reviews/technical-reviews.service';
import { ActionAuthorizationService } from '../src/work-items/action-authorization.service';
import { WorkItemsService } from '../src/work-items/work-items.service';

jest.setTimeout(90_000);

function databaseName(url: string) {
    const part = url.split(';').find((item) => /^(database|initial catalog)=/i.test(item.trim()));
    return part?.slice(part.indexOf('=') + 1).replace(/^\{|\}$/g, '') ?? '';
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const configuredDatabaseName = databaseName(testDatabaseUrl);
const safeTestDatabase = configuredDatabaseName.toLowerCase().endsWith('_test') || configuredDatabaseName.toLowerCase().endsWith('_ci');

if (testDatabaseUrl && !safeTestDatabase) {
    throw new Error(`[PHASE 2.4 E2E SAFETY] Refusing non-test database ${configuredDatabaseName || '<missing>'}`);
}
if (safeTestDatabase) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.NODE_ENV = 'test';
}

const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 2.4 full-role assignment, delegation and SoD (isolated real database)', () => {
    let prisma: PrismaService;
    let workItems: WorkItemsService;
    let delegations: DelegationsService;
    let reviews: TechnicalReviewsService;
    let authorization: ActionAuthorizationService;
    const run = randomUUID().replaceAll('-', '').slice(0, 10);
    const ids = {
        admin: randomUUID(),
        coordinatorA: randomUUID(),
        coordinatorB: randomUUID(),
        lead: randomUUID(),
        auditor: randomUUID(),
        expert: randomUUID(),
        reviewerA: randomUUID(),
        reviewerB: randomUUID(),
        decision: randomUUID(),
        customerUser: randomUUID(),
        customer: randomUUID(),
        application: randomUUID(),
        project: randomUUID(),
        program: randomUUID(),
        event: randomUUID(),
        plan: randomUUID(),
        appointment: randomUUID(),
        report: randomUUID(),
        leadExpert: randomUUID(),
        auditorExpert: randomUUID(),
        technicalExpert: randomUUID(),
    };
    const allUserIds = [
        ids.admin, ids.coordinatorA, ids.coordinatorB, ids.lead, ids.auditor,
        ids.expert, ids.reviewerA, ids.reviewerB, ids.decision, ids.customerUser,
    ];
    const roleNames = ['admin', 'coordinator', 'lead_auditor', 'auditor', 'technical_expert', 'technical_reviewer', 'decision_maker', 'customer'];

    async function assertTestDatabase() {
        const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        const actual = rows[0]?.database_name ?? '';
        if (!actual.toLowerCase().endsWith('_test') && !actual.toLowerCase().endsWith('_ci')) {
            throw new Error(`[PHASE 2.4 E2E SAFETY] Cleanup refused for ${actual || '<unknown>'}`);
        }
    }

    async function cleanup() {
        await assertTestDatabase();
        const workItemIds = (
            await prisma.work_items.findMany({
                where: { project_id: ids.project },
                select: { id: true },
            })
        ).map((item) => item.id);
        await prisma.notifications.deleteMany({ where: { OR: [{ user_id: { in: allUserIds } }, { project_id: ids.project }] } });
        if (workItemIds.length) {
            await prisma.notifications.deleteMany({ where: { work_item_id: { in: workItemIds } } });
        }
        await prisma.delegated_action_logs.deleteMany({ where: { OR: [{ actor_user_id: { in: allUserIds } }, { project_id: ids.project }] } });
        await prisma.delegations.deleteMany({ where: { OR: [{ delegator_user_id: { in: allUserIds } }, { delegate_user_id: { in: allUserIds } }] } });
        await prisma.work_items.deleteMany({ where: { project_id: ids.project } });
        await prisma.technical_review_assignments.deleteMany({ where: { technical_review: { report_id: ids.report } } });
        await prisma.technical_reviews.deleteMany({ where: { report_id: ids.report } });
        await prisma.reports.deleteMany({ where: { id: ids.report } });
        await prisma.audit_team_members.deleteMany({ where: { appointment_id: ids.appointment } });
        await prisma.audit_team_appointments.deleteMany({ where: { id: ids.appointment } });
        await prisma.experts.deleteMany({ where: { id: { in: [ids.leadExpert, ids.auditorExpert, ids.technicalExpert] } } });
        await prisma.audit_plans.deleteMany({ where: { id: ids.plan } });
        await prisma.audit_program_events.deleteMany({ where: { id: ids.event } });
        await prisma.audit_programs.deleteMany({ where: { id: ids.program } });
        await prisma.customer_user_access_history.deleteMany({ where: { user_id: ids.customerUser } });
        await prisma.customer_user_access.deleteMany({ where: { user_id: ids.customerUser } });
        await prisma.certification_projects.deleteMany({ where: { id: ids.project } });
        await prisma.certification_applications.deleteMany({ where: { id: ids.application } });
        await prisma.customers.deleteMany({ where: { id: ids.customer } });
        await prisma.audit_logs.deleteMany({ where: { user_id: { in: allUserIds } } });
        await prisma.user_roles.deleteMany({ where: { user_id: { in: allUserIds } } });
        // A scheduler evaluation from another AppModule-backed E2E suite can
        // finish between the first notification cleanup and fixture-user
        // cleanup. Drain that bounded race immediately before deleting users;
        // this changes test cleanup only, not the production scheduler.
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            await prisma.notifications.deleteMany({ where: { user_id: { in: allUserIds } } });
            try {
                await prisma.users.deleteMany({ where: { id: { in: allUserIds } } });
                break;
            } catch (error) {
                const notificationRace = String(error).includes('notifications_user_id_fkey');
                if (!notificationRace || attempt === 3) throw error;
            }
        }
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect();
        const resourceAccess = new ResourceAccessService(prisma);
        const recipients = new NotificationRecipientService(prisma, resourceAccess);
        const notificationEngine = new NotificationEngineService(prisma, recipients);
        delegations = new DelegationsService(prisma, notificationEngine);
        authorization = new ActionAuthorizationService(resourceAccess, prisma);
        workItems = new WorkItemsService(prisma, authorization, resourceAccess, notificationEngine, delegations);
        reviews = new TechnicalReviewsService(prisma, workItems, delegations, notificationEngine);
        await cleanup();

        const roleIds = new Map<string, string>();
        for (const roleName of roleNames) {
            const role = await prisma.roles.upsert({
                where: { role_name: roleName },
                create: { role_name: roleName },
                update: {},
            });
            roleIds.set(roleName, role.id);
        }

        const users = [
            [ids.admin, 'admin'],
            [ids.coordinatorA, 'coordinator'],
            [ids.coordinatorB, 'coordinator'],
            [ids.lead, 'lead_auditor'],
            [ids.auditor, 'auditor'],
            [ids.expert, 'technical_expert'],
            [ids.reviewerA, 'technical_reviewer'],
            [ids.reviewerB, 'technical_reviewer'],
            [ids.decision, 'decision_maker'],
            [ids.customerUser, 'customer'],
        ] as const;
        await prisma.users.createMany({
            data: users.map(([id, role], index) => ({
                id,
                username: `p24_${role}_${index}_${run}`,
                email: `p24_${role}_${index}_${run}@example.test`,
                full_name: `Phase 2.4 ${role}`,
                password_hash: 'phase-2.4-e2e-not-a-login-secret',
                status: 'active',
            })),
        });
        await prisma.user_roles.createMany({
            data: users.map(([userId, role]) => ({ user_id: userId, role_id: roleIds.get(role)! })),
        });
        await prisma.user_roles.create({
            data: { user_id: ids.reviewerB, role_id: roleIds.get('decision_maker')! },
        });

        await prisma.customers.create({
            data: { id: ids.customer, customer_code: `P24${run}`, company_name: 'Phase 2.4 Customer' },
        });
        await prisma.certification_applications.create({
            data: {
                id: ids.application,
                customer_id: ids.customer,
                application_code: `APP-P24-${run}`,
                application_date: new Date('2026-08-21'),
                standard_name: 'ISO 9001:2015',
                certification_scope: 'Phase 2.4 scope',
                declaration_accepted: true,
            },
        });
        await prisma.certification_projects.create({
            data: { id: ids.project, application_id: ids.application, project_code: `PRJ-P24-${run}` },
        });
        await prisma.customer_user_access.create({
            data: { customer_id: ids.customer, user_id: ids.customerUser },
        });
        await prisma.audit_programs.create({
            data: {
                id: ids.program,
                project_id: ids.project,
                program_code: `PROGRAM-P24-${run}`,
                program_year: 2026,
                organization_name: 'Phase 2.4 Customer',
                standard_name: 'ISO 9001:2015',
                certification_scope: 'Phase 2.4 scope',
                certification_type: 'initial',
                status: 'approved',
            },
        });
        await prisma.audit_program_events.create({
            data: {
                id: ids.event,
                program_id: ids.program,
                sequence_no: 1,
                event_type: 'initial',
                planned_start_date: new Date('2026-09-01'),
                planned_end_date: new Date('2026-09-02'),
                status: 'completed',
            },
        });
        await prisma.audit_plans.create({
            data: {
                id: ids.plan,
                project_id: ids.project,
                audit_event_id: ids.event,
                plan_code: `PLAN-P24-${run}`,
                audit_type: 'initial',
                status: 'completed',
                planned_start_date: new Date('2026-09-01'),
                planned_end_date: new Date('2026-09-02'),
            },
        });
        await prisma.experts.createMany({
            data: [
                { id: ids.leadExpert, user_id: ids.lead, employee_code: `P24L${run}`, full_name: 'Lead Auditor', email: `p24_lead_expert_${run}@example.test` },
                { id: ids.auditorExpert, user_id: ids.auditor, employee_code: `P24A${run}`, full_name: 'Auditor', email: `p24_auditor_expert_${run}@example.test` },
                { id: ids.technicalExpert, user_id: ids.expert, employee_code: `P24E${run}`, full_name: 'Technical Expert', email: `p24_technical_expert_${run}@example.test` },
            ],
        });
        await prisma.audit_team_appointments.create({
            data: {
                id: ids.appointment,
                audit_plan_id: ids.plan,
                appointment_number: `F04-P24-${run}`,
                appointment_date: new Date('2026-08-21'),
                status: 'issued',
                prepared_by: ids.coordinatorA,
            },
        });
        await prisma.audit_team_members.createMany({
            data: [
                { appointment_id: ids.appointment, expert_id: ids.leadExpert, team_role: 'LEAD_AUDITOR', planned_start_date: new Date('2026-09-01'), planned_end_date: new Date('2026-09-02') },
                { appointment_id: ids.appointment, expert_id: ids.auditorExpert, team_role: 'AUDITOR', planned_start_date: new Date('2026-09-01'), planned_end_date: new Date('2026-09-02') },
                { appointment_id: ids.appointment, expert_id: ids.technicalExpert, team_role: 'TECHNICAL_EXPERT', planned_start_date: new Date('2026-09-01'), planned_end_date: new Date('2026-09-02') },
            ],
        });
        await prisma.reports.create({
            data: {
                id: ids.report,
                audit_plan_id: ids.plan,
                report_code: `REP-P24-${run}`,
                status: 'ready_for_technical_review',
                report_date: new Date('2026-09-03'),
                prepared_by: ids.lead,
            },
        });
    });

    afterAll(async () => {
        await cleanup();
        await prisma.$disconnect();
    });

    it('keeps Technical Reviewer outside F.04 and filters audit participants from candidates', async () => {
        const members = await prisma.audit_team_members.findMany({
            where: { appointment_id: ids.appointment },
            select: { experts: { select: { user_id: true } } },
        });
        expect(members.map((item) => item.experts.user_id)).toEqual(expect.arrayContaining([ids.lead, ids.auditor, ids.expert]));
        expect(members.map((item) => item.experts.user_id)).not.toContain(ids.reviewerA);

        const candidates = await reviews.getReviewerCandidates(ids.plan);
        expect(candidates.map((item) => item.id)).toEqual(expect.arrayContaining([ids.reviewerA, ids.reviewerB]));
        expect(candidates.map((item) => item.id)).not.toEqual(expect.arrayContaining([ids.lead, ids.auditor, ids.expert]));
    });

    it('assigns Reviewer A exactly once and prevents Reviewer B from taking the specific task', async () => {
        await reviews.assignForPlan(ids.plan, {
            reviewer_id: ids.reviewerA,
            due_at: new Date('2026-09-10'),
            note: 'Full-role E2E assignment',
        }, { userId: ids.coordinatorA, roles: ['COORDINATOR'] });

        const review = await prisma.technical_reviews.findFirstOrThrow({ where: { report_id: ids.report } });
        expect(review.reviewer_id).toBe(ids.reviewerA);
        expect(await prisma.technical_review_assignments.count({ where: { technical_review_id: review.id, status: 'CURRENT' } })).toBe(1);
        expect(await prisma.work_items.count({ where: { entity_id: review.id, action_code: 'technical_review.perform', status: 'OPEN' } })).toBe(1);
        expect(await prisma.notifications.count({ where: { user_id: ids.reviewerA, work_item_id: { not: null } } })).toBeGreaterThanOrEqual(1);

        const mineA = await workItems.getMyWork({ userId: ids.reviewerA, roles: ['TECHNICAL_REVIEWER'] }, {});
        const mineB = await workItems.getMyWork({ userId: ids.reviewerB, roles: ['TECHNICAL_REVIEWER', 'DECISION_MAKER'] }, {});
        expect(mineA.items.some((item) => item.entity_id === review.id && item.can_execute)).toBe(true);
        expect(mineB.items.some((item) => item.entity_id === review.id)).toBe(false);

        await expect(reviews.assignForPlan(ids.plan, { reviewer_id: ids.reviewerA }, { userId: ids.reviewerA, roles: ['TECHNICAL_REVIEWER'] }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('reassigns A to B with history, cancelled old task and one new notification', async () => {
        const review = await prisma.technical_reviews.findFirstOrThrow({ where: { report_id: ids.report } });
        await reviews.reassign(review.id, {
            reviewer_id: ids.reviewerB,
            reason: 'Reviewer A unavailable',
            due_at: new Date('2026-09-11'),
        }, { userId: ids.coordinatorA, roles: ['COORDINATOR'] });

        const history = await prisma.technical_review_assignments.findMany({
            where: { technical_review_id: review.id },
            orderBy: { assigned_at: 'asc' },
        });
        expect(history).toHaveLength(2);
        expect(history.map((item) => item.status)).toEqual(['REASSIGNED', 'CURRENT']);
        expect(await prisma.work_items.count({ where: { entity_id: review.id, status: 'CANCELLED' } })).toBe(1);
        expect(await prisma.work_items.count({ where: { entity_id: review.id, assigned_user_id: ids.reviewerB, status: 'OPEN' } })).toBe(1);
        expect(await prisma.notifications.count({ where: { user_id: ids.reviewerB, work_item_id: { not: null } } })).toBeGreaterThanOrEqual(1);

        const mineA = await workItems.getMyWork({ userId: ids.reviewerA, roles: ['TECHNICAL_REVIEWER'] }, {});
        const mineB = await workItems.getMyWork({ userId: ids.reviewerB, roles: ['TECHNICAL_REVIEWER', 'DECISION_MAKER'] }, {});
        expect(mineA.items.some((item) => item.entity_id === review.id)).toBe(false);
        expect(mineB.items.some((item) => item.entity_id === review.id && item.can_execute)).toBe(true);
    });

    it('enforces delegation timing, records delegated action and removes visibility on expiry/revoke', async () => {
        const scheduled = await delegations.create({
            delegate_user_id: ids.coordinatorB,
            effective_from: new Date(Date.now() + 60_000),
            effective_to: new Date(Date.now() + 3_600_000),
            scope_type: 'PROJECT_ACTION',
            action_codes: ['audit_team.issue'],
            project_id: ids.project,
            reason: 'Coordinator A temporary absence',
        }, { userId: ids.coordinatorA, roles: ['COORDINATOR'] });
        const work = await workItems.openWorkItem({
            sourceKey: `phase24-delegated:${run}`,
            workType: 'F04_TEAM_APPOINTMENT',
            actionCode: 'audit_team.issue',
            title: 'Delegated coordination work',
            entityType: 'audit_plan',
            entityId: ids.plan,
            projectId: ids.project,
            auditPlanId: ids.plan,
            assignedUserId: ids.coordinatorA,
        });

        const beforeEffective = await workItems.getMyWork({ userId: ids.coordinatorB, roles: ['COORDINATOR'] }, {});
        expect(beforeEffective.items.some((item) => item.id === work.id)).toBe(false);

        await prisma.delegations.update({
            where: { id: scheduled.id },
            data: {
                effective_from: new Date(Date.now() - 60_000),
                effective_to: new Date(Date.now() + 3_600_000),
            },
        });
        const delegated = await workItems.getMyWork({ userId: ids.coordinatorB, roles: ['COORDINATOR'] }, {});
        const projected = delegated.items.filter((item) => item.id === work.id);
        expect(projected).toHaveLength(1);
        expect(projected[0]).toMatchObject({ is_delegated: true, can_execute: true });

        await expect(authorization.assertCanPerformAction({
            user: { userId: ids.coordinatorB, roles: ['COORDINATOR'] },
            actionCode: work.action_code,
            resource: { projectId: work.project_id, entityType: work.entity_type, entityId: work.entity_id },
            assignment: { assignedUserId: work.assigned_user_id, assignedRole: work.assigned_role },
            workflowState: work.status,
        })).resolves.toBeUndefined();
        await delegations.recordDelegatedAction({
            delegationId: scheduled.id,
            actor: { userId: ids.coordinatorB, roles: ['COORDINATOR'] },
            actionCode: work.action_code,
            entityType: work.entity_type,
            entityId: work.entity_id,
            projectId: work.project_id,
        });
        expect(await prisma.delegated_action_logs.count({
            where: {
                delegation_id: scheduled.id,
                actor_user_id: ids.coordinatorB,
                delegated_for_user_id: ids.coordinatorA,
            },
        })).toBe(1);

        await prisma.delegations.update({
            where: { id: scheduled.id },
            data: {
                effective_from: new Date(Date.now() - 3_600_000),
                effective_to: new Date(Date.now() - 60_000),
            },
        });
        const afterExpiry = await workItems.getMyWork({ userId: ids.coordinatorB, roles: ['COORDINATOR'] }, {});
        expect(afterExpiry.items.some((item) => item.id === work.id)).toBe(false);
        await expect(delegations.recordDelegatedAction({
            delegationId: scheduled.id,
            actor: { userId: ids.coordinatorB, roles: ['COORDINATOR'] },
            actionCode: work.action_code,
            entityType: work.entity_type,
            entityId: work.entity_id,
            projectId: work.project_id,
        })).rejects.toBeInstanceOf(ForbiddenException);

        const revocable = await delegations.create({
            delegate_user_id: ids.coordinatorB,
            effective_from: new Date(Date.now() - 60_000),
            effective_to: new Date(Date.now() + 3_600_000),
            scope_type: 'PROJECT_ACTION',
            action_codes: ['audit_team.issue'],
            project_id: ids.project,
            reason: 'Second temporary absence',
        }, { userId: ids.coordinatorA, roles: ['COORDINATOR'] });
        expect((await workItems.getMyWork({ userId: ids.coordinatorB, roles: ['COORDINATOR'] }, {})).items
            .some((item) => item.id === work.id)).toBe(true);
        await delegations.revoke(revocable.id, { userId: ids.coordinatorA, roles: ['COORDINATOR'] });
        const afterRevoke = await workItems.getMyWork({ userId: ids.coordinatorB, roles: ['COORDINATOR'] }, {});
        expect(afterRevoke.items.some((item) => item.id === work.id)).toBe(false);
    });

    it('enforces base eligibility, multi-role decision SoD and customer assignment isolation', async () => {
        await expect(delegations.create({
            delegate_user_id: ids.lead,
            effective_from: new Date(Date.now() + 60_000),
            effective_to: new Date(Date.now() + 3_600_000),
            scope_type: 'PROJECT_ACTION',
            action_codes: ['technical_review.perform'],
            project_id: ids.project,
            reason: 'Invalid eligibility attempt',
        }, { userId: ids.reviewerB, roles: ['TECHNICAL_REVIEWER', 'DECISION_MAKER'] }))
            .rejects.toBeInstanceOf(BadRequestException);

        const review = await prisma.technical_reviews.findFirstOrThrow({ where: { report_id: ids.report } });
        await prisma.technical_reviews.update({ where: { id: review.id }, data: { status: 'completed', completed_at: new Date() } });
        await workItems.openWorkItem({
            sourceKey: `phase24-decision:${run}`,
            workType: 'CERTIFICATION_DECISION',
            actionCode: 'certification_decision.issue',
            title: 'Decision SoD',
            entityType: 'technical_review',
            entityId: review.id,
            projectId: ids.project,
            auditPlanId: ids.plan,
            assignedRole: 'DECISION_MAKER',
        });
        const reviewerDecision = await workItems.getMyWork({ userId: ids.reviewerB, roles: ['TECHNICAL_REVIEWER', 'DECISION_MAKER'] }, {});
        const validDecision = await workItems.getMyWork({ userId: ids.decision, roles: ['DECISION_MAKER'] }, {});
        expect(reviewerDecision.items.find((item) => item.entity_id === review.id && item.action_code === 'certification_decision.issue')?.can_execute).toBe(false);
        expect(validDecision.items.find((item) => item.entity_id === review.id && item.action_code === 'certification_decision.issue')?.can_execute).toBe(true);

        const customer = await workItems.getMyWork({ userId: ids.customerUser, roles: ['CUSTOMER'] }, {});
        expect(customer.items.some((item) => item.action_code === 'technical_review.perform' || item.action_code === 'certification_decision.issue')).toBe(false);
    });
});
