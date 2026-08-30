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
  admin: '14000000-0000-4000-8000-000000000001',
  adminRole: '14000000-0000-4000-8000-000000000101',
  readPermission: '14000000-0000-4000-8000-000000000201',
  managePermission: '14000000-0000-4000-8000-000000000202',
  expert: '14000000-0000-4000-8000-000000000301',
  document: '14000000-0000-4000-8000-000000000401',
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
const safeTestDatabase = configuredDatabaseName.toLowerCase().endsWith('_test') || configuredDatabaseName.toLowerCase().endsWith('_ci');
if (testDatabaseUrl && !safeTestDatabase) {
  throw new Error(`[P09 E2E SAFETY] Refusing TEST_DATABASE_URL database without _test/_ci suffix: ${configuredDatabaseName || '<missing>'}`);
}
if (safeTestDatabase) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = 'test';
}
const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 4A expert competency governance (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminToken = '';
  let competencyId = '';
  let evidenceId = '';
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
    const existing = await prisma.role_permissions.findFirst({ where: { role_id: roleId, permission_id: permissionId }, select: { role_id: true } });
    if (existing) return;
    await prisma.role_permissions.create({ data: { role_id: roleId, permission_id: permissionId } });
    createdGrantKeys.push({ role_id: roleId, permission_id: permissionId });
  }

  async function cleanup(cleanAuth = false) {
    await assertConnectedToTestDatabase(prisma);

    const competencies = await prisma.expert_competencies.findMany({
      where: { expert_id: ids.expert },
      select: { id: true },
    });
    const competencyIds = competencies.map((item) => item.id);
    const evidences = competencyIds.length
      ? await prisma.expert_competency_evidences.findMany({
          where: { competency_id: { in: competencyIds } },
          select: { id: true },
        })
      : [];
    const evidenceIds = evidences.map((item) => item.id);

    if (evidenceIds.length) {
      await prisma.documentFile.deleteMany({
        where: { entity_type: 'expert_competency_evidence', entity_id: { in: evidenceIds } },
      });
    }
    if (competencyIds.length) {
      await prisma.expert_competency_actions.deleteMany({ where: { competency_id: { in: competencyIds } } });
      await prisma.expert_competency_reviews.deleteMany({ where: { competency_id: { in: competencyIds } } });
      await prisma.expert_competency_evidences.deleteMany({ where: { competency_id: { in: competencyIds } } });
      await prisma.expert_competencies.deleteMany({ where: { id: { in: competencyIds } } });
    }
    await prisma.experts.deleteMany({ where: { id: ids.expert } });
    await prisma.user_sessions.deleteMany({ where: { user_id: ids.admin } });
    await prisma.user_roles.deleteMany({ where: { user_id: ids.admin } });
    await prisma.audit_logs.deleteMany({ where: { user_id: ids.admin } });
    await prisma.users.deleteMany({ where: { id: ids.admin } });

    if (cleanAuth) {
      for (const grant of createdGrantKeys) await prisma.role_permissions.deleteMany({ where: grant });
      if (createdPermissionIds.length) await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
      if (createdRoleIds.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
  }

  async function createFixtures() {
    const adminRoleId = await ensureRole('ADMIN', ids.adminRole);
    const readPermissionId = await ensurePermission('competencies.read', ids.readPermission);
    const managePermissionId = await ensurePermission('competencies.manage', ids.managePermission);
    await ensureGrant(adminRoleId, readPermissionId);
    await ensureGrant(adminRoleId, managePermissionId);

    await prisma.users.create({
      data: {
        id: ids.admin,
        username: 'p4a_admin',
        email: 'p4a-admin@example.com',
        password_hash: 'E2E_NOT_USED',
        full_name: 'Phase 4A Admin',
      },
    });
    await prisma.user_roles.create({ data: { user_id: ids.admin, role_id: adminRoleId } });
    await prisma.experts.create({
      data: {
        id: ids.expert,
        employee_code: 'P4A-EXPERT',
        full_name: 'Phase 4A Expert',
        email: 'p4a-expert@example.com',
        status: 'active',
        profile_status: 'APPROVED',
        approved_by: ids.admin,
        approved_at: new Date('2026-08-20T00:00:00.000Z'),
      },
    });
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
    adminToken = await jwt.signAsync({ sub: ids.admin, username: 'p4a_admin' });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  }, 180_000);

  it('blocks approval without evidence, then accepts structured evidence and approval', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/expert-competencies')
      .set('Authorization', bearer(adminToken))
      .send({
        expert_id: ids.expert,
        management_system: 'QMS',
        standard_code: 'ISO 9001:2015',
        competency_role: 'AUDITOR',
        scope_level: 'IAF',
        iaf_code: '14',
        competency_level: 'QUALIFIED',
        effective_date: '2026-08-22',
        expiry_date: '2027-08-21',
        scope_description: 'Manufacture of rubber and plastic products',
        approval_basis: 'Phase 4A E2E governance test',
      })
      .expect(201);

    competencyId = createResponse.body.id;
    expect(competencyId).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/approve`)
      .set('Authorization', bearer(adminToken))
      .expect(400);

    const evidenceResponse = await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/evidence`)
      .set('Authorization', bearer(adminToken))
      .send({
        evidence_type: 'INTERVIEW_TEST',
        title: 'Initial interview and competence test',
        reference_no: 'F10-P4A-001',
        evidence_date: '2026-08-21',
        result: 'PASS',
        score: 85,
        description: 'Interview/test result used as approval evidence.',
      })
      .expect(201);

    evidenceId = evidenceResponse.body.id;
    expect(evidenceId).toBeTruthy();

    const approveResponse = await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/approve`)
      .set('Authorization', bearer(adminToken))
      .expect(201);

    expect(approveResponse.body.approval_status).toBe('APPROVED');
  });

  it('returns structured evidence, attachment projection and immutable action history', async () => {
    await prisma.documentFile.create({
      data: {
        id: ids.document,
        entity_type: 'expert_competency_evidence',
        entity_id: evidenceId,
        document_type: 'competency_evidence',
        file_kind: 'attachment',
        original_name: 'f10-competency-test.pdf',
        stored_name: 'p4a-f10-competency-test.pdf',
        file_url: 'storage/e2e/p4a-f10-competency-test.pdf',
        mime_type: 'application/pdf',
        file_size: 128,
        sha256: 'a'.repeat(64),
        uploaded_by: ids.admin,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/expert-competencies/${competencyId}`)
      .set('Authorization', bearer(adminToken))
      .expect(200);

    expect(response.body.evidence_records).toHaveLength(1);
    expect(response.body.evidence_records[0].attachments[0].download_url).toBe(`/document-files/${ids.document}/download`);
    expect(response.body.governance.active_evidence_count).toBe(1);
    expect(response.body.governance.evidence_gap).toBe(false);
    expect(response.body.action_records.map((item: { action_type: string }) => item.action_type)).toEqual(
      expect.arrayContaining(['CREATE', 'EVIDENCE_ADDED', 'APPROVE']),
    );
  });

  it('records annual review due date and allows renewal after satisfactory review', async () => {
    await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/renew`)
      .set('Authorization', bearer(adminToken))
      .send({
        effective_date: '2026-08-23',
        expiry_date: '2027-08-22',
        decision_basis: 'Renewal must be blocked until a competence review exists.',
      })
      .expect(400);

    const reviewResponse = await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/reviews`)
      .set('Authorization', bearer(adminToken))
      .send({
        review_type: 'PERIODIC',
        review_date: '2026-08-22',
        monitoring_methods: 'Audit log and report review',
        score: 90,
        result: 'SATISFACTORY',
        finding: 'Competence maintained',
      })
      .expect(201);

    expect(String(reviewResponse.body.next_review_date)).toContain('2027-08-22');

    await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/renew`)
      .set('Authorization', bearer(adminToken))
      .send({
        effective_date: '2026-08-23',
        expiry_date: '2027-08-22',
        decision_basis: 'Satisfactory annual competence review and active evidence.',
        note: 'Phase 4A renewal E2E',
      })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/expert-competencies/${competencyId}`)
      .set('Authorization', bearer(adminToken))
      .expect(200);

    expect(detail.body.governance.review_due_date).toContain('2027-08-22');
    expect(detail.body.action_records.map((item: { action_type: string }) => item.action_type)).toEqual(
      expect.arrayContaining(['REVIEW_RECORDED', 'RENEW']),
    );
  });

  it('suspends and reactivates competency without creating a replacement record', async () => {
    const suspended = await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/suspend`)
      .set('Authorization', bearer(adminToken))
      .send({ reason: 'Temporary governance hold for E2E.' })
      .expect(201);
    expect(suspended.body.approval_status).toBe('SUSPENDED');

    const reactivated = await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/reactivate`)
      .set('Authorization', bearer(adminToken))
      .send({
        decision_basis: 'Governance hold resolved and evidence reconfirmed.',
        effective_date: '2026-08-23',
        expiry_date: '2027-08-22',
      })
      .expect(201);

    expect(reactivated.body.id).toBe(competencyId);
    expect(reactivated.body.approval_status).toBe('APPROVED');
  });

  it('blocks renewal after unsatisfactory review and keeps voided evidence in history', async () => {
    await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/reviews`)
      .set('Authorization', bearer(adminToken))
      .send({
        review_type: 'UNSCHEDULED',
        review_date: '2026-08-24',
        monitoring_methods: 'Unscheduled report review and interview',
        result: 'UNSATISFACTORY',
        finding: 'Competence evidence requires corrective follow-up.',
        required_action: 'Complete retraining and reassessment.',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/renew`)
      .set('Authorization', bearer(adminToken))
      .send({
        effective_date: '2027-08-23',
        expiry_date: '2028-08-22',
        decision_basis: 'Should be rejected while latest review is unsatisfactory.',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/expert-competencies/${competencyId}/evidence/${evidenceId}/void`)
      .set('Authorization', bearer(adminToken))
      .send({ reason: 'Superseded evidence retained only for historical traceability.' })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/expert-competencies/${competencyId}`)
      .set('Authorization', bearer(adminToken))
      .expect(200);

    expect(detail.body.evidence_records[0].status).toBe('VOID');
    expect(detail.body.governance.evidence_gap).toBe(true);
    expect(detail.body.governance.requires_management_action).toBe(true);
    expect(detail.body.action_records.map((item: { action_type: string }) => item.action_type)).toEqual(
      expect.arrayContaining(['SUSPEND', 'REACTIVATE', 'EVIDENCE_VOIDED']),
    );
  });
});
