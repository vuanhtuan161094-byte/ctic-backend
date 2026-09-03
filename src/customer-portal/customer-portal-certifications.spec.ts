import { CustomerPortalService } from './customer-portal.service';

describe('CustomerPortalService certification case projection', () => {
    it('limits the query to active customer mappings resolved by ResourceAccessService', async () => {
        const findMany = jest.fn().mockResolvedValue([]);
        const prisma = {
            certification_projects: {
                findMany,
            },
        };
        const resourceAccess = {
            getAccessibleCustomerIds: jest
                .fn()
                .mockResolvedValue(
                    new Set([
                        'customer-a',
                        'customer-b',
                    ]),
                ),
        };

        const service = new CustomerPortalService(
            prisma as any,
            resourceAccess as any,
            {} as any,
            {} as any,
        );

        await service.getCertificationCases({
            userId: 'customer-user',
            roles: ['CUSTOMER'],
            permissions: ['customer_portal.access'],
        });

        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    certification_applications: {
                        customer_id: {
                            in: [
                                'customer-a',
                                'customer-b',
                            ],
                        },
                    },
                },
            }),
        );
    });

    it('returns a bounded customer-safe case projection without internal workflow fields', async () => {
        const prisma = {
            certification_projects: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'case-1',
                        project_code: 'HS-001',
                        standard_name: 'ISO 9001:2015',
                        status: 'draft',
                        created_at: new Date('2026-09-01T00:00:00.000Z'),
                        updated_at: new Date('2026-09-02T00:00:00.000Z'),
                        certification_applications: {
                            id: 'application-1',
                            application_code: 'APP-001',
                            certification_scope: 'Sản xuất sản phẩm thử nghiệm',
                            customers: {
                                id: 'customer-a',
                                customer_code: 'KH-001',
                                company_name: 'Khách hàng A',
                            },
                        },
                    },
                ]),
            },
        };
        const resourceAccess = {
            getAccessibleCustomerIds: jest
                .fn()
                .mockResolvedValue(
                    new Set(['customer-a']),
                ),
        };

        const service = new CustomerPortalService(
            prisma as any,
            resourceAccess as any,
            {} as any,
            {} as any,
        );

        const result = await service.getCertificationCases({
            userId: 'customer-user',
            roles: ['CUSTOMER'],
            permissions: ['customer_portal.access'],
        });

        expect(result).toEqual([
            {
                id: 'case-1',
                project_code: 'HS-001',
                standard_name: 'ISO 9001:2015',
                status: 'draft',
                certification_scope: 'Sản xuất sản phẩm thử nghiệm',
                application: {
                    id: 'application-1',
                    application_code: 'APP-001',
                },
                customer: {
                    id: 'customer-a',
                    customer_code: 'KH-001',
                    company_name: 'Khách hàng A',
                },
                created_at: new Date('2026-09-01T00:00:00.000Z'),
                updated_at: new Date('2026-09-02T00:00:00.000Z'),
            },
        ]);
        expect(JSON.stringify(result)).not.toMatch(
            /technical_review|independence|decision_maker|audit_log|permission/i,
        );
    });
});
