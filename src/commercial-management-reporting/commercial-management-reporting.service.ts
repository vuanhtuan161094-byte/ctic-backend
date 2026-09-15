import { readOrganizationTimezone } from '../common/organization-runtime-settings';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from '../security/security-audit.service';
import {
    CreateBillingMilestoneDto,
    CreateQuotationDto,
    ReportingQueryDto,
    UpdateBillingMilestoneDto,
    UpdateQuotationDto,
} from './dto/commercial-management-reporting.dto';

const QUOTATION_TRANSITIONS: Record<string, Record<string, string>> = {
    SUBMIT_REVIEW: { DRAFT: 'UNDER_REVIEW' },
    APPROVE: { UNDER_REVIEW: 'APPROVED' },
    SEND: { APPROVED: 'SENT' },
    ACCEPT: { SENT: 'ACCEPTED' },
    REJECT: { SENT: 'REJECTED' },
    CANCEL: { DRAFT: 'CANCELLED', UNDER_REVIEW: 'CANCELLED', APPROVED: 'CANCELLED', SENT: 'CANCELLED' },
};

const FINAL_QUOTATION_STATUSES = new Set(['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
const OPEN_WORK_STATUSES = ['OPEN', 'IN_PROGRESS'];
const CLOSED_CASE_STATUSES = ['COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED', 'OUT_OF_SCOPE'];

export interface ReportingPeriod {
    from: Date;
    toExclusive: Date;
    timezone: string;
    preset: string;
}

function datePartsInZone(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return {
        year: Number(value('year')), month: Number(value('month')), day: Number(value('day')),
        hour: Number(value('hour')), minute: Number(value('minute')), second: Number(value('second')),
        weekday: value('weekday'),
    };
}

function utcForLocalDate(year: number, month: number, day: number, timezone: string) {
    let guess = Date.UTC(year, month - 1, day);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const observed = datePartsInZone(new Date(guess), timezone);
        const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
        guess += Date.UTC(year, month - 1, day) - observedUtc;
    }
    return new Date(guess);
}

function addLocalDays(date: Date, days: number, timezone: string) {
    const parts = datePartsInZone(date, timezone);
    const pivot = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return utcForLocalDate(pivot.getUTCFullYear(), pivot.getUTCMonth() + 1, pivot.getUTCDate(), timezone);
}

export function resolveReportingPeriod(
    query: ReportingQueryDto,
    timezone: string,
    now = new Date(),
): ReportingPeriod {
    const preset = query.preset ?? (query.from || query.to ? 'CUSTOM' : 'THIS_MONTH');
    if (preset === 'CUSTOM') {
        if (!query.from || !query.to) throw new BadRequestException('Khoảng tùy chỉnh cần đủ ngày bắt đầu và kết thúc');
        const fromParts = query.from.slice(0, 10).split('-').map(Number);
        const toParts = query.to.slice(0, 10).split('-').map(Number);
        const from = utcForLocalDate(fromParts[0], fromParts[1], fromParts[2], timezone);
        const to = utcForLocalDate(toParts[0], toParts[1], toParts[2], timezone);
        if (to < from) throw new BadRequestException('Ngày kết thúc không được trước ngày bắt đầu');
        return { from, toExclusive: addLocalDays(to, 1, timezone), timezone, preset };
    }

    const local = datePartsInZone(now, timezone);
    let year = local.year;
    let month = local.month;
    let day = local.day;
    let endYear = year;
    let endMonth = month;
    let endDay = day + 1;
    if (preset === 'THIS_WEEK') {
        const offset = ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[local.weekday] ?? 0;
        const monday = new Date(Date.UTC(year, month - 1, day - offset));
        year = monday.getUTCFullYear(); month = monday.getUTCMonth() + 1; day = monday.getUTCDate();
        const next = new Date(Date.UTC(year, month - 1, day + 7));
        endYear = next.getUTCFullYear(); endMonth = next.getUTCMonth() + 1; endDay = next.getUTCDate();
    } else if (preset === 'THIS_MONTH') {
        day = 1; endMonth = month + 1; endDay = 1;
        if (endMonth === 13) { endMonth = 1; endYear += 1; }
    } else if (preset === 'QUARTER') {
        month = Math.floor((month - 1) / 3) * 3 + 1; day = 1;
        endMonth = month + 3; endDay = 1;
        if (endMonth > 12) { endMonth -= 12; endYear += 1; }
    } else if (preset === 'YEAR') {
        month = 1; day = 1; endYear = year + 1; endMonth = 1; endDay = 1;
    } else if (preset !== 'TODAY') {
        throw new BadRequestException('Khoảng báo cáo không hợp lệ');
    }
    return {
        from: utcForLocalDate(year, month, day, timezone),
        toExclusive: utcForLocalDate(endYear, endMonth, endDay, timezone),
        timezone,
        preset,
    };
}

function decimal(value?: string | number | Prisma.Decimal | null) {
    return new Prisma.Decimal(value ?? 0);
}

function moneyString(value?: Prisma.Decimal | null) {
    return decimal(value).toFixed(4);
}

function positiveInteger(value: number | undefined, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
    return Number.isFinite(value) ? Math.min(maximum, Math.max(1, Math.trunc(value as number))) : fallback;
}

@Injectable()
export class CommercialManagementReportingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: SecurityAuditService,
    ) { }

    private async writeAudit(action: string, entityType: string, entityId: string, actorId: string) {
        await this.audit.write({ action, entityType, entityId, userId: actorId, outcome: 'success' });
    }

    private quotationInclude() {
        return {
            customer: { select: { id: true, customer_code: true, company_name: true } },
            application: { select: { id: true, application_code: true, status: true } },
            project: { select: { id: true, project_code: true, status: true, standard_name: true } },
            scheme: { select: { id: true, code: true, name: true } },
            lines: { orderBy: { line_no: 'asc' as const } },
            linked_contract: { select: { id: true, contract_number: true, commercial_status: true } },
        };
    }

    async listQuotations(filters?: { status?: string; customer_id?: string; project_id?: string; scheme_id?: string; page?: number; page_size?: number }) {
        const page = positiveInteger(filters?.page, 1);
        const pageSize = positiveInteger(filters?.page_size, 25, 100);
        const where = {
                ...(filters?.status ? { status: filters.status.trim().toUpperCase() } : {}),
                ...(filters?.customer_id ? { customer_id: filters.customer_id } : {}),
                ...(filters?.project_id ? { project_id: filters.project_id } : {}),
                ...(filters?.scheme_id ? { scheme_id: filters.scheme_id } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.quotations.findMany({ where, include: this.quotationInclude(), orderBy: [{ quotation_date: 'desc' }, { quotation_number: 'desc' }, { version_no: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
            this.prisma.quotations.count({ where }),
        ]);
        return { items, total, page, page_size: pageSize };
    }

    async getQuotation(id: string) {
        const row = await this.prisma.quotations.findUnique({ where: { id }, include: this.quotationInclude() });
        if (!row) throw new NotFoundException('Không tìm thấy báo giá');
        return row;
    }

    private calculateQuotation(dto: Pick<CreateQuotationDto, 'lines' | 'discount_amount' | 'tax_amount'>) {
        const lines = dto.lines.map((line, index) => {
            const quantity = decimal(line.quantity);
            const unitPrice = decimal(line.unit_price);
            if (quantity.lte(0)) throw new BadRequestException('Số lượng dòng báo giá phải lớn hơn 0');
            return {
                line_no: index + 1,
                description: line.description.trim(),
                quantity,
                unit_price: unitPrice,
                line_total: quantity.mul(unitPrice),
            };
        });
        const subtotal = lines.reduce((sum, line) => sum.add(line.line_total), decimal(0));
        const discount = decimal(dto.discount_amount);
        const tax = decimal(dto.tax_amount);
        const total = subtotal.sub(discount).add(tax);
        if (discount.gt(subtotal) || total.lt(0)) throw new BadRequestException('Chiết khấu/tổng tiền không hợp lệ');
        return { lines, subtotal, discount, tax, total };
    }

    private async validateQuotationLinks(dto: Pick<CreateQuotationDto, 'customer_id' | 'application_id' | 'project_id' | 'scheme_id'>) {
        const [customer, application, project, scheme] = await Promise.all([
            this.prisma.customers.findUnique({ where: { id: dto.customer_id }, select: { id: true, status: true } }),
            dto.application_id ? this.prisma.certification_applications.findUnique({ where: { id: dto.application_id }, select: { id: true, customer_id: true } }) : null,
            dto.project_id ? this.prisma.certification_projects.findUnique({ where: { id: dto.project_id }, select: { id: true, application_id: true } }) : null,
            dto.scheme_id ? this.prisma.certification_schemes.findUnique({ where: { id: dto.scheme_id }, select: { id: true, status: true } }) : null,
        ]);
        if (!customer || customer.status === 'inactive') throw new NotFoundException('Không tìm thấy khách hàng hoạt động');
        if (dto.application_id && (!application || application.customer_id !== dto.customer_id)) throw new BadRequestException('Đơn đăng ký không thuộc khách hàng');
        if (dto.project_id && (!project || (application && project.application_id !== application.id))) throw new BadRequestException('Hồ sơ không khớp đơn đăng ký');
        if (dto.scheme_id && (!scheme || scheme.status !== 'ACTIVE')) throw new BadRequestException('Scheme không còn khả dụng');
        let approvedMandays: Prisma.Decimal | null = null;
        if (application) {
            const review = await this.prisma.application_reviews.findFirst({
                where: { application_id: application.id, workflow_status: 'APPROVED' },
                orderBy: [{ approved_at: 'desc' }, { created_at: 'desc' }],
                select: { final_mandays: true },
            });
            approvedMandays = review?.final_mandays ?? null;
        }
        return approvedMandays;
    }

    async createQuotation(dto: CreateQuotationDto, actorId: string) {
        const existing = await this.prisma.quotations.findFirst({ where: { quotation_number: dto.quotation_number.trim() } });
        if (existing) throw new ConflictException('Số báo giá đã tồn tại');
        const approvedMandays = await this.validateQuotationLinks(dto);
        const totals = this.calculateQuotation(dto);
        const row = await this.prisma.quotations.create({
            data: {
                quotation_number: dto.quotation_number.trim(), customer_id: dto.customer_id,
                application_id: dto.application_id, project_id: dto.project_id, scheme_id: dto.scheme_id,
                quotation_date: new Date(dto.quotation_date), validity_date: dto.validity_date ? new Date(dto.validity_date) : null,
                currency: dto.currency.trim().toUpperCase(), technical_approved_mandays: approvedMandays,
                subtotal_amount: totals.subtotal, discount_amount: totals.discount, tax_amount: totals.tax,
                total_amount: totals.total, commercial_notes: dto.commercial_notes?.trim(), created_by: actorId,
                lines: { create: totals.lines },
            },
            include: this.quotationInclude(),
        });
        await this.writeAudit('QUOTATION_CREATED', 'quotation', row.id, actorId);
        return row;
    }

    async updateQuotation(id: string, dto: UpdateQuotationDto, actorId: string) {
        const current = await this.getQuotation(id);
        if (current.status !== 'DRAFT') throw new ConflictException('Chỉ báo giá DRAFT được sửa trực tiếp; hãy tạo revision');
        if (dto.scheme_id) await this.validateQuotationLinks({ customer_id: current.customer_id, scheme_id: dto.scheme_id });
        const totals = dto.lines ? this.calculateQuotation({
            lines: dto.lines,
            discount_amount: dto.discount_amount ?? current.discount_amount.toString(),
            tax_amount: dto.tax_amount ?? current.tax_amount.toString(),
        }) : null;
        if (!totals && (dto.discount_amount !== undefined || dto.tax_amount !== undefined)) {
            throw new BadRequestException('Thay đổi chiết khấu/thuế phải gửi lại các dòng báo giá');
        }
        const row = await this.prisma.$transaction(async (tx) => {
            if (totals) {
                await tx.quotation_line_items.deleteMany({ where: { quotation_id: id } });
                await tx.quotation_line_items.createMany({ data: totals.lines.map((line) => ({ ...line, quotation_id: id })) });
            }
            return tx.quotations.update({
                where: { id }, data: {
                    validity_date: dto.validity_date ? new Date(dto.validity_date) : undefined,
                    scheme_id: dto.scheme_id, commercial_notes: dto.commercial_notes?.trim(),
                    ...(totals ? { subtotal_amount: totals.subtotal, discount_amount: totals.discount, tax_amount: totals.tax, total_amount: totals.total } : {}),
                }, include: this.quotationInclude(),
            });
        });
        await this.writeAudit('QUOTATION_UPDATED', 'quotation', id, actorId);
        return row;
    }

    async transitionQuotation(id: string, action: string, actorId: string) {
        const current = await this.getQuotation(id);
        const next = QUOTATION_TRANSITIONS[action]?.[current.status];
        if (!next) throw new ConflictException(`Không thể ${action} khi báo giá ở trạng thái ${current.status}`);
        const now = new Date();
        const row = await this.prisma.quotations.update({
            where: { id }, data: {
                status: next,
                ...(next === 'APPROVED' ? { approved_by: actorId, approved_at: now } : {}),
                ...(next === 'SENT' ? { sent_at: now } : {}),
                ...(next === 'ACCEPTED' ? { accepted_at: now } : {}),
                ...(next === 'REJECTED' ? { rejected_at: now } : {}),
                ...(next === 'CANCELLED' ? { cancelled_at: now } : {}),
            }, include: this.quotationInclude(),
        });
        await this.writeAudit(`QUOTATION_${next}`, 'quotation', id, actorId);
        return row;
    }

    async reviseQuotation(id: string, actorId: string) {
        const current = await this.getQuotation(id);
        if (!FINAL_QUOTATION_STATUSES.has(current.status) && current.status !== 'SENT' && current.status !== 'APPROVED') {
            throw new ConflictException('Chỉ báo giá đã phát hành/kết thúc mới được tạo revision');
        }
        const latest = await this.prisma.quotations.findFirst({ where: { quotation_number: current.quotation_number }, orderBy: { version_no: 'desc' } });
        if (latest?.id !== current.id) throw new ConflictException('Chỉ phiên bản mới nhất được tạo revision');
        const row = await this.prisma.quotations.create({
            data: {
                quotation_number: current.quotation_number, version_no: current.version_no + 1, previous_version_id: current.id,
                customer_id: current.customer_id, application_id: current.application_id, project_id: current.project_id, scheme_id: current.scheme_id,
                quotation_date: new Date(), validity_date: current.validity_date, currency: current.currency,
                technical_approved_mandays: current.technical_approved_mandays, subtotal_amount: current.subtotal_amount,
                discount_amount: current.discount_amount, tax_amount: current.tax_amount, total_amount: current.total_amount,
                commercial_notes: current.commercial_notes, created_by: actorId,
                lines: { create: current.lines.map((line) => ({ line_no: line.line_no, description: line.description, quantity: line.quantity, unit_price: line.unit_price, line_total: line.line_total })) },
            }, include: this.quotationInclude(),
        });
        await this.writeAudit('QUOTATION_REVISED', 'quotation', row.id, actorId);
        return row;
    }

    async listBillingMilestones(contractId?: string, requestedPage = 1, requestedPageSize = 25) {
        const page = positiveInteger(requestedPage, 1);
        const pageSize = positiveInteger(requestedPageSize, 25, 100);
        const where = contractId ? { contract_id: contractId } : {};
        const [items, total] = await Promise.all([
            this.prisma.billing_milestones.findMany({
                where, include: { contract: { select: { id: true, contract_number: true, customer_id: true } }, project: { select: { id: true, project_code: true } } },
                orderBy: [{ planned_date: 'asc' }, { created_at: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
            }),
            this.prisma.billing_milestones.count({ where }),
        ]);
        return { items, total, page, page_size: pageSize };
    }

    async createBillingMilestone(dto: CreateBillingMilestoneDto, actorId: string) {
        const contract = await this.prisma.contracts.findUnique({ where: { id: dto.contract_id }, select: { id: true, currency: true, customer_id: true } });
        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        const currency = dto.currency.trim().toUpperCase();
        if (contract.currency && contract.currency !== currency) throw new BadRequestException('Tiền tệ milestone phải khớp hợp đồng');
        if (dto.project_id) {
            const project = await this.prisma.certification_projects.findUnique({ where: { id: dto.project_id }, select: { certification_applications: { select: { customer_id: true } } } });
            if (!project || project.certification_applications.customer_id !== contract.customer_id) throw new BadRequestException('Hồ sơ không thuộc khách hàng hợp đồng');
        }
        const amount = decimal(dto.planned_amount);
        const row = await this.prisma.$transaction(async (tx) => {
            const milestone = await tx.billing_milestones.create({ data: {
                contract_id: dto.contract_id, project_id: dto.project_id, milestone_type: dto.milestone_type,
                milestone_name: dto.milestone_name.trim(), planned_amount: amount, currency,
                planned_date: dto.planned_date ? new Date(dto.planned_date) : null, note: dto.note?.trim(), created_by: actorId,
            } });
            await tx.billing_milestone_actions.create({ data: {
                billing_milestone_id: milestone.id, action: 'CREATE', to_status: milestone.status,
                snapshot_json: JSON.stringify({ planned_amount: moneyString(amount), currency, status: milestone.status }), actor_id: actorId,
            } });
            return milestone;
        });
        await this.writeAudit('BILLING_MILESTONE_CREATED', 'billing_milestone', row.id, actorId);
        return row;
    }

    async updateBillingMilestone(id: string, dto: UpdateBillingMilestoneDto, actorId: string) {
        const current = await this.prisma.billing_milestones.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy billing milestone');
        if (current.status === 'CANCELLED') throw new ConflictException('Milestone đã hủy và không được sửa');
        const paid = dto.paid_amount === undefined ? current.paid_amount : decimal(dto.paid_amount);
        if (paid.gt(current.planned_amount)) throw new BadRequestException('Số tiền đã thu không được vượt số tiền kế hoạch');
        const invoiceReference = dto.invoice_reference === undefined ? current.invoice_reference : dto.invoice_reference.trim() || null;
        const invoiceDate = dto.invoice_date === undefined ? current.invoice_date : new Date(dto.invoice_date);
        if (paid.gt(0) && (!invoiceReference || !invoiceDate)) throw new BadRequestException('Ghi nhận thanh toán cần đủ tham chiếu và ngày hóa đơn');
        let status = dto.status ?? current.status;
        if (status !== 'CANCELLED') {
            status = paid.equals(current.planned_amount) && paid.gt(0) ? 'PAID'
                : paid.gt(0) ? 'PARTIALLY_PAID'
                    : invoiceReference ? 'INVOICED'
                        : status === 'READY_TO_INVOICE' ? status : 'PLANNED';
        }
        const snapshot = { planned_amount: moneyString(current.planned_amount), paid_amount: moneyString(paid), currency: current.currency, invoice_reference: invoiceReference, status };
        const row = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.billing_milestones.update({ where: { id }, data: {
                invoice_reference: invoiceReference, invoice_date: invoiceDate, paid_amount: paid,
                paid_date: dto.paid_date ? new Date(dto.paid_date) : dto.paid_amount !== undefined && paid.gt(0) ? current.paid_date ?? new Date() : current.paid_date,
                status, note: dto.note?.trim(), updated_by: actorId,
            } });
            await tx.billing_milestone_actions.create({ data: {
                billing_milestone_id: id, action: 'UPDATE', from_status: current.status, to_status: status,
                snapshot_json: JSON.stringify(snapshot), actor_id: actorId,
            } });
            return updated;
        });
        await this.writeAudit('BILLING_MILESTONE_UPDATED', 'billing_milestone', id, actorId);
        return row;
    }

    private kpi(key: string, label: string, definition: string, unit: string, value: number | string, context: object, numerator?: number, denominator?: number) {
        return { key, label, definition, unit, value, ...(numerator !== undefined ? { numerator } : {}), ...(denominator !== undefined ? { denominator } : {}), context };
    }

    private async reportingContext(query: ReportingQueryDto) {
        const timezone = await readOrganizationTimezone(this.prisma);
        const period = resolveReportingPeriod(query, timezone);
        let scheme: { id: string; code: string; name: string; standards: Array<{ standard_code: string; standard_name: string }> } | null = null;
        if (query.scheme_id) {
            scheme = await this.prisma.certification_schemes.findUnique({
                where: { id: query.scheme_id },
                select: { id: true, code: true, name: true, standards: { where: { status: 'ACTIVE' }, select: { standard_code: true, standard_name: true } } },
            });
            if (!scheme) throw new NotFoundException('Không tìm thấy scheme');
        }
        const standardTerms = scheme?.standards.flatMap((item) => [item.standard_code, item.standard_name]) ?? [];
        const standardFilter = standardTerms.length ? { OR: standardTerms.map((term) => ({ standard_name: { contains: term } })) } : {};
        const context = { preset: period.preset, from: period.from, to_exclusive: period.toExclusive, timezone, scheme: scheme ? { id: scheme.id, code: scheme.code, name: scheme.name } : null, customer_id: query.customer_id ?? null, expert_id: query.expert_id ?? null };
        return { period, scheme, standardFilter, context };
    }

    async getCockpit(query: ReportingQueryDto, roles: string[]) {
        const { period, standardFilter, context } = await this.reportingContext(query);
        const date = { gte: period.from, lt: period.toExclusive };
        const customerProjectFilter: any = query.customer_id ? { certification_applications: { customer_id: query.customer_id } } : {};
        const projectWhere: any = { ...customerProjectFilter, ...standardFilter };
        const auditWhere: any = { planned_start_date: date, ...(query.audit_type ? { event_type: query.audit_type } : {}), audit_programs: { certification_projects: projectWhere } };
        const certWhere: any = { issue_date: date, certificate_series: { certification_project: projectWhere } };
        const now = new Date();

        const [
            activeCustomers, activeProjects, applicationsReceived, applicationsPending,
            auditsPlanned, auditsCompleted, certificatesActive, certificatesExpiring,
            overdueWork, openFindings, overdueFindings, pendingReviews,
            openChanges, openComplaints, openAppeals,
            projectStatuses, certificateStatuses, applicationStatuses, auditStatuses,
            expertWorkload, documentStatuses,
        ] = await Promise.all([
            this.prisma.customers.count({ where: { status: 'active', ...(query.customer_id ? { id: query.customer_id } : {}) } }),
            this.prisma.certification_projects.count({ where: { ...projectWhere, status: { notIn: ['cancelled', 'closed'] } } }),
            this.prisma.certification_applications.count({ where: { application_date: date, ...(query.customer_id ? { customer_id: query.customer_id } : {}), ...standardFilter } }),
            this.prisma.certification_applications.count({ where: { ...(query.customer_id ? { customer_id: query.customer_id } : {}), ...standardFilter, status: { notIn: ['accepted', 'project_created', 'rejected', 'cancelled'] } } }),
            this.prisma.audit_program_events.count({ where: auditWhere }),
            this.prisma.audit_program_events.count({ where: { ...auditWhere, status: 'completed' } }),
            this.prisma.certificates.count({ where: { status: 'active', certificate_series: { certification_project: projectWhere } } }),
            this.prisma.certificates.count({ where: { status: { in: ['active', 'suspended'] }, expire_date: { gte: now, lt: period.toExclusive }, certificate_series: { certification_project: projectWhere } } }),
            this.prisma.work_items.count({ where: { status: { in: OPEN_WORK_STATUSES }, due_at: { lt: now }, ...(query.customer_id ? { project: customerProjectFilter } : {}) } }),
            this.prisma.audit_findings.count({ where: { finding_type: { in: ['major_nc', 'minor_nc'] }, status: { not: 'closed' }, reports: { audit_plans: { certification_projects: projectWhere } } } }),
            this.prisma.audit_findings.count({ where: { finding_type: { in: ['major_nc', 'minor_nc'] }, status: { not: 'closed' }, due_date: { lt: now }, reports: { audit_plans: { certification_projects: projectWhere } } } }),
            this.prisma.technical_reviews.count({ where: { status: { not: 'completed' }, reports: { audit_plans: { certification_projects: projectWhere } } } }),
            this.prisma.certification_change_cases.count({ where: { status: { notIn: CLOSED_CASE_STATUSES }, ...(query.customer_id ? { customer_id: query.customer_id } : {}) } }),
            this.prisma.complaint_cases.count({ where: { status: { notIn: CLOSED_CASE_STATUSES }, ...(query.customer_id ? { customer_id: query.customer_id } : {}) } }),
            this.prisma.appeal_cases.count({ where: { status: { notIn: CLOSED_CASE_STATUSES }, ...(query.customer_id ? { customer_id: query.customer_id } : {}) } }),
            this.prisma.certification_projects.groupBy({ by: ['status'], where: projectWhere, _count: { _all: true } }),
            this.prisma.certificates.groupBy({ by: ['status'], where: { certificate_series: { certification_project: projectWhere } }, _count: { _all: true } }),
            this.prisma.certification_applications.groupBy({ by: ['status'], where: { ...(query.customer_id ? { customer_id: query.customer_id } : {}), ...standardFilter }, _count: { _all: true } }),
            this.prisma.audit_program_events.groupBy({ by: ['status'], where: auditWhere, _count: { _all: true } }),
            this.prisma.audit_team_members.groupBy({ by: ['expert_id'], where: { planned_start_date: { lt: period.toExclusive }, planned_end_date: { gte: period.from }, assignment_status: { not: 'cancelled' }, ...(query.expert_id ? { expert_id: query.expert_id } : {}) }, _sum: { planned_mandays: true, actual_mandays: true }, _count: { _all: true } }),
            this.prisma.controlled_documents.groupBy({ by: ['status'], _count: { _all: true } }),
        ]);

        const expertIds = expertWorkload.map((item) => item.expert_id);
        const experts = expertIds.length ? await this.prisma.experts.findMany({ where: { id: { in: expertIds } }, select: { id: true, full_name: true } }) : [];
        const expertNames = new Map(experts.map((item) => [item.id, item.full_name]));

        const quotationWhere: any = { quotation_date: date, ...(query.scheme_id ? { scheme_id: query.scheme_id } : {}), ...(query.customer_id ? { customer_id: query.customer_id } : {}) };
        const contractWhere: any = { sign_date: date, ...(query.customer_id ? { customer_id: query.customer_id } : {}), ...(query.scheme_id ? { quotation: { scheme_id: query.scheme_id } } : {}) };
        const milestoneWhere: any = { ...(query.customer_id ? { contract: { customer_id: query.customer_id } } : {}), ...(query.scheme_id ? { contract: { quotation: { scheme_id: query.scheme_id } } } : {}) };
        const [pipeline, contracted, invoiced, collected] = await Promise.all([
            this.prisma.quotations.groupBy({ by: ['currency'], where: { ...quotationWhere, status: { in: ['APPROVED', 'SENT'] } }, _sum: { total_amount: true } }),
            this.prisma.contracts.groupBy({ by: ['currency'], where: { ...contractWhere, commercial_status: { in: ['SIGNED', 'ACTIVE'] }, currency: { not: null } }, _sum: { total_value: true } }),
            this.prisma.billing_milestones.groupBy({ by: ['currency'], where: { ...milestoneWhere, status: { in: ['INVOICED', 'PARTIALLY_PAID', 'PAID'] } }, _sum: { planned_amount: true } }),
            this.prisma.billing_milestones.groupBy({ by: ['currency'], where: milestoneWhere, _sum: { paid_amount: true, planned_amount: true } }),
        ]);
        const currencySet = new Set([...pipeline, ...contracted, ...invoiced, ...collected].map((item) => item.currency).filter(Boolean) as string[]);
        const byCurrency = [...currencySet].sort().map((currency) => {
            const pipelineValue = pipeline.find((item) => item.currency === currency)?._sum.total_amount ?? null;
            const contractValue = contracted.find((item) => item.currency === currency)?._sum.total_value ?? null;
            const invoicedValue = invoiced.find((item) => item.currency === currency)?._sum.planned_amount ?? null;
            const collectedRow = collected.find((item) => item.currency === currency)?._sum;
            const collectedValue = collectedRow?.paid_amount ?? null;
            return {
                currency,
                pipeline_value: moneyString(pipelineValue),
                contracted_value: moneyString(contractValue),
                invoiced: moneyString(invoicedValue),
                collected: moneyString(collectedValue),
                outstanding: moneyString(decimal(invoicedValue).sub(decimal(collectedValue))),
            };
        });

        const kpiContext = context;
        const executive = [
            this.kpi('active_customers', 'Khách hàng hoạt động', 'Khách hàng có status active tại thời điểm báo cáo', 'count', activeCustomers, kpiContext),
            this.kpi('active_projects', 'Hồ sơ đang hoạt động', 'Hồ sơ không closed/cancelled theo bộ lọc', 'count', activeProjects, kpiContext),
            this.kpi('applications_received', 'Đơn tiếp nhận', 'Đơn có application_date trong kỳ', 'count', applicationsReceived, kpiContext),
            this.kpi('applications_pending', 'Đơn chờ xử lý', 'Đơn chưa accepted/project_created/rejected/cancelled', 'count', applicationsPending, kpiContext),
            this.kpi('audits_planned', 'Lịch đánh giá trong kỳ', 'Audit program event có planned_start_date trong kỳ', 'count', auditsPlanned, kpiContext),
            this.kpi('audits_completed', 'Đánh giá hoàn tất', 'Audit program event status completed trong kỳ kế hoạch', 'count', auditsCompleted, kpiContext, auditsCompleted, auditsPlanned),
            this.kpi('certificates_active', 'Chứng chỉ hiệu lực', 'Chứng chỉ status active', 'count', certificatesActive, kpiContext),
            this.kpi('certificates_expiring', 'Chứng chỉ sắp hết hạn', 'Chứng chỉ active/suspended hết hạn trước cuối kỳ', 'count', certificatesExpiring, kpiContext),
            this.kpi('overdue_work_items', 'Công việc quá hạn', 'Work Item OPEN/IN_PROGRESS có due_at trước hiện tại', 'count', overdueWork, kpiContext),
        ];

        return {
            generated_at: new Date(), filter_context: context,
            metric_definitions: executive,
            executive,
            operations: {
                open_nc: openFindings, overdue_nc: overdueFindings, pending_technical_reviews: pendingReviews,
                status_breakdowns: { projects: projectStatuses, applications: applicationStatuses, audits: auditStatuses, certificates: certificateStatuses },
            },
            commercial: { labels: { pipeline_value: 'Giá trị pipeline', contracted_value: 'Giá trị đã ký', invoiced: 'Đã lập tham chiếu hóa đơn', collected: 'Đã thu', outstanding: 'Còn phải thu' }, by_currency: byCurrency, mixed_currency_total: null },
            resource: { utilization_percentage: null, utilization_note: 'Không tính tỷ lệ sử dụng vì chưa có mẫu số năng lực khả dụng chuẩn hóa.', workload: expertWorkload.map((item) => ({ expert_id: item.expert_id, expert_name: expertNames.get(item.expert_id) ?? 'Unknown', assigned_mandays: moneyString(item._sum.planned_mandays), completed_mandays: moneyString(item._sum.actual_mandays), engagement_count: item._count._all })) },
            governance: { open_changes: openChanges, open_complaints: openComplaints, open_appeals: openAppeals, documents_by_status: documentStatuses },
            unavailable_metrics: ['revenue_recognized', 'application_submit_to_review_turnaround_without_semantic_submit_timestamp', 'utilization_percentage_without_capacity_denominator'],
            role_projection: { roles, commercial_visible: true, confidential_case_details_included: false },
        };
    }

    async exportCockpitCsv(query: ReportingQueryDto, roles: string[], actorId: string) {
        const report = await this.getCockpit(query, roles);
        const escape = (value: unknown) => {
            let text = String(value ?? '');
            if (/^[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
        };
        const rows: unknown[][] = [['section', 'key', 'label', 'unit_or_currency', 'value', 'definition']];
        for (const metric of report.executive) rows.push(['executive', metric.key, metric.label, metric.unit, metric.value, metric.definition]);
        for (const item of report.commercial.by_currency) {
            for (const key of ['pipeline_value', 'contracted_value', 'invoiced', 'collected', 'outstanding'] as const) {
                rows.push(['commercial', key, report.commercial.labels[key], item.currency, item[key], 'Giá trị được nhóm riêng theo tiền tệ; không quy đổi FX']);
            }
        }
        const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`;
        await this.writeAudit('MANAGEMENT_REPORT_EXPORTED', 'audit_log', actorId, actorId);
        return csv;
    }
}
