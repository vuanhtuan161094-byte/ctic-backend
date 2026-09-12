import { CertificationApplicationsService } from './certification-applications.service';

describe('CertificationApplicationsService application code', () => {
    const baseDto = {
        customer_id: '11111111-1111-1111-1111-111111111111',
        application_date: '2026-08-13',
        standard_name: 'ISO 9001:2015',
        certification_scope: 'Sản xuất sản phẩm nhựa',
        employee_count: 10,
        declaration_accepted: true,
        sites: [{
            site_no: 1,
            site_name: 'Trụ sở chính',
            address: 'Hải Phòng',
            activities: 'Sản xuất sản phẩm nhựa',
            employee_count: 10,
            is_headquarters: true,
        }],
    } as any;

    it('allocates APP-YYYY-NNNN in the backend and ignores a stale client code', async () => {
        const create = jest.fn().mockImplementation(async ({ data }) => ({
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            ...data,
        }));
        const tx = {
            certification_applications: {
                findMany: jest.fn().mockResolvedValue([
                    { application_code: 'APP-2026-0012' },
                    { application_code: 'APP-2026-0009' },
                ]),
                create,
            },
        };
        const prisma = {
            standard_editions: {
                findMany: jest.fn().mockResolvedValue([
                    { standard_code: 'ISO 9001', edition: '2015' },
                ]),
            },
            customers: {
                findUnique: jest.fn().mockResolvedValue({
                    id: baseDto.customer_id,
                    status: 'active',
                    address: 'Hải Phòng',
                }),
            },
            $transaction: jest.fn(async (callback: any) => callback(tx)),
        } as any;

        const service = new CertificationApplicationsService(prisma);
        const result = await service.create({
            ...baseDto,
            application_code: 'APP-2026-0001',
        });

        expect(result.application_code).toBe('APP-2026-0013');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ application_code: 'APP-2026-0013' }),
        }));
    });

    it('uses the application date year for the sequence prefix', async () => {
        const tx = {
            certification_applications: {
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn().mockImplementation(async ({ data }) => data),
            },
        };
        const prisma = {
            standard_editions: {
                findMany: jest.fn().mockResolvedValue([
                    { standard_code: 'ISO 9001', edition: '2015' },
                ]),
            },
            customers: {
                findUnique: jest.fn().mockResolvedValue({
                    id: baseDto.customer_id,
                    status: 'active',
                    address: 'Hải Phòng',
                }),
            },
            $transaction: jest.fn(async (callback: any) => callback(tx)),
        } as any;

        const service = new CertificationApplicationsService(prisma);
        const result = await service.create({
            ...baseDto,
            application_date: '2027-01-02',
        });

        expect(result.application_code).toBe('APP-2027-0001');
    });
});
