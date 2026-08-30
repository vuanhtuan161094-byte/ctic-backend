import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { PrismaService } from '../src/prisma/prisma.service';
import { resolveDocumentStoragePath } from '../src/common/storage-config';

jest.setTimeout(90_000);

const ids = {
  customerUser: '14000000-0000-4000-8000-000000000001',
  coordinator: '14000000-0000-4000-8000-000000000002',
  customerRole: '14000000-0000-4000-8000-000000000101',
  coordinatorRole: '14000000-0000-4000-8000-000000000102',
  portalPermission: '14000000-0000-4000-8000-000000000201',
  documentPermission: '14000000-0000-4000-8000-000000000202',
  customerA: '14000000-0000-4000-8000-000000000301',
  customerB: '14000000-0000-4000-8000-000000000302',
  applicationA: '14000000-0000-4000-8000-000000000401',
  applicationB: '14000000-0000-4000-8000-000000000402',
};

const userIds = [ids.customerUser, ids.coordinator];
const customerIds = [ids.customerA, ids.customerB];
const applicationIds = [ids.applicationA, ids.applicationB];

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
const safeTestDatabase =
  configuredDatabaseName.toLowerCase().endsWith('_test') ||
  configuredDatabaseName.toLowerCase().endsWith('_ci');
if (testDatabaseUrl && !safeTestDatabase) {
  throw new Error(`[P09 E2E SAFETY] Refusing TEST_DATABASE_URL database without _test/_ci suffix: ${configuredDatabaseName || '<missing>'}`);
}
if (safeTestDatabase) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = 'test';
}
const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 3.2C application documents and evidence request inbox (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let customerToken = '';
  let coordinatorToken = '';
  let requestId = '';
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];
  const createdGrantKeys: Array<{ role_id: string; permission_id: string }> = [];
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
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
    const requests = await prisma.customer_document_requests.findMany({
      where: { customer_id: { in: customerIds } },
      select: { id: true },
    });
    const requestIds = requests.map((item) => item.id);
    const docs = await prisma.documentFile.findMany({
      where: {
        OR: [
          { entity_type: 'certification_application', entity_id: { in: applicationIds } },
          ...(requestIds.length ? [{ entity_type: 'customer_document_request', entity_id: { in: requestIds } }] : []),
        ],
      },
      select: { id: true, stored_name: true },
    });
    const workItems = requestIds.length
      ? await prisma.work_items.findMany({ where: { entity_id: { in: requestIds } }, select: { id: true } })
      : [];
    const workItemIds = workItems.map((item) => item.id);

    await prisma.notifications.deleteMany({
      where: {
        OR: [
          { user_id: { in: userIds } },
          ...(workItemIds.length ? [{ work_item_id: { in: workItemIds } }] : []),
        ],
      },
    });
    if (requestIds.length) {
      await prisma.work_items.deleteMany({ where: { entity_id: { in: requestIds } } });
      await prisma.customer_document_requests.deleteMany({ where: { id: { in: requestIds } } });
    }
    await prisma.documentFile.deleteMany({ where: { id: { in: docs.map((item) => item.id) } } });
    for (const doc of docs) {
      try {
        const path = resolveDocumentStoragePath(doc.stored_name);
        if (existsSync(path)) unlinkSync(path);
      } catch {
        // best effort test cleanup
      }
    }
    await prisma.customer_user_access_history.deleteMany({
      where: { OR: [{ customer_id: { in: customerIds } }, { user_id: { in: userIds } }] },
    });
    await prisma.customer_user_access.deleteMany({
      where: { OR: [{ customer_id: { in: customerIds } }, { user_id: { in: userIds } }] },
    });
    await prisma.certification_applications.deleteMany({ where: { id: { in: applicationIds } } });
    await prisma.customers.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });

    if (cleanAuth) {
      for (const grant of createdGrantKeys) await prisma.role_permissions.deleteMany({ where: grant });
      if (createdPermissionIds.length) await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
      if (createdRoleIds.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
  }

  async function createFixtures() {
    const customerRoleId = await ensureRole('CUSTOMER', ids.customerRole);
    const coordinatorRoleId = await ensureRole('COORDINATOR', ids.coordinatorRole);
    const portalPermissionId = await ensurePermission('customer_portal.access', ids.portalPermission);
    const documentPermissionId = await ensurePermission('customer_documents.manage', ids.documentPermission);
    await ensureGrant(customerRoleId, portalPermissionId);
    await ensureGrant(coordinatorRoleId, documentPermissionId);

    await prisma.users.createMany({
      data: [
        { id: ids.customerUser, username: 'p32c_customer', email: 'p32c-customer@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32C Customer' },
        { id: ids.coordinator, username: 'p32c_coordinator', email: 'p32c-coordinator@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32C Coordinator' },
      ],
    });
    await prisma.user_roles.createMany({
      data: [
        { user_id: ids.customerUser, role_id: customerRoleId },
        { user_id: ids.coordinator, role_id: coordinatorRoleId },
      ],
    });
    await prisma.customers.createMany({
      data: [
        { id: ids.customerA, customer_code: 'P32C-A', company_name: 'P32C Customer A', status: 'active' },
        { id: ids.customerB, customer_code: 'P32C-B', company_name: 'P32C Customer B', status: 'active' },
      ],
    });
    await prisma.customer_user_access.create({
      data: { customer_id: ids.customerA, user_id: ids.customerUser, created_by: ids.coordinator, status: 'active' },
    });
    await prisma.certification_applications.createMany({
      data: [
        {
          id: ids.applicationA,
          customer_id: ids.customerA,
          application_code: 'APP-P32C-A',
          application_date: new Date('2026-08-22'),
          certification_type: 'INITIAL',
          standard_name: 'ISO 9001:2015',
          certification_scope: 'Manufacture of example products',
          declaration_accepted: true,
          status: 'submitted',
        },
        {
          id: ids.applicationB,
          customer_id: ids.customerB,
          application_code: 'APP-P32C-B',
          application_date: new Date('2026-08-22'),
          certification_type: 'INITIAL',
          standard_name: 'ISO 14001:2015',
          certification_scope: 'Secret customer B scope',
          declaration_accepted: true,
          status: 'submitted',
        },
      ],
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
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }));
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await cleanup();
    await createFixtures();
    customerToken = await jwt.signAsync({ sub: ids.customerUser, username: 'p32c_customer' });
    coordinatorToken = await jwt.signAsync({ sub: ids.coordinator, username: 'p32c_coordinator' });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  });

  it('uploads versioned application documents and denies cross-customer application access', async () => {
    const first = await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/applications/${ids.applicationA}/upload`)
      .set('Authorization', bearer(customerToken))
      .field('category', 'LEGAL')
      .attach('file', png, { filename: 'business-license.png', contentType: 'image/png' })
      .expect(201);
    expect(first.body.version_no).toBe(1);
    expect(first.body.document_type).toBe('customer_application_legal');
    expect(first.body.sha256).toMatch(/^[a-f0-9]{64}$/);

    const second = await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/applications/${ids.applicationA}/upload`)
      .set('Authorization', bearer(customerToken))
      .field('category', 'LEGAL')
      .attach('file', png, { filename: 'business-license-v2.png', contentType: 'image/png' })
      .expect(201);
    expect(second.body.version_no).toBe(2);

    await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/applications/${ids.applicationB}/upload`)
      .set('Authorization', bearer(customerToken))
      .field('category', 'LEGAL')
      .attach('file', png, { filename: 'cross-customer.png', contentType: 'image/png' })
      .expect(403);
  });

  it('creates a customer-safe document request and opens a Coordinator work item only after customer response', async () => {
    const created = await request(app.getHttpServer())
      .post('/customer-document-requests')
      .set('Authorization', bearer(coordinatorToken))
      .send({
        application_id: ids.applicationA,
        category: 'MANAGEMENT_SYSTEM',
        title: 'Sổ tay hoặc tài liệu mô tả hệ thống quản lý',
        description: 'Cung cấp phiên bản hiện hành có kiểm soát.',
        due_date: '2026-09-05',
      })
      .expect(201);
    requestId = created.body.id as string;
    expect(requestId).toBeTruthy();
    expect(created.body.status).toBe('REQUESTED');
    expect(await prisma.work_items.findUnique({ where: { source_key: `customer-document-request:${requestId}:review` } })).toBeNull();

    await request(app.getHttpServer())
      .get('/customer-portal/me/documents')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        expect(response.body.requests.some((item: { id: string }) => item.id === requestId)).toBe(true);
        expect(JSON.stringify(response.body)).not.toContain('password_hash');
      });

    await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/requests/${requestId}/upload`)
      .set('Authorization', bearer(customerToken))
      .attach('file', png, { filename: 'qms-manual.png', contentType: 'image/png' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/requests/${requestId}/submit`)
      .set('Authorization', bearer(customerToken))
      .send({ note: 'Tài liệu hiện hành theo yêu cầu.' })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('SUBMITTED'));

    const work = await prisma.work_items.findUnique({ where: { source_key: `customer-document-request:${requestId}:review` } });
    expect(work).toEqual(expect.objectContaining({
      assigned_role: 'COORDINATOR',
      action_code: 'customer.document_response.review',
      status: 'OPEN',
    }));
  });

  it('supports revision -> version 2 -> resubmit -> accept and completes the durable work item', async () => {
    await request(app.getHttpServer())
      .post(`/customer-document-requests/${requestId}/review`)
      .set('Authorization', bearer(coordinatorToken))
      .send({ decision: 'REVISION_REQUIRED', comment: 'Vui lòng bổ sung trang phê duyệt và mã phiên bản.' })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('REVISION_REQUIRED'));

    await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/requests/${requestId}/upload`)
      .set('Authorization', bearer(customerToken))
      .attach('file', png, { filename: 'qms-manual-v2.png', contentType: 'image/png' })
      .expect(201)
      .expect((response) => expect(response.body.version_no).toBe(2));

    await request(app.getHttpServer())
      .post(`/customer-portal/me/documents/requests/${requestId}/submit`)
      .set('Authorization', bearer(customerToken))
      .send({ note: 'Đã bổ sung trang phê duyệt.' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/customer-document-requests/${requestId}/review`)
      .set('Authorization', bearer(coordinatorToken))
      .send({ decision: 'ACCEPT', comment: 'Đủ bằng chứng.' })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('ACCEPTED'));

    const work = await prisma.work_items.findUnique({ where: { source_key: `customer-document-request:${requestId}:review` } });
    expect(work?.status).toBe('DONE');
    const notification = await prisma.notifications.findFirst({
      where: { user_id: ids.customerUser, notification_type: 'CUSTOMER_DOCUMENT_ACCEPTED' },
    });
    expect(notification?.destination_path).toBe('/customer-portal/documents');
  });

  it('keeps the customer projection isolated from customer B', async () => {
    await request(app.getHttpServer())
      .get('/customer-portal/me/documents')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        expect(JSON.stringify(response.body)).toContain('APP-P32C-A');
        expect(JSON.stringify(response.body)).not.toContain('APP-P32C-B');
        expect(JSON.stringify(response.body)).not.toContain('Secret customer B scope');
      });
  });
});
