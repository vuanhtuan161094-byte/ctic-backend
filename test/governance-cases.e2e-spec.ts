import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { DocumentControlService } from '../src/document-control/document-control.service';
import { GovernanceCasesService } from '../src/governance-cases/governance-cases.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkItemsService } from '../src/work-items/work-items.service';

jest.setTimeout(90_000);

function databaseName(url: string) {
    for (const part of url.replace(/^sqlserver:\/\//i, '').split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        const key = part.slice(0, separator).trim().toLowerCase();
        if (key === 'database' || key === 'initial catalog') {
            return part.slice(separator + 1).trim().replace(/^\{|\}$/g, '');
        }
    }
    return '';
}

const testUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const configuredDatabase = databaseName(testUrl);
const safe = configuredDatabase.toLowerCase().endsWith('_test') || configuredDatabase.toLowerCase().endsWith('_ci');
if (testUrl && !safe) throw new Error(`[P09 E2E SAFETY] Refusing ${configuredDatabase || '<missing>'}`);
if (safe) {
    process.env.DATABASE_URL = testUrl;
    process.env.NODE_ENV = 'test';
}
const describeRealDatabase = safe ? describe : describe.skip;

describeRealDatabase('Phase 6 governance cases (real SQL Server e2e)', () => {
    let prisma: PrismaService;
    let service: GovernanceCasesService;
    const run = randomUUID().replaceAll('-', '').slice(0, 10);
    const users = {
        coordinator: randomUUID(), investigator: randomUUID(), reviewer: randomUUID(),
        decision: randomUUID(), original: randomUUID(), customer: randomUUID(),
    };
    const a = {
        customer: randomUUID(), application: randomUUID(), project: randomUUID(), plan: randomUUID(),
        report: randomUUID(), review: randomUUID(), decision: randomUUID(), sourceChange: randomUUID(),
    };
    const b = {
        customer: randomUUID(), application: randomUUID(), project: randomUUID(), plan: randomUUID(),
        report: randomUUID(), review: randomUUID(), decision: randomUUID(),
    };
    const actors = {
        coordinator: { userId: users.coordinator, roles: ['COORDINATOR'] },
        investigator: { userId: users.investigator, roles: ['AUDITOR'] },
        reviewer: { userId: users.reviewer, roles: ['TECHNICAL_REVIEWER'] },
        decision: { userId: users.decision, roles: ['DECISION_MAKER'] },
        customer: { userId: users.customer, roles: ['CUSTOMER'] },
    };
    const caseIds: string[] = [];
    let complaintId = '';
    let appealId = '';

    async function assertTestDatabase() {
        const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        const actual = rows[0]?.database_name ?? '';
        if (!actual.toLowerCase().endsWith('_test') && !actual.toLowerCase().endsWith('_ci')) {
            throw new Error(`[P09 E2E SAFETY] Cleanup refused for ${actual || '<unknown>'}`);
        }
    }

    async function decisionChain(fixture: typeof a | typeof b, suffix: string) {
        await prisma.certification_applications.create({ data: {
            id: fixture.application, customer_id: fixture.customer,
            application_code: `APP-P6-${run}-${suffix}`, application_date: new Date('2026-08-01'),
            certification_type: 'initial', standard_name: 'ISO 9001:2015',
            certification_scope: 'Manufacturing', declaration_accepted: true, status: 'approved',
        } });
        await prisma.certification_projects.create({ data: {
            id: fixture.project, application_id: fixture.application,
            project_code: `PRJ-P6-${run}-${suffix}`, standard_name: 'ISO 9001:2015', status: 'active',
        } });
        await prisma.audit_plans.create({ data: {
            id: fixture.plan, project_id: fixture.project, plan_code: `PLAN-P6-${run}-${suffix}`,
            audit_type: 'special', status: 'completed',
        } });
        await prisma.reports.create({ data: {
            id: fixture.report, audit_plan_id: fixture.plan, report_code: `RPT-P6-${run}-${suffix}`,
            status: 'technical_review_completed', audit_result: 'conformity',
        } });
        await prisma.technical_reviews.create({ data: {
            id: fixture.review, report_id: fixture.report, reviewer_id: users.reviewer,
            status: 'completed', completed_at: new Date('2026-08-20'),
        } });
        await prisma.certification_decisions.create({ data: {
            id: fixture.decision, technical_review_id: fixture.review, project_id: fixture.project,
            decision_number: `DEC-P6-${run}-${suffix}`, decision_date: new Date('2026-08-21'),
            decision_type: 'REFUSE', decision_result: 'rejected', organization_name: `P6 Org ${suffix}`,
            standard_name: 'ISO 9001:2015', certification_scope: 'Manufacturing',
            signatory_name: 'Original Maker', signatory_title: 'Certification Director', created_by: users.original,
        } });
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect();
        await assertTestDatabase();
        const workItems = new WorkItemsService(prisma, {} as any, {} as any);
        const documents = new DocumentControlService(prisma, {
            assertDocumentEntityAccess: jest.fn().mockResolvedValue(undefined),
            filterDocumentEntities: jest.fn(async (rows: unknown[]) => rows),
        } as any);
        service = new GovernanceCasesService(prisma, workItems, documents);

        await prisma.users.createMany({ data: Object.entries(users).map(([name, id]) => ({
            id, username: `p6_${name}_${run}`, email: `p6_${name}_${run}@example.test`,
            password_hash: 'P6_E2E_NOT_A_LOGIN_SECRET', full_name: `P6 ${name}`,
        })) });
        await prisma.customers.createMany({ data: [
            { id: a.customer, customer_code: `P6A${run}`, company_name: 'P6 Customer A', address: 'Original A' },
            { id: b.customer, customer_code: `P6B${run}`, company_name: 'P6 Customer B', address: 'Original B' },
        ] });
        await decisionChain(a, 'A');
        await decisionChain(b, 'B');
        await prisma.customer_user_access.create({ data: {
            customer_id: a.customer, user_id: users.customer, created_by: users.coordinator, status: 'active',
        } });
        await prisma.customer_organization_change_requests.create({ data: {
            id: a.sourceChange, request_code: `OCR-P6-${run}`, customer_id: a.customer,
            requested_by: users.customer, reason: 'Address changed',
            before_snapshot: JSON.stringify({ address: 'Original A' }),
            after_snapshot: JSON.stringify({ address: 'Changed A' }),
        } });
    }, 180_000);

    afterAll(async () => {
        await assertTestDatabase();
        const work = caseIds.length ? await prisma.work_items.findMany({ where: { entity_id: { in: caseIds } }, select: { id: true } }) : [];
        if (work.length) await prisma.notifications.deleteMany({ where: { work_item_id: { in: work.map((item) => item.id) } } });
        if (caseIds.length) {
            await prisma.work_items.deleteMany({ where: { entity_id: { in: caseIds } } });
            await prisma.audit_logs.deleteMany({ where: { entity_id: { in: caseIds } } });
            await prisma.appeal_cases.deleteMany({ where: { id: { in: caseIds } } });
            await prisma.complaint_cases.deleteMany({ where: { id: { in: caseIds } } });
            await prisma.special_audit_cases.deleteMany({ where: { id: { in: caseIds } } });
            await prisma.certification_change_cases.deleteMany({ where: { id: { in: caseIds } } });
        }
        await prisma.customer_organization_change_requests.deleteMany({ where: { id: a.sourceChange } });
        await prisma.customer_user_access.deleteMany({ where: { user_id: users.customer } });
        await prisma.certification_decisions.deleteMany({ where: { id: { in: [a.decision, b.decision] } } });
        await prisma.technical_reviews.deleteMany({ where: { id: { in: [a.review, b.review] } } });
        await prisma.reports.deleteMany({ where: { id: { in: [a.report, b.report] } } });
        await prisma.audit_plans.deleteMany({ where: { id: { in: [a.plan, b.plan] } } });
        await prisma.certification_projects.deleteMany({ where: { id: { in: [a.project, b.project] } } });
        await prisma.certification_applications.deleteMany({ where: { id: { in: [a.application, b.application] } } });
        await prisma.customers.deleteMany({ where: { id: { in: [a.customer, b.customer] } } });
        await prisma.audit_logs.deleteMany({ where: { user_id: { in: Object.values(users) } } });
        await prisma.users.deleteMany({ where: { id: { in: Object.values(users) } } });
        await prisma.controlled_number_sequences.deleteMany({ where: { series_key: { in: ['CHG', 'SA', 'CMP', 'APL'] } } });
        await prisma.$disconnect();
    }, 180_000);

    it('promotes organization change into impact/special audit without mutating customer or certificate authority', async () => {
        const change = await service.createChangeCase({
            source_request_id: a.sourceChange, customer_id: a.customer, project_id: a.project,
            change_type: 'ADDRESS', description: 'Assess certification impact', owner_id: users.coordinator,
        }, actors.coordinator);
        caseIds.push(change.id);
        const assessed = await service.assessChangeCase(change.id, {
            outcome: 'SPECIAL_AUDIT_REQUIRED', scope_change: false, site_population_change: true,
            manday_recalculation_required: true, competency_change_required: true,
            special_audit_required: true, suspension_consideration_required: false,
            commercial_update_required: false, document_update_required: true,
            rationale: 'Verification required', special_audit_scope: 'Changed location',
        }, actors.coordinator);
        const specialId = assessed.special_audit!.id;
        caseIds.push(specialId);
        await service.linkSpecialAuditPlan(specialId, { audit_plan_id: a.plan }, actors.coordinator);
        const originalDecision = await prisma.certification_decisions.findUniqueOrThrow({ where: { id: a.decision } });
        await service.recordSpecialAuditResult(specialId, { result: 'No action required', follow_up_action: 'NONE' }, actors.coordinator);
        expect((await prisma.customers.findUniqueOrThrow({ where: { id: a.customer } })).address).toBe('Original A');
        expect(await prisma.certification_decisions.findUniqueOrThrow({ where: { id: a.decision } })).toEqual(originalDecision);
    });

    it('runs complaint lifecycle with SoD, unique work items and immutable closure', async () => {
        const complaint = await service.createComplaint({
            customer_id: a.customer, project_id: a.project, received_date: '2026-08-24',
            complainant_name: 'Customer A', subject: 'Audit conduct complaint',
            description: 'Formal dissatisfaction requiring investigation', source_channel: 'EMAIL',
        }, actors.coordinator);
        complaintId = complaint.id;
        caseIds.push(complaint.id);
        await expect(service.assignComplaint(complaint.id, {
            owner_id: users.coordinator, investigator_id: users.investigator,
            decision_owner_id: users.investigator, independence_note: 'Invalid same-person assignment',
        }, actors.coordinator)).rejects.toBeInstanceOf(ConflictException);
        await service.assignComplaint(complaint.id, {
            owner_id: users.coordinator, investigator_id: users.investigator,
            decision_owner_id: users.decision, independence_note: 'Independent authorities confirmed',
        }, actors.coordinator);
        await service.acknowledgeComplaint(complaint.id, actors.coordinator);
        await service.investigateComplaint(complaint.id, {
            investigation: 'Evidence reviewed', findings: 'Partly substantiated', internal_notes: 'PRIVATE-P6',
        }, actors.investigator);
        await service.closeComplaint(complaint.id, {
            outcome_status: 'CLOSED', final_response: 'Investigation completed.',
        }, actors.decision);
        expect(await prisma.work_items.count({ where: { entity_id: complaint.id } })).toBe(3);
        await expect(service.investigateComplaint(complaint.id, {
            investigation: 'Attempted overwrite',
        }, actors.investigator)).rejects.toBeInstanceOf(ConflictException);
    });

    it('keeps exact challenged decision immutable and creates controlled subsequent action for successful appeal', async () => {
        const appeal = await service.createAppeal({
            challenged_decision_id: a.decision, appellant_name: 'Customer A',
            grounds: 'Formal request to reconsider the exact refusal decision',
        }, actors.coordinator);
        appealId = appeal.id;
        caseIds.push(appeal.id);
        await expect(service.assignAppeal(appeal.id, {
            owner_id: users.coordinator, reviewer_id: users.reviewer,
            decision_owner_id: users.original, independence_note: 'Must fail self-review',
        }, actors.coordinator)).rejects.toBeInstanceOf(ConflictException);
        await service.assignAppeal(appeal.id, {
            owner_id: users.coordinator, reviewer_id: users.reviewer,
            decision_owner_id: users.decision, independence_note: 'Independent appeal authorities',
        }, actors.coordinator);
        await service.reviewAppeal(appeal.id, {
            review_notes: 'Independent review completed', internal_deliberation: 'PRIVATE-APPEAL-P6',
        }, actors.reviewer);
        const original = await prisma.certification_decisions.findUniqueOrThrow({ where: { id: a.decision } });
        await service.decideAppeal(appeal.id, {
            outcome: 'UPHELD', required_action: 'NEW_CERTIFICATION_DECISION',
            final_response: 'Appeal upheld; subsequent decision required.',
        }, actors.decision);
        expect(await prisma.certification_decisions.findUniqueOrThrow({ where: { id: a.decision } })).toEqual(original);
        expect((await prisma.work_items.findUnique({ where: { source_key: `appeal:${appeal.id}:subsequent-action` } }))?.status).toBe('OPEN');
    });

    it('enforces customer isolation and customer-safe projections for complaints and appeals', async () => {
        const complaintB = await service.createComplaint({
            customer_id: b.customer, project_id: b.project, received_date: '2026-08-24',
            complainant_name: 'Customer B', subject: 'Private B complaint', description: 'Not visible to A',
        }, actors.coordinator);
        const appealB = await service.createAppeal({
            challenged_decision_id: b.decision, appellant_name: 'Customer B', grounds: 'Private B appeal',
        }, actors.coordinator);
        caseIds.push(complaintB.id, appealB.id);
        const complaints = await service.portalComplaints(actors.customer);
        const appeals = await service.portalAppeals(actors.customer);
        expect(complaints.some((item) => item.id === complaintId)).toBe(true);
        expect(complaints.some((item) => item.id === complaintB.id)).toBe(false);
        expect(appeals.some((item) => item.id === appealId)).toBe(true);
        expect(appeals.some((item) => item.id === appealB.id)).toBe(false);
        expect(JSON.stringify(complaints)).not.toContain('PRIVATE-P6');
        expect(JSON.stringify(appeals)).not.toContain('PRIVATE-APPEAL-P6');
        await expect(service.createAppeal({
            challenged_decision_id: b.decision, appellant_name: 'Cross customer', grounds: 'Must be denied',
        }, actors.customer, true)).rejects.toBeInstanceOf(ForbiddenException);
    });
});
