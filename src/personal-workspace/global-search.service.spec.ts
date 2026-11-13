import { BadRequestException } from '@nestjs/common';
import { GlobalSearchService, parseGlobalSearchQuery } from './global-search.service';

describe('GlobalSearchService P09 scoped search', () => {
    const prisma = {
        customers: { count: jest.fn(), findMany: jest.fn() },
        certification_applications: { count: jest.fn(), findMany: jest.fn() },
        certification_projects: { count: jest.fn(), findMany: jest.fn() },
        certificates: { count: jest.fn(), findMany: jest.fn() },
    };
    const resources = { getAccessibleProjectIds: jest.fn() };
    const workItems = { getMyWork: jest.fn() };
    const service = new GlobalSearchService(prisma as never, resources as never, workItems as never);

    beforeEach(() => {
        jest.clearAllMocks();
        for (const category of Object.values(prisma)) {
            category.count.mockResolvedValue(0);
            category.findMany.mockResolvedValue([]);
        }
        resources.getAccessibleProjectIds.mockResolvedValue(null);
        workItems.getMyWork.mockResolvedValue({ items: [], pagination: { total: 0 } });
    });

    it('validates query length, categories and bounded page/limit', () => {
        for (const query of [
            { q: 'a' }, { q: 'a'.repeat(101) }, { q: 'ok', type: 'secrets' },
            { q: 'ok', page: '2' }, { q: 'ok', type: 'project', page: '-3' },
            { q: 'ok', limit: '500' }, { q: 'ok', limit: 'NaN' },
        ]) expect(() => parseGlobalSearchQuery(query)).toThrow(BadRequestException);
    });

    it('returns only a scope-filtered project page with matching count, never client-side ACL', async () => {
        resources.getAccessibleProjectIds.mockResolvedValue(new Set(['allowed-1']));
        prisma.certification_projects.count.mockResolvedValue(1);
        prisma.certification_projects.findMany.mockResolvedValue([{
            id: 'allowed-1', project_code: 'PROJECT-3000', standard_name: 'ISO 9001',
            certification_applications: { customers: { company_name: 'Đông Á' } },
        }]);
        const response = await service.search({
            userId: 'auditor-1', roles: ['AUDITOR'], permissions: ['projects.read'],
        }, { q: 'PROJECT', type: 'project', page: '2', limit: '1' });
        expect(response.pagination.total).toBe(1);
        expect(response.items[0].entity_id).toBe('allowed-1');
        expect(prisma.certification_projects.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ AND: expect.arrayContaining([{ id: { in: ['allowed-1'] } }]) }),
            skip: 1, take: 1,
        }));
    });

    it('does not query unauthorized resources even if role appears eligible', async () => {
        const result = await service.search({
            userId: 'reviewer-1', roles: ['TECHNICAL_REVIEWER'], permissions: ['projects.read'],
        }, { q: 'SECRET', type: 'all' });
        expect(result.items).toEqual([]);
        expect(prisma.customers.findMany).not.toHaveBeenCalled();
        expect(prisma.certificates.findMany).not.toHaveBeenCalled();
        expect(prisma.certification_applications.findMany).not.toHaveBeenCalled();
        expect(prisma.certification_projects.findMany).toHaveBeenCalled();
    });

    it('customer records are filtered through related accessible project ids', async () => {
        resources.getAccessibleProjectIds.mockResolvedValue(new Set(['project-3']));
        await service.search({
            userId: 'lead-1', roles: ['LEAD_AUDITOR'], permissions: ['customers.read'],
        }, { q: 'CONG TY', type: 'customer' });
        expect(prisma.customers.count).toHaveBeenCalledWith({
            where: { AND: [
                { OR: [
                    { customer_code: { contains: 'CONG TY' } },
                    { company_name: { contains: 'CONG TY' } },
                    { tax_code: { contains: 'CONG TY' } },
                ] },
                { certification_applications: { some: { certification_projects: { some: { id: { in: ['project-3'] } } } } } },
            ] },
        });
    });

    it('searches work through the canonical server-side ACL and SoD projection', async () => {
        workItems.getMyWork.mockResolvedValue({
            items: [{ id: 'task-1', title: 'F.11', project_code: 'P', project_id: 'p1',
                status: 'DONE', entity_id: 'r1', destination_path: null }],
            pagination: { total: 1 },
        });
        const response = await service.search({
            userId: 'u1', roles: ['AUDITOR'], permissions: [],
        }, { q: 'F.11', type: 'work', page: '1', limit: '20' });
        expect(workItems.getMyWork).toHaveBeenCalledWith(
            { userId: 'u1', roles: ['AUDITOR'] },
            { search: 'F.11', status: 'ALL', page: '1', limit: '20' },
        );
        expect(response.items[0].type).toBe('work');
        expect(prisma.customers.findMany).not.toHaveBeenCalled();
    });
});
