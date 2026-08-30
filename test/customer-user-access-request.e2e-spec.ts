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
  customerUser: '13000000-0000-4000-8000-000000000001',
  secondCustomerUser: '13000000-0000-4000-8000-000000000002',
  unmappedUser: '13000000-0000-4000-8000-000000000003',
  admin: '13000000-0000-4000-8000-000000000004',
  customerRole: '13000000-0000-4000-8000-000000000101',
  adminRole: '13000000-0000-4000-8000-000000000102',
  portalPermission: '13000000-0000-4000-8000-000000000201',
  reviewPermission: '13000000-0000-4000-8000-000000000202',
  customerA: '13000000-0000-4000-8000-000000000301',
  customerB: '13000000-0000-4000-8000-000000000302',
};

const baseUserIds = [ids.customerUser, ids.secondCustomerUser, ids.unmappedUser, ids.admin];
const customerIds = [ids.customerA, ids.customerB];
const newUserEmail = 'p32b-new-user@example.com';

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

describeRealDatabase('Phase 3.2B customer user access requests (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let customerToken = '';
  let unmappedToken = '';
  let adminToken = '';
  let addRequestId = '';
  let newUserId = '';
  let revokeRequestId = '';
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
    const dynamicUsers = await prisma.users.findMany({
      where: { OR: [{ id: { in: baseUserIds } }, { email: newUserEmail }] },
      select: { id: true },
    });
    const userIds = dynamicUsers.map((item) => item.id);
    const requests = await prisma.customer_user_access_requests.findMany({
      where: { customer_id: { in: customerIds } },
      select: { id: true },
    });
    const requestIds = requests.map((item) => item.id);
    const workItems = requestIds.length
      ? await prisma.work_items.findMany({ where: { entity_id: { in: requestIds } }, select: { id: true } })
      : [];
    const workItemIds = workItems.map((item) => item.id);

    await prisma.notifications.deleteMany({
      where: {
        OR: [
          ...(userIds.length ? [{ user_id: { in: userIds } }] : []),
          ...(workItemIds.length ? [{ work_item_id: { in: workItemIds } }] : []),
        ],
      },
    });
    await prisma.customer_user_access_history.deleteMany({
      where: { OR: [{ customer_id: { in: customerIds } }, ...(requestIds.length ? [{ source_request_id: { in: requestIds } }] : [])] },
    });
    if (requestIds.length) {
      await prisma.work_items.deleteMany({ where: { entity_id: { in: requestIds } } });
      await prisma.customer_user_access_requests.deleteMany({ where: { id: { in: requestIds } } });
    }
    await prisma.customer_user_access.deleteMany({
      where: { OR: [{ customer_id: { in: customerIds } }, ...(userIds.length ? [{ user_id: { in: userIds } }] : [])] },
    });
    await prisma.customers.deleteMany({ where: { id: { in: customerIds } } });
    if (userIds.length) {
      await prisma.user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    }

    if (cleanAuth) {
      for (const grant of createdGrantKeys) await prisma.role_permissions.deleteMany({ where: grant });
      if (createdPermissionIds.length) await prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } });
      if (createdRoleIds.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
  }

  async function createFixtures() {
    const customerRoleId = await ensureRole('CUSTOMER', ids.customerRole);
    const adminRoleId = await ensureRole('ADMIN', ids.adminRole);
    const portalPermissionId = await ensurePermission('customer_portal.access', ids.portalPermission);
    const reviewPermissionId = await ensurePermission('customer_user_requests.review', ids.reviewPermission);
    await ensureGrant(customerRoleId, portalPermissionId);
    await ensureGrant(adminRoleId, reviewPermissionId);

    await prisma.users.createMany({
      data: [
        { id: ids.customerUser, username: 'p32b_customer', email: 'p32b-customer@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32B Customer' },
        { id: ids.secondCustomerUser, username: 'p32b_second', email: 'p32b-second@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32B Second Customer' },
        { id: ids.unmappedUser, username: 'p32b_unmapped', email: 'p32b-unmapped@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32B Unmapped' },
        { id: ids.admin, username: 'p32b_admin', email: 'p32b-admin@example.com', password_hash: 'E2E_NOT_USED', full_name: 'P32B Admin' },
      ],
    });
    await prisma.user_roles.createMany({
      data: [
        { user_id: ids.customerUser, role_id: customerRoleId },
        { user_id: ids.secondCustomerUser, role_id: customerRoleId },
        { user_id: ids.unmappedUser, role_id: customerRoleId },
        { user_id: ids.admin, role_id: adminRoleId },
      ],
    });
    await prisma.customers.createMany({
      data: [
        { id: ids.customerA, customer_code: 'P32B-A', company_name: 'P32B Customer A', status: 'active' },
        { id: ids.customerB, customer_code: 'P32B-B', company_name: 'P32B Customer B', status: 'active' },
      ],
    });
    const initialAccess = await prisma.customer_user_access.create({
      data: { customer_id: ids.customerA, user_id: ids.customerUser, created_by: ids.admin, status: 'active' },
    });
    await prisma.customer_user_access_history.create({
      data: {
        customer_user_access_id: initialAccess.id,
        customer_id: ids.customerA,
        user_id: ids.customerUser,
        action: 'ASSIGNED',
        source_type: 'ADMIN_DIRECT',
        changed_by: ids.admin,
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

    customerToken = await jwt.signAsync({ sub: ids.customerUser, username: 'p32b_customer' });
    unmappedToken = await jwt.signAsync({ sub: ids.unmappedUser, username: 'p32b_unmapped' });
    adminToken = await jwt.signAsync({ sub: ids.admin, username: 'p32b_admin' });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  });

  it('projects only mapped customer users and creates an approval request without self-granting access', async () => {
    await request(app.getHttpServer())
      .get('/customer-portal/me/user-access')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].customer_id).toBe(ids.customerA);
        expect(JSON.stringify(response.body)).not.toContain('password_hash');
      });

    await request(app.getHttpServer())
      .get('/customer-portal/me/user-access')
      .set('Authorization', bearer(unmappedToken))
      .expect(403);

    const response = await request(app.getHttpServer())
      .post('/customer-portal/me/user-access-requests')
      .set('Authorization', bearer(customerToken))
      .send({
        customer_id: ids.customerA,
        request_type: 'ADD_USER',
        email: newUserEmail,
        full_name: 'New Portal User',
        reason: 'Add backup certification contact',
      })
      .expect(201);

    addRequestId = response.body.id as string;
    expect(await prisma.users.findUnique({ where: { email: newUserEmail } })).toBeNull();
    const work = await prisma.work_items.findUnique({ where: { source_key: `customer-user-access:${addRequestId}:review` } });
    expect(work).toEqual(expect.objectContaining({ assigned_role: 'ADMIN', action_code: 'customer.user_access.review', status: 'OPEN' }));
  });

  it('lets Admin approve a new CUSTOMER-only account with transient credentials and audited mapping history', async () => {
    await request(app.getHttpServer())
      .get('/customer-user-requests?status=SUBMITTED')
      .set('Authorization', bearer(adminToken))
      .expect(200)
      .expect((response) => {
        const item = response.body.find((candidate: { id: string }) => candidate.id === addRequestId);
        expect(item.resolution_mode).toBe('CREATE_NEW_USER');
      });

    await request(app.getHttpServer())
      .post(`/customer-user-requests/${addRequestId}/review`)
      .set('Authorization', bearer(adminToken))
      .send({ decision: 'APPROVE', username: 'p32b_new_portal', temporary_password: 'Temporary@2026', comment: 'Identity confirmed' })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('APPROVED'));

    const created = await prisma.users.findUnique({
      where: { email: newUserEmail },
      include: { user_roles: { include: { roles: true } } },
    });
    expect(created).not.toBeNull();
    newUserId = created!.id;
    expect(created!.user_roles.map(({ roles }) => roles.role_name)).toEqual(['CUSTOMER']);

    const mapping = await prisma.customer_user_access.findUnique({
      where: { customer_id_user_id: { customer_id: ids.customerA, user_id: newUserId } },
    });
    expect(mapping?.status).toBe('active');
    const history = await prisma.customer_user_access_history.findFirst({
      where: { source_request_id: addRequestId, user_id: newUserId },
    });
    expect(history?.action).toBe('ASSIGNED');
    expect(history?.source_type).toBe('CUSTOMER_REQUEST');

    const storedRequest = await prisma.customer_user_access_requests.findUnique({ where: { id: addRequestId } });
    expect(JSON.stringify(storedRequest)).not.toContain('Temporary@2026');
  });

  it('revokes only the customer mapping after approval and keeps the user account active', async () => {
    const response = await request(app.getHttpServer())
      .post('/customer-portal/me/user-access-requests')
      .set('Authorization', bearer(customerToken))
      .send({
        customer_id: ids.customerA,
        request_type: 'REVOKE_ACCESS',
        target_user_id: newUserId,
        reason: 'User no longer handles certification',
      })
      .expect(201);
    revokeRequestId = response.body.id as string;

    await request(app.getHttpServer())
      .post(`/customer-user-requests/${revokeRequestId}/review`)
      .set('Authorization', bearer(adminToken))
      .send({ decision: 'APPROVE', comment: 'Confirmed by customer management' })
      .expect(201);

    const mapping = await prisma.customer_user_access.findUnique({
      where: { customer_id_user_id: { customer_id: ids.customerA, user_id: newUserId } },
    });
    const user = await prisma.users.findUnique({ where: { id: newUserId } });
    expect(mapping?.status).toBe('revoked');
    expect(user?.status).toBe('active');
    const history = await prisma.customer_user_access_history.findFirst({ where: { source_request_id: revokeRequestId } });
    expect(history?.action).toBe('REVOKED');
  });

  it('reactivates the mapping through a new approved request and exposes customer-safe request history', async () => {
    const response = await request(app.getHttpServer())
      .post('/customer-portal/me/user-access-requests')
      .set('Authorization', bearer(customerToken))
      .send({
        customer_id: ids.customerA,
        request_type: 'REACTIVATE_ACCESS',
        target_user_id: newUserId,
        reason: 'User resumes certification responsibility',
      })
      .expect(201);
    const reactivateRequestId = response.body.id as string;

    await request(app.getHttpServer())
      .post(`/customer-user-requests/${reactivateRequestId}/review`)
      .set('Authorization', bearer(adminToken))
      .send({ decision: 'APPROVE' })
      .expect(201);

    const mapping = await prisma.customer_user_access.findUnique({
      where: { customer_id_user_id: { customer_id: ids.customerA, user_id: newUserId } },
    });
    expect(mapping?.status).toBe('active');

    await request(app.getHttpServer())
      .get('/customer-portal/me/user-access-requests')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((historyResponse) => {
        expect(historyResponse.body.some((item: { id: string; status: string }) => item.id === reactivateRequestId && item.status === 'APPROVED')).toBe(true);
        expect(JSON.stringify(historyResponse.body)).not.toContain('password_hash');
        expect(JSON.stringify(historyResponse.body)).not.toContain('Temporary@2026');
      });
  });
});
