import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService demo admin bootstrap', () => {
  const token = 'cmp-demo-one-time-token-' + 'a'.repeat(40);
  let originalEnabled: string | undefined;
  let originalToken: string | undefined;

  beforeEach(() => {
    originalEnabled = process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED;
    originalToken = process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN;
    process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED = 'true';
    process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN = token;
  });

  afterEach(() => {
    if (originalEnabled === undefined)
      delete process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED;
    else process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED = originalEnabled;
    if (originalToken === undefined)
      delete process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN;
    else process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN = originalToken;
  });

  function createHarness() {
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ lock_result: 0 }]),
      audit_logs: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      user_roles: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ user_id: 'user-1', role_id: 'role-admin' }),
      },
      users: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          username: 'demo.admin',
          email: 'demo.admin@example.invalid',
          full_name: 'Quản trị DEMO',
        }),
      },
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          database_name: 'CTIC_CMP_DEMO_2026',
          sql_machine: 'CTIC-LP-054',
          sql_instance: 'SQLEXPRESS',
        },
      ]),
      roles: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'role-admin', role_name: 'admin' }]),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as never,
    );
    return { service, prisma, transaction };
  }

  const dto = {
    username: 'Demo.Admin',
    email: 'demo.admin@example.invalid',
    password: 'Strong-CMP-Demo-Admin-2026!',
    full_name: 'Quản trị DEMO',
  };

  it('refuses bootstrap when disabled, remote, or presented with the wrong token', async () => {
    const { service, prisma } = createHarness();

    process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED = 'false';
    await expect(
      service.bootstrapDemoAdmin(dto, token, '127.0.0.1'),
    ).rejects.toThrow('đang tắt');
    process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED = 'true';
    await expect(
      service.bootstrapDemoAdmin(dto, token, '192.168.1.10'),
    ).rejects.toThrow('máy cục bộ');
    await expect(
      service.bootstrapDemoAdmin(dto, 'wrong-token', '127.0.0.1'),
    ).rejects.toThrow('không hợp lệ');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a database fingerprint outside the approved SQL sandbox', async () => {
    const { service, prisma, transaction } = createHarness();
    prisma.$queryRaw.mockResolvedValue([
      {
        database_name: 'CTIC_Certification',
        sql_machine: 'CTIC-LP-054',
        sql_instance: 'SQLEXPRESS',
      },
    ]);

    await expect(
      service.bootstrapDemoAdmin(dto, token, '::ffff:127.0.0.1'),
    ).rejects.toThrow('đúng SQL sandbox');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.users.create).not.toHaveBeenCalled();
  });

  it('creates one audited ADMIN through the guarded API service and consumes the process token', async () => {
    const { service, transaction } = createHarness();

    const result = await service.bootstrapDemoAdmin(dto, token, '127.0.0.1');

    expect(result).toMatchObject({
      id: 'user-1',
      username: 'demo.admin',
      email: 'demo.admin@example.invalid',
      roles: ['ADMIN'],
    });
    const userCreateCalls = transaction.users.create.mock
      .calls as unknown as Array<[unknown]>;
    const userCreateCall = userCreateCalls[0]?.[0] as {
      data: {
        username: string;
        email: string;
        status: string;
        password_hash: string;
      };
    };
    expect(userCreateCall.data).toMatchObject({
      username: 'demo.admin',
      email: 'demo.admin@example.invalid',
      status: 'active',
    });
    expect(typeof userCreateCall.data.password_hash).toBe('string');
    expect(userCreateCall.data.password_hash).not.toBe(dto.password);
    expect(transaction.user_roles.create).toHaveBeenCalledWith({
      data: { user_id: 'user-1', role_id: 'role-admin' },
    });
    const auditCreateCalls = transaction.audit_logs.create.mock
      .calls as unknown as Array<[unknown]>;
    const auditCreateCall = auditCreateCalls[0]?.[0] as {
      data: { action: string; entity_id: string };
    };
    expect(auditCreateCall.data).toEqual({
      user_id: 'user-1',
      action: 'DEMO_INITIAL_ADMIN_BOOTSTRAPPED',
      entity_type: 'user',
      entity_id: 'user-1',
      outcome: 'success',
      status_code: 201,
      details_json: JSON.stringify({
        database: 'CTIC_CMP_DEMO_2026',
        source: 'loopback_one_time_bootstrap',
      }),
    });
    expect(process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED).toBe('false');
    expect(process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN).toBe('');
    expect(JSON.stringify(transaction.users.create.mock.calls)).not.toContain(
      dto.password,
    );
  });

  it('refuses a second bootstrap if an earlier audit record exists', async () => {
    const { service, transaction } = createHarness();
    transaction.audit_logs.findFirst.mockResolvedValue({ id: 'audit-old' });

    await expect(
      service.bootstrapDemoAdmin(dto, token, '127.0.0.1'),
    ).rejects.toThrow('đã được thiết lập');
    expect(transaction.users.create).not.toHaveBeenCalled();
  });
});
