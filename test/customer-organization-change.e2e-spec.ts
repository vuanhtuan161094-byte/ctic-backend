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
  customerUser: '12000000-0000-4000-8000-000000000001',
  unmappedUser: '12000000-0000-4000-8000-000000000002',
  coordinator: '12000000-0000-4000-8000-000000000003',
  customerRole: '12000000-0000-4000-8000-000000000101',
  coordinatorRole: '12000000-0000-4000-8000-000000000102',
  portalPermission: '12000000-0000-4000-8000-000000000201',
  changePermission: '12000000-0000-4000-8000-000000000202',
  customerA: '12000000-0000-4000-8000-000000000301',
  customerB: '12000000-0000-4000-8000-000000000302',
  contactA: '12000000-0000-4000-8000-000000000401',
};

const userIds = [ids.customerUser, ids.unmappedUser, ids.coordinator];
const customerIds = [ids.customerA, ids.customerB];

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

describeRealDatabase('Phase 3.2A customer organization change request (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let customerToken = '';
  let unmappedToken = '';
  let coordinatorToken = '';
  let requestId = '';
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];
  const createdGrantKeys: Array<{ role_id: string; permission_id: string }> = [];

  const bearer = (token: string) => `Bearer ${token}`;

  async function assertConnectedToTestDatabase(database: PrismaClient) {
    const result = await database.$queryRawUnsafe<Array<{ database_name: string }>>(
      'SELECT DB_NAME() AS database_name',
    );
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
    const existing = await prisma.role_permissions.findFirst({
      where: { role_id: roleId, permission_id: permissionId },
      select: { role_id: true },
    });
    if (existing) return;
    await prisma.role_permissions.create({ data: { role_id: roleId, permission_id: permissionId } });
    createdGrantKeys.push({ role_id: roleId, permission_id: permissionId });
  }

  async function cleanup(cleanAuth = false) {
    await assertConnectedToTestDatabase(prisma);
    const changeRequests = await prisma.customer_organization_change_requests.findMany({
      where: { customer_id: { in: customerIds } },
      select: { id: true },
    });
    const changeIds = changeRequests.map((item) => item.id);
    const workItems = changeIds.length
      ? await prisma.work_items.findMany({ where: { entity_id: { in: changeIds } }, select: { id: true } })
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
    if (changeIds.length) {
      await prisma.documentFile.deleteMany({
        where: {
          entity_type: 'customer_organization_change_request',
          entity_id: { in: changeIds },
        },
      });
      await prisma.work_items.deleteMany({ where: { entity_id: { in: changeIds } } });
      await prisma.customer_organization_change_requests.deleteMany({ where: { id: { in: changeIds } } });
    }
    await prisma.customer_user_access_history.deleteMany({
      where: { OR: [{ customer_id: { in: customerIds } }, { user_id: { in: userIds } }] },
    });
    await prisma.customer_user_access.deleteMany({
      where: { OR: [{ customer_id: { in: customerIds } }, { user_id: { in: userIds } }] },
    });
    await prisma.contacts.deleteMany({ where: { customer_id: { in: customerIds } } });
    await prisma.customers.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });

    if (cleanAuth) {
      for (const grant of createdGrantKeys) {
        await prisma.role_permissions.deleteMany({ where: grant });
      }
      if (createdPermissionIds.length) {
        await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
      }
      if (createdRoleIds.length) {
        await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
      }
    }
  }

  async function createFixtures() {
    const customerRoleId = await ensureRole('CUSTOMER', ids.customerRole);
    const coordinatorRoleId = await ensureRole('COORDINATOR', ids.coordinatorRole);
    const portalPermissionId = await ensurePermission('customer_portal.access', ids.portalPermission);
    const changePermissionId = await ensurePermission('customer_changes.review', ids.changePermission);
    await ensureGrant(customerRoleId, portalPermissionId);
    await ensureGrant(coordinatorRoleId, changePermissionId);

    await prisma.users.createMany({
      data: [
        { id: ids.customerUser, username: 'p32_customer', email: 'p32-customer@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32 Customer' },
        { id: ids.unmappedUser, username: 'p32_unmapped', email: 'p32-unmapped@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32 Unmapped' },
        { id: ids.coordinator, username: 'p32_coordinator', email: 'p32-coordinator@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32 Coordinator' },
      ],
    });
    await prisma.user_roles.createMany({
      data: [
        { user_id: ids.customerUser, role_id: customerRoleId },
        { user_id: ids.unmappedUser, role_id: customerRoleId },
        { user_id: ids.coordinator, role_id: coordinatorRoleId },
      ],
    });
    await prisma.customers.createMany({
      data: [
        { id: ids.customerA, customer_code: 'P32-A', company_name: 'P32 Customer A', tax_code: 'P32TAXA', address: 'Old address', phone: '0900000001', email: 'old@example.com', status: 'active' },
        { id: ids.customerB, customer_code: 'P32-B', company_name: 'P32 Customer B', tax_code: 'P32TAXB', address: 'Secret B address', status: 'active' },
      ],
    });
    await prisma.contacts.create({
      data: { id: ids.contactA, customer_id: ids.customerA, full_name: 'Old Contact', email: 'old-contact@example.com', phone: '0900000002', position: 'QA' },
    });
    await prisma.customer_user_access.create({
      data: { customer_id: ids.customerA, user_id: ids.customerUser, created_by: ids.coordinator, status: 'active' },
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

    customerToken = await jwt.signAsync({ sub: ids.customerUser, username: 'p32_customer' });
    unmappedToken = await jwt.signAsync({ sub: ids.unmappedUser, username: 'p32_unmapped' });
    coordinatorToken = await jwt.signAsync({ sub: ids.coordinator, username: 'p32_coordinator' });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  });

  it('creates a controlled before/after snapshot and Coordinator work item without mutating master data', async () => {
    const response = await request(app.getHttpServer())
      .post('/customer-portal/me/organization-change-requests')
      .set('Authorization', bearer(customerToken))
      .send({
        customer_id: ids.customerA,
        reason: 'Company registered address and contact changed',
        address: 'New controlled address',
        phone: '0911111111',
        contact_id: ids.contactA,
        contact_full_name: 'New Contact Name',
        contact_email: 'new-contact@example.com',
        contact_phone: '0922222222',
        contact_position: 'QMS Manager',
      })
      .expect(201);

    requestId = response.body.id as string;
    expect(requestId).toBeTruthy();
    expect(response.body.status).toBe('SUBMITTED');

    const customer = await prisma.customers.findUnique({ where: { id: ids.customerA } });
    expect(customer?.address).toBe('Old address');

    const stored = await prisma.customer_organization_change_requests.findUnique({ where: { id: requestId } });
    expect(stored?.before_snapshot).toContain('Old address');
    expect(stored?.after_snapshot).toContain('New controlled address');

    const work = await prisma.work_items.findUnique({ where: { source_key: `customer-org-change:${requestId}:review` } });
    expect(work).toEqual(expect.objectContaining({
      assigned_role: 'COORDINATOR',
      action_code: 'customer.organization_change.review',
      status: 'OPEN',
    }));
  });

  it('denies cross-customer and unmapped customer requests', async () => {
    await request(app.getHttpServer())
      .post('/customer-portal/me/organization-change-requests')
      .set('Authorization', bearer(customerToken))
      .send({ customer_id: ids.customerB, reason: 'Cross customer attempt', address: 'Should never apply' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/customer-portal/me/organization-change-requests')
      .set('Authorization', bearer(unmappedToken))
      .expect(403);
  });

  it('allows Coordinator to approve once, atomically updates master data, completes work and notifies customer', async () => {
    await request(app.getHttpServer())
      .get('/customer-change-requests?status=SUBMITTED')
      .set('Authorization', bearer(coordinatorToken))
      .expect(200)
      .expect((response) => {
        expect(response.body.some((item: { id: string }) => item.id === requestId)).toBe(true);
      });

    await request(app.getHttpServer())
      .post(`/customer-change-requests/${requestId}/review`)
      .set('Authorization', bearer(coordinatorToken))
      .send({ decision: 'APPROVE', comment: 'Verified against legal evidence.' })
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('APPROVED');
      });

    const customer = await prisma.customers.findUnique({ where: { id: ids.customerA } });
    expect(customer?.address).toBe('New controlled address');
    expect(customer?.phone).toBe('0911111111');

    const contact = await prisma.contacts.findUnique({ where: { id: ids.contactA } });
    expect(contact?.full_name).toBe('New Contact Name');
    expect(contact?.position).toBe('QMS Manager');

    const work = await prisma.work_items.findUnique({ where: { source_key: `customer-org-change:${requestId}:review` } });
    expect(work?.status).toBe('DONE');

    const notification = await prisma.notifications.findFirst({
      where: { user_id: ids.customerUser, notification_type: 'CUSTOMER_ORGANIZATION_CHANGE_APPROVED' },
    });
    expect(notification?.destination_path).toBe('/customer-portal/profile');

    await request(app.getHttpServer())
      .post(`/customer-change-requests/${requestId}/review`)
      .set('Authorization', bearer(coordinatorToken))
      .send({ decision: 'APPROVE' })
      .expect(400);
  });

  it('returns approved history through customer-safe projection without internal-only fields', async () => {
    await request(app.getHttpServer())
      .get('/customer-portal/me/organization-change-requests')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        const item = response.body.find((candidate: { id: string }) => candidate.id === requestId);
        expect(item.status).toBe('APPROVED');
        expect(item.after_snapshot.organization.address).toBe('New controlled address');
        expect(JSON.stringify(item)).not.toContain('password_hash');
      });
  });
});
