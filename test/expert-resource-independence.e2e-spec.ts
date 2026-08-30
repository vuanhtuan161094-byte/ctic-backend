import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(60_000);

const ids = {
  admin: '16000000-0000-4000-8000-000000000001',
  expertUser: '16000000-0000-4000-8000-000000000002',
  customerUser: '16000000-0000-4000-8000-000000000003',
  coordinatorUser: '16000000-0000-4000-8000-000000000004',
  expert: '16000000-0000-4000-8000-000000000101',
  competency: '16000000-0000-4000-8000-000000000102',
  customerA: '16000000-0000-4000-8000-000000000201',
  customerB: '16000000-0000-4000-8000-000000000202',
  applicationA: '16000000-0000-4000-8000-000000000301',
  applicationB: '16000000-0000-4000-8000-000000000302',
  projectA: '16000000-0000-4000-8000-000000000401',
  projectB: '16000000-0000-4000-8000-000000000402',
  planA: '16000000-0000-4000-8000-000000000501',
  planB: '16000000-0000-4000-8000-000000000502',
  appointment: '16000000-0000-4000-8000-000000000601',
  member: '16000000-0000-4000-8000-000000000602',
  adminRole: '16000000-0000-4000-8000-000000000701',
  customerRole: '16000000-0000-4000-8000-000000000702',
  coordinatorRole: '16000000-0000-4000-8000-000000000703',
  expertsRead: '16000000-0000-4000-8000-000000000801',
  expertsManage: '16000000-0000-4000-8000-000000000802',
  teamsRead: '16000000-0000-4000-8000-000000000803',
  teamsManage: '16000000-0000-4000-8000-000000000804',
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
const safeTestDatabase = configuredDatabaseName.toLowerCase().endsWith('_test') ||
  configuredDatabaseName.toLowerCase().endsWith('_ci');
if (testDatabaseUrl && !safeTestDatabase) {
  throw new Error(`[P09 E2E SAFETY] Refusing TEST_DATABASE_URL database without _test/_ci suffix: ${configuredDatabaseName || '<missing>'}`);
}
if (safeTestDatabase) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = 'test';
}
const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 4C resource availability and independence (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminToken = '';
  let customerToken = '';
  let coordinatorToken = '';
  let availabilityId = '';
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
    await prisma.expert_resource_actions.deleteMany({ where: { expert_id: ids.expert } });
    await prisma.expert_customer_conflicts.deleteMany({ where: { expert_id: ids.expert } });
    await prisma.expert_availability_periods.deleteMany({ where: { expert_id: ids.expert } });
    await prisma.audit_team_member_scopes.deleteMany({ where: { member_id: ids.member } });
    await prisma.audit_team_members.deleteMany({ where: { id: ids.member } });
    await prisma.audit_team_appointments.deleteMany({ where: { id: ids.appointment } });
    await prisma.audit_plans.deleteMany({ where: { id: { in: [ids.planA, ids.planB] } } });
    await prisma.certification_projects.deleteMany({ where: { id: { in: [ids.projectA, ids.projectB] } } });
    await prisma.certification_applications.deleteMany({ where: { id: { in: [ids.applicationA, ids.applicationB] } } });
    await prisma.customers.deleteMany({ where: { id: { in: [ids.customerA, ids.customerB] } } });
    await prisma.expert_competency_actions.deleteMany({ where: { competency_id: ids.competency } });
    await prisma.expert_competency_reviews.deleteMany({ where: { competency_id: ids.competency } });
    await prisma.expert_competency_evidences.deleteMany({ where: { competency_id: ids.competency } });
    await prisma.expert_competencies.deleteMany({ where: { id: ids.competency } });
    await prisma.experts.deleteMany({ where: { id: ids.expert } });
    await prisma.user_sessions.deleteMany({ where: { user_id: { in: [ids.admin, ids.expertUser, ids.customerUser, ids.coordinatorUser] } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: [ids.admin, ids.expertUser, ids.customerUser, ids.coordinatorUser] } } });
    await prisma.audit_logs.deleteMany({ where: { OR: [
      { user_id: { in: [ids.admin, ids.customerUser, ids.coordinatorUser] } },
      { entity_id: { in: [ids.planA, ids.planB] } },
    ] } });
    await prisma.users.deleteMany({ where: { id: { in: [ids.admin, ids.expertUser, ids.customerUser, ids.coordinatorUser] } } });

    if (cleanAuth) {
      for (const grant of createdGrantKeys) await prisma.role_permissions.deleteMany({ where: grant });
      if (createdPermissionIds.length) await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
      if (createdRoleIds.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
  }

  async function createFixtures() {
    const adminRoleId = await ensureRole('ADMIN', ids.adminRole);
    const customerRoleId = await ensureRole('CUSTOMER', ids.customerRole);
    const coordinatorRoleId = await ensureRole('COORDINATOR', ids.coordinatorRole);
    const permissionIds = await Promise.all([
      ensurePermission('experts.read', ids.expertsRead),
      ensurePermission('experts.manage', ids.expertsManage),
      ensurePermission('audit_teams.read', ids.teamsRead),
      ensurePermission('audit_teams.manage', ids.teamsManage),
    ]);
    for (const permissionId of permissionIds) await ensureGrant(adminRoleId, permissionId);
    await ensureGrant(coordinatorRoleId, permissionIds[0]);

    await prisma.users.createMany({ data: [
      { id: ids.admin, username: 'p4c_admin', email: 'p4c-admin@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4C Admin' },
      { id: ids.expertUser, username: 'p4c_expert', email: 'p4c-expert@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4C Expert' },
      { id: ids.customerUser, username: 'p4c_customer', email: 'p4c-customer@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4C Customer' },
      { id: ids.coordinatorUser, username: 'p4c_coordinator', email: 'p4c-coordinator@example.com', password_hash: 'E2E_NOT_USED', full_name: 'Phase 4C Coordinator' },
    ] });
    await prisma.user_roles.createMany({ data: [
      { user_id: ids.admin, role_id: adminRoleId },
      { user_id: ids.customerUser, role_id: customerRoleId },
      { user_id: ids.coordinatorUser, role_id: coordinatorRoleId },
    ] });
    await prisma.experts.create({ data: {
      id: ids.expert,
      user_id: ids.expertUser,
      employee_code: 'P4C-EXPERT',
      full_name: 'Phase 4C Lead Auditor',
      email: 'p4c-expert-profile@example.com',
      status: 'active',
      profile_status: 'APPROVED',
      approved_by: ids.admin,
      approved_at: new Date('2026-08-20T00:00:00.000Z'),
    } });
    await prisma.expert_competencies.create({ data: {
      id: ids.competency,
      expert_id: ids.expert,
      management_system: 'QMS',
      standard_code: 'ISO 9001:2015',
      competency_role: 'LEAD_AUDITOR',
      scope_level: 'IAF',
      iaf_code: '03',
      competency_level: 'QUALIFIED',
      approval_status: 'APPROVED',
      effective_date: new Date('2026-01-01T00:00:00.000Z'),
      expiry_date: new Date('2027-12-31T00:00:00.000Z'),
      approved_by: ids.admin,
      approved_at: new Date('2026-01-01T00:00:00.000Z'),
    } });
    await prisma.customers.createMany({ data: [
      { id: ids.customerA, customer_code: 'P4C-A', company_name: 'Phase 4C Customer A', status: 'active' },
      { id: ids.customerB, customer_code: 'P4C-B', company_name: 'Phase 4C Customer B', status: 'active' },
    ] });
    await prisma.certification_applications.createMany({ data: [
      { id: ids.applicationA, customer_id: ids.customerA, application_code: 'P4C-APP-A', application_date: new Date('2026-08-20T00:00:00.000Z'), standard_name: 'ISO 9001:2015', certification_scope: 'E2E scope A' },
      { id: ids.applicationB, customer_id: ids.customerB, application_code: 'P4C-APP-B', application_date: new Date('2026-08-20T00:00:00.000Z'), standard_name: 'ISO 9001:2015', certification_scope: 'E2E scope B' },
    ] });
    await prisma.certification_projects.createMany({ data: [
      { id: ids.projectA, application_id: ids.applicationA, project_code: 'P4C-PRJ-A', standard_name: 'ISO 9001:2015', status: 'active' },
      { id: ids.projectB, application_id: ids.applicationB, project_code: 'P4C-PRJ-B', standard_name: 'ISO 9001:2015', status: 'active' },
    ] });
    await prisma.audit_plans.createMany({ data: [
      { id: ids.planA, project_id: ids.projectA, plan_code: 'P4C-PLAN-A', audit_type: 'surveillance', planned_start_date: new Date('2026-09-03T00:00:00.000Z'), planned_end_date: new Date('2026-09-03T00:00:00.000Z'), status: 'draft' },
      { id: ids.planB, project_id: ids.projectB, plan_code: 'P4C-PLAN-B', audit_type: 'surveillance', planned_start_date: new Date('2026-09-03T00:00:00.000Z'), planned_end_date: new Date('2026-09-03T00:00:00.000Z'), status: 'draft' },
    ] });
  }

  beforeAll(async () => {
    const { AppModule } = jest.requireActual<typeof import('../src/app.module')>('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use((incoming: Request & { requestId?: string }, response: Response, next: NextFunction) => {
      incoming.requestId = randomUUID();
      response.setHeader('X-Request-Id', incoming.requestId);
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, validationError: { target: false, value: false } }));
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await cleanup();
    await createFixtures();
    adminToken = await jwt.signAsync({ sub: ids.admin, username: 'p4c_admin' });
    customerToken = await jwt.signAsync({ sub: ids.customerUser, username: 'p4c_customer' });
    coordinatorToken = await jwt.signAsync({ sub: ids.coordinatorUser, username: 'p4c_coordinator' });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  }, 180_000);

  it('blocks an inclusive LEAVE overlap, explains the recommendation, and allows non-overlap after cancellation', async () => {
    const created = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability`)
      .set('Authorization', bearer(adminToken))
      .send({
        availability_type: 'LEAVE',
        start_datetime: '2026-09-01',
        end_datetime: '2026-09-03',
        reason: 'Approved leave',
      })
      .expect(201);
    availabilityId = created.body.id;

    const blocked = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const candidate = blocked.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(candidate.eligible).toBe(false);
    expect(candidate.eligibility_reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LEAVE', severity: 'BLOCK' }),
    ]));

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability/${availabilityId}/cancel`)
      .set('Authorization', bearer(adminToken))
      .send({ reason: 'Leave cancelled for E2E non-overlap proof' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability`)
      .set('Authorization', bearer(adminToken))
      .send({
        availability_type: 'UNAVAILABLE',
        start_datetime: '2026-10-01',
        end_datetime: '2026-10-02',
        reason: 'Non-overlapping period',
      })
      .expect(201);
    const available = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const availableCandidate = available.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(availableCandidate.eligible).toBe(true);
  });

  it('hard-blocks an overlapping OTHER_COMMITMENT at Save/Issue while a non-overlap remains eligible', async () => {
    const overlapping = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability`)
      .set('Authorization', bearer(adminToken))
      .send({
        availability_type: 'OTHER_COMMITMENT',
        start_datetime: '2026-09-03',
        end_datetime: '2026-09-03',
        reason: 'Time-specific external commitment',
      })
      .expect(201);

    const recommendation = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const blockedCandidate = recommendation.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(blockedCandidate.eligible).toBe(false);
    expect(blockedCandidate.eligibility_reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OTHER_COMMITMENT', severity: 'BLOCK' }),
    ]));

    await prisma.audit_team_appointments.create({ data: {
      id: ids.appointment,
      audit_plan_id: ids.planA,
      appointment_number: 'P4C-F04-COMMITMENT',
      appointment_date: new Date('2026-08-24T00:00:00.000Z'),
      status: 'draft',
      prepared_by: ids.admin,
    } });
    await prisma.audit_team_members.create({ data: {
      id: ids.member,
      appointment_id: ids.appointment,
      expert_id: ids.expert,
      team_role: 'TEAM_LEADER',
      planned_start_date: new Date('2026-09-03T00:00:00.000Z'),
      planned_end_date: new Date('2026-09-03T00:00:00.000Z'),
      planned_mandays: 1,
    } });
    await request(app.getHttpServer())
      .post(`/audit-team-appointments/${ids.appointment}/issue`)
      .set('Authorization', bearer(adminToken))
      .expect(409);
    const assignmentBlock = await prisma.expert_resource_actions.findFirst({
      where: {
        expert_id: ids.expert,
        entity_id: ids.planA,
        action_type: 'ASSIGNMENT_BLOCKED',
        reason: { contains: 'OTHER_COMMITMENT' },
      },
    });
    expect(assignmentBlock).not.toBeNull();
    await prisma.audit_team_members.deleteMany({ where: { id: ids.member } });
    await prisma.audit_team_appointments.deleteMany({ where: { id: ids.appointment } });

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability/${overlapping.body.id}/cancel`)
      .set('Authorization', bearer(adminToken))
      .send({ reason: 'End overlap case' })
      .expect(201);
    const nonOverlapping = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability`)
      .set('Authorization', bearer(adminToken))
      .send({
        availability_type: 'OTHER_COMMITMENT',
        start_datetime: '2026-09-04',
        end_datetime: '2026-09-04',
        reason: 'Adjacent but non-overlapping commitment',
      })
      .expect(201);
    const available = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const availableCandidate = available.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(availableCandidate.eligible).toBe(true);
    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability/${nonOverlapping.body.id}/cancel`)
      .set('Authorization', bearer(adminToken))
      .send({ reason: 'End non-overlap case' })
      .expect(201);
  });

  it('applies PROHIBITED only to Customer A and ignores an expired Customer B declaration', async () => {
    const declaredA = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/conflicts`)
      .set('Authorization', bearer(adminToken))
      .send({
        customer_id: ids.customerA,
        conflict_type: 'CONSULTANCY',
        description: 'Current consultancy risk for Customer A',
        risk_level: 'HIGH',
        valid_from: '2026-01-01',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/conflicts/${declaredA.body.id}/review`)
      .set('Authorization', bearer(adminToken))
      .send({
        independence_status: 'PROHIBITED',
        review_note: 'Assignment is prohibited while the consultancy relationship remains active.',
      })
      .expect(201);

    const declaredB = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/conflicts`)
      .set('Authorization', bearer(adminToken))
      .send({
        customer_id: ids.customerB,
        conflict_type: 'PRIOR_INVOLVEMENT',
        description: 'Expired involvement for Customer B',
        risk_level: 'LOW',
        valid_from: '2025-01-01',
        valid_to: '2025-12-31',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/conflicts/${declaredB.body.id}/review`)
      .set('Authorization', bearer(adminToken))
      .send({
        independence_status: 'PROHIBITED',
        review_note: 'Historical decision retained for audit trail.',
      })
      .expect(201);

    const recommendationA = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const candidateA = recommendationA.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(candidateA.eligibility_reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INDEPENDENCE_CONFLICT' }),
    ]));

    const recommendationB = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planB}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const candidateB = recommendationB.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(candidateB.eligible).toBe(true);
  });

  it('derives workload from real assignment data and server-side issue revalidation blocks TOCTOU', async () => {
    await prisma.audit_team_appointments.create({ data: {
      id: ids.appointment,
      audit_plan_id: ids.planA,
      appointment_number: 'P4C-F04-001',
      appointment_date: new Date('2026-08-24T00:00:00.000Z'),
      status: 'draft',
      prepared_by: ids.admin,
    } });
    await prisma.audit_team_members.create({ data: {
      id: ids.member,
      appointment_id: ids.appointment,
      expert_id: ids.expert,
      team_role: 'TEAM_LEADER',
      planned_start_date: new Date('2026-09-03T00:00:00.000Z'),
      planned_end_date: new Date('2026-09-03T00:00:00.000Z'),
      planned_mandays: 1,
    } });

    const overview = await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/resource-governance?start_date=2026-09-01&end_date=2026-09-05`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    expect(Number(overview.body.workload.assigned_mandays)).toBe(1);
    expect(overview.body.workload.engagement_count).toBe(1);

    await request(app.getHttpServer())
      .post(`/audit-team-appointments/${ids.appointment}/issue`)
      .set('Authorization', bearer(adminToken))
      .expect(409);

    const unchanged = await prisma.audit_team_appointments.findUnique({ where: { id: ids.appointment } });
    expect(unchanged?.status).toBe('draft');
    const blockAudit = await prisma.expert_resource_actions.findFirst({
      where: {
        expert_id: ids.expert,
        entity_id: ids.planA,
        action_type: 'ASSIGNMENT_BLOCKED',
        reason: { contains: 'INDEPENDENCE_CONFLICT' },
      },
    });
    expect(blockAudit?.reason).toContain('INDEPENDENCE_CONFLICT');
  });

  it('minimizes independence data for COORDINATOR and recommendations', async () => {
    const adminOverview = await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/resource-governance`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    expect(adminOverview.body.independence_conflicts.some(
      (item: Record<string, unknown>) => typeof item.description === 'string',
    )).toBe(true);

    const coordinatorOverview = await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/resource-governance`)
      .set('Authorization', bearer(coordinatorToken))
      .expect(200);
    expect(coordinatorOverview.body.action_history).toEqual([]);
    for (const conflict of coordinatorOverview.body.independence_conflicts) {
      expect(conflict).not.toHaveProperty('description');
      expect(conflict).not.toHaveProperty('mitigation_justification');
      expect(conflict).not.toHaveProperty('review_note');
      expect(conflict).not.toHaveProperty('conflict_type');
      expect(conflict).not.toHaveProperty('snapshot_json');
    }

    const recommendation = await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(coordinatorToken))
      .expect(200);
    const candidate = recommendation.body.recommendations.find(
      (item: { expert: { id: string } }) => item.expert.id === ids.expert,
    );
    expect(candidate).not.toHaveProperty('independence_conflicts');
    expect(candidate.eligibility_reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INDEPENDENCE_CONFLICT' }),
    ]));
  });

  it('default-denies customer access to internal resource and independence endpoints', async () => {
    await request(app.getHttpServer())
      .get('/experts/resource-customers')
      .set('Authorization', bearer(customerToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/experts/recommendations?plan_id=${ids.planA}&team_role=TEAM_LEADER`)
      .set('Authorization', bearer(customerToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/resource-governance`)
      .set('Authorization', bearer(customerToken))
      .expect(403);
    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/conflicts`)
      .set('Authorization', bearer(customerToken))
      .send({
        customer_id: ids.customerA,
        conflict_type: 'OTHER',
        description: 'Customer must never reach this operation',
        valid_from: '2026-01-01',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/availability`)
      .set('Authorization', bearer(customerToken))
      .send({
        availability_type: 'LEAVE',
        start_datetime: '2026-09-01',
        end_datetime: '2026-09-01',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/conflicts/16000000-0000-4000-8000-000000000999/review`)
      .set('Authorization', bearer(customerToken))
      .send({ independence_status: 'PROHIBITED', review_note: 'Must be denied' })
      .expect(403);
  });
});
