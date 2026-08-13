import { BadRequestException } from '@nestjs/common';

import { CustomersService } from './customers.service';

function createHarness() {
    const prisma = {
        customers: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(async ({ data }: any) => ({ id: 'customer-1', ...data })),
            update: jest.fn(async ({ data }: any) => ({ id: 'customer-1', ...data })),
        },
    };
    const service = new CustomersService(prisma as any);
    return { prisma, service };
}

describe('CustomersService country-aware Tax ID', () => {
    it('defaults country to VN and normalizes a 10-digit Vietnamese tax code', async () => {
        const { prisma, service } = createHarness();
        prisma.customers.findUnique.mockResolvedValue(null);
        await service.create({
            customer_code: 'C001',
            company_name: 'Example Vietnam',
            tax_code: '0101234567',
        });
        expect(prisma.customers.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                country_code: 'VN',
                tax_code: '0101234567',
            }),
        });
    });

    it('accepts Vietnamese branch notation and stores digits-only 13 characters', async () => {
        const { prisma, service } = createHarness();
        prisma.customers.findUnique.mockResolvedValue(null);
        await service.create({
            customer_code: 'C002',
            company_name: 'Example Branch',
            country_code: 'vn',
            tax_code: '0101234567-001',
        });
        expect(prisma.customers.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                country_code: 'VN',
                tax_code: '0101234567001',
            }),
        });
    });

    it('rejects a Vietnamese tax code that is not 10 or 13 digits after normalization', async () => {
        const { service } = createHarness();
        await expect(service.create({
            customer_code: 'C003',
            company_name: 'Invalid Vietnam',
            country_code: 'VN',
            tax_code: 'VN-ABC-123',
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps a foreign Tax ID free-form and does not apply the Vietnam regex', async () => {
        const { prisma, service } = createHarness();
        prisma.customers.findUnique.mockResolvedValue(null);
        await service.create({
            customer_code: 'C004',
            company_name: 'Example Indonesia',
            country_code: 'id',
            tax_code: 'NPWP-12.345/ABC',
        });
        expect(prisma.customers.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                country_code: 'ID',
                tax_code: 'NPWP-12.345/ABC',
            }),
        });
    });

    it('allows a customer without Tax ID and skips duplicate Tax ID lookup', async () => {
        const { prisma, service } = createHarness();
        prisma.customers.findUnique.mockResolvedValue(null);
        await service.create({
            customer_code: 'C005',
            company_name: 'Example No Tax ID',
            country_code: 'VN',
        });
        expect(prisma.customers.findFirst).not.toHaveBeenCalled();
        expect(prisma.customers.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                country_code: 'VN',
                tax_code: null,
            }),
        });
    });

    it('stores a free-text country name when country code OT is used', async () => {
        const { prisma, service } = createHarness();
        prisma.customers.findUnique.mockResolvedValue(null);
        await service.create({
            customer_code: 'C006',
            company_name: 'Example Other Country',
            country_code: 'OT',
            country_name: 'Lào',
            tax_code: 'TAX-LAO-001',
        });
        expect(prisma.customers.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                country_code: 'OT',
                country_name: 'Lào',
                tax_code: 'TAX-LAO-001',
            }),
        });
    });

    it('requires a country name when country code OT is used', async () => {
        const { service } = createHarness();
        await expect(service.create({
            customer_code: 'C007',
            company_name: 'Missing Other Country Name',
            country_code: 'OT',
        })).rejects.toBeInstanceOf(BadRequestException);
    });

});
