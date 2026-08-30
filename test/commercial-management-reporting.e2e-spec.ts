import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CommercialManagementReportingService } from '../src/commercial-management-reporting/commercial-management-reporting.service';
import { ContractsService } from '../src/contracts/contracts.service';
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

describeRealDatabase('Phase 8 commercial and management reporting (real SQL Server e2e)', () => {
    let prisma: PrismaService;
    let service: CommercialManagementReportingService;
    let contracts: ContractsService;
    const run = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const ids = { actor: randomUUID(), customer: randomUUID(), application: randomUUID(), review: randomUUID(), project: randomUUID(), scheme: randomUUID(), standard: randomUUID() };
    const quoteIds: string[] = [];
    const contractIds: string[] = [];
    const billingIds: string[] = [];
    let acceptedQuoteId = '';
    let contractId = '';
    let certificateCountBefore = 0;

    async function assertTestDatabase() {
        const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        if (!/_(test|ci)$/i.test(rows[0]?.database_name ?? '')) throw new Error('[P09 E2E SAFETY] Cleanup refused');
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect(); await assertTestDatabase();
        service = new CommercialManagementReportingService(prisma, new SecurityAuditService(prisma));
        contracts = new ContractsService(prisma);
        await prisma.users.create({ data: { id: ids.actor, username: `p8_${run}`, email: `p8_${run}@example.test`, password_hash: 'P8_NOT_A_LOGIN_SECRET', full_name: 'P8 Commercial Manager' } });
        await prisma.customers.create({ data: { id: ids.customer, customer_code: `C8${run}`, company_name: 'P8 Customer' } });
        await prisma.certification_schemes.create({ data: { id: ids.scheme, code: `P8${run}`, name: 'P8 Scheme', status: 'ACTIVE', created_by: ids.actor } });
        await prisma.standard_editions.create({ data: { id: ids.standard, scheme_id: ids.scheme, standard_code: `STD8${run}`, standard_name: 'P8 Standard', edition: '2026', effective_from: new Date('2026-01-01'), status: 'ACTIVE', created_by: ids.actor } });
        await prisma.certification_applications.create({ data: { id: ids.application, customer_id: ids.customer, application_code: `APP-P8-${run}`, application_date: new Date('2026-08-24'), standard_name: `P8 Standard STD8${run}`, certification_scope: 'Manufacturing', declaration_accepted: true, status: 'accepted' } });
        await prisma.application_reviews.create({ data: { id: ids.review, application_id: ids.application, result: 'accepted', workflow_status: 'APPROVED', final_mandays: '7.50', approved_at: new Date('2026-08-24') } });
        await prisma.certification_projects.create({ data: { id: ids.project, application_id: ids.application, project_code: `PRJ-P8-${run}`, standard_name: `P8 Standard STD8${run}`, status: 'active' } });
        await prisma.work_items.create({ data: { source_key: `P8:${run}:OVERDUE`, work_type: 'APPLICATION_REVIEW', action_code: 'application.review', title: 'P8 overdue authority', entity_type: 'application', entity_id: ids.application, project_id: ids.project, assigned_role: 'COORDINATOR', status: 'OPEN', due_at: new Date('2026-08-01') } });
        certificateCountBefore = await prisma.certificates.count();
    });

    afterAll(async () => {
        await assertTestDatabase();
        await prisma.billing_milestone_actions.deleteMany({ where: { billing_milestone_id: { in: billingIds } } });
        await prisma.billing_milestones.deleteMany({ where: { id: { in: billingIds } } });
        await prisma.contracts.deleteMany({ where: { id: { in: contractIds } } });
        await prisma.quotation_line_items.deleteMany({ where: { quotation_id: { in: quoteIds } } });
        for (const id of [...quoteIds].reverse()) await prisma.quotations.deleteMany({ where: { id } });
        await prisma.work_items.deleteMany({ where: { source_key: `P8:${run}:OVERDUE` } });
        await prisma.certification_projects.deleteMany({ where: { id: ids.project } });
        await prisma.application_reviews.deleteMany({ where: { id: ids.review } });
        await prisma.certification_applications.deleteMany({ where: { id: ids.application } });
        await prisma.standard_editions.deleteMany({ where: { id: ids.standard } });
        await prisma.certification_schemes.deleteMany({ where: { id: ids.scheme } });
        await prisma.customers.deleteMany({ where: { id: ids.customer } });
        await prisma.audit_logs.deleteMany({ where: { user_id: ids.actor } });
        await prisma.users.deleteMany({ where: { id: ids.actor } });
        await prisma.$disconnect();
    }, 180_000);

    it('controls quotation lifecycle, Decimal totals and approved technical manday snapshot', async () => {
        const quote = await service.createQuotation({
            quotation_number: `QT-P8-${run}`, customer_id: ids.customer, application_id: ids.application,
            project_id: ids.project, scheme_id: ids.scheme, quotation_date: '2026-08-24', validity_date: '2026-09-24', currency: 'VND',
            discount_amount: '0.1000', tax_amount: '0.0500',
            lines: [{ description: 'Certification package', quantity: '2.5000', unit_price: '100.1000' }],
        }, ids.actor);
        acceptedQuoteId = quote.id; quoteIds.push(quote.id);
        expect(quote.technical_approved_mandays?.toString()).toBe('7.5');
        expect(quote.total_amount.toFixed(4)).toBe('250.2000');
        await service.transitionQuotation(quote.id, 'SUBMIT_REVIEW', ids.actor);
        await service.transitionQuotation(quote.id, 'APPROVE', ids.actor);
        await service.transitionQuotation(quote.id, 'SEND', ids.actor);
        const accepted = await service.transitionQuotation(quote.id, 'ACCEPT', ids.actor);
        expect(accepted.status).toBe('ACCEPTED');
        await expect(service.updateQuotation(quote.id, { commercial_notes: 'silent overwrite' }, ids.actor)).rejects.toBeInstanceOf(ConflictException);
        const revision = await service.reviseQuotation(quote.id, ids.actor);
        quoteIds.push(revision.id);
        expect(revision.version_no).toBe(2);
        expect((await prisma.quotations.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('ACCEPTED');
    });

    it('links contract only to accepted quotation and keeps technical mandays outside contract authority', async () => {
        const contract = await contracts.create({
            customer_id: ids.customer, contract_number: `CTR-P8-${run}`, quotation_id: acceptedQuoteId,
            sign_date: '2026-08-24', start_date: '2026-08-24', end_date: '2029-08-23', payment_terms: '30 days',
        });
        contractId = contract.id; contractIds.push(contract.id);
        expect(contract.total_value?.toFixed(4)).toBe('250.2000');
        expect(contract.currency).toBe('VND');
        const stored = await prisma.contracts.findUniqueOrThrow({ where: { id: contract.id } });
        expect(stored.quotation_id).toBe(acceptedQuoteId);
        expect(Object.prototype.hasOwnProperty.call(stored, 'technical_approved_mandays')).toBe(false);
    });

    it('tracks invoice/payment metadata without mutating certificate lifecycle', async () => {
        const milestone = await service.createBillingMilestone({
            contract_id: contractId, project_id: ids.project, milestone_type: 'STAGE_1', milestone_name: 'Stage 1',
            planned_amount: '250.2000', currency: 'VND', planned_date: '2026-08-30',
        }, ids.actor);
        billingIds.push(milestone.id);
        const partial = await service.updateBillingMilestone(milestone.id, {
            invoice_reference: `INV-P8-${run}`, invoice_date: '2026-08-24', paid_amount: '100.1000', paid_date: '2026-08-24',
        }, ids.actor);
        expect(partial.status).toBe('PARTIALLY_PAID');
        const paid = await service.updateBillingMilestone(milestone.id, { paid_amount: '250.2000', paid_date: '2026-08-25' }, ids.actor);
        expect(paid.status).toBe('PAID');
        expect(await prisma.certificates.count()).toBe(certificateCountBefore);
        expect(await prisma.billing_milestone_actions.count({ where: { billing_milestone_id: milestone.id } })).toBe(3);
    });

    it('uses Phase 7 scheme filters, Work Item overdue authority, separate currencies and identical export filters', async () => {
        const usd = await service.createQuotation({
            quotation_number: `QT-USD-P8-${run}`, customer_id: ids.customer, application_id: ids.application,
            project_id: ids.project, scheme_id: ids.scheme, quotation_date: '2026-08-24', currency: 'USD',
            lines: [{ description: 'Open USD proposal', quantity: '1', unit_price: '123.4500' }],
        }, ids.actor);
        quoteIds.push(usd.id);
        await service.transitionQuotation(usd.id, 'SUBMIT_REVIEW', ids.actor);
        await service.transitionQuotation(usd.id, 'APPROVE', ids.actor);
        await service.transitionQuotation(usd.id, 'SEND', ids.actor);

        const query = { preset: 'CUSTOM', from: '2026-08-01', to: '2026-08-31', scheme_id: ids.scheme, customer_id: ids.customer };
        const cockpit = await service.getCockpit(query, ['ADMIN']);
        expect(cockpit.filter_context.scheme?.id).toBe(ids.scheme);
        expect(cockpit.executive.find((metric) => metric.key === 'overdue_work_items')?.value).toBe(1);
        expect(cockpit.commercial.by_currency.map((row) => row.currency).sort()).toEqual(['USD', 'VND']);
        expect(cockpit.commercial.mixed_currency_total).toBeNull();
        expect(cockpit.resource.utilization_percentage).toBeNull();
        const csv = await service.exportCockpitCsv(query, ['ADMIN'], ids.actor);
        expect(csv).toContain('USD'); expect(csv).toContain('VND'); expect(csv).toContain('overdue_work_items');
    });
});
