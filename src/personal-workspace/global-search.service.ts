import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../security/resource-access.service';
import { normalizeRoles } from '../security/security-request';
import { WorkItemsService } from '../work-items/work-items.service';

export type GlobalSearchType = 'all' | 'customer' | 'application' | 'project' | 'certificate' | 'work';
type ResultType = Exclude<GlobalSearchType, 'all'>;
type SearchActor = { userId: string; roles: string[]; permissions: string[] };
export type GlobalSearchQuery = { q?: string; type?: string; page?: string; limit?: string };
export type GlobalSearchResult = {
    key: string; type: ResultType; title: string; description: string;
    entity_id: string; project_id: string | null; destination_path: string | null;
};

export function parseGlobalSearchQuery(query: GlobalSearchQuery) {
    const q = (query.q ?? '').trim();
    const type = (query.type || 'all').trim().toLowerCase();
    const page = Number(query.page ?? '1');
    const limit = Number(query.limit ?? '10');
    if (q.length < 2 || q.length > 100) {
        throw new BadRequestException('Từ khóa tìm kiếm phải có 2–100 ký tự');
    }
    if (!['all', 'customer', 'application', 'project', 'certificate', 'work'].includes(type)) {
        throw new BadRequestException('Nhóm dữ liệu tìm kiếm không hợp lệ');
    }
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
        throw new BadRequestException('Trang tìm kiếm không hợp lệ');
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        throw new BadRequestException('Giới hạn kết quả từ 1 đến 20');
    }
    if (type === 'all' && page !== 1) {
        throw new BadRequestException('Để xem trang tiếp theo, hãy chọn một nhóm dữ liệu');
    }
    return { q, type: type as GlobalSearchType, page, limit };
}

