import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CommercialManagementReportingService, resolveReportingPeriod } from './commercial-management-reporting.service';

function harness() {
    const quotations = {
        findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
        create: jest.fn(), update: jest.fn(),
    };
    const billing = { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() };
    const prisma: any = {
        quotations,
        quotation_line_items: { deleteMany: jest.fn(), createMany: jest.fn() },
        billing_milestones: billing,
        billing_milestone_actions: { create: jest.fn() },
        customers: { findUnique: jest.fn() },
        certification_applications: { findUnique: jest.fn() },
        certification_projects: { findUnique: jest.fn() },
        certification_schemes: { findUnique: jest.fn() },
        application_reviews: { findFirst: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return { prisma, audit, service: new CommercialManagementReportingService(prisma, audit as any) };
}

const dto = {
    quotation_number: 'QT-2026-0001', customer_id: '10000000-0000-4000-8000-000000000001',
    application_id: '10000000-0000-4000-8000-000000000002', quotation_date: '2026-08-24',
    currency: 'vnd', discount_amount: '10.1250', tax_amount: '5.1250',
    lines: [{ description: 'Certification service', quantity: '2.5000', unit_price: '100.1000' }],
};

describe('CommercialManagementReportingService', () => {
    it('resolves timezone-aware custom date boundaries without including the following local day', () => {
        const period = resolveReportingPeriod({ preset: 'CUSTOM', from: '2026-08-01', to: '2026-08-31' }, 'Asia/Ho_Chi_Minh');
        expect(period.from.toISOString()).toBe('2026-07-31T17:00:00.000Z');
        expect(period.toExclusive.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    });

    it('rejects reversed custom range instead of guessing dates', () => {
        expect(() => resolveReportingPeriod({ preset: 'CUSTOM', from: '2026-08-31', to: '2026-08-01' }, 'Asia/Ho_Chi_Minh'))
            .toThrow(BadRequestException);
    });

    it('uses approved Application Review mandays as a read-only quotation snapshot and Decimal arithmetic', async () => {
        const { service, prisma } = harness();
        prisma.quotations.findFirst.mockResolvedValue(null);
        prisma.customers.findUnique.mockResolvedValue({ id: dto.customer_id, status: 'active' });
        prisma.certification_applications.findUnique.mockResolvedValue({ id: dto.application_id, customer_id: dto.customer_id });
        prisma.application_reviews.findFirst.mockResolvedValue({ final_mandays: new Prisma.Decimal('7.50') });
        prisma.quotations.create.mockImplementation(({ data }: any) => ({ id: 'quote-1', status: 'DRAFT', ...data }));
        const row: any = await service.createQuotation(dto, 'actor-1');
        expect(row.technical_approved_mandays.toString()).toBe('7.5');
        expect(row.subtotal_amount.toString()).toBe('250.25');
        expect(row.total_amount.toString()).toBe('245.25');
        expect(prisma.application_reviews.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ workflow_status: 'APPROVED' }),
        }));
    });

    it('blocks direct overwrite after quotation leaves DRAFT', async () => {
        const { service, prisma } = harness();
        prisma.quotations.findUnique.mockResolvedValue({ id: 'quote-1', status: 'ACCEPTED', lines: [] });
        await expect(service.updateQuotation('quote-1', { commercial_notes: 'overwrite' }, 'actor'))
            .rejects.toBeInstanceOf(ConflictException);
        expect(prisma.quotations.update).not.toHaveBeenCalled();
    });

    it('enforces the controlled quotation lifecycle', async () => {
        const { service, prisma } = harness();
        prisma.quotations.findUnique.mockResolvedValue({ id: 'quote-1', status: 'DRAFT', lines: [] });
        prisma.quotations.update.mockImplementation(({ data }: any) => ({ id: 'quote-1', ...data }));
        expect((await service.transitionQuotation('quote-1', 'SUBMIT_REVIEW', 'actor')).status).toBe('UNDER_REVIEW');
        await expect(service.transitionQuotation('quote-1', 'ACCEPT', 'actor')).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a revision from the final snapshot instead of rewriting accepted history', async () => {
        const { service, prisma } = harness();
        const current = {
            id: 'quote-1', quotation_number: 'QT-1', version_no: 1, status: 'ACCEPTED', customer_id: dto.customer_id,
            application_id: null, project_id: null, scheme_id: null, validity_date: null, currency: 'VND',
            technical_approved_mandays: null, subtotal_amount: new Prisma.Decimal(100), discount_amount: new Prisma.Decimal(0),
            tax_amount: new Prisma.Decimal(0), total_amount: new Prisma.Decimal(100), commercial_notes: null,
            lines: [{ line_no: 1, description: 'Line', quantity: new Prisma.Decimal(1), unit_price: new Prisma.Decimal(100), line_total: new Prisma.Decimal(100) }],
        };
        prisma.quotations.findUnique.mockResolvedValue(current);
        prisma.quotations.findFirst.mockResolvedValue(current);
        prisma.quotations.create.mockImplementation(({ data }: any) => ({ id: 'quote-2', ...data }));
        const revised: any = await service.reviseQuotation('quote-1', 'actor');
        expect(revised.version_no).toBe(2);
        expect(revised.previous_version_id).toBe('quote-1');
        expect(prisma.quotations.update).not.toHaveBeenCalled();
    });

    it('derives billing status from invoice and exact Decimal paid amount', async () => {
        const { service, prisma } = harness();
        prisma.billing_milestones.findUnique.mockResolvedValue({
            id: 'bill-1', planned_amount: new Prisma.Decimal('100.1000'), paid_amount: new Prisma.Decimal(0),
            currency: 'VND', status: 'PLANNED', invoice_reference: null, invoice_date: null, paid_date: null,
        });
        prisma.billing_milestones.update.mockImplementation(({ data }: any) => ({ id: 'bill-1', ...data }));
        const row: any = await service.updateBillingMilestone('bill-1', {
            invoice_reference: 'INV-1', invoice_date: '2026-08-24', paid_amount: '100.1000', paid_date: '2026-08-24',
        }, 'actor');
        expect(row.status).toBe('PAID');
        expect(row.paid_amount.toString()).toBe('100.1');
        expect(prisma.billing_milestone_actions.create).toHaveBeenCalled();
        expect((prisma as any).certificates).toBeUndefined();
    });

    it('blocks overpayment and requires invoice metadata for collection', async () => {
        const { service, prisma } = harness();
        prisma.billing_milestones.findUnique.mockResolvedValue({
            id: 'bill-1', planned_amount: new Prisma.Decimal(100), paid_amount: new Prisma.Decimal(0),
            currency: 'VND', status: 'PLANNED', invoice_reference: null, invoice_date: null, paid_date: null,
        });
        await expect(service.updateBillingMilestone('bill-1', { paid_amount: '101' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateBillingMilestone('bill-1', { paid_amount: '50' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    });
});
