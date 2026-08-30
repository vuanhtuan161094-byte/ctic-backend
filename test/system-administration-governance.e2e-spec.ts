import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuditLogsService } from '../src/audit-logs/audit-logs.service';
import { JwtStrategy } from '../src/auth/jwt.strategy/jwt.strategy';
import { NotificationSchedulerService } from '../src/notifications/notification-scheduler.service';
import { DatabaseSchemaService } from '../src/prisma/database-schema.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SystemAdministrationService } from '../src/system-administration/system-administration.service';
import { UsersService } from '../src/users/users.service';

jest.setTimeout(120_000);
function databaseName(url: string) { return url.replace(/^sqlserver:\/\//i, '').split(';').map((part) => part.split('=')).find(([key]) => ['database', 'initial catalog'].includes(String(key).trim().toLowerCase()))?.[1]?.replace(/^\{|\}$/g, '') ?? ''; }
const testUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const safe = /_(test|ci)$/i.test(databaseName(testUrl));
if (testUrl && !safe) throw new Error(`[P09 E2E SAFETY] Refusing ${databaseName(testUrl) || '<missing>'}`);
if (safe) { process.env.DATABASE_URL = testUrl; process.env.NODE_ENV = 'test'; }
const describeRealDatabase = safe ? describe : describe.skip;

describeRealDatabase('Phase 9 system administration governance (real SQL Server e2e)', () => {
    let prisma: PrismaService;
    let users: UsersService;
    let administration: SystemAdministrationService;
    let auditLogs: AuditLogsService;
    const run = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const actorId = randomUUID();
    const createdUserIds: string[] = [];

    function isTransientSqlConnectivityError(error: unknown) {
        const queue: unknown[] = [error];
        const seen = new Set<unknown>();
        while (queue.length > 0) {
            const current = queue.shift();
            if (current == null || seen.has(current)) continue;
            seen.add(current);
            if (typeof current === 'string') {
                const message = current.toLowerCase();
                if (message.includes('failed to connect to') || message.includes('server is not reachable')) return true;
                continue;
            }
            if (typeof current !== 'object') continue;
            const candidate = current as Record<string, unknown>;
            if (String(candidate.code ?? '').toUpperCase() === 'P1001') return true;
            if (typeof candidate.message === 'string') queue.push(candidate.message);
            for (const key of ['cause', 'originalError', 'driverAdapterError', 'meta']) {
                if (candidate[key]) queue.push(candidate[key]);
            }
        }
        return false;
    }

    async function assertTestDatabase() {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
                if (!/_(test|ci)$/i.test(rows[0]?.database_name ?? '')) throw new Error('[P09 E2E SAFETY] Cleanup refused');
                return;
            } catch (error) {
                lastError = error;
                if (!isTransientSqlConnectivityError(error) || attempt >= 1) throw error;
                await prisma.$disconnect().catch(() => undefined);
                await new Promise<void>((resolve) => setTimeout(resolve, 500));
                await prisma.$connect();
            }
        }
        throw lastError;
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect(); await assertTestDatabase();
        for (const roleName of ['admin', 'staff', 'customer']) {
            await prisma.roles.upsert({ where: { role_name: roleName }, update: {}, create: { role_name: roleName, description: `P9 supported ${roleName}` } });
        }
        await prisma.users.create({ data: { id: actorId, username: `p9_actor_${run}`, email: `p9_actor_${run}@example.test`, password_hash: 'P9_NOT_A_LOGIN_SECRET', full_name: 'P9 Admin Actor' } });
        users = new UsersService(prisma);
        const scheduler = new NotificationSchedulerService({} as never);
        administration = new SystemAdministrationService(prisma, new DatabaseSchemaService(prisma), scheduler);
        auditLogs = new AuditLogsService(prisma);
    });

    afterAll(async () => {
        await assertTestDatabase();
        await prisma.user_sessions.deleteMany({ where: { user_id: { in: createdUserIds } } });
        await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: actorId }, { entity_id: { in: createdUserIds } }] } });
        await prisma.user_roles.deleteMany({ where: { user_id: { in: createdUserIds } } });
        await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
        await prisma.users.deleteMany({ where: { id: actorId } });
        await prisma.$disconnect();
    });

    it('creates only a supported internal account and records before/after audit metadata', async () => {
        const created = await users.create({ username: `p9_staff_${run}`, email: `p9_staff_${run}@example.test`, full_name: 'P9 Staff', password: 'StrongPassword9!', role_names: ['staff'] }, actorId) as { id: string; roles: Array<{ role_name: string }> };
        createdUserIds.push(created.id);
        expect(created.roles.map((role) => role.role_name)).toEqual(['staff']);
        expect(await prisma.customer_user_access.count({ where: { user_id: created.id } })).toBe(0);
        const audit = await prisma.audit_logs.findFirstOrThrow({ where: { action: 'USER_CREATED', entity_id: created.id } });
        expect(JSON.parse(audit.details_json ?? '{}').after.roles).toEqual(['STAFF']);
        expect(audit.details_json).not.toContain('StrongPassword9!');
    });

    it('rejects CUSTOMER elevation and keeps customer access under Phase 3.2B', async () => {
        await expect(users.create({ username: `p9_customer_${run}`, email: `p9_customer_${run}@example.test`, password: 'StrongPassword9!', role_names: ['customer'] }, actorId)).rejects.toBeInstanceOf(BadRequestException);
        expect(await prisma.users.count({ where: { username: `p9_customer_${run}` } })).toBe(0);
    });

    it('revokes disabled account access and provides filtered read-only audit projection', async () => {
        const created = await users.create({ username: `p9_disabled_${run}`, email: `p9_disabled_${run}@example.test`, password: 'StrongPassword9!', role_names: ['staff'] }, actorId) as { id: string };
        createdUserIds.push(created.id);
        await users.update(created.id, { status: 'inactive' }, actorId);
        const strategy = new JwtStrategy(new ConfigService({ JWT_SECRET: 'P9_TEST_ONLY_SECRET_1234567890' }), prisma);
        await expect(strategy.validate({ sub: created.id, username: `p9_disabled_${run}` })).rejects.toBeInstanceOf(UnauthorizedException);
        const page = await auditLogs.findAll({ action: 'USER_', entity_id: created.id, page: 1, limit: 10 });
        expect(page.total).toBeGreaterThanOrEqual(2);
        expect(page.items.every((item) => !JSON.stringify(item).includes('password_hash'))).toBe(true);
    });

    it('returns safe app governance and detailed ADMIN health without secrets or raw storage paths', async () => {
        const overview = await administration.getOverview();
        expect(overview.security.arbitrary_role_designer).toBe(false);
        expect(overview.customer_access.mutation_authority).toBe('PHASE_3_2B_WORKFLOW_ONLY');
        const health = await administration.getDetailedHealth();
        expect(health.database.migration_count).toBeGreaterThanOrEqual(28);
        expect(health.secrets_exposed).toBe(false);
        expect(JSON.stringify(health)).not.toMatch(/DATABASE_URL|JWT_SECRET|password|connection string/i);
        expect(JSON.stringify(await administration.getDocumentGovernance())).not.toContain('documentsDirectory');
    });
});
