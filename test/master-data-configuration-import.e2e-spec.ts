import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { DocumentControlService } from '../src/document-control/document-control.service';
import { MasterDataConfigurationService } from '../src/master-data-configuration/master-data-configuration.service';
import { numberingBusinessDate, numberingBusinessYear } from '../src/master-data-configuration/numbering-runtime-policy';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecurityAuditService } from '../src/security/security-audit.service';

jest.setTimeout(120_000);

function databaseName(url: string) {
    return url.replace(/^sqlserver:\/\//i, '').split(';').map((part) => part.split('=')).find(([key]) => ['database', 'initial catalog'].includes(String(key).trim().toLowerCase()))?.[1]?.replace(/^\{|\}$/g, '') ?? '';
}
const testUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const safe = /_(test|ci)$/i.test(databaseName(testUrl));
if (testUrl && !safe) throw new Error(`[P09 E2E SAFETY] Refusing ${databaseName(testUrl) || '<missing>'}`);
if (safe) { process.env.DATABASE_URL = testUrl; process.env.NODE_ENV = 'test'; }
const describeRealDatabase = safe ? describe : describe.skip;

describeRealDatabase('Phase 7 master data/configuration/import (real SQL Server e2e)', () => {
    let prisma: PrismaService;
    let service: MasterDataConfigurationService;
    let documents: DocumentControlService;
    const run = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const adminId = randomUUID();
    const ids = { customer: randomUUID(), application: randomUUID(), project: randomUUID(), plan: randomUUID(), report: randomUUID(), review: randomUUID(), series: randomUUID(), certificate: randomUUID() };
    const schemeCode = `P7${run}`;
    const importedCode = `I7${run}`;
    let schemeId = '';
    let standardId = '';
    const configIds: string[] = [];
    const numberingIds: string[] = [];
    const numberingPrefixes: string[] = [];
    const importIds: string[] = [];

    async function assertTestDatabase() {
        const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        if (!/_(test|ci)$/i.test(rows[0]?.database_name ?? '')) throw new Error('[P09 E2E SAFETY] Cleanup refused');
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect(); await assertTestDatabase();
        service = new MasterDataConfigurationService(prisma, new SecurityAuditService(prisma));
        documents = new DocumentControlService(prisma, {} as any);
        await prisma.users.create({ data: { id: adminId, username: `p7_${run}`, email: `p7_${run}@example.test`, password_hash: 'P7_NOT_A_LOGIN_SECRET', full_name: 'P7 Admin' } });
    });

    afterAll(async () => {
        await assertTestDatabase();
        await prisma.import_job_rows.deleteMany({ where: { job_id: { in: importIds } } });
        await prisma.import_jobs.deleteMany({ where: { id: { in: importIds } } });
        if (configIds.length) await prisma.scheme_configuration_versions.deleteMany({ where: { id: { in: configIds } } });
        if (numberingIds.length) await prisma.numbering_series_configs.deleteMany({ where: { id: { in: numberingIds } } });
        await prisma.certificates.deleteMany({ where: { id: ids.certificate } });
        await prisma.certificate_series.deleteMany({ where: { id: ids.series } });
        await prisma.technical_reviews.deleteMany({ where: { id: ids.review } });
        await prisma.reports.deleteMany({ where: { id: ids.report } });
        await prisma.audit_plans.deleteMany({ where: { id: ids.plan } });
        await prisma.certification_projects.deleteMany({ where: { id: ids.project } });
        await prisma.certification_applications.deleteMany({ where: { id: ids.application } });
        await prisma.customers.deleteMany({ where: { id: ids.customer } });
        if (standardId) await prisma.standard_editions.deleteMany({ where: { id: standardId } });
        await prisma.certification_schemes.deleteMany({ where: { code: { in: [schemeCode, importedCode] } } });
        await prisma.controlled_number_sequences.deleteMany({ where: { series_key: { in: numberingPrefixes } } });
        await prisma.audit_logs.deleteMany({ where: { user_id: adminId } });
        await prisma.users.deleteMany({ where: { id: adminId } });
        await prisma.$disconnect();
    }, 180_000);

    it('manages unique scheme/standard editions and preserves exact certificate snapshot after master edit', async () => {
        const scheme = await service.createScheme({ code: schemeCode, name: 'Phase 7 Scheme' }, adminId);
        schemeId = scheme.id;
        await expect(service.createScheme({ code: schemeCode, name: 'Duplicate' }, adminId)).rejects.toBeInstanceOf(ConflictException);
        const standard = await service.createStandard({
            scheme_id: scheme.id, standard_code: `STD-${run}`, standard_name: 'Original Standard Name', edition: '2026', effective_from: '2026-01-01',
        }, adminId);
        standardId = standard.id;
        await prisma.customers.create({ data: { id: ids.customer, customer_code: `C7${run}`, company_name: 'P7 Customer' } });
        await prisma.certification_applications.create({ data: { id: ids.application, customer_id: ids.customer, application_code: `APP-P7-${run}`, application_date: new Date('2026-01-01'), standard_name: 'Original Standard Name:2026', certification_scope: 'Manufacturing', declaration_accepted: true } });
        await prisma.certification_projects.create({ data: { id: ids.project, application_id: ids.application, project_code: `PRJ-P7-${run}`, standard_name: 'Original Standard Name:2026' } });
        await prisma.audit_plans.create({ data: { id: ids.plan, project_id: ids.project, plan_code: `PLAN-P7-${run}` } });
        await prisma.reports.create({ data: { id: ids.report, audit_plan_id: ids.plan, report_code: `RPT-P7-${run}` } });
        await prisma.technical_reviews.create({ data: { id: ids.review, report_id: ids.report, reviewer_id: adminId } });
        await prisma.certificate_series.create({ data: { id: ids.series, project_id: ids.project, series_code: `SER-P7-${run}` } });
        await prisma.certificates.create({ data: { id: ids.certificate, technical_review_id: ids.review, certificate_series_id: ids.series, version_no: 1, cert_number: `CERT-P7-${run}`, organization_name: 'P7 Customer', standard_name: 'Original Standard Name:2026', certification_scope: 'Manufacturing' } });
        await service.updateStandard(standard.id, { standard_name: 'Renamed Current Master' }, adminId);
        expect((await prisma.certificates.findUniqueOrThrow({ where: { id: ids.certificate } })).standard_name).toBe('Original Standard Name:2026');
    });

    it('resolves effective scheme config by date and keeps future revision out of current resolution', async () => {
        const baseInput = { scheme_id: schemeId, cycle_duration_months: 36, surveillance_frequency_months: 12, stage1_applicable: true, validity_duration_months: 36, renewal_window_days: 90, reminder_lead_days: 60, required_audit_types: ['INITIAL_STAGE_1', 'INITIAL_STAGE_2', 'SURVEILLANCE'], required_decision_types: ['GRANT', 'MAINTAIN'] };
        const v1 = await service.createConfiguration({ ...baseInput, version_no: 1, effective_from: '2026-01-01', effective_to: '2026-12-31' }, adminId);
        const v2 = await service.createConfiguration({ ...baseInput, version_no: 2, effective_from: '2027-01-01', reminder_lead_days: 75 }, adminId);
        configIds.push(v1.id, v2.id);
        expect((await service.resolveConfiguration(schemeCode, '2026-08-24')).version_no).toBe(1);
        expect((await service.resolveConfiguration(schemeCode, '2027-01-01')).version_no).toBe(2);
    });

    it('keeps prefix-year sequence authority atomic across schedule and cancellation', async () => {
        const prefix = `PX${run}`;
        const today = numberingBusinessDate();
        const tomorrow = new Date(today.getTime() + 86_400_000);
        const effectiveFrom = new Date(today.getTime() - (30 * 86_400_000)).toISOString().slice(0, 10);
        const tomorrowText = tomorrow.toISOString().slice(0, 10);
        const year = numberingBusinessYear();
        numberingPrefixes.push(prefix);

        const row = await service.createNumberingSeries({ entity_type: 'COMPLAINT', prefix, padding: 5, effective_from: effectiveFrom }, adminId);
        numberingIds.push(row.id);
        const allocated = await Promise.all(Array.from({ length: 10 }, () =>
            prisma.$transaction(
                (tx) => documents.allocateControlledNumber(tx, 'CMP', year, 'COMPLAINT'),
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            ),
        ));
        expect(new Set(allocated).size).toBe(10);
        expect(allocated.sort()).toEqual(Array.from({ length: 10 }, (_, index) =>
            `${prefix}-${year}-${String(index + 1).padStart(5, '0')}`));

        const counterBeforeLifecycle = await prisma.controlled_number_sequences.findUniqueOrThrow({
            where: { series_key_year_no: { series_key: prefix, year_no: year } },
        });
        const replacement = await service.replaceNumberingSeries(row.id, {
            prefix,
            padding: 6,
            effective_from: tomorrowText,
            reason: 'Verify safe future lifecycle without resetting the counter',
        }, adminId);
        numberingIds.push(replacement.rule.id);
        expect((await service.resolveNumbering('COMPLAINT', today)).id).toBe(row.id);
        expect((await service.resolveNumbering('COMPLAINT', tomorrow)).id).toBe(replacement.rule.id);

        await service.cancelScheduledNumberingSeries(replacement.rule.id, {
            reason: 'Verify cancellation restores the prior current rule',
        }, adminId);
        expect((await service.resolveNumbering('COMPLAINT', tomorrow)).id).toBe(row.id);
        const counterAfterLifecycle = await prisma.controlled_number_sequences.findUniqueOrThrow({
            where: { series_key_year_no: { series_key: prefix, year_no: year } },
        });
        expect(counterAfterLifecycle.next_value).toBe(counterBeforeLifecycle.next_value);
        const next = await prisma.$transaction(
            (tx) => documents.allocateControlledNumber(tx, 'CMP', year, 'COMPLAINT'),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        expect(next).toBe(`${prefix}-${year}-00011`);
        expect(allocated[0]).toMatch(new RegExp(`^${prefix}-${year}-`));
    });

    it('validates without master writes, commits once, retains history and blocks repeat commit', async () => {
        const file = { originalname: 'schemes.csv', size: 80, buffer: Buffer.from(`code,name,description,effective_from,effective_to\n${importedCode},Imported Scheme,,,`, 'utf8') } as Express.Multer.File;
        const preview = await service.validateImport('SCHEME', 'CREATE_ONLY', file, adminId);
        importIds.push(preview.id);
        expect(await prisma.certification_schemes.findUnique({ where: { code: importedCode } })).toBeNull();
        expect(preview.valid_rows).toBe(1); expect(preview.invalid_rows).toBe(0);
        await service.commitImport(preview.id, adminId);
        expect((await prisma.certification_schemes.findUniqueOrThrow({ where: { code: importedCode } })).name).toBe('Imported Scheme');
        await expect(service.commitImport(preview.id, adminId)).rejects.toBeInstanceOf(ConflictException);
        expect((await service.getImportJob(preview.id)).committed_rows).toBe(1);
    });
});
