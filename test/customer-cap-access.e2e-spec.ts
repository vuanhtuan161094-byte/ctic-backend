import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, resolve, sep } from 'path';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  ensureStorageLayout,
  getStorageConfig,
  resolveDocumentStoragePath,
} from '../src/common/storage-config';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(60_000);

const ids = {
  userA: '00000000-0000-4000-8000-000000000001',
  userB: '00000000-0000-4000-8000-000000000002',
  userUnmapped: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
  auditor: '00000000-0000-4000-8000-000000000005',
  customerRole: '00000000-0000-4000-8000-000000000101',
  adminRole: '00000000-0000-4000-8000-000000000102',
  auditorRole: '00000000-0000-4000-8000-000000000103',
  customersManage: '00000000-0000-4000-8000-000000000201',
  findingsManage: '00000000-0000-4000-8000-000000000202',
  customerA: '00000000-0000-4000-8000-000000000301',
  customerB: '00000000-0000-4000-8000-000000000302',
  applicationA: '00000000-0000-4000-8000-000000000401',
  applicationB: '00000000-0000-4000-8000-000000000402',
  projectA: '00000000-0000-4000-8000-000000000501',
  projectB: '00000000-0000-4000-8000-000000000502',
  planA: '00000000-0000-4000-8000-000000000601',
  planB: '00000000-0000-4000-8000-000000000602',
  reportA: '00000000-0000-4000-8000-000000000701',
  reportB: '00000000-0000-4000-8000-000000000702',
  findingA: '00000000-0000-4000-8000-000000000801',
  findingB: '00000000-0000-4000-8000-000000000802',
  actionB: '00000000-0000-4000-8000-000000000901',
  evidenceB: '00000000-0000-4000-8000-000000000902',
  auditorExpert: '00000000-0000-4000-8000-000000001001',
  appointmentA: '00000000-0000-4000-8000-000000001101',
  appointmentMemberA: '00000000-0000-4000-8000-000000001201',
};

const allUserIds = [
  ids.userA,
  ids.userB,
  ids.userUnmapped,
  ids.admin,
  ids.auditor,
];
const allRoleIds = [ids.customerRole, ids.adminRole, ids.auditorRole];
const allPermissionIds = [ids.customersManage, ids.findingsManage];
const allCustomerIds = [ids.customerA, ids.customerB];
const allApplicationIds = [ids.applicationA, ids.applicationB];
const allProjectIds = [ids.projectA, ids.projectB];
const allPlanIds = [ids.planA, ids.planB];
const allReportIds = [ids.reportA, ids.reportB];
const allFindingIds = [ids.findingA, ids.findingB];

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
    } else {
      current += character;
    }
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
const safeTestDatabase =
  configuredDatabaseName.toLowerCase().endsWith('_test') ||
  configuredDatabaseName.toLowerCase().endsWith('_ci');

if (testDatabaseUrl && !safeTestDatabase) {
  throw new Error(
    `[P09 E2E SAFETY] Refusing TEST_DATABASE_URL database without _test/_ci suffix: ${configuredDatabaseName || '<missing>'}`,
  );
}

if (safeTestDatabase) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = 'test';
}

const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

if (!safeTestDatabase) {
  console.warn(
    'P09 real E2E skipped: TEST_DATABASE_URL is missing. Runtime DATABASE_URL was not used.',
  );
}

