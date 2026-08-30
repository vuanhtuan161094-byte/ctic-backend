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
  customerUser: '10000000-0000-4000-8000-000000000001',
  unmappedUser: '10000000-0000-4000-8000-000000000002',
  coordinator: '10000000-0000-4000-8000-000000000003',
  customerRole: '10000000-0000-4000-8000-000000000101',
  coordinatorRole: '10000000-0000-4000-8000-000000000102',
  portalPermission: '10000000-0000-4000-8000-000000000201',
  customerA: '10000000-0000-4000-8000-000000000301',
  customerB: '10000000-0000-4000-8000-000000000302',
  applicationB: '10000000-0000-4000-8000-000000000401',
  safeNotification: '10000000-0000-4000-8000-000000000501',
  internalNotification: '10000000-0000-4000-8000-000000000502',
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
      return raw.startsWith('{') && raw.endsWith('}')
        ? raw.slice(1, -1)
        : raw;
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
    'Customer Portal real E2E skipped: TEST_DATABASE_URL is missing. Runtime DATABASE_URL was not used.',
  );
}

describeRealDatabase('Phase 3.1 Customer Portal foundation (real database e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let customerToken = '';
  let unmappedToken = '';
  let createdApplicationId = '';
  let customerRoleId = '';
  let coordinatorRoleId = '';
  let portalPermissionId = '';
  let createdCustomerRole = false;
  let createdCoordinatorRole = false;
  let createdPortalPermission = false;
  let createdCustomerPortalGrant = false;

  const bearer = (token: string) => `Bearer ${token}`;

  async function assertConnectedToTestDatabase(database: PrismaClient) {
    const result = await database.$queryRawUnsafe<Array<{ database_name: string }>>(
      'SELECT DB_NAME() AS database_name',
    );
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

  async function cleanupFixtures(
    database: PrismaService,
    cleanupAuthSeeds = false,
  ) {
    await assertConnectedToTestDatabase(database);

    const applications = await database.certification_applications.findMany({
      where: { customer_id: { in: customerIds } },
      select: { id: true },
    });
    const applicationIds = applications.map((item) => item.id);

    const workItemIds = applicationIds.length
      ? (
          await database.work_items.findMany({
            where: { entity_id: { in: applicationIds } },
            select: { id: true },
          })
        ).map((item) => item.id)
      : [];

    await database.notifications.deleteMany({
      where: { user_id: { in: userIds } },
    });
    if (workItemIds.length) {
      await database.notifications.deleteMany({
        where: { work_item_id: { in: workItemIds } },
      });
    }
    await database.audit_logs.deleteMany({
      where: { user_id: { in: userIds } },
    });

    if (applicationIds.length) {
      await database.work_items.deleteMany({
        where: { entity_id: { in: applicationIds } },
      });
      await database.application_review_actions.deleteMany({
        where: {
          review: {
            application_id: { in: applicationIds },
          },
        },
      });
      await database.application_reviews.deleteMany({
        where: { application_id: { in: applicationIds } },
      });
      await database.certification_application_sites.deleteMany({
        where: { application_id: { in: applicationIds } },
      });
      await database.certification_applications.deleteMany({
        where: { id: { in: applicationIds } },
      });
    }
    await database.customer_user_access_history.deleteMany({
      where: {
        OR: [
          { customer_id: { in: customerIds } },
          { user_id: { in: userIds } },
        ],
      },
    });
    await database.customer_user_access.deleteMany({
      where: {
        OR: [
          { customer_id: { in: customerIds } },
          { user_id: { in: userIds } },
        ],
      },
    });
    await database.customers.deleteMany({
      where: { id: { in: customerIds } },
    });
    await database.user_roles.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await database.users.deleteMany({
      where: { id: { in: userIds } },
    });

    if (cleanupAuthSeeds) {
      if (createdCustomerPortalGrant && customerRoleId && portalPermissionId) {
        await database.role_permissions.deleteMany({
          where: {
            role_id: customerRoleId,
            permission_id: portalPermissionId,
          },
        });
      }
      if (createdPortalPermission && portalPermissionId) {
        await database.permissions.deleteMany({
          where: { id: portalPermissionId },
        });
      }
      const createdRoleIds = [
        createdCustomerRole ? customerRoleId : '',
        createdCoordinatorRole ? coordinatorRoleId : '',
      ].filter(Boolean);
      if (createdRoleIds.length) {
        await database.roles.deleteMany({
          where: { id: { in: createdRoleIds } },
        });
      }
    }
  }

  async function ensureRole(roleName: string, preferredId: string) {
    const existing = await prisma.roles.findUnique({
      where: { role_name: roleName },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await prisma.roles.create({
      data: { id: preferredId, role_name: roleName },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  async function ensurePortalPermission() {
    const existing = await prisma.permissions.findUnique({
      where: { permission_name: 'customer_portal.access' },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await prisma.permissions.create({
      data: {
        id: ids.portalPermission,
        permission_name: 'customer_portal.access',
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  async function createFixtures() {
    const customerRole = await ensureRole('CUSTOMER', ids.customerRole);
    customerRoleId = customerRole.id;
    createdCustomerRole = customerRole.created;

    const coordinatorRole = await ensureRole(
      'COORDINATOR',
      ids.coordinatorRole,
    );
    coordinatorRoleId = coordinatorRole.id;
    createdCoordinatorRole = coordinatorRole.created;

    const portalPermission = await ensurePortalPermission();
    portalPermissionId = portalPermission.id;
    createdPortalPermission = portalPermission.created;

    const existingGrant = await prisma.role_permissions.findFirst({
      where: {
        role_id: customerRoleId,
        permission_id: portalPermissionId,
      },
      select: { role_id: true },
    });
    if (!existingGrant) {
      await prisma.role_permissions.create({
        data: {
          role_id: customerRoleId,
          permission_id: portalPermissionId,
        },
      });
      createdCustomerPortalGrant = true;
    }
    await prisma.users.createMany({
      data: [
        {
          id: ids.customerUser,
          username: 'p3_e2e_customer',
          email: 'p3-customer@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Phase 3 Customer',
        },
        {
          id: ids.unmappedUser,
          username: 'p3_e2e_unmapped',
          email: 'p3-unmapped@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Phase 3 Unmapped Customer',
        },
        {
          id: ids.coordinator,
          username: 'p3_e2e_coordinator',
          email: 'p3-coordinator@example.com',
          password_hash: 'E2E_NOT_USED',
          full_name: 'Phase 3 Coordinator',
        },
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
        {
          id: ids.customerA,
          customer_code: 'P3-E2E-A',
          company_name: 'Phase 3 Customer A',
          address: 'Customer A address',
          status: 'active',
        },
        {
          id: ids.customerB,
          customer_code: 'P3-E2E-B',
          company_name: 'Phase 3 Customer B',
          address: 'Customer B address',
          status: 'active',
        },
      ],
    });
    await prisma.customer_user_access.create({
      data: {
        customer_id: ids.customerA,
        user_id: ids.customerUser,
        created_by: ids.coordinator,
        status: 'active',
      },
    });
    await prisma.certification_applications.create({
      data: {
        id: ids.applicationB,
        customer_id: ids.customerB,
        application_code: 'P3-E2E-OTHER-CUSTOMER',
        application_date: new Date('2026-08-22'),
        standard_name: 'ISO 14001:2015',
        certification_scope: 'Other customer secret scope',
        declaration_accepted: true,
        status: 'draft',
      },
    });
    await prisma.notifications.createMany({
      data: [
        {
          id: ids.safeNotification,
          user_id: ids.customerUser,
          source_key: 'p3-e2e-safe-cap',
          notification_type: 'CUSTOMER_CAP_DUE',
          category: 'CAP_DUE',
          title: 'CAP cần xử lý',
          message: 'Customer-safe message',
          severity: 'WARNING',
          status: 'unread',
          channel: 'IN_APP',
        },
        {
          id: ids.internalNotification,
          user_id: ids.customerUser,
          source_key: 'p3-e2e-internal-review',
          notification_type: 'TECHNICAL_REVIEW_READY',
          category: 'TECHNICAL_REVIEW_READY',
          title: 'Internal reviewer message',
          message: 'INTERNAL_SECRET_DO_NOT_EXPOSE',
          severity: 'NORMAL',
          status: 'unread',
          channel: 'IN_APP',
        },
      ],
    });
  }

  beforeAll(async () => {
    const { AppModule } = jest.requireActual<typeof import('../src/app.module')>(
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
        validationError: { target: false, value: false },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await cleanupFixtures(prisma);
    await createFixtures();

    customerToken = await jwt.signAsync({
      sub: ids.customerUser,
      username: 'p3_e2e_customer',
    });
    unmappedToken = await jwt.signAsync({
      sub: ids.unmappedUser,
      username: 'p3_e2e_unmapped',
    });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await cleanupFixtures(prisma, true);
    if (app) await app.close();
  });

  it('isolates customer profile/applications and denies unmapped access', async () => {
    await request(app.getHttpServer())
      .get('/customer-portal/me/profile')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBe(ids.customerA);
        expect(JSON.stringify(response.body)).not.toContain('Phase 3 Customer B');
      });

    await request(app.getHttpServer())
      .get('/customer-portal/me/applications')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        expect(JSON.stringify(response.body)).not.toContain('Other customer secret scope');
      });

    await request(app.getHttpServer())
      .get('/customer-portal/me/profile')
      .set('Authorization', bearer(unmappedToken))
      .expect(403);
  });

  it('supports true draft -> customer confirmation -> submit and opens Coordinator intake work', async () => {
    const payload = {
      customer_id: ids.customerA,
      application_date: '2026-08-22',
      certification_type: 'INITIAL',
      standard_name: 'ISO 9001:2015',
      certification_scope: 'Manufacture of example products',
      headquarters_address: 'Customer A address',
      declaration_accepted: false,
      sites: [
        {
          site_no: 1,
          address: 'Customer A address',
          activities: 'Manufacture of example products',
          is_headquarters: true,
        },
      ],
    };

    const created = await request(app.getHttpServer())
      .post('/customer-portal/me/applications')
      .set('Authorization', bearer(customerToken))
      .send(payload)
      .expect(201);

    createdApplicationId = (created.body as { id: string }).id;
    expect(createdApplicationId).toBeTruthy();
    expect(created.body.declaration_accepted).toBe(false);
    expect(created.body.status).toBe('draft');

    await request(app.getHttpServer())
      .post(`/customer-portal/me/applications/${createdApplicationId}/submit`)
      .set('Authorization', bearer(customerToken))
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/customer-portal/me/applications/${createdApplicationId}`)
      .set('Authorization', bearer(customerToken))
      .send({ ...payload, declaration_accepted: true })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/customer-portal/me/applications/${createdApplicationId}/submit`)
      .set('Authorization', bearer(customerToken))
      .expect(201)
      .expect((response) => {
        expect(response.body.portal_status).toBe('SUBMITTED');
      });

    const workItem = await prisma.work_items.findFirst({
      where: {
        entity_id: createdApplicationId,
        action_code: 'application.intake',
      },
    });
    expect(workItem).toEqual(
      expect.objectContaining({
        assigned_role: 'COORDINATOR',
        status: 'OPEN',
        work_type: 'CUSTOMER_APPLICATION_INTAKE',
      }),
    );

    await request(app.getHttpServer())
      .post('/customer-portal/me/applications')
      .set('Authorization', bearer(customerToken))
      .send({ ...payload, customer_id: ids.customerB })
      .expect(403);
  });

  it('returns and marks only customer-safe notifications', async () => {
    await request(app.getHttpServer())
      .get('/customer-portal/me/notifications?limit=20')
      .set('Authorization', bearer(customerToken))
      .expect(200)
      .expect((response) => {
        const json = JSON.stringify(response.body);
        expect(json).toContain('Customer-safe message');
        expect(json).not.toContain('INTERNAL_SECRET_DO_NOT_EXPOSE');
        expect(response.body.items[0].destination_path).toBe(
          '/customer-portal/corrective-actions',
        );
      });

    await request(app.getHttpServer())
      .patch('/customer-portal/me/notifications/read-all')
      .set('Authorization', bearer(customerToken))
      .expect(200);

    const [safe, internal] = await Promise.all([
      prisma.notifications.findUnique({ where: { id: ids.safeNotification } }),
      prisma.notifications.findUnique({ where: { id: ids.internalNotification } }),
    ]);
    expect(safe?.status).toBe('read');
    expect(internal?.status).toBe('unread');

    await request(app.getHttpServer())
      .patch(`/customer-portal/me/notifications/${ids.internalNotification}/read`)
      .set('Authorization', bearer(customerToken))
      .expect(404);
  });
});
