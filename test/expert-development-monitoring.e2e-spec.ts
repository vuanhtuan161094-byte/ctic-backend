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
  admin: '15000000-0000-4000-8000-000000000001',
  coordinator: '15000000-0000-4000-8000-000000000002',
  adminRole: '15000000-0000-4000-8000-000000000101',
  coordinatorRole: '15000000-0000-4000-8000-000000000102',
  readPermission: '15000000-0000-4000-8000-000000000201',
  managePermission: '15000000-0000-4000-8000-000000000202',
  documentsManagePermission: '15000000-0000-4000-8000-000000000203',
  expert: '15000000-0000-4000-8000-000000000301',
  competency: '15000000-0000-4000-8000-000000000302',
  document: '15000000-0000-4000-8000-000000000401',
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

describeRealDatabase('Phase 4B expert training, witness and performance monitoring (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminToken = '';
  let coordinatorToken = '';
  let trainingId = '';
  let witnessId = '';
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

    const trainings = await prisma.expert_training_records.findMany({ where: { expert_id: ids.expert }, select: { id: true } });
    const monitoring = await prisma.expert_monitoring_records.findMany({ where: { expert_id: ids.expert }, select: { id: true } });
    const trainingIds = trainings.map((item) => item.id);
    const monitoringIds = monitoring.map((item) => item.id);

    if (trainingIds.length || monitoringIds.length) {
      await prisma.documentFile.deleteMany({
        where: {
          OR: [
            ...(trainingIds.length ? [{ entity_type: 'expert_training_record', entity_id: { in: trainingIds } }] : []),
            ...(monitoringIds.length ? [{ entity_type: 'expert_monitoring_record', entity_id: { in: monitoringIds } }] : []),
          ],
        },
      });
    }
    if (monitoringIds.length) {
      await prisma.expert_witness_assessment_items.deleteMany({ where: { monitoring_id: { in: monitoringIds } } });
      await prisma.expert_monitoring_records.deleteMany({ where: { id: { in: monitoringIds } } });
    }
    if (trainingIds.length) {
      await prisma.expert_training_records.deleteMany({ where: { id: { in: trainingIds } } });
    }
    await prisma.expert_competency_actions.deleteMany({ where: { competency_id: ids.competency } });
    await prisma.expert_competency_reviews.deleteMany({ where: { competency_id: ids.competency } });
    await prisma.expert_competency_evidences.deleteMany({ where: { competency_id: ids.competency } });
    await prisma.expert_competencies.deleteMany({ where: { id: ids.competency } });
    await prisma.experts.deleteMany({ where: { id: ids.expert } });
    await prisma.user_sessions.deleteMany({ where: { user_id: { in: [ids.admin, ids.coordinator] } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: [ids.admin, ids.coordinator] } } });
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: [ids.admin, ids.coordinator] } } });
    await prisma.users.deleteMany({ where: { id: { in: [ids.admin, ids.coordinator] } } });

    if (cleanAuth) {
      for (const grant of createdGrantKeys) await prisma.role_permissions.deleteMany({ where: grant });
      if (createdPermissionIds.length) await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
      if (createdRoleIds.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
  }

  async function createFixtures() {
    const adminRoleId = await ensureRole('ADMIN', ids.adminRole);
    const coordinatorRoleId = await ensureRole('COORDINATOR', ids.coordinatorRole);
    const readPermissionId = await ensurePermission('experts.read', ids.readPermission);
    const managePermissionId = await ensurePermission('experts.manage', ids.managePermission);
    const documentsManagePermissionId = await ensurePermission('documents.manage', ids.documentsManagePermission);
    await ensureGrant(adminRoleId, readPermissionId);
    await ensureGrant(adminRoleId, managePermissionId);
    await ensureGrant(coordinatorRoleId, readPermissionId);
    await ensureGrant(coordinatorRoleId, documentsManagePermissionId);

    await prisma.users.create({
      data: {
        id: ids.admin,
        username: 'p4b_admin',
        email: 'p4b-admin@example.com',
        password_hash: 'E2E_NOT_USED',
        full_name: 'Phase 4B Admin',
      },
    });
    await prisma.user_roles.create({ data: { user_id: ids.admin, role_id: adminRoleId } });
    await prisma.users.create({
      data: {
        id: ids.coordinator,
        username: 'p4b_coordinator',
        email: 'p4b-coordinator@example.com',
        password_hash: 'E2E_NOT_USED',
        full_name: 'Phase 4B Coordinator',
      },
    });
    await prisma.user_roles.create({ data: { user_id: ids.coordinator, role_id: coordinatorRoleId } });
    await prisma.experts.create({
      data: {
        id: ids.expert,
        employee_code: 'P4B-EXPERT',
        full_name: 'Phase 4B EMS Auditor',
        email: 'p4b-expert@example.com',
        status: 'active',
        profile_status: 'APPROVED',
        approved_by: ids.admin,
        approved_at: new Date('2026-08-20T00:00:00.000Z'),
      },
    });
    await prisma.expert_competencies.create({
      data: {
        id: ids.competency,
        expert_id: ids.expert,
        management_system: 'EMS',
        standard_code: 'ISO 14001:2015',
        competency_role: 'AUDITOR',
        scope_level: 'IAF',
        iaf_code: '14',
        competency_level: 'QUALIFIED',
        approval_status: 'APPROVED',
        effective_date: new Date('2026-08-20T00:00:00.000Z'),
        expiry_date: new Date('2027-08-19T00:00:00.000Z'),
        approval_basis: 'Phase 4B E2E fixture',
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
    adminToken = await jwt.signAsync({ sub: ids.admin, username: 'p4b_admin' });
    coordinatorToken = await jwt.signAsync({ sub: ids.coordinator, username: 'p4b_coordinator' });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  }, 180_000);

  it('creates training, keeps its document projection and records post-training effectiveness', async () => {
    const response = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/trainings`)
      .set('Authorization', bearer(adminToken))
      .send({
        training_type: 'INTERNAL',
        title: 'ISO 14001 auditor refresher',
        provider: 'Internal qualified trainer',
        delivery_mode: 'IN_PERSON',
        competency_id: ids.competency,
        start_date: '2026-08-21',
        end_date: '2026-08-21',
        duration_hours: 8,
        status: 'COMPLETED',
        completion_result: 'COMPLETED',
        certificate_number: 'P4B-TR-001',
      })
      .expect(201);

    trainingId = response.body.id;
    expect(trainingId).toBeTruthy();

    await prisma.documentFile.create({
      data: {
        id: ids.document,
        entity_type: 'expert_training_record',
        entity_id: trainingId,
        document_type: 'training_evidence',
        file_kind: 'attachment',
        original_name: 'training-certificate.pdf',
        stored_name: 'p4b-training-certificate.pdf',
        file_url: 'storage/e2e/p4b-training-certificate.pdf',
        mime_type: 'application/pdf',
        file_size: 128,
        sha256: 'b'.repeat(64),
        uploaded_by: ids.admin,
      },
    });

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/trainings/${trainingId}/evaluate`)
      .set('Authorization', bearer(adminToken))
      .send({
        method: 'TEST',
        result: 'SATISFACTORY',
        score: 90,
        comment: 'Post-training effectiveness confirmed.',
      })
      .expect(201);

    const development = await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/development`)
      .set('Authorization', bearer(adminToken))
      .expect(200);

    const training = development.body.trainings.find((item: { id: string }) => item.id === trainingId);
    expect(training.effectiveness_result).toBe('SATISFACTORY');
    expect(training.attachments[0].download_url).toBe(`/document-files/${ids.document}/download`);
    expect(development.body.governance.training.effectiveness_pending).toBe(0);
  });

  it('blocks non-Admin upload into training/monitoring governance entities even when the role has generic document permission', async () => {
    expect(trainingId).toBeTruthy();

    await request(app.getHttpServer())
      .post('/document-files/upload')
      .set('Authorization', bearer(coordinatorToken))
      .field('entity_type', 'expert_training_record')
      .field('entity_id', trainingId)
      .field('document_type', 'training_evidence')
      .field('file_kind', 'attachment')
      .attach('file', Buffer.from('%PDF-1.4\n% Phase 4B denied upload fixture'), {
        filename: 'blocked-training-evidence.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
  });

  it('requires F.09 criteria for witness and stores 4-1-N detail without auto-suspending competency', async () => {
    const planned = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/monitoring`)
      .set('Authorization', bearer(adminToken))
      .send({
        monitoring_method: 'WITNESS',
        monitoring_content: 'On-site witnessed EMS audit',
        plan_type: 'SCHEDULED',
        planned_date: '2026-08-22',
        due_date: '2026-08-22',
        competency_id: ids.competency,
      })
      .expect(201);

    witnessId = planned.body.id;

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/monitoring/${witnessId}/complete`)
      .set('Authorization', bearer(adminToken))
      .send({ performed_date: '2026-08-22', result: 'SATISFACTORY' })
      .expect(400);

    const completed = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/monitoring/${witnessId}/complete`)
      .set('Authorization', bearer(adminToken))
      .send({
        performed_date: '2026-08-22',
        result: 'SATISFACTORY',
        summary: 'Witness assessment satisfactory.',
        witness_items: [
          { criterion_code: 'PLANNING', criterion_label: 'Hoạch định, chuẩn bị đánh giá', rating: '4', comment: 'Prepared well' },
          { criterion_code: 'OBJECTIVITY', criterion_label: 'Khách quan, không áp đặt', rating: '3' },
          { criterion_code: 'STANDARD_INTERPRETATION', criterion_label: 'Mức độ bao quát và hiểu yêu cầu tiêu chuẩn', rating: '4' },
          { criterion_code: 'NOT_APPLICABLE', criterion_label: 'Nội dung không áp dụng', rating: 'N' },
        ],
      })
      .expect(201);

    expect(completed.body.witness_items).toHaveLength(4);
    expect(Number(completed.body.score)).toBeCloseTo(91.67, 1);

    const competency = await prisma.expert_competencies.findUnique({ where: { id: ids.competency } });
    expect(competency?.approval_status).toBe('APPROVED');
  });

  it('tracks report review and customer feedback so EMS mandatory monitoring methods become complete', async () => {
    for (const [method, content] of [
      ['AUDIT_REPORT_REVIEW', 'Review audit report quality and completeness'],
      ['CUSTOMER_FEEDBACK', 'Review customer feedback on auditor performance'],
    ] as const) {
      const planned = await request(app.getHttpServer())
        .post(`/experts/${ids.expert}/monitoring`)
        .set('Authorization', bearer(adminToken))
        .send({
          monitoring_method: method,
          monitoring_content: content,
          plan_type: 'UNSCHEDULED',
          planned_date: '2026-08-22',
          competency_id: ids.competency,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/experts/${ids.expert}/monitoring/${planned.body.id}/complete`)
        .set('Authorization', bearer(adminToken))
        .send({
          performed_date: '2026-08-22',
          result: 'SATISFACTORY',
          summary: `${method} satisfactory`,
        })
        .expect(201);
    }

    const development = await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/development`)
      .set('Authorization', bearer(adminToken))
      .expect(200);

    expect(development.body.governance.witness.status).toBe('CURRENT');
    expect(development.body.governance.current_cycle_coverage.audit_report_review_12m).toBe(true);
    expect(development.body.governance.current_cycle_coverage.customer_or_market_feedback_12m).toBe(true);
    expect(development.body.governance.current_cycle_coverage.ems_required_methods_met).toBe(true);
    expect(development.body.governance.current_cycle_coverage.documented_follow_up_complete).toBe(true);
  });

  it('requires management action for an unsatisfactory monitoring result but leaves the competency decision unchanged', async () => {
    const planned = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/monitoring`)
      .set('Authorization', bearer(adminToken))
      .send({
        monitoring_method: 'SITUATION_TEST',
        monitoring_content: 'Audit situation handling test',
        plan_type: 'UNSCHEDULED',
        planned_date: '2026-08-22',
        competency_id: ids.competency,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/monitoring/${planned.body.id}/complete`)
      .set('Authorization', bearer(adminToken))
      .send({
        performed_date: '2026-08-22',
        result: 'UNSATISFACTORY',
        score: 45,
        finding: 'Did not adequately handle the audit scenario.',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/monitoring/${planned.body.id}/complete`)
      .set('Authorization', bearer(adminToken))
      .send({
        performed_date: '2026-08-22',
        result: 'UNSATISFACTORY',
        score: 45,
        finding: 'Did not adequately handle the audit scenario.',
        required_action: 'Additional training and reassessment before any management decision.',
      })
      .expect(201);

    const development = await request(app.getHttpServer())
      .get(`/experts/${ids.expert}/development`)
      .set('Authorization', bearer(adminToken))
      .expect(200);

    expect(development.body.governance.management_action_required).toBe(true);
    const competency = await prisma.expert_competencies.findUnique({ where: { id: ids.competency } });
    expect(competency?.approval_status).toBe('APPROVED');
  });

  it('cancels a planned training without deleting its historical row', async () => {
    const planned = await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/trainings`)
      .set('Authorization', bearer(adminToken))
      .send({
        training_type: 'SPECIALIZED',
        title: 'Future sector-specific training',
        start_date: '2026-10-01',
        status: 'PLANNED',
        competency_id: ids.competency,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/experts/${ids.expert}/trainings/${planned.body.id}/cancel`)
      .set('Authorization', bearer(adminToken))
      .send({ reason: 'Training schedule replaced by a later approved plan.' })
      .expect(201);

    const row = await prisma.expert_training_records.findUnique({ where: { id: planned.body.id } });
    expect(row?.status).toBe('CANCELLED');
    expect(row?.cancellation_reason).toContain('replaced');
  });
});