describeRealDatabase('P.09 customer CAP access (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let storageRoot = '';
  let tokenA = '';
  let tokenUnmapped = '';
  let tokenAdmin = '';
  let tokenAuditor = '';
  let actionAId = '';
  let evidenceAId = '';

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  const capPayload = {
    root_cause: 'P09_E2E_SECRET_PAYLOAD root cause',
    correction: 'Immediate correction',
    corrective_action_plan: 'Corrective action plan',
    responsible_person: 'Example Customer',
    target_date: '2026-09-30',
  };

  function bearer(token: string) {
    return `Bearer ${token}`;
  }

  function storageFiles() {
    const storage = getStorageConfig();
    return [
      ...readdirSync(storage.documentsDirectory).map(
        (name) => `documents/${name}`,
      ),
      ...readdirSync(storage.tempDirectory).map((name) => `temp/${name}`),
    ].sort();
  }

  async function assertConnectedToTestDatabase(database: PrismaClient) {
    const result = await database.$queryRawUnsafe<
      Array<{ database_name: string }>
    >('SELECT DB_NAME() AS database_name');
    const actual = result[0]?.database_name ?? '';
    if (
      !actual.toLowerCase().endsWith('_test') &&
      !actual.toLowerCase().endsWith('_ci')
    ) {
      throw new Error(
        `[P09 E2E SAFETY] Cleanup refused for ${actual || '<unknown database>'}`,
      );
    }
  }

  async function cleanupFixtures(database: PrismaService) {
    await assertConnectedToTestDatabase(database);

    const storedFiles = await database.documentFile.findMany({
      where: {
        OR: [
          { entity_id: { in: [ids.actionB, actionAId].filter(Boolean) } },
          { uploaded_by: { in: allUserIds } },
        ],
      },
      select: { stored_name: true },
    });

    for (const file of storedFiles) {
      const absolutePath = resolveDocumentStoragePath(file.stored_name);
      if (existsSync(absolutePath)) unlinkSync(absolutePath);
    }

    await database.documentFile.deleteMany({
      where: {
        OR: [
          { entity_id: { in: [ids.actionB, actionAId].filter(Boolean) } },
          { uploaded_by: { in: allUserIds } },
        ],
      },
    });
    await database.audit_logs.deleteMany({
      where: { user_id: { in: allUserIds } },
    });
    await database.customer_user_access.deleteMany({
      where: {
        OR: [
          { customer_id: { in: allCustomerIds } },
          { user_id: { in: allUserIds } },
        ],
      },
    });
    await database.corrective_actions.deleteMany({
      where: { finding_id: { in: allFindingIds } },
    });
    await database.audit_findings.deleteMany({
      where: { id: { in: allFindingIds } },
    });
    await database.reports.deleteMany({
      where: { id: { in: allReportIds } },
    });
    await database.audit_team_members.deleteMany({
      where: { id: ids.appointmentMemberA },
    });
    await database.audit_team_appointments.deleteMany({
      where: { id: ids.appointmentA },
    });
    await database.experts.deleteMany({
      where: { id: ids.auditorExpert },
    });
    await database.audit_plans.deleteMany({
      where: { id: { in: allPlanIds } },
    });
    await database.certification_projects.deleteMany({
      where: { id: { in: allProjectIds } },
    });
    await database.certification_applications.deleteMany({
      where: { id: { in: allApplicationIds } },
    });
    await database.user_roles.deleteMany({
      where: { user_id: { in: allUserIds } },
    });
    await database.role_permissions.deleteMany({
      where: { role_id: { in: allRoleIds } },
    });
    await database.users.deleteMany({
      where: { id: { in: allUserIds } },
    });
    await database.permissions.deleteMany({
      where: { id: { in: allPermissionIds } },
    });
    await database.roles.deleteMany({
      where: { id: { in: allRoleIds } },
    });
    await database.customers.deleteMany({
      where: { id: { in: allCustomerIds } },
    });
  }

  async function createFixtures() {
    await prisma.roles.createMany({
      data: [
        { id: ids.customerRole, role_name: 'CUSTOMER' },
        { id: ids.adminRole, role_name: 'ADMIN' },
        { id: ids.auditorRole, role_name: 'AUDITOR' },
      ],
    });
    await prisma.permissions.createMany({
      data: [
        {
          id: ids.customersManage,
          permission_name: 'customers.manage',
        },
        {
          id: ids.findingsManage,
          permission_name: 'findings.manage',
        },
      ],
    });
    await prisma.role_permissions.createMany({
      data: [
        {
          role_id: ids.adminRole,
          permission_id: ids.customersManage,
        },
        {
          role_id: ids.auditorRole,
          permission_id: ids.findingsManage,
        },
      ],
    });
    await prisma.users.createMany({
      data: [
        {
          id: ids.userA,
          username: 'p09_e2e_customer_a',
          email: 'customer-a@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Example Customer A',
        },
        {
          id: ids.userB,
          username: 'p09_e2e_customer_b',
          email: 'customer-b@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Example Customer B',
        },
        {
          id: ids.userUnmapped,
          username: 'p09_e2e_customer_unmapped',
          email: 'customer-unmapped@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Example Customer Unmapped',
        },
        {
          id: ids.admin,
          username: 'p09_e2e_admin',
          email: 'admin@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Example Administrator',
        },
        {
          id: ids.auditor,
          username: 'p09_e2e_auditor',
          email: 'auditor@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Example Auditor',
        },
      ],
    });
    await prisma.user_roles.createMany({
      data: [
        { user_id: ids.userA, role_id: ids.customerRole },
        { user_id: ids.userB, role_id: ids.customerRole },
        { user_id: ids.userUnmapped, role_id: ids.customerRole },
        { user_id: ids.admin, role_id: ids.adminRole },
        { user_id: ids.auditor, role_id: ids.auditorRole },
      ],
    });
    await prisma.customers.createMany({
      data: [
        {
          id: ids.customerA,
          customer_code: 'P09-E2E-A',
          company_name: 'Example Customer A',
          tax_code: 'P09-E2E-TAX-A',
        },
        {
          id: ids.customerB,
          customer_code: 'P09-E2E-B',
          company_name: 'Example Customer B',
          tax_code: 'P09-E2E-TAX-B',
        },
      ],
    });
    await prisma.customer_user_access.createMany({
      data: [
        {
          customer_id: ids.customerA,
          user_id: ids.userA,
          created_by: ids.admin,
        },
        {
          customer_id: ids.customerB,
          user_id: ids.userB,
          created_by: ids.admin,
        },
      ],
    });
    await prisma.certification_applications.createMany({
      data: [
        {
          id: ids.applicationA,
          customer_id: ids.customerA,
          application_code: 'P09-E2E-APP-A',
          application_date: new Date('2026-08-01'),
          standard_name: 'ISO 9001:2015',
          certification_scope: 'Example scope A',
          declaration_accepted: true,
          status: 'accepted',
        },
        {
          id: ids.applicationB,
          customer_id: ids.customerB,
          application_code: 'P09-E2E-APP-B',
          application_date: new Date('2026-08-01'),
          standard_name: 'ISO 14001:2015',
          certification_scope: 'Example scope B',
          declaration_accepted: true,
          status: 'accepted',
        },
      ],
    });
    await prisma.certification_projects.createMany({
      data: [
        {
          id: ids.projectA,
          application_id: ids.applicationA,
          project_code: 'P09-E2E-PRJ-A',
          standard_name: 'ISO 9001:2015',
          status: 'corrective_action_required',
        },
        {
          id: ids.projectB,
          application_id: ids.applicationB,
          project_code: 'P09-E2E-PRJ-B',
          standard_name: 'ISO 14001:2015',
          status: 'corrective_action_required',
        },
      ],
    });
    await prisma.audit_plans.createMany({
      data: [
        {
          id: ids.planA,
          project_id: ids.projectA,
          plan_code: 'P09-E2E-PLAN-A',
          audit_type: 'stage2',
          status: 'completed',
        },
        {
          id: ids.planB,
          project_id: ids.projectB,
          plan_code: 'P09-E2E-PLAN-B',
          audit_type: 'stage2',
          status: 'completed',
        },
      ],
    });
    await prisma.reports.createMany({
      data: [
        {
          id: ids.reportA,
          audit_plan_id: ids.planA,
          report_code: 'P09-E2E-REP-A',
          status: 'submitted',
        },
        {
          id: ids.reportB,
          audit_plan_id: ids.planB,
          report_code: 'P09-E2E-REP-B',
          status: 'submitted',
        },
      ],
    });
    await prisma.audit_findings.createMany({
      data: [
        {
          id: ids.findingA,
          report_id: ids.reportA,
          finding_code: 'P09-E2E-NC-A',
          finding_type: 'minor_nc',
          description: 'Example finding A',
          objective_evidence: 'Example objective evidence A',
          detected_date: new Date('2026-08-01'),
          status: 'open',
          created_by: ids.auditor,
        },
        {
          id: ids.findingB,
          report_id: ids.reportB,
          finding_code: 'P09-E2E-NC-B',
          finding_type: 'major_nc',
          description: 'Example finding B',
          objective_evidence: 'Example objective evidence B',
          detected_date: new Date('2026-08-01'),
          status: 'response_submitted',
          created_by: ids.auditor,
        },
      ],
    });
    await prisma.corrective_actions.create({
      data: {
        id: ids.actionB,
        finding_id: ids.findingB,
        version_no: 1,
        root_cause: 'Example B root cause',
        correction: 'Example B correction',
        corrective_action_plan: 'Example B corrective plan',
        status: 'submitted',
        submitted_by: ids.userB,
      },
    });
    await prisma.experts.create({
      data: {
        id: ids.auditorExpert,
        user_id: ids.auditor,
        employee_code: 'P09-E2E-AUDITOR',
        full_name: 'Example Auditor',
        email: 'expert-auditor@example.com',
        profile_status: 'APPROVED',
      },
    });
    await prisma.audit_team_appointments.create({
      data: {
        id: ids.appointmentA,
        audit_plan_id: ids.planA,
        appointment_number: 'P09-E2E-APT-A',
        appointment_date: new Date('2026-08-01'),
        status: 'issued',
        prepared_by: ids.admin,
      },
    });
    await prisma.audit_team_members.create({
      data: {
        id: ids.appointmentMemberA,
        appointment_id: ids.appointmentA,
        expert_id: ids.auditorExpert,
        team_role: 'auditor',
        planned_start_date: new Date('2026-08-01'),
        planned_end_date: new Date('2026-08-02'),
        assignment_status: 'assigned',
      },
    });

    const evidenceBStoredName = 'p09-e2e-evidence-b.png';
    const evidenceBPath = resolveDocumentStoragePath(evidenceBStoredName);
    writeFileSync(evidenceBPath, png);
    await prisma.documentFile.create({
      data: {
        id: ids.evidenceB,
        entity_type: 'corrective_action',
        entity_id: ids.actionB,
        document_type: 'corrective_action_evidence',
        file_kind: 'attachment',
        original_name: 'evidence-b.png',
        stored_name: evidenceBStoredName,
        file_url: `/uploads/documents/${evidenceBStoredName}`,
        mime_type: 'image/png',
        file_size: png.length,
        sha256: createHash('sha256').update(png).digest('hex'),
        uploaded_by: ids.userB,
      },
    });
  }

  beforeAll(async () => {
    storageRoot = resolve(tmpdir(), `ctic-p09-e2e-${randomUUID()}`);
    process.env.STORAGE_ROOT = storageRoot;
    ensureStorageLayout();

    const { AppModule } =
      jest.requireActual<typeof import('../src/app.module')>(
        '../src/app.module',
      );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (
        incoming: Request & { requestId?: string },
        response: Response,
        next: NextFunction,
      ) => {
        incoming.requestId = randomUUID();
        response.setHeader('X-Request-Id', incoming.requestId);
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        validationError: {
          target: false,
          value: false,
        },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await assertConnectedToTestDatabase(prisma);
    await cleanupFixtures(prisma);
    await createFixtures();

    tokenA = await jwt.signAsync({
      sub: ids.userA,
      username: 'p09_e2e_customer_a',
    });
    tokenUnmapped = await jwt.signAsync({
      sub: ids.userUnmapped,
      username: 'p09_e2e_customer_unmapped',
    });
    tokenAdmin = await jwt.signAsync({
      sub: ids.admin,
      username: 'p09_e2e_admin',
    });
    tokenAuditor = await jwt.signAsync({
      sub: ids.auditor,
      username: 'p09_e2e_auditor',
    });
  }, 180_000);

  it('enforces customer-safe plan and finding reads', async () => {
    await request(app.getHttpServer())
      .get(`/audit-findings/customer/plan/${ids.planA}`)
      .set('Authorization', bearer(tokenA))
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          plan: { id: string };
          findings: unknown[];
        };
        expect(body.plan.id).toBe(ids.planA);
        expect(body.findings).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .get(`/audit-findings/customer/plan/${ids.planB}`)
      .set('Authorization', bearer(tokenA))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/audit-findings/customer/${ids.findingB}`)
      .set('Authorization', bearer(tokenA))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/audit-findings/customer/plan/${ids.planA}`)
      .set('Authorization', bearer(tokenUnmapped))
      .expect(403);
  });

  it('creates CAP atomically and denies cross-customer or pending duplicate writes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/audit-findings/${ids.findingA}/corrective-actions`)
      .set('Authorization', bearer(tokenA))
      .send(capPayload)
      .expect(201);

    const createdAction = response.body as {
      id: string;
      version_no: number;
      status: string;
    };
    actionAId = createdAction.id;
    expect(createdAction.version_no).toBe(1);
    expect(createdAction.status).toBe('submitted');

    const [action, finding] = await Promise.all([
      prisma.corrective_actions.findUnique({
        where: { id: actionAId },
      }),
      prisma.audit_findings.findUnique({
        where: { id: ids.findingA },
      }),
    ]);
    expect(action?.version_no).toBe(1);
    expect(action?.submitted_by).toBe(ids.userA);
    expect(finding?.status).toBe('response_submitted');

    const countBefore = await prisma.corrective_actions.count({
      where: { finding_id: ids.findingB },
    });
    await request(app.getHttpServer())
      .post(`/audit-findings/${ids.findingB}/corrective-actions`)
      .set('Authorization', bearer(tokenA))
      .send(capPayload)
      .expect(403);
    expect(
      await prisma.corrective_actions.count({
        where: { finding_id: ids.findingB },
      }),
    ).toBe(countBefore);
    expect(
      (
        await prisma.audit_findings.findUnique({
          where: { id: ids.findingB },
        })
      )?.status,
    ).toBe('response_submitted');

    await request(app.getHttpServer())
      .post(`/audit-findings/${ids.findingA}/corrective-actions`)
      .set('Authorization', bearer(tokenA))
      .send(capPayload)
      .expect(409);
    expect(
      await prisma.corrective_actions.count({
        where: { finding_id: ids.findingA },
      }),
    ).toBe(1);
  });

  it('secures evidence upload, download, server metadata and orphan cleanup', async () => {
    const uploaded = await request(app.getHttpServer())
      .post(`/document-files/customer/corrective-actions/${actionAId}/evidence`)
      .set('Authorization', bearer(tokenA))
      .field('note', 'P09 E2E evidence')
      .attach('file', png, {
        filename: 'evidence-a.png',
        contentType: 'image/png',
      })
      .expect(201);

    evidenceAId = (uploaded.body as { id: string }).id;
    const documentRow = await prisma.documentFile.findUnique({
      where: { id: evidenceAId },
    });
    expect(documentRow).toEqual(
      expect.objectContaining({
        entity_type: 'corrective_action',
        entity_id: actionAId,
        document_type: 'corrective_action_evidence',
        file_kind: 'attachment',
        uploaded_by: ids.userA,
      }),
    );
    expect(documentRow?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      existsSync(resolveDocumentStoragePath(documentRow?.stored_name ?? '')),
    ).toBe(true);

    const filesBeforeDeniedUpload = storageFiles();
    const rowsBeforeDeniedUpload = await prisma.documentFile.count({
      where: { entity_id: ids.actionB },
    });
    await request(app.getHttpServer())
      .post(
        `/document-files/customer/corrective-actions/${ids.actionB}/evidence`,
      )
      .set('Authorization', bearer(tokenA))
      .attach('file', png, {
        filename: 'cross-customer.png',
        contentType: 'image/png',
      })
      .expect(403);
    expect(
      await prisma.documentFile.count({
        where: { entity_id: ids.actionB },
      }),
    ).toBe(rowsBeforeDeniedUpload);
    expect(storageFiles()).toEqual(filesBeforeDeniedUpload);

    await request(app.getHttpServer())
      .post('/document-files/upload')
      .set('Authorization', bearer(tokenA))
      .field('entity_type', 'corrective_action')
      .field('entity_id', actionAId)
      .field('document_type', 'corrective_action_evidence')
      .field('file_kind', 'attachment')
      .attach('file', png, {
        filename: 'generic-upload.png',
        contentType: 'image/png',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/document-files/customer/${evidenceAId}/download`)
      .set('Authorization', bearer(tokenA))
      .expect(200)
      .expect('Content-Type', /image\/png/);

    await request(app.getHttpServer())
      .get(`/document-files/customer/${ids.evidenceB}/download`)
      .set('Authorization', bearer(tokenA))
      .expect(403);
  });

  it('preserves internal auditor review and permits the next CAP only after revision request', async () => {
    await request(app.getHttpServer())
      .patch(
        `/audit-findings/${ids.findingA}/corrective-actions/${actionAId}/review`,
      )
      .set('Authorization', bearer(tokenAuditor))
      .send({
        review_result: 'revision_required',
        review_comment: 'Please revise the action plan.',
      })
      .expect(200);

    expect(
      (
        await prisma.audit_findings.findUnique({
          where: { id: ids.findingA },
        })
      )?.status,
    ).toBe('revision_required');

    const revised = await request(app.getHttpServer())
      .post(`/audit-findings/${ids.findingA}/corrective-actions`)
      .set('Authorization', bearer(tokenA))
      .send({
        ...capPayload,
        corrective_action_plan: 'Revised corrective action plan',
      })
      .expect(201);
    expect((revised.body as { version_no: number }).version_no).toBe(2);
    expect(
      await prisma.corrective_actions.count({
        where: { finding_id: ids.findingA },
      }),
    ).toBe(2);
  });

  it('supports admin assign, reactivate, idempotent access and soft revoke', async () => {
    const assign = await request(app.getHttpServer())
      .put(`/customers/${ids.customerA}/user-access/${ids.userUnmapped}`)
      .set('Authorization', bearer(tokenAdmin))
      .expect(200);
    const assignedMapping = assign.body as { id: string; status: string };
    const mappingId = assignedMapping.id;
    expect(assignedMapping.status).toBe('active');

    await request(app.getHttpServer())
      .delete(`/customers/${ids.customerA}/user-access/${ids.userUnmapped}`)
      .set('Authorization', bearer(tokenAdmin))
      .expect(200)
      .expect((response) => {
        expect((response.body as { status: string }).status).toBe('revoked');
      });

    const reactivated = await request(app.getHttpServer())
      .put(`/customers/${ids.customerA}/user-access/${ids.userUnmapped}`)
      .set('Authorization', bearer(tokenAdmin))
      .expect(200);
    const reactivatedMapping = reactivated.body as {
      id: string;
      status: string;
    };
    expect(reactivatedMapping.id).toBe(mappingId);
    expect(reactivatedMapping.status).toBe('active');

    const idempotent = await request(app.getHttpServer())
      .put(`/customers/${ids.customerA}/user-access/${ids.userUnmapped}`)
      .set('Authorization', bearer(tokenAdmin))
      .expect(200);
    expect((idempotent.body as { id: string }).id).toBe(mappingId);

    await request(app.getHttpServer())
      .get(`/customers/${ids.customerA}/user-access`)
      .set('Authorization', bearer(tokenAdmin))
      .expect(200)
      .expect((response) => {
        const mappings = response.body as Array<{ user_id: string }>;
        expect(mappings.some((item) => item.user_id === ids.userUnmapped)).toBe(
          true,
        );
      });

    await request(app.getHttpServer())
      .delete(`/customers/${ids.customerA}/user-access/${ids.userA}`)
      .set('Authorization', bearer(tokenAdmin))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/audit-findings/customer/plan/${ids.planA}`)
      .set('Authorization', bearer(tokenA))
      .expect(403);
  });

  it('records successful mutations and authenticated cross-customer denials without sensitive content', async () => {
    const logs = await prisma.audit_logs.findMany({
      where: { user_id: ids.userA },
      orderBy: { created_at: 'asc' },
    });

    expect(
      logs.some(
        (log) =>
          log.outcome === 'success' &&
          log.status_code === 201 &&
          log.action.includes('corrective-actions'),
      ),
    ).toBe(true);
    expect(
      logs.some(
        (log) =>
          log.outcome === 'failure' &&
          log.status_code === 403 &&
          log.action.startsWith('POST '),
      ),
    ).toBe(true);
    expect(
      logs.some(
        (log) =>
          log.outcome === 'failure' &&
          log.status_code === 403 &&
          log.action.startsWith('GET '),
      ),
    ).toBe(true);
    expect(logs.every((log) => Boolean(log.request_id))).toBe(true);

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain('P09_E2E_SECRET_PAYLOAD');
    expect(serialized.toLowerCase()).not.toContain('authorization');
    expect(serialized.toLowerCase()).not.toContain('password');
    expect(serialized).not.toContain(png.toString('base64'));
  });

  afterAll(async () => {
    if (prisma) {
      await cleanupFixtures(prisma);
    }
    if (app) {
      await app.close();
    }

    const resolvedRoot = resolve(storageRoot || '.');
    const resolvedTemp = resolve(tmpdir());
    if (
      storageRoot &&
      resolvedRoot.startsWith(`${resolvedTemp}${sep}`) &&
      basename(resolvedRoot).startsWith('ctic-p09-e2e-')
    ) {
      rmSync(resolvedRoot, {
        recursive: true,
        force: true,
      });
    }
  }, 60_000);
});
