import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { SurveillanceInformationService } from '../src/surveillance-information/surveillance-information.service';
import { MandayRulesService } from '../src/manday-calculations/manday-rules.service';

jest.setTimeout(120_000);

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
            continue;
        }
        current += character;
    }
    if (current) parts.push(current);
    return parts;
}

function unwrapConnectionValue(value: string) {
    const trimmed = value.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}')
        ? trimmed.slice(1, -1)
        : trimmed;
}

function parseBoolean(value: string | undefined) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function buildStableTestAdapterConfig(databaseUrl: string) {
    const parts = splitConnectionParts(databaseUrl.replace(/^sqlserver:\/\//i, ''));
    const hostPart = parts.shift()?.trim() || 'localhost:1433';
    const lastColon = hostPart.lastIndexOf(':');
    const server = lastColon > 0 ? hostPart.slice(0, lastColon) : hostPart;
    const parsedPort = lastColon > 0 ? Number(hostPart.slice(lastColon + 1)) : 1433;
    const parameters = new Map<string, string>();
    for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        parameters.set(
            part.slice(0, separator).trim().toLowerCase(),
            unwrapConnectionValue(part.slice(separator + 1)),
        );
    }
    const user = parameters.get('user') ?? parameters.get('username') ?? parameters.get('uid');
    const password = parameters.get('password') ?? parameters.get('pwd');
    return {
        server,
        port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 1433,
        database: parameters.get('database') ?? parameters.get('initial catalog'),
        ...(user ? { user } : {}),
        ...(password ? { password } : {}),
        connectionTimeout: 15_000,
        requestTimeout: 60_000,
        pool: { max: 2, min: 0, idleTimeoutMillis: 5_000 },
        options: {
            encrypt: parseBoolean(parameters.get('encrypt')),
            trustServerCertificate: parseBoolean(parameters.get('trustservercertificate')),
            packetSize: 4_096,
            enableArithAbort: true,
        },
    };
}

const testUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const safe = /(?:database|initial catalog)=CTIC_Certification_P09_test(?:;|$)/i.test(testUrl);
const describeDatabase = safe ? describe : describe.skip;
if (testUrl && !safe) throw new Error('SURVEILLANCE INFORMATION E2E refused a non-test database.');

describeDatabase('Surveillance information snapshot real database E2E', () => {
    const ids = {
        actor: randomUUID(),
        customer: randomUUID(),
        application: randomUUID(),
        project: randomUUID(),
        program: randomUUID(),
        gs1: randomUUID(),
        gs2: randomUUID(),
    };
    let prisma: PrismaClient;
    let service: SurveillanceInformationService;

    async function cleanup() {
        if (!prisma) return;
        const db = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        if (db[0]?.database_name !== 'CTIC_Certification_P09_test') {
            throw new Error('Cleanup refused outside test DB.');
        }
        await prisma.surveillance_information_snapshots.deleteMany({ where: { project_id: ids.project } });
        await prisma.audit_program_events.deleteMany({ where: { program_id: ids.program } });
        await prisma.audit_programs.deleteMany({ where: { id: ids.program } });
        await prisma.certification_projects.deleteMany({ where: { id: ids.project } });
        await prisma.certification_application_sites.deleteMany({ where: { application_id: ids.application } });
        await prisma.application_reviews.deleteMany({ where: { application_id: ids.application } });
        await prisma.certification_applications.deleteMany({ where: { id: ids.application } });
        await prisma.customers.deleteMany({ where: { id: ids.customer } });
        await prisma.users.deleteMany({ where: { id: ids.actor } });
    }

    beforeAll(async () => {
        prisma = new PrismaClient({ adapter: new PrismaMssql(buildStableTestAdapterConfig(testUrl)) });
        await prisma.$connect();
        await cleanup();

        await prisma.users.create({ data: {
            id: ids.actor,
            username: `surv-${ids.actor.slice(0, 8)}`,
            email: `${ids.actor}@example.com`,
            password_hash: 'not-used',
            full_name: 'Surveillance E2E Coordinator',
            status: 'active',
        } });
        await prisma.customers.create({ data: {
            id: ids.customer,
            customer_code: `SURV-${ids.customer.slice(0, 8)}`,
            company_name: 'Original Certification Customer',
            country_code: 'VN',
            tax_code: `99${Date.now().toString().slice(-8)}`,
            address: 'Original registered address',
            status: 'active',
        } });
        await prisma.certification_applications.create({ data: {
            id: ids.application,
            customer_id: ids.customer,
            application_code: `APP-SURV-${ids.application.slice(0, 8)}`,
            application_date: new Date('2026-01-10'),
            standard_name: 'ISO 9001:2015',
            certification_scope: 'Manufacture of example products',
            headquarters_address: 'Original registered address',
            contact_name: 'Original Contact',
            contact_email: 'original@example.com',
            site_count: 1,
            total_employee_count: 100,
            employee_count: 100,
            shift_count: 1,
            declaration_accepted: true,
            status: 'approved',
        } });
        await prisma.certification_application_sites.create({ data: {
            application_id: ids.application,
            site_no: 1,
            site_name: 'Main site',
            address: 'Original registered address',
            activities: 'Manufacturing',
            employee_count: 100,
            is_headquarters: true,
        } });
        await prisma.certification_projects.create({ data: {
            id: ids.project,
            application_id: ids.application,
            project_code: `PRJ-SURV-${ids.project.slice(0, 8)}`,
            standard_name: 'ISO 9001:2015',
            status: 'active',
        } });
        await prisma.audit_programs.create({ data: {
            id: ids.program,
            project_id: ids.project,
            program_code: `PG-SURV-${ids.program.slice(0, 8)}`,
            program_year: 2026,
            version_no: 1,
            organization_name: 'Original Certification Customer',
            address: 'Original registered address',
            standard_name: 'ISO 9001:2015',
            certification_scope: 'Manufacture of example products',
            effective_personnel: 100,
            certification_type: 'INITIAL',
            cycle_number: 1,
            status: 'issued',
            prepared_by: ids.actor,
        } });
        await prisma.audit_program_events.createMany({ data: [
            {
                id: ids.gs1,
                program_id: ids.program,
                sequence_no: 3,
                event_type: 'surveillance1',
                planned_start_date: new Date('2027-08-01'),
                planned_mandays: 4,
                status: 'planned',
            },
            {
                id: ids.gs2,
                program_id: ids.program,
                sequence_no: 4,
                event_type: 'surveillance2',
                planned_start_date: new Date('2028-08-01'),
                planned_mandays: 4,
                status: 'planned',
            },
        ] });
        service = new SurveillanceInformationService(prisma as any, new MandayRulesService());
    });

    afterAll(async () => {
        try {
            await cleanup();
        } finally {
            if (prisma) await prisma.$disconnect();
        }
    });

    it('preserves initial history, lets GS2 inherit latest GS1 and keeps MD until explicit review', async () => {
        const gs1Initial = await service.get(ids.project, ids.gs1);
        expect(gs1Initial.source.type).toBe('INITIAL_APPLICATION');
        expect(gs1Initial.current_data.contact_name).toBe('Original Contact');
        expect(gs1Initial.manday.effective_mandays).toBe(4);

        const gs1Confirmed = await service.confirm(ids.project, ids.gs1, {
            data: {
                contact_name: 'GS1 Contact',
                contact_email: 'gs1@example.com',
            },
            manday_decision: 'KEEP_CURRENT',
            note: 'Administrative update only',
        }, ids.actor);
        expect(gs1Confirmed.snapshot?.status).toBe('CONFIRMED');
        expect(gs1Confirmed.summary.manday_review_recommended).toBe(false);
        expect(gs1Confirmed.manday.effective_mandays).toBe(4);

        const overwriteError = await service.saveDraft(ids.project, ids.gs1, {
            data: { contact_name: 'Forbidden overwrite' },
            manday_decision: 'KEEP_CURRENT',
        }, ids.actor).then(() => null).catch((error: unknown) => error);

        expect(overwriteError).toBeInstanceOf(Error);
        const overwriteMessage = (overwriteError as Error).message;
        expect(overwriteMessage).toMatch(/khóa|bất biến|immutable/i);
        expect(overwriteMessage).toMatch(/tạo bản cập nhật mới/i);

        const gs2Initial = await service.get(ids.project, ids.gs2);
        expect(gs2Initial.source.type).toBe('PREVIOUS_SURVEILLANCE');
        expect(gs2Initial.current_data.contact_name).toBe('GS1 Contact');
        expect(gs2Initial.current_data.employee_count).toBe(100);

        const gs2Confirmed = await service.confirm(ids.project, ids.gs2, {
            data: {
                employee_count: 140,
                certification_scope: 'Manufacture and assembly of example products',
            },
            note: 'Scope and effective personnel reviewed before GS2',
        }, ids.actor);
        expect(gs2Confirmed.summary.manday_review_recommended).toBe(true);
        expect(gs2Confirmed.summary.scope_review_required).toBe(true);
        expect(gs2Confirmed.manday.effective_mandays).toBe(4);
        expect(gs2Confirmed.next_action?.code).toBe('REVIEW_CHANGE');

        const gs2BeforeReview = await prisma.audit_program_events.findUnique({ where: { id: ids.gs2 } });
        expect(Number(gs2BeforeReview?.planned_mandays)).toBe(4);

        const gs2Reviewed = await service.reviewChange(ids.project, ids.gs2, {
            decision: 'KEEP_CURRENT',
            review_note: 'Giữ ngày công giám sát đã được phê duyệt',
        }, ids.actor);
        expect(gs2Reviewed.snapshot?.status).toBe('REVIEWED');
        expect(gs2Reviewed.manday.effective_mandays).toBe(4);

        const gs2AfterReview = await prisma.audit_program_events.findUnique({ where: { id: ids.gs2 } });
        expect(Number(gs2AfterReview?.planned_mandays)).toBe(4);

        const originalApplication = await prisma.certification_applications.findUnique({ where: { id: ids.application } });
        expect(originalApplication?.employee_count).toBe(100);
        expect(originalApplication?.certification_scope).toBe('Manufacture of example products');
    });
});
