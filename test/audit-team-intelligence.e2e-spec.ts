import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(60_000);

const ids = {
    admin: '17000000-0000-4000-8000-000000000001',
    customerUser: '17000000-0000-4000-8000-000000000002',
    expertAUser: '17000000-0000-4000-8000-000000000003',
    expertBUser: '17000000-0000-4000-8000-000000000004',
    expertA: '17000000-0000-4000-8000-000000000101',
    expertB: '17000000-0000-4000-8000-000000000102',
    competenceQms: '17000000-0000-4000-8000-000000000111',
    competenceEms: '17000000-0000-4000-8000-000000000112',
    customer: '17000000-0000-4000-8000-000000000201',
    application: '17000000-0000-4000-8000-000000000202',
    project: '17000000-0000-4000-8000-000000000203',
    plan: '17000000-0000-4000-8000-000000000204',
    appointment: '17000000-0000-4000-8000-000000000205',
    memberA: '17000000-0000-4000-8000-000000000211',
    memberB: '17000000-0000-4000-8000-000000000212',
    scopeQms: '17000000-0000-4000-8000-000000000221',
    scopeEms: '17000000-0000-4000-8000-000000000222',
    isic: '17000000-0000-4000-8000-000000000301',
    nace: '17000000-0000-4000-8000-000000000302',
    iaf: '17000000-0000-4000-8000-000000000303',
    isicNace: '17000000-0000-4000-8000-000000000304',
    naceIafQms: '17000000-0000-4000-8000-000000000305',
    naceIafEms: '17000000-0000-4000-8000-000000000306',
    adminRole: '17000000-0000-4000-8000-000000000401',
    customerRole: '17000000-0000-4000-8000-000000000402',
    teamsRead: '17000000-0000-4000-8000-000000000411',
    teamsManage: '17000000-0000-4000-8000-000000000412',
    expertsRead: '17000000-0000-4000-8000-000000000413',
};

function splitConnectionParts(value: string) {
    const parts: string[] = [];
    let current = '';
    let braceDepth = 0;
    for (const character of value) {
        if (character === '{') braceDepth += 1;
        if (character === '}' && braceDepth > 0) braceDepth -= 1;
        if (character === ';' && braceDepth === 0) {
            parts.push(current);
            current = '';
        } else current += character;
    }
    if (current) parts.push(current);
    return parts;
}