@Injectable()
export class GlobalSearchService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly resources: ResourceAccessService,
        private readonly workItems: WorkItemsService,
    ) {}

    async search(actor: SearchActor, raw: GlobalSearchQuery) {
        const { q, type, page, limit } = parseGlobalSearchQuery(raw);
        const roles = new Set(normalizeRoles(actor.roles));
        const permissions = new Set(actor.permissions.map((p) => p.trim().toLowerCase()));
        const has = (permission: string) => roles.has('ADMIN') || permissions.has(permission);
        const role = (...allowed: string[]) => allowed.some((name) => roles.has(name));
        const abilities: Record<ResultType, boolean> = {
            customer: has('customers.read') && role('ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER', 'DECISION_MAKER'),
            application: has('applications.read') && role('ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'TECHNICAL_REVIEWER'),
            project: has('projects.read') && role('ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'LEAD_AUDITOR', 'AUDITOR', 'TECHNICAL_EXPERT', 'TECHNICAL_REVIEWER', 'DECISION_MAKER'),
            certificate: has('certificates.read') && role('ADMIN', 'STAFF', 'SALES', 'DECISION_MAKER'),
            work: role('ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'LEAD_AUDITOR', 'AUDITOR', 'TECHNICAL_EXPERT', 'TECHNICAL_REVIEWER', 'DECISION_MAKER'),
        };
        const types: ResultType[] = type === 'all'
            ? ['customer', 'application', 'project', 'certificate', 'work']
            : [type];
        const take = type === 'all' ? Math.min(limit, 5) : limit;
        const skip = type === 'all' ? 0 : (page - 1) * limit;
        // The scope query is done before database search so an unauthorized hit
        // cannot affect count, pagination or result metadata.
        const projectIds = types.some((kind) => abilities[kind] && ['customer', 'application', 'project'].includes(kind))
            ? await this.resources.getAccessibleProjectIds({ userId: actor.userId, roles: actor.roles })
            : null;
        const ids = projectIds === null ? null : Array.from(projectIds);
        const selected: Record<ResultType, { total: number; items: GlobalSearchResult[] }> = {
            customer: { total: 0, items: [] },
            application: { total: 0, items: [] },
            project: { total: 0, items: [] },
            certificate: { total: 0, items: [] },
            work: { total: 0, items: [] },
        };
        await Promise.all(types.filter((kind) => abilities[kind]).map(async (kind) => {
            if (kind === 'customer') {
                const where: Prisma.customersWhereInput = {
                    AND: [
                        { OR: [{ customer_code: { contains: q } }, { company_name: { contains: q } }, { tax_code: { contains: q } }] },
                        ...(ids === null ? [] : [{ certification_applications: { some: { certification_projects: { some: { id: { in: ids } } } } } }]),
                    ],
                };
                const [total, rows] = await Promise.all([
                    this.prisma.customers.count({ where }),
                    this.prisma.customers.findMany({
                        where, orderBy: [{ customer_code: 'asc' }, { id: 'asc' }], skip, take,
                        select: { id: true, customer_code: true, company_name: true },
                    }),
                ]);
                selected.customer = { total, items: rows.map((x) => ({
                    key: `customer:${x.id}`, type: 'customer', title: x.company_name,
                    description: `Khách hàng · ${x.customer_code}`, entity_id: x.id,
                    project_id: null, destination_path: null,
                })) };
            } else if (kind === 'application') {
                const where: Prisma.certification_applicationsWhereInput = {
                    AND: [
                        { OR: [
                            { application_code: { contains: q } }, { standard_name: { contains: q } },
                            { customers: { is: { company_name: { contains: q } } } },
                        ] },
                        ...(ids === null ? [] : [{ certification_projects: { some: { id: { in: ids } } } }]),
                    ],
                };
                const [total, rows] = await Promise.all([
                    this.prisma.certification_applications.count({ where }),
                    this.prisma.certification_applications.findMany({
                        where, orderBy: [{ application_date: 'desc' }, { id: 'asc' }], skip, take,
                        select: { id: true, application_code: true, standard_name: true, customers: { select: { company_name: true } } },
                    }),
                ]);
                selected.application = { total, items: rows.map((x) => ({
                    key: `application:${x.id}`, type: 'application', title: x.application_code,
                    description: `${x.customers.company_name} · ${x.standard_name}`, entity_id: x.id,
                    project_id: null, destination_path: null,
                })) };
            } else if (kind === 'project') {
                const where: Prisma.certification_projectsWhereInput = {
                    AND: [
                        { OR: [
                            { project_code: { contains: q } },
                            { standard_name: { contains: q } },
                            { certification_applications: { is: { application_code: { contains: q } } } },
                            { certification_applications: { is: { customers: { is: { company_name: { contains: q } } } } } },
                        ] },
                        ...(ids === null ? [] : [{ id: { in: ids } }]),
                    ],
                };
                const [total, rows] = await Promise.all([
                    this.prisma.certification_projects.count({ where }),
                    this.prisma.certification_projects.findMany({
                        where, orderBy: [{ created_at: 'desc' }, { id: 'asc' }], skip, take,
                        select: { id: true, project_code: true, standard_name: true, certification_applications: { select: { customers: { select: { company_name: true } } } } },
                    }),
                ]);
                selected.project = { total, items: rows.map((x) => ({
                    key: `project:${x.id}`, type: 'project', title: x.project_code,
                    description: `${x.certification_applications.customers.company_name} · ${x.standard_name || 'Chứng nhận'}`,
                    entity_id: x.id, project_id: x.id,
                    destination_path: `/certifications/${x.id}`,
                })) };
            } else if (kind === 'certificate') {
                const where: Prisma.certificatesWhereInput = {
                    OR: [
                        { cert_number: { contains: q } },
                        { organization_name: { contains: q } },
                        { standard_name: { contains: q } },
                    ],
                };
                const [total, rows] = await Promise.all([
                    this.prisma.certificates.count({ where }),
                    this.prisma.certificates.findMany({
                        where, orderBy: [{ issue_date: 'desc' }, { id: 'asc' }], skip, take,
                        select: { id: true, cert_number: true, organization_name: true, standard_name: true, status: true, certificate_series: { select: { project_id: true } } },
                    }),
                ]);
                selected.certificate = { total, items: rows.map((x) => ({
                    key: `certificate:${x.id}`, type: 'certificate', title: x.cert_number,
                    description: `${x.organization_name} · ${x.standard_name} · ${x.status ?? '—'}`,
                    entity_id: x.id, project_id: x.certificate_series.project_id,
                    destination_path: `/certifications/${x.certificate_series.project_id}/certificates/${x.id}`,
                })) };
            } else {
                const response = await this.workItems.getMyWork(
                    { userId: actor.userId, roles: actor.roles },
                    { search: q, status: 'ALL', page: String(type === 'all' ? 1 : page), limit: String(take) },
                );
                selected.work = {
                    total: response.pagination.total,
                    items: response.items.map((x) => ({
                        key: `work:${x.id}`, type: 'work', title: x.title,
                        description: `${x.project_code ?? 'Công việc'} · ${x.status}`,
                        entity_id: x.entity_id, project_id: x.project_id,
                        destination_path: x.destination_path || (x.project_id ? `/certifications/${x.project_id}` : '/my-work'),
                    })),
                };
            }
        }));
        const items = types.flatMap((kind) => selected[kind].items);
        const total = types.reduce((sum, kind) => sum + selected[kind].total, 0);
        return {
            query: q, type,
            items,
            totals: Object.fromEntries(types.map((kind) => [kind, selected[kind].total])),
            pagination: {
                page, page_size: take, total,
                page_count: type === 'all' ? 1 : Math.ceil(total / take),
                has_more: type !== 'all' && page * take < total,
                grouped_preview: type === 'all',
            },
        };
    }
}