function databaseName(url: string) {
    const parts = splitConnectionParts(url.replace(/^sqlserver:\/\//i, ''));
    parts.shift();
    for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        const key = part.slice(0, separator).trim().toLowerCase();
        if (key === 'database' || key === 'initial catalog') {
            const raw = part.slice(separator + 1).trim();
            return raw.startsWith('{') && raw.endsWith('}') ? raw.slice(1, -1) : raw;
        }
    }
    return '';
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const configuredDatabaseName = databaseName(testDatabaseUrl);
const safeTestDatabase = configuredDatabaseName.toLowerCase().endsWith('_test')
    || configuredDatabaseName.toLowerCase().endsWith('_ci');
if (testDatabaseUrl && !safeTestDatabase) {
    throw new Error(`[P09 E2E SAFETY] Refusing TEST_DATABASE_URL database without _test/_ci suffix: ${configuredDatabaseName || '<missing>'}`);
}
if (safeTestDatabase) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.NODE_ENV = 'test';
}
const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 4D audit-team intelligence (real database e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let jwt: JwtService;
    let adminToken = '';
    let customerToken = '';
    const createdRoleIds: string[] = [];
    const createdPermissionIds: string[] = [];
    const createdGrantKeys: Array<{ role_id: string; permission_id: string }> = [];

    const bearer = (token: string) => `Bearer ${token}`;

    async function assertConnectedToTestDatabase(database: PrismaClient) {
        const result = await database.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        const actual = result[0]?.database_name ?? '';
        if (!actual.toLowerCase().endsWith('_test') && !actual.toLowerCase().endsWith('_ci')) {
            throw new Error(`[P09 E2E SAFETY] Cleanup refused for ${actual || '<unknown database>'}`);
        }
    }

    async function ensureRole(roleName: string, preferredId: string) {
        const existing = await prisma.roles.findUnique({ where: { role_name: roleName }, select: { id: true } });
        if (existing) return existing.id;
        const created = await prisma.roles.create({ data: { id: preferredId, role_name: roleName }, select: { id: true } });
        createdRoleIds.push(created.id);
        return created.id;
    }

    async function ensurePermission(permissionName: string, preferredId: string) {
        const existing = await prisma.permissions.findUnique({ where: { permission_name: permissionName }, select: { id: true } });
        if (existing) return existing.id;
        const created = await prisma.permissions.create({ data: { id: preferredId, permission_name: permissionName }, select: { id: true } });
        createdPermissionIds.push(created.id);
        return created.id;
    }

    async function ensureGrant(roleId: string, permissionId: string) {
        const existing = await prisma.role_permissions.findFirst({ where: { role_id: roleId, permission_id: permissionId } });
        if (existing) return;
        await prisma.role_permissions.create({ data: { role_id: roleId, permission_id: permissionId } });
        createdGrantKeys.push({ role_id: roleId, permission_id: permissionId });
    }

    async function cleanup(cleanAuth = false) {
        await assertConnectedToTestDatabase(prisma);
        await prisma.audit_logs.deleteMany({ where: { OR: [{ entity_id: ids.appointment }, { user_id: { in: [ids.admin, ids.customerUser] } }] } });
        await prisma.expert_resource_actions.deleteMany({ where: { expert_id: { in: [ids.expertA, ids.expertB] } } });
        await prisma.expert_availability_periods.deleteMany({ where: { expert_id: { in: [ids.expertA, ids.expertB] } } });
        await prisma.expert_customer_conflicts.deleteMany({ where: { expert_id: { in: [ids.expertA, ids.expertB] } } });
        await prisma.audit_team_member_scopes.deleteMany({ where: { member_id: { in: [ids.memberA, ids.memberB] } } });
        await prisma.audit_member_program_mandays.deleteMany({ where: { appointment_id: ids.appointment } });
        await prisma.audit_program_manday_requirements.deleteMany({ where: { appointment_id: ids.appointment } });
        await prisma.audit_manday_allocation_versions.deleteMany({ where: { appointment_id: ids.appointment } });
        await prisma.audit_team_members.deleteMany({ where: { appointment_id: ids.appointment } });
        await prisma.audit_team_appointments.deleteMany({ where: { id: ids.appointment } });
        await prisma.notifications.deleteMany({ where: { work_item: { audit_plan_id: ids.plan } } });
        await prisma.work_items.deleteMany({ where: { audit_plan_id: ids.plan } });
        await prisma.audit_plans.deleteMany({ where: { id: ids.plan } });
        await prisma.certification_project_scopes.deleteMany({ where: { id: { in: [ids.scopeQms, ids.scopeEms] } } });
        await prisma.certification_projects.deleteMany({ where: { id: ids.project } });
        await prisma.certification_applications.deleteMany({ where: { id: ids.application } });
        await prisma.customers.deleteMany({ where: { id: ids.customer } });
        await prisma.expert_competency_actions.deleteMany({ where: { competency_id: { in: [ids.competenceQms, ids.competenceEms] } } });
        await prisma.expert_competency_reviews.deleteMany({ where: { competency_id: { in: [ids.competenceQms, ids.competenceEms] } } });
        await prisma.expert_competency_evidences.deleteMany({ where: { competency_id: { in: [ids.competenceQms, ids.competenceEms] } } });
        await prisma.expert_competencies.deleteMany({ where: { id: { in: [ids.competenceQms, ids.competenceEms] } } });
        await prisma.experts.deleteMany({ where: { id: { in: [ids.expertA, ids.expertB] } } });
        await prisma.nace_iaf_mappings.deleteMany({ where: { id: { in: [ids.naceIafQms, ids.naceIafEms] } } });
        await prisma.industry_code_mappings.deleteMany({ where: { id: ids.isicNace } });
        await prisma.iaf_scopes.deleteMany({ where: { id: ids.iaf } });
        await prisma.industry_classifications.deleteMany({ where: { id: { in: [ids.isic, ids.nace] } } });
        await prisma.user_sessions.deleteMany({ where: { user_id: { in: [ids.admin, ids.customerUser, ids.expertAUser, ids.expertBUser] } } });
        await prisma.user_roles.deleteMany({ where: { user_id: { in: [ids.admin, ids.customerUser] } } });
        await prisma.users.deleteMany({ where: { id: { in: [ids.admin, ids.customerUser, ids.expertAUser, ids.expertBUser] } } });
        if (cleanAuth) {
            for (const grant of createdGrantKeys) await prisma.role_permissions.deleteMany({ where: grant });
            if (createdPermissionIds.length) await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
            if (createdRoleIds.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
        }
    }

    async function createFixtures() {
        const adminRoleId = await ensureRole('ADMIN', ids.adminRole);
        const customerRoleId = await ensureRole('CUSTOMER', ids.customerRole);
        const teamsRead = await ensurePermission('audit_teams.read', ids.teamsRead);
        const teamsManage = await ensurePermission('audit_teams.manage', ids.teamsManage);
        const expertsRead = await ensurePermission('experts.read', ids.expertsRead);
        await ensureGrant(adminRoleId, teamsRead);
        await ensureGrant(adminRoleId, teamsManage);
        await ensureGrant(adminRoleId, expertsRead);

        await prisma.users.createMany({ data: [
            { id: ids.admin, username: 'p4d_admin', email: 'p4d-admin@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4D Admin', status: 'active' },
            { id: ids.customerUser, username: 'p4d_customer', email: 'p4d-customer@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4D Customer', status: 'active' },
            { id: ids.expertAUser, username: 'p4d_expert_a', email: 'p4d-expert-a@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4D Expert A', status: 'active' },
            { id: ids.expertBUser, username: 'p4d_expert_b', email: 'p4d-expert-b@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4D Expert B', status: 'active' },
        ] });
        await prisma.user_roles.createMany({ data: [
            { user_id: ids.admin, role_id: adminRoleId },
            { user_id: ids.customerUser, role_id: customerRoleId },
        ] });
        await prisma.experts.createMany({ data: [
            { id: ids.expertA, user_id: ids.expertAUser, employee_code: 'P4D-A', full_name: 'QMS Lead', email: 'p4d-a-profile@example.com', status: 'active', profile_status: 'APPROVED', approved_by: ids.admin, approved_at: new Date() },
            { id: ids.expertB, user_id: ids.expertBUser, employee_code: 'P4D-B', full_name: 'EMS Auditor', email: 'p4d-b-profile@example.com', status: 'active', profile_status: 'APPROVED', approved_by: ids.admin, approved_at: new Date() },
        ] });
        await prisma.expert_competencies.createMany({ data: [
            { id: ids.competenceQms, expert_id: ids.expertA, management_system: 'QMS', standard_code: 'ISO 9001:2015', competency_role: 'LEAD_AUDITOR', scope_level: 'IAF', iaf_code: 'P4D', competency_level: 'QUALIFIED', approval_status: 'APPROVED', effective_date: new Date('2026-01-01'), expiry_date: new Date('2027-12-31'), approved_by: ids.admin, approved_at: new Date() },
            { id: ids.competenceEms, expert_id: ids.expertB, management_system: 'EMS', standard_code: 'ISO 14001:2015', competency_role: 'AUDITOR', scope_level: 'IAF', iaf_code: 'P4D', competency_level: 'QUALIFIED', approval_status: 'APPROVED', effective_date: new Date('2026-01-01'), expiry_date: new Date('2027-12-31'), approved_by: ids.admin, approved_at: new Date() },
        ] });
        await prisma.customers.create({ data: { id: ids.customer, customer_code: 'P4D-CUSTOMER', company_name: 'Phase 4D Customer', status: 'active' } });
        await prisma.certification_applications.create({ data: { id: ids.application, customer_id: ids.customer, application_code: 'P4D-APP', application_date: new Date('2026-08-24'), standard_name: 'ISO 9001:2015; ISO 14001:2015', certification_scope: 'Integrated E2E scope' } });
        await prisma.certification_projects.create({ data: { id: ids.project, application_id: ids.application, project_code: 'P4D-PRJ', standard_name: 'ISO 9001:2015; ISO 14001:2015', status: 'active' } });
        await prisma.industry_classifications.createMany({ data: [
            { id: ids.isic, classification_type: 'ISIC', revision: 'P4D_E2E', code: 'P4D-ISIC', title_en: 'P4D manufacture', level: 4, is_active: true },
            { id: ids.nace, classification_type: 'NACE', revision: 'P4D_E2E', code: 'P4D-NACE', title_en: 'P4D manufacture', level: 4, is_active: true },
        ] });
        await prisma.iaf_scopes.create({ data: { id: ids.iaf, iaf_code: 'P4D', iaf_name: 'Phase 4D E2E', is_active: true } });
        await prisma.industry_code_mappings.create({ data: { id: ids.isicNace, source_code_id: ids.isic, target_code_id: ids.nace, mapping_type: 'EXACT', mapping_status: 'APPROVED', approved_by: ids.admin, approved_at: new Date() } });
        await prisma.nace_iaf_mappings.createMany({ data: [
            { id: ids.naceIafQms, nace_code_id: ids.nace, iaf_scope_id: ids.iaf, management_system: 'QMS', mapping_status: 'APPROVED', approved_by: ids.admin, approved_at: new Date() },
            { id: ids.naceIafEms, nace_code_id: ids.nace, iaf_scope_id: ids.iaf, management_system: 'EMS', mapping_status: 'APPROVED', approved_by: ids.admin, approved_at: new Date() },
        ] });
        await prisma.certification_project_scopes.createMany({ data: [
            { id: ids.scopeQms, project_id: ids.project, isic_nace_mapping_id: ids.isicNace, nace_iaf_mapping_id: ids.naceIafQms, management_system: 'QMS', standard_code: 'ISO 9001:2015', scope_description: 'QMS P4D scope', status: 'APPROVED', selected_by: ids.admin, approved_by: ids.admin, approved_at: new Date() },
            { id: ids.scopeEms, project_id: ids.project, isic_nace_mapping_id: ids.isicNace, nace_iaf_mapping_id: ids.naceIafEms, management_system: 'EMS', standard_code: 'ISO 14001:2015', scope_description: 'EMS P4D scope', status: 'APPROVED', selected_by: ids.admin, approved_by: ids.admin, approved_at: new Date() },
        ] });
        await prisma.audit_plans.create({ data: { id: ids.plan, project_id: ids.project, plan_code: 'P4D-PLAN', audit_type: 'project_team', planned_start_date: new Date('2026-09-10'), planned_end_date: new Date('2026-09-11'), status: 'draft' } });
        await prisma.audit_team_appointments.create({ data: { id: ids.appointment, audit_plan_id: ids.plan, appointment_number: 'P4D-F04', appointment_date: new Date('2026-08-24'), status: 'draft', prepared_by: ids.admin } });
        await prisma.audit_team_members.createMany({ data: [
            { id: ids.memberA, appointment_id: ids.appointment, expert_id: ids.expertA, team_role: 'TEAM_LEADER', planned_start_date: new Date('2026-09-10'), planned_end_date: new Date('2026-09-11'), planned_mandays: 0 },
            { id: ids.memberB, appointment_id: ids.appointment, expert_id: ids.expertB, team_role: 'AUDITOR', planned_start_date: new Date('2026-09-10'), planned_end_date: new Date('2026-09-11'), planned_mandays: 0 },
        ] });
        await prisma.audit_team_member_scopes.createMany({ data: [
            { member_id: ids.memberA, project_scope_id: ids.scopeQms, iaf_code: 'P4D', nace_code: 'P4D-NACE', coverage_type: 'full' },
            { member_id: ids.memberB, project_scope_id: ids.scopeEms, iaf_code: 'P4D', nace_code: 'P4D-NACE', coverage_type: 'full' },
        ] });
    }

    beforeAll(async () => {
        const { AppModule } = jest.requireActual<typeof import('../src/app.module')>('../src/app.module');
        const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);
        jwt = app.get(JwtService);
        await cleanup();
        await createFixtures();
        adminToken = await jwt.signAsync({ sub: ids.admin, username: 'p4d_admin' });
        customerToken = await jwt.signAsync({ sub: ids.customerUser, username: 'p4d_customer' });
    }, 180_000);

    afterAll(async () => {
        if (prisma) await cleanup(true);
        if (app) await app.close();
    }, 180_000);

    it('accepts collective QMS plus EMS coverage without requiring either expert to cover all programs', async () => {
        const response = await request(app.getHttpServer())
            .get(`/audit-team-appointments/${ids.appointment}/readiness`)
            .set('Authorization', bearer(adminToken))
            .expect(200);
        expect(response.body.ready_to_issue).toBe(true);
        expect(response.body.summary.covered_programs).toBe(2);
        expect(response.body.summary.covered_scopes).toBe(2);
        expect(response.body.coverage_matrix).toEqual(expect.arrayContaining([
            expect.objectContaining({ project_scope_id: ids.scopeQms, status: 'COVERED', covered_by: [expect.objectContaining({ expert_id: ids.expertA })] }),
            expect.objectContaining({ project_scope_id: ids.scopeEms, status: 'COVERED', covered_by: [expect.objectContaining({ expert_id: ids.expertB })] }),
        ]));
    });

    it('recommends by each IMS program and explains candidate contribution deterministically', async () => {
        const response = await request(app.getHttpServer())
            .get(`/experts/recommendations?plan_id=${ids.plan}&team_role=AUDITOR`)
            .set('Authorization', bearer(adminToken))
            .expect(200);
        expect(response.body.team_context.covered_scope_ids).toEqual(expect.arrayContaining([
            ids.scopeQms,
            ids.scopeEms,
        ]));
        const qms = response.body.recommendations.find((item: { expert: { id: string } }) => item.expert.id === ids.expertA);
        const ems = response.body.recommendations.find((item: { expert: { id: string } }) => item.expert.id === ids.expertB);
        expect(qms.coverage.covered).toBe(1);
        expect(ems.coverage.covered).toBe(1);
        expect(qms.score_components).toEqual(expect.objectContaining({ role_competency: 30 }));
        expect(ems.score_components).toEqual(expect.objectContaining({ role_competency: 30 }));
    });

    it('recalculates current readiness when a competency expiry changes', async () => {
        await prisma.expert_competencies.update({ where: { id: ids.competenceEms }, data: { expiry_date: new Date('2026-09-09') } });
        const expired = await request(app.getHttpServer())
            .get(`/audit-team-appointments/${ids.appointment}/readiness`)
            .set('Authorization', bearer(adminToken))
            .expect(200);
        expect(expired.body.ready_to_issue).toBe(false);
        expect(expired.body.coverage_matrix).toEqual(expect.arrayContaining([
            expect.objectContaining({ project_scope_id: ids.scopeEms, status: 'MISSING' }),
        ]));
        await prisma.expert_competencies.update({ where: { id: ids.competenceEms }, data: { expiry_date: new Date('2027-12-31') } });
    });

    it('blocks issue after a TOCTOU competency expiry and audits the failed validation', async () => {
        await prisma.expert_competencies.update({
            where: { id: ids.competenceEms },
            data: { expiry_date: new Date('2026-09-09') },
        });
        await request(app.getHttpServer())
            .post(`/audit-team-appointments/${ids.appointment}/issue`)
            .set('Authorization', bearer(adminToken))
            .expect(400);
        expect((await prisma.audit_team_appointments.findUnique({ where: { id: ids.appointment } }))?.status).toBe('draft');
        expect(await prisma.audit_logs.findFirst({
            where: { entity_id: ids.appointment, action: 'AUDIT_TEAM_READINESS_BLOCKED' },
        })).not.toBeNull();
        await prisma.expert_competencies.update({
            where: { id: ids.competenceEms },
            data: { expiry_date: new Date('2027-12-31') },
        });
    });

    it('default-denies CUSTOMER access to internal team readiness', async () => {
        await request(app.getHttpServer())
            .get(`/audit-team-appointments/${ids.appointment}/readiness`)
            .set('Authorization', bearer(customerToken))
            .expect(403);
    });

    it('issues a ready team and writes the existing audit log', async () => {
        await request(app.getHttpServer())
            .post(`/audit-team-appointments/${ids.appointment}/issue`)
            .set('Authorization', bearer(adminToken))
            .expect(201);
        expect((await prisma.audit_team_appointments.findUnique({ where: { id: ids.appointment } }))?.status).toBe('issued');
        expect(await prisma.audit_logs.findFirst({ where: { entity_id: ids.appointment, action: 'AUDIT_TEAM_ISSUED', outcome: 'success' } })).not.toBeNull();
    });
});
