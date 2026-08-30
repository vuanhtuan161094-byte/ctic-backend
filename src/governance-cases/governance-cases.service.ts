import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    Prisma,
    type special_audit_cases,
} from '@prisma/client';

import { DocumentControlService } from '../document-control/document-control.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ResourceActor } from '../security/resource-access.service';
import { normalizeRoles } from '../security/security-request';
import {
    WORK_ITEM_ACTIONS,
} from '../work-items/work-item.constants';
import { WorkItemsService } from '../work-items/work-items.service';
import {
    AppealReviewDto,
    AssessCertificationChangeDto,
    AssignAppealDto,
    AssignComplaintDto,
    CaseListQueryDto,
    CloseComplaintDto,
    ComplaintInvestigationDto,
    CreateAppealDto,
    CreateCertificationChangeCaseDto,
    CreateComplaintDto,
    CreateSpecialAuditDto,
    DecideAppealDto,
    LinkControlledOutputDto,
    LinkResultingDecisionDto,
    LinkSpecialAuditPlanDto,
    RecordSpecialAuditResultDto,
} from './dto/governance-case.dto';

const CLOSED_CHANGE = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);
const CLOSED_SPECIAL = new Set(['CLOSED', 'CANCELLED']);
const CLOSED_COMPLAINT = new Set(['CLOSED', 'REJECTED', 'OUT_OF_SCOPE']);
const CLOSED_APPEAL = new Set(['CLOSED', 'REJECTED', 'OUT_OF_SCOPE']);
const CERTIFICATE_ACTIONS = new Set([
    'MAINTAIN',
    'AMEND',
    'EXTEND_SCOPE',
    'REDUCE_SCOPE',
    'SUSPEND',
    'RESTORE',
    'WITHDRAW',
]);

@Injectable()
export class GovernanceCasesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly workItems: WorkItemsService,
        private readonly documentControl: DocumentControlService,
    ) {}

    private actorId(actor: ResourceActor) {
        if (!actor.userId) {
            throw new ForbiddenException('Không xác định được người thực hiện');
        }
        return actor.userId;
    }

    private roles(actor: ResourceActor) {
        return new Set(normalizeRoles(actor.roles));
    }

    private broadInternal(actor: ResourceActor) {
        const roles = this.roles(actor);
        return roles.has('ADMIN') || roles.has('COORDINATOR');
    }

    private assertAssigned(actor: ResourceActor, assignedIds: Array<string | null | undefined>) {
        const actorId = this.actorId(actor);
        if (this.broadInternal(actor) || assignedIds.some((id) => id === actorId)) return;
        throw new ForbiddenException('Bạn không được phân công xử lý hồ sơ này');
    }

    private date(value?: string) {
        return value ? new Date(value) : null;
    }

    private json(value?: Record<string, unknown> | string[] | null) {
        return value ? JSON.stringify(value) : null;
    }

    private async audit(
        tx: Prisma.TransactionClient,
        actor: ResourceActor,
        action: string,
        entityType: string,
        entityId: string,
    ) {
        await tx.audit_logs.create({
            data: {
                user_id: this.actorId(actor),
                action,
                entity_type: entityType,
                entity_id: entityId,
                outcome: 'SUCCESS',
            },
        });
    }

    private async transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
        return this.prisma.$transaction(callback, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    }

    private async validateCustomerLinks(input: {
        customerId: string;
        projectId?: string | null;
        certificateSeriesId?: string | null;
    }) {
        if (input.projectId) {
            const project = await this.prisma.certification_projects.findUnique({
                where: { id: input.projectId },
                select: {
                    id: true,
                    certification_applications: { select: { customer_id: true } },
                },
            });
            if (!project) throw new NotFoundException('Không tìm thấy dự án chứng nhận');
            if (project.certification_applications.customer_id !== input.customerId) {
                throw new BadRequestException('Dự án không thuộc khách hàng đã chọn');
            }
        }
        if (input.certificateSeriesId) {
            const series = await this.prisma.certificate_series.findUnique({
                where: { id: input.certificateSeriesId },
                select: { project_id: true },
            });
            if (!series) throw new NotFoundException('Không tìm thấy dòng chứng chỉ');
            if (input.projectId && series.project_id !== input.projectId) {
                throw new BadRequestException('Dòng chứng chỉ không thuộc dự án đã chọn');
            }
            const project = await this.prisma.certification_projects.findUnique({
                where: { id: series.project_id },
                select: { certification_applications: { select: { customer_id: true } } },
            });
            if (project?.certification_applications.customer_id !== input.customerId) {
                throw new BadRequestException('Dòng chứng chỉ không thuộc khách hàng đã chọn');
            }
        }
    }

    private async customerIds(actor: ResourceActor) {
        const actorId = this.actorId(actor);
        const mappings = await this.prisma.customer_user_access.findMany({
            where: { user_id: actorId, status: 'active' },
            select: { customer_id: true },
        });
        if (!mappings.length) throw new ForbiddenException('Tài khoản không có customer mapping đang hoạt động');
        return mappings.map((mapping) => mapping.customer_id);
    }

    private async resolvePortalCustomer(actor: ResourceActor, requested?: string | null) {
        const accessible = await this.customerIds(actor);
        if (requested) {
            if (!accessible.includes(requested)) throw new ForbiddenException('Không được truy cập khách hàng khác');
            return requested;
        }
        if (accessible.length !== 1) {
            throw new BadRequestException('Phải chọn customer_id khi tài khoản quản lý nhiều tổ chức');
        }
        return accessible[0];
    }

    private scopedWhere(actor: ResourceActor, fields: string[]) {
        if (this.broadInternal(actor)) return {};
        const actorId = this.actorId(actor);
        return { OR: fields.map((field) => ({ [field]: actorId })) };
    }

    private filters(query: CaseListQueryDto) {
        return {
            ...(query.status ? { status: query.status.trim().toUpperCase() } : {}),
            ...(query.customer_id ? { customer_id: query.customer_id } : {}),
            ...(query.project_id ? { project_id: query.project_id } : {}),
        };
    }

    private overdue(status: string, ...dates: Array<Date | null>) {
        if (['COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED', 'OUT_OF_SCOPE'].includes(status)) return false;
        return dates.some((date) => date && date.getTime() < Date.now());
    }

    async listChangeCases(query: CaseListQueryDto, actor: ResourceActor) {
        return this.prisma.certification_change_cases.findMany({
            where: {
                ...this.filters(query),
                AND: [
                    this.scopedWhere(actor, ['owner_id', 'submitted_by']),
                    query.search ? {
                        OR: [
                            { case_number: { contains: query.search } },
                            { description: { contains: query.search } },
                        ],
                    } : {},
                ],
            },
            orderBy: { created_at: 'desc' },
            take: query.limit ?? 100,
        });
    }

    async createChangeCase(dto: CreateCertificationChangeCaseDto, actor: ResourceActor) {
        const actorId = this.actorId(actor);
        let source = dto.source?.trim().toUpperCase() || 'INTERNAL';
        let beforeSnapshot = dto.before_snapshot;
        let afterSnapshot = dto.after_snapshot;
        if (dto.source_request_id) {
            const request = await this.prisma.customer_organization_change_requests.findUnique({
                where: { id: dto.source_request_id },
            });
            if (!request) throw new NotFoundException('Không tìm thấy yêu cầu thay đổi tổ chức nguồn');
            if (request.customer_id !== dto.customer_id) {
                throw new BadRequestException('Yêu cầu nguồn không thuộc khách hàng đã chọn');
            }
            source = 'CUSTOMER_ORGANIZATION_CHANGE';
            beforeSnapshot = JSON.parse(request.before_snapshot) as Record<string, unknown>;
            afterSnapshot = JSON.parse(request.after_snapshot) as Record<string, unknown>;
        }
        await this.validateCustomerLinks({
            customerId: dto.customer_id,
            projectId: dto.project_id,
            certificateSeriesId: dto.certificate_series_id,
        });
        const created = await this.transaction(async (tx) => {
            const caseNumber = await this.documentControl.allocateControlledNumber(tx, 'CHG', undefined, 'CHANGE');
            const row = await tx.certification_change_cases.create({
                data: {
                    case_number: caseNumber,
                    source,
                    source_request_id: dto.source_request_id ?? null,
                    customer_id: dto.customer_id,
                    project_id: dto.project_id ?? null,
                    certificate_series_id: dto.certificate_series_id ?? null,
                    change_type: dto.change_type,
                    description: dto.description.trim(),
                    before_snapshot: this.json(beforeSnapshot),
                    after_snapshot: this.json(afterSnapshot),
                    effective_date: this.date(dto.effective_date),
                    submitted_by: actorId,
                    owner_id: dto.owner_id ?? null,
                },
            });
            await this.audit(tx, actor, 'CHANGE_CASE_SUBMIT', 'certification_change_case', row.id);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `change:${created.id}:impact`,
            workType: 'CHANGE_IMPACT_REVIEW',
            actionCode: WORK_ITEM_ACTIONS.CHANGE_IMPACT_REVIEW,
            title: `Đánh giá tác động ${created.case_number}`,
            entityType: 'certification_change_case',
            entityId: created.id,
            projectId: created.project_id,
            assignedUserId: created.owner_id,
            assignedRole: created.owner_id ? null : 'COORDINATOR',
            destinationPath: `/governance-cases?case_id=${created.id}`,
        });
        return created;
    }

    async assessChangeCase(id: string, dto: AssessCertificationChangeDto, actor: ResourceActor) {
        const current = await this.prisma.certification_change_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy change case');
        this.assertAssigned(actor, [current.owner_id, current.submitted_by]);
        if (CLOSED_CHANGE.has(current.status) || current.assessment_outcome) {
            throw new ConflictException('Change case đã được đánh giá hoặc đã đóng');
        }
        if (dto.outcome === 'SPECIAL_AUDIT_REQUIRED' && !dto.special_audit_required) {
            throw new BadRequestException('Kết quả SPECIAL_AUDIT_REQUIRED phải đánh dấu special_audit_required');
        }
        if (dto.special_audit_required && !dto.special_audit_scope?.trim()) {
            throw new BadRequestException('Phải xác định phạm vi special audit');
        }
        const result = await this.transaction(async (tx) => {
            const actionRequired = !['NO_CERTIFICATION_IMPACT', 'DOCUMENT_UPDATE_ONLY'].includes(dto.outcome);
            const updated = await tx.certification_change_cases.update({
                where: { id },
                data: {
                    status: actionRequired ? 'ACTION_REQUIRED' : 'IMPACT_ASSESSED',
                    assessment_outcome: dto.outcome,
                    assessment_json: JSON.stringify(dto),
                    special_audit_required: dto.special_audit_required,
                },
            });
            let specialAudit: special_audit_cases | null = null;
            if (dto.special_audit_required) {
                const caseNumber = await this.documentControl.allocateControlledNumber(tx, 'SA', undefined, 'SPECIAL_AUDIT');
                const createdSpecialAudit = await tx.special_audit_cases.create({
                    data: {
                        case_number: caseNumber,
                        customer_id: current.customer_id,
                        project_id: current.project_id,
                        certificate_series_id: current.certificate_series_id,
                        trigger_type: dto.special_audit_trigger_type?.trim() || 'SIGNIFICANT_CUSTOMER_CHANGE',
                        trigger_entity_type: 'certification_change_case',
                        trigger_entity_id: current.id,
                        reason: dto.rationale?.trim() || current.description,
                        audit_scope: dto.special_audit_scope!.trim(),
                        owner_id: current.owner_id,
                        created_by: this.actorId(actor),
                    },
                });
                specialAudit = createdSpecialAudit;
                await this.audit(tx, actor, 'SPECIAL_AUDIT_REQUIRED', 'special_audit_case', createdSpecialAudit.id);
            }
            await this.audit(tx, actor, 'CHANGE_IMPACT_ASSESS', 'certification_change_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `change:${id}:impact` }, this.actorId(actor), tx);
            return { change: updated, special_audit: specialAudit };
        });
        if (result.special_audit) {
            await this.openSpecialAuditPlanWork(result.special_audit);
        } else if (CERTIFICATE_ACTIONS.has(this.outcomeCertificateAction(dto.outcome))) {
            await this.workItems.openWorkItem({
                sourceKey: `change:${id}:certificate-action`,
                workType: 'CHANGE_CERTIFICATE_ACTION',
                actionCode: WORK_ITEM_ACTIONS.CHANGE_CERTIFICATE_ACTION,
                title: `Xử lý hành động chứng chỉ ${current.case_number}`,
                entityType: 'certification_change_case',
                entityId: id,
                projectId: current.project_id,
                assignedRole: 'DECISION_MAKER',
                destinationPath: `/certification-projects/${current.project_id ?? ''}`,
                context: { recommended_action: this.outcomeCertificateAction(dto.outcome) },
            });
        }
        return result;
    }

    private outcomeCertificateAction(outcome: string) {
        return ({
            CERTIFICATE_AMENDMENT_REQUIRED: 'AMEND',
            EXTENSION_REQUIRED: 'EXTEND_SCOPE',
            REDUCTION_REQUIRED: 'REDUCE_SCOPE',
            SUSPENSION_REVIEW_REQUIRED: 'SUSPEND',
        } as Record<string, string>)[outcome] ?? 'NONE';
    }

    async listSpecialAudits(query: CaseListQueryDto, actor: ResourceActor) {
        return this.prisma.special_audit_cases.findMany({
            where: {
                ...this.filters(query),
                AND: [
                    this.scopedWhere(actor, ['owner_id', 'created_by']),
                    query.search ? {
                        OR: [
                            { case_number: { contains: query.search } },
                            { reason: { contains: query.search } },
                        ],
                    } : {},
                ],
            },
            include: { audit_plan: { select: { id: true, plan_code: true, status: true } } },
            orderBy: { created_at: 'desc' },
            take: query.limit ?? 100,
        });
    }

    private async createSpecialAuditRecord(dto: CreateSpecialAuditDto, actor: ResourceActor) {
        await this.validateCustomerLinks({
            customerId: dto.customer_id,
            projectId: dto.project_id,
            certificateSeriesId: dto.certificate_series_id,
        });
        return this.transaction(async (tx) => {
            const caseNumber = await this.documentControl.allocateControlledNumber(tx, 'SA', undefined, 'SPECIAL_AUDIT');
            const row = await tx.special_audit_cases.create({
                data: {
                    case_number: caseNumber,
                    customer_id: dto.customer_id,
                    project_id: dto.project_id ?? null,
                    certificate_series_id: dto.certificate_series_id ?? null,
                    trigger_type: dto.trigger_type.trim().toUpperCase(),
                    trigger_entity_type: dto.trigger_entity_type?.trim().toLowerCase() || null,
                    trigger_entity_id: dto.trigger_entity_id ?? null,
                    reason: dto.reason.trim(),
                    audit_scope: dto.audit_scope.trim(),
                    purpose: dto.purpose?.trim() || null,
                    planned_date: this.date(dto.planned_date),
                    owner_id: dto.owner_id ?? null,
                    created_by: this.actorId(actor),
                },
            });
            await this.audit(tx, actor, 'SPECIAL_AUDIT_CREATE', 'special_audit_case', row.id);
            return row;
        });
    }

    async createSpecialAudit(dto: CreateSpecialAuditDto, actor: ResourceActor) {
        const created = await this.createSpecialAuditRecord(dto, actor);
        await this.openSpecialAuditPlanWork(created);
        return created;
    }

    private openSpecialAuditPlanWork(row: {
        id: string;
        case_number: string;
        project_id: string | null;
        owner_id: string | null;
    }) {
        return this.workItems.openWorkItem({
            sourceKey: `special-audit:${row.id}:plan`,
            workType: 'SPECIAL_AUDIT_PLAN',
            actionCode: WORK_ITEM_ACTIONS.SPECIAL_AUDIT_PLAN,
            title: `Lập kế hoạch đánh giá đặc biệt ${row.case_number}`,
            entityType: 'special_audit_case',
            entityId: row.id,
            projectId: row.project_id,
            assignedUserId: row.owner_id,
            assignedRole: row.owner_id ? null : 'COORDINATOR',
            destinationPath: `/governance-cases?special_audit_id=${row.id}`,
        });
    }

    async linkSpecialAuditPlan(id: string, dto: LinkSpecialAuditPlanDto, actor: ResourceActor) {
        const current = await this.prisma.special_audit_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy special audit');
        this.assertAssigned(actor, [current.owner_id, current.created_by]);
        if (CLOSED_SPECIAL.has(current.status) || current.audit_plan_id) {
            throw new ConflictException('Special audit đã đóng hoặc đã liên kết PLAN');
        }
        const plan = await this.prisma.audit_plans.findUnique({ where: { id: dto.audit_plan_id } });
        if (!plan) throw new NotFoundException('Không tìm thấy audit PLAN');
        if (!current.project_id || plan.project_id !== current.project_id) {
            throw new BadRequestException('PLAN phải thuộc đúng dự án của special audit');
        }
        const updated = await this.transaction(async (tx) => {
            const row = await tx.special_audit_cases.update({
                where: { id },
                data: { audit_plan_id: plan.id, status: 'PLANNED' },
            });
            await this.audit(tx, actor, 'SPECIAL_AUDIT_LINK_PLAN', 'special_audit_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `special-audit:${id}:plan` }, this.actorId(actor), tx);
            return row;
        });
        return updated;
    }

    async recordSpecialAuditResult(id: string, dto: RecordSpecialAuditResultDto, actor: ResourceActor) {
        const current = await this.prisma.special_audit_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy special audit');
        this.assertAssigned(actor, [current.owner_id, current.created_by]);
        if (CLOSED_SPECIAL.has(current.status) || current.result) {
            throw new ConflictException('Kết quả special audit đã được chốt');
        }
        if (!current.audit_plan_id) throw new ConflictException('Special audit phải liên kết PLAN trước khi ghi kết quả');
        const updated = await this.transaction(async (tx) => {
            const row = await tx.special_audit_cases.update({
                where: { id },
                data: {
                    result: dto.result.trim(),
                    follow_up_action: dto.follow_up_action,
                    status: dto.follow_up_action === 'NONE' ? 'CLOSED' : 'RESULT_RECORDED',
                    closed_at: dto.follow_up_action === 'NONE' ? new Date() : null,
                },
            });
            await this.audit(tx, actor, 'SPECIAL_AUDIT_RESULT', 'special_audit_case', id);
            return row;
        });
        if (dto.follow_up_action !== 'NONE') {
            await this.workItems.openWorkItem({
                sourceKey: `special-audit:${id}:follow-up`,
                workType: 'SPECIAL_AUDIT_FOLLOW_UP',
                actionCode: WORK_ITEM_ACTIONS.SPECIAL_AUDIT_FOLLOW_UP,
                title: `Xem xét kết quả ${current.case_number}`,
                entityType: 'special_audit_case',
                entityId: id,
                projectId: current.project_id,
                assignedRole: CERTIFICATE_ACTIONS.has(dto.follow_up_action) ? 'DECISION_MAKER' : 'COORDINATOR',
                destinationPath: `/governance-cases?special_audit_id=${id}`,
                context: { recommended_action: dto.follow_up_action },
            });
        }
        return updated;
    }

    async listComplaints(query: CaseListQueryDto, actor: ResourceActor) {
        const rows = await this.prisma.complaint_cases.findMany({
            where: {
                ...this.filters(query),
                AND: [
                    this.scopedWhere(actor, ['owner_id', 'investigator_id', 'decision_owner_id']),
                    query.search ? {
                        OR: [
                            { complaint_number: { contains: query.search } },
                            { subject: { contains: query.search } },
                        ],
                    } : {},
                ],
            },
            orderBy: { created_at: 'desc' },
            take: query.limit ?? 100,
        });
        const evidence = await this.portalEvidence('complaint_case', rows.map((row) => row.id));
        return rows.map((row) => ({
            ...row,
            overdue: this.overdue(row.status, row.acknowledgement_due, row.investigation_due, row.response_due),
            evidence: evidence.get(row.id) ?? [],
        }));
    }

    async createComplaint(dto: CreateComplaintDto, actor: ResourceActor, portal = false) {
        const customerId = portal
            ? await this.resolvePortalCustomer(actor, dto.customer_id)
            : dto.customer_id ?? null;
        if (!customerId && (dto.project_id || dto.certificate_series_id)) {
            throw new BadRequestException('Phải chọn customer_id khi complaint liên kết project/certificate');
        }
        if (customerId) {
            await this.validateCustomerLinks({
                customerId,
                projectId: dto.project_id,
                certificateSeriesId: dto.certificate_series_id,
            });
        }
        const created = await this.transaction(async (tx) => {
            const complaintNumber = await this.documentControl.allocateControlledNumber(tx, 'CMP', undefined, 'COMPLAINT');
            const row = await tx.complaint_cases.create({
                data: {
                    complaint_number: complaintNumber,
                    received_date: new Date(dto.received_date),
                    customer_id: customerId,
                    project_id: dto.project_id ?? null,
                    certificate_series_id: dto.certificate_series_id ?? null,
                    complainant_name: dto.complainant_name.trim(),
                    complainant_contact: dto.complainant_contact?.trim() || null,
                    subject: dto.subject.trim(),
                    description: dto.description.trim(),
                    source_channel: portal ? 'CUSTOMER_PORTAL' : dto.source_channel?.trim().toUpperCase() || 'INTERNAL',
                    submitted_by: this.actorId(actor),
                    involved_user_ids_json: portal ? null : this.json(dto.involved_user_ids),
                    acknowledgement_due: this.date(dto.acknowledgement_due),
                    investigation_due: this.date(dto.investigation_due),
                    response_due: this.date(dto.response_due),
                },
            });
            await this.audit(tx, actor, 'COMPLAINT_RECEIVE', 'complaint_case', row.id);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `complaint:${created.id}:acknowledge`,
            workType: 'COMPLAINT_ACKNOWLEDGE',
            actionCode: WORK_ITEM_ACTIONS.COMPLAINT_ACKNOWLEDGE,
            title: `Xác nhận tiếp nhận ${created.complaint_number}`,
            entityType: 'complaint_case',
            entityId: created.id,
            projectId: created.project_id,
            assignedRole: 'COORDINATOR',
            dueAt: created.acknowledgement_due,
            destinationPath: `/governance-cases?complaint_id=${created.id}`,
        });
        return portal ? this.complaintProjection(created) : created;
    }

    async assignComplaint(id: string, dto: AssignComplaintDto, actor: ResourceActor) {
        const current = await this.prisma.complaint_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy complaint');
        if (!this.broadInternal(actor)) throw new ForbiddenException('Chỉ governance owner được phân công complaint');
        if (CLOSED_COMPLAINT.has(current.status)) throw new ConflictException('Complaint đã đóng và bất biến');
        const involved = new Set<string>(current.involved_user_ids_json ? JSON.parse(current.involved_user_ids_json) : []);
        if (dto.investigator_id === dto.decision_owner_id || involved.has(dto.decision_owner_id)) {
            throw new ConflictException('Decision owner phải độc lập với investigator và người liên quan');
        }
        const updated = await this.transaction(async (tx) => {
            const row = await tx.complaint_cases.update({
                where: { id },
                data: {
                    owner_id: dto.owner_id,
                    investigator_id: dto.investigator_id,
                    decision_owner_id: dto.decision_owner_id,
                    independence_checked_at: new Date(),
                    independence_note: dto.independence_note.trim(),
                    status: current.status === 'RECEIVED' ? 'UNDER_REVIEW' : current.status,
                },
            });
            await this.audit(tx, actor, 'COMPLAINT_ASSIGN', 'complaint_case', id);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `complaint:${id}:investigate`,
            workType: 'COMPLAINT_INVESTIGATE',
            actionCode: WORK_ITEM_ACTIONS.COMPLAINT_INVESTIGATE,
            title: `Điều tra ${current.complaint_number}`,
            entityType: 'complaint_case',
            entityId: id,
            projectId: current.project_id,
            assignedUserId: dto.investigator_id,
            dueAt: current.investigation_due,
            destinationPath: `/governance-cases?complaint_id=${id}`,
        });
        return updated;
    }

    async acknowledgeComplaint(id: string, actor: ResourceActor) {
        const current = await this.prisma.complaint_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy complaint');
        this.assertAssigned(actor, [current.owner_id]);
        if (CLOSED_COMPLAINT.has(current.status) || current.acknowledgement_date) {
            throw new ConflictException('Complaint đã được xác nhận hoặc đã đóng');
        }
        return this.transaction(async (tx) => {
            const row = await tx.complaint_cases.update({
                where: { id },
                data: { acknowledgement_date: new Date(), status: current.investigator_id ? 'INVESTIGATING' : 'ACKNOWLEDGED' },
            });
            await this.audit(tx, actor, 'COMPLAINT_ACKNOWLEDGE', 'complaint_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `complaint:${id}:acknowledge` }, this.actorId(actor), tx);
            return row;
        });
    }

    async investigateComplaint(id: string, dto: ComplaintInvestigationDto, actor: ResourceActor) {
        const current = await this.prisma.complaint_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy complaint');
        if (CLOSED_COMPLAINT.has(current.status)) throw new ConflictException('Complaint đã đóng và bất biến');
        if (current.investigator_id !== this.actorId(actor)) {
            throw new ForbiddenException('Chỉ investigator được phân công mới được cập nhật điều tra');
        }
        if (!current.independence_checked_at) throw new ConflictException('Chưa hoàn tất independence check');
        if (!current.acknowledgement_date) throw new ConflictException('Complaint phải được acknowledge trước khi điều tra');
        const updated = await this.transaction(async (tx) => {
            const row = await tx.complaint_cases.update({
                where: { id },
                data: {
                    investigation: dto.investigation.trim(),
                    findings: dto.findings?.trim() || null,
                    corrective_actions: dto.corrective_actions?.trim() || null,
                    internal_notes: dto.internal_notes?.trim() || null,
                    status: 'RESPONSE_PENDING',
                },
            });
            await this.audit(tx, actor, 'COMPLAINT_INVESTIGATION_UPDATE', 'complaint_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `complaint:${id}:investigate` }, this.actorId(actor), tx);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `complaint:${id}:response`,
            workType: 'COMPLAINT_RESPONSE',
            actionCode: WORK_ITEM_ACTIONS.COMPLAINT_RESPONSE,
            title: `Phản hồi ${current.complaint_number}`,
            entityType: 'complaint_case',
            entityId: id,
            projectId: current.project_id,
            assignedUserId: current.decision_owner_id,
            assignedRole: current.decision_owner_id ? null : 'COORDINATOR',
            dueAt: current.response_due,
            destinationPath: `/governance-cases?complaint_id=${id}`,
        });
        return updated;
    }

    async closeComplaint(id: string, dto: CloseComplaintDto, actor: ResourceActor) {
        const current = await this.prisma.complaint_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy complaint');
        if (CLOSED_COMPLAINT.has(current.status)) throw new ConflictException('Complaint đã đóng và bất biến');
        const actorId = this.actorId(actor);
        if (!current.decision_owner_id || current.decision_owner_id !== actorId) {
            throw new ForbiddenException('Chỉ decision owner độc lập được phân công mới được đóng complaint');
        }
        if (!current.independence_checked_at || current.investigator_id === actorId) {
            throw new ConflictException('Không đáp ứng SoD/independence để đóng complaint');
        }
        return this.transaction(async (tx) => {
            const row = await tx.complaint_cases.update({
                where: { id },
                data: {
                    status: dto.outcome_status,
                    final_response: dto.final_response.trim(),
                    closure_note: dto.closure_note?.trim() || null,
                    closed_at: new Date(),
                },
            });
            await this.audit(tx, actor, 'COMPLAINT_CLOSE', 'complaint_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `complaint:${id}:response` }, actorId, tx);
            return row;
        });
    }

    private complaintProjection(row: Record<string, any>) {
        if (!row) return null;
        return {
            id: row.id,
            complaint_number: row.complaint_number,
            received_date: row.received_date,
            customer_id: row.customer_id,
            project_id: row.project_id,
            certificate_series_id: row.certificate_series_id,
            complainant_name: row.complainant_name,
            subject: row.subject,
            description: row.description,
            source_channel: row.source_channel,
            acknowledgement_date: row.acknowledgement_date,
            acknowledgement_due: row.acknowledgement_due,
            response_due: row.response_due,
            final_response: row.final_response,
            response_document_id: row.response_document_id,
            status: row.status,
            closed_at: row.closed_at,
            created_at: row.created_at,
            overdue: this.overdue(row.status, row.acknowledgement_due, row.response_due),
            evidence: row.evidence ?? [],
        };
    }

    private async portalEvidence(entityType: 'complaint_case' | 'appeal_case', entityIds: string[]) {
        const files = entityIds.length ? await this.prisma.documentFile.findMany({
            where: {
                entity_type: entityType,
                entity_id: { in: entityIds },
                document_type: 'case_evidence',
                file_kind: 'attachment',
            },
            select: {
                id: true,
                entity_id: true,
                original_name: true,
                file_size: true,
                sha256: true,
                version_no: true,
                note: true,
                created_at: true,
            },
            orderBy: { created_at: 'desc' },
        }) : [];
        const grouped = new Map<string, typeof files>();
        for (const file of files) grouped.set(file.entity_id, [...(grouped.get(file.entity_id) ?? []), file]);
        return grouped;
    }

    async portalComplaints(actor: ResourceActor) {
        const customerIds = await this.customerIds(actor);
        const rows = await this.prisma.complaint_cases.findMany({
            where: { customer_id: { in: customerIds } },
            orderBy: { created_at: 'desc' },
        });
        const evidence = await this.portalEvidence('complaint_case', rows.map((row) => row.id));
        return rows.map((row) => this.complaintProjection({ ...row, evidence: evidence.get(row.id) ?? [] }));
    }

    async portalChangeCases(actor: ResourceActor) {
        const customerIds = await this.customerIds(actor);
        const rows = await this.prisma.certification_change_cases.findMany({
            where: {
                customer_id: { in: customerIds },
                source: 'CUSTOMER_ORGANIZATION_CHANGE',
            },
            select: {
                id: true,
                case_number: true,
                source_request_id: true,
                change_type: true,
                description: true,
                effective_date: true,
                status: true,
                assessment_outcome: true,
                special_audit_required: true,
                completed_at: true,
                created_at: true,
                updated_at: true,
            },
            orderBy: { created_at: 'desc' },
        });
        return rows;
    }

    async listAppeals(query: CaseListQueryDto, actor: ResourceActor) {
        const rows = await this.prisma.appeal_cases.findMany({
            where: {
                ...this.filters(query),
                AND: [
                    this.scopedWhere(actor, ['owner_id', 'reviewer_id', 'decision_owner_id']),
                    query.search ? {
                        OR: [
                            { appeal_number: { contains: query.search } },
                            { grounds: { contains: query.search } },
                        ],
                    } : {},
                ],
            },
            include: {
                challenged_decision: { select: { id: true, decision_number: true, decision_date: true, decision_type: true, decision_result: true } },
            },
            orderBy: { created_at: 'desc' },
            take: query.limit ?? 100,
        });
        const evidence = await this.portalEvidence('appeal_case', rows.map((row) => row.id));
        return rows.map((row) => ({
            ...row,
            overdue: this.overdue(row.status, row.acknowledgement_due, row.review_due, row.response_due),
            evidence: evidence.get(row.id) ?? [],
        }));
    }

    async createAppeal(dto: CreateAppealDto, actor: ResourceActor, portal = false) {
        const decision = await this.prisma.certification_decisions.findUnique({
            where: { id: dto.challenged_decision_id },
            include: {
                certification_project: {
                    select: { certification_applications: { select: { customer_id: true } } },
                },
            },
        });
        if (!decision) throw new NotFoundException('Không tìm thấy quyết định bị khiếu nại');
        const customerId = decision.certification_project.certification_applications.customer_id;
        if (portal) await this.resolvePortalCustomer(actor, customerId);
        const created = await this.transaction(async (tx) => {
            const appealNumber = await this.documentControl.allocateControlledNumber(tx, 'APL', undefined, 'APPEAL');
            const row = await tx.appeal_cases.create({
                data: {
                    appeal_number: appealNumber,
                    challenged_decision_id: decision.id,
                    customer_id: customerId,
                    project_id: decision.project_id,
                    certificate_series_id: decision.certificate_series_id,
                    appellant_name: dto.appellant_name.trim(),
                    appellant_contact: dto.appellant_contact?.trim() || null,
                    grounds: dto.grounds.trim(),
                    submitted_by: this.actorId(actor),
                    acknowledgement_due: this.date(dto.acknowledgement_due),
                    review_due: this.date(dto.review_due),
                    response_due: this.date(dto.response_due),
                },
            });
            await this.audit(tx, actor, 'APPEAL_SUBMIT', 'appeal_case', row.id);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `appeal:${created.id}:review`,
            workType: 'APPEAL_REVIEW',
            actionCode: WORK_ITEM_ACTIONS.APPEAL_REVIEW,
            title: `Thẩm xét ${created.appeal_number}`,
            entityType: 'appeal_case',
            entityId: created.id,
            projectId: created.project_id,
            assignedRole: 'TECHNICAL_REVIEWER',
            dueAt: created.review_due,
            destinationPath: `/governance-cases?appeal_id=${created.id}`,
        });
        return portal ? this.appealProjection(created, decision) : created;
    }

    async assignAppeal(id: string, dto: AssignAppealDto, actor: ResourceActor) {
        const current = await this.prisma.appeal_cases.findUnique({
            where: { id },
            include: { challenged_decision: { select: { created_by: true } } },
        });
        if (!current) throw new NotFoundException('Không tìm thấy appeal');
        if (!this.broadInternal(actor)) throw new ForbiddenException('Chỉ governance owner được phân công appeal');
        if (CLOSED_APPEAL.has(current.status)) throw new ConflictException('Appeal đã đóng và bất biến');
        const originalMaker = current.challenged_decision.created_by;
        if (
            dto.reviewer_id === dto.decision_owner_id ||
            (originalMaker && (dto.reviewer_id === originalMaker || dto.decision_owner_id === originalMaker))
        ) {
            throw new ConflictException('Reviewer và appeal decision owner phải độc lập với nhau và người ra quyết định gốc');
        }
        const updated = await this.transaction(async (tx) => {
            const row = await tx.appeal_cases.update({
                where: { id },
                data: {
                    owner_id: dto.owner_id,
                    reviewer_id: dto.reviewer_id,
                    decision_owner_id: dto.decision_owner_id,
                    independence_checked_at: new Date(),
                    independence_note: dto.independence_note.trim(),
                    status: 'UNDER_REVIEW',
                },
            });
            await this.audit(tx, actor, 'APPEAL_ASSIGN', 'appeal_case', id);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `appeal:${id}:review`,
            workType: 'APPEAL_REVIEW',
            actionCode: WORK_ITEM_ACTIONS.APPEAL_REVIEW,
            title: `Thẩm xét ${current.appeal_number}`,
            entityType: 'appeal_case',
            entityId: id,
            projectId: current.project_id,
            assignedUserId: dto.reviewer_id,
            dueAt: current.review_due,
            destinationPath: `/governance-cases?appeal_id=${id}`,
        });
        return updated;
    }

    async reviewAppeal(id: string, dto: AppealReviewDto, actor: ResourceActor) {
        const current = await this.prisma.appeal_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy appeal');
        if (CLOSED_APPEAL.has(current.status)) throw new ConflictException('Appeal đã đóng và bất biến');
        if (current.reviewer_id !== this.actorId(actor)) {
            throw new ForbiddenException('Chỉ appeal reviewer được phân công mới được thẩm xét');
        }
        if (!current.independence_checked_at) throw new ConflictException('Chưa hoàn tất independence check');
        const updated = await this.transaction(async (tx) => {
            const row = await tx.appeal_cases.update({
                where: { id },
                data: {
                    review_notes: dto.review_notes.trim(),
                    internal_deliberation: dto.internal_deliberation?.trim() || null,
                    status: 'DECISION_PENDING',
                },
            });
            await this.audit(tx, actor, 'APPEAL_REVIEW', 'appeal_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `appeal:${id}:review` }, this.actorId(actor), tx);
            return row;
        });
        await this.workItems.openWorkItem({
            sourceKey: `appeal:${id}:decision`,
            workType: 'APPEAL_DECISION',
            actionCode: WORK_ITEM_ACTIONS.APPEAL_DECISION,
            title: `Quyết định appeal ${current.appeal_number}`,
            entityType: 'appeal_case',
            entityId: id,
            projectId: current.project_id,
            assignedUserId: current.decision_owner_id,
            assignedRole: current.decision_owner_id ? null : 'DECISION_MAKER',
            dueAt: current.response_due,
            destinationPath: `/governance-cases?appeal_id=${id}`,
        });
        return updated;
    }

    async decideAppeal(id: string, dto: DecideAppealDto, actor: ResourceActor) {
        const current = await this.prisma.appeal_cases.findUnique({
            where: { id },
            include: { challenged_decision: { select: { created_by: true } } },
        });
        if (!current) throw new NotFoundException('Không tìm thấy appeal');
        if (CLOSED_APPEAL.has(current.status)) throw new ConflictException('Appeal đã đóng và bất biến');
        const actorId = this.actorId(actor);
        if (!current.decision_owner_id || current.decision_owner_id !== actorId) {
            throw new ForbiddenException('Chỉ appeal decision owner được phân công mới được quyết định');
        }
        if (
            !current.independence_checked_at ||
            current.reviewer_id === actorId ||
            current.challenged_decision.created_by === actorId
        ) {
            throw new ConflictException('Không đáp ứng SoD với reviewer hoặc người ra quyết định gốc');
        }
        const successful = ['UPHELD', 'PARTIALLY_UPHELD'].includes(dto.outcome);
        if (successful && (!dto.required_action || dto.required_action === 'NONE')) {
            throw new BadRequestException('Appeal thành công phải chỉ rõ controlled subsequent action');
        }
        const updated = await this.transaction(async (tx) => {
            const row = await tx.appeal_cases.update({
                where: { id },
                data: {
                    outcome: dto.outcome,
                    required_action: dto.required_action ?? 'NONE',
                    final_response: dto.final_response.trim(),
                    status: dto.outcome === 'OUT_OF_SCOPE' ? 'OUT_OF_SCOPE' : 'CLOSED',
                    closed_at: new Date(),
                },
            });
            await this.audit(tx, actor, 'APPEAL_DECIDE', 'appeal_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `appeal:${id}:decision` }, actorId, tx);
            return row;
        });
        if (successful) {
            await this.workItems.openWorkItem({
                sourceKey: `appeal:${id}:subsequent-action`,
                workType: 'CHANGE_CERTIFICATE_ACTION',
                actionCode: WORK_ITEM_ACTIONS.CHANGE_CERTIFICATE_ACTION,
                title: `Hành động sau appeal ${current.appeal_number}`,
                entityType: 'appeal_case',
                entityId: id,
                projectId: current.project_id,
                assignedRole: 'DECISION_MAKER',
                destinationPath: `/certification-projects/${current.project_id}`,
                context: {
                    challenged_decision_id: current.challenged_decision_id,
                    required_action: dto.required_action,
                },
            });
        }
        return updated;
    }

    async linkResultingDecision(domain: 'change' | 'special-audit' | 'appeal', id: string, dto: LinkResultingDecisionDto, actor: ResourceActor) {
        const decision = await this.prisma.certification_decisions.findUnique({ where: { id: dto.decision_id } });
        if (!decision) throw new NotFoundException('Không tìm thấy resulting certification decision');
        if (domain === 'change') {
            const current = await this.prisma.certification_change_cases.findUnique({ where: { id } });
            if (!current) throw new NotFoundException('Không tìm thấy change case');
            this.assertAssigned(actor, [current.owner_id, current.submitted_by]);
            if (current.resulting_decision_id) throw new ConflictException('Resulting decision đã được liên kết');
            if (!current.assessment_outcome || !CERTIFICATE_ACTIONS.has(this.outcomeCertificateAction(current.assessment_outcome))) {
                throw new ConflictException('Change assessment chưa yêu cầu certificate lifecycle action');
            }
            if (!current.project_id || decision.project_id !== current.project_id) throw new BadRequestException('Decision không thuộc dự án của change case');
            const expectedAction = this.outcomeCertificateAction(current.assessment_outcome);
            if (decision.decision_type !== expectedAction) throw new BadRequestException('Decision type không khớp impact assessment');
            return this.transaction(async (tx) => {
                const row = await tx.certification_change_cases.update({
                    where: { id },
                    data: { resulting_decision_id: decision.id, status: 'COMPLETED', completed_at: new Date() },
                });
                await this.audit(tx, actor, 'CHANGE_LINK_RESULTING_DECISION', 'certification_change_case', id);
                await this.workItems.completeWorkItem({ sourceKey: `change:${id}:certificate-action` }, this.actorId(actor), tx);
                return row;
            });
        }
        if (domain === 'special-audit') {
            const current = await this.prisma.special_audit_cases.findUnique({ where: { id } });
            if (!current) throw new NotFoundException('Không tìm thấy special audit');
            this.assertAssigned(actor, [current.owner_id, current.created_by]);
            if (current.resulting_decision_id) throw new ConflictException('Resulting decision đã được liên kết');
            if (!current.result || !current.follow_up_action || !CERTIFICATE_ACTIONS.has(current.follow_up_action)) {
                throw new ConflictException('Special audit chưa ghi nhận certificate follow-up action');
            }
            if (!current.project_id || decision.project_id !== current.project_id) throw new BadRequestException('Decision không thuộc dự án của special audit');
            if (decision.decision_type !== current.follow_up_action) throw new BadRequestException('Decision type không khớp special-audit follow-up action');
            return this.transaction(async (tx) => {
                const row = await tx.special_audit_cases.update({
                    where: { id },
                    data: { resulting_decision_id: decision.id, status: 'CLOSED', closed_at: new Date() },
                });
                await this.audit(tx, actor, 'SPECIAL_AUDIT_LINK_RESULTING_DECISION', 'special_audit_case', id);
                await this.workItems.completeWorkItem({ sourceKey: `special-audit:${id}:follow-up` }, this.actorId(actor), tx);
                return row;
            });
        }
        const current = await this.prisma.appeal_cases.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy appeal');
        this.assertAssigned(actor, [current.owner_id, current.reviewer_id, current.decision_owner_id]);
        if (current.resulting_decision_id) throw new ConflictException('Resulting decision đã được liên kết');
        if (!['UPHELD', 'PARTIALLY_UPHELD'].includes(current.outcome ?? '')) {
            throw new ConflictException('Chỉ appeal thành công mới có subsequent decision');
        }
        if (decision.id === current.challenged_decision_id || decision.project_id !== current.project_id) {
            throw new BadRequestException('Phải liên kết một subsequent decision khác thuộc cùng dự án');
        }
        if (current.required_action !== 'NEW_CERTIFICATION_DECISION' && decision.decision_type !== current.required_action) {
            throw new BadRequestException('Subsequent decision type không khớp appeal outcome');
        }
        return this.transaction(async (tx) => {
            const row = await tx.appeal_cases.update({ where: { id }, data: { resulting_decision_id: decision.id } });
            await this.audit(tx, actor, 'APPEAL_LINK_SUBSEQUENT_DECISION', 'appeal_case', id);
            await this.workItems.completeWorkItem({ sourceKey: `appeal:${id}:subsequent-action` }, this.actorId(actor), tx);
            return row;
        });
    }

    async linkControlledOutput(
        domain: 'change' | 'special-audit' | 'complaint' | 'appeal',
        id: string,
        dto: LinkControlledOutputDto,
        actor: ResourceActor,
    ) {
        const document = await this.prisma.controlled_documents.findUnique({
            where: { id: dto.document_id },
            include: { versions: { where: { status: 'ISSUED' }, select: { id: true }, take: 1 } },
        });
        if (!document || !document.versions.length || document.status !== 'ISSUED') {
            throw new ConflictException('Chỉ được liên kết controlled document đã ISSUED');
        }
        const config = {
            change: { model: 'certification_change_cases', field: 'output_document_id', entity: 'certification_change_case', closed: CLOSED_CHANGE },
            'special-audit': { model: 'special_audit_cases', field: 'output_document_id', entity: 'special_audit_case', closed: CLOSED_SPECIAL },
            complaint: { model: 'complaint_cases', field: 'response_document_id', entity: 'complaint_case', closed: CLOSED_COMPLAINT },
            appeal: { model: 'appeal_cases', field: 'outcome_document_id', entity: 'appeal_case', closed: CLOSED_APPEAL },
        }[domain];
        if (!config) throw new BadRequestException('Domain controlled output không hợp lệ');
        const model = (this.prisma as any)[config.model];
        const current = await model.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy case');
        this.assertAssigned(actor, [current.owner_id, current.investigator_id, current.reviewer_id, current.decision_owner_id, current.created_by, current.submitted_by]);
        if (config.closed.has(current.status) || current[config.field]) throw new ConflictException('Case đã đóng hoặc đã có controlled output');
        if (document.customer_id && document.customer_id !== current.customer_id) throw new BadRequestException('Controlled document không thuộc customer của case');
        if (document.project_id && current.project_id && document.project_id !== current.project_id) throw new BadRequestException('Controlled document không thuộc project của case');
        if (document.entity_type.trim().toLowerCase() !== config.entity || document.entity_id !== id) {
            throw new BadRequestException('Controlled document phải được phát hành chính xác cho case này');
        }
        return this.transaction(async (tx) => {
            const txModel = (tx as any)[config.model];
            const row = await txModel.update({ where: { id }, data: { [config.field]: document.id } });
            await this.audit(tx, actor, 'CASE_LINK_CONTROLLED_OUTPUT', config.entity, id);
            return row;
        });
    }

    private appealProjection(row: Record<string, any>, decision?: Record<string, any>) {
        const challenged = decision ?? row.challenged_decision;
        return {
            id: row.id,
            appeal_number: row.appeal_number,
            customer_id: row.customer_id,
            project_id: row.project_id,
            certificate_series_id: row.certificate_series_id,
            challenged_decision: challenged ? {
                id: challenged.id,
                decision_number: challenged.decision_number,
                decision_date: challenged.decision_date,
                decision_type: challenged.decision_type,
                decision_result: challenged.decision_result,
            } : null,
            appellant_name: row.appellant_name,
            grounds: row.grounds,
            acknowledgement_due: row.acknowledgement_due,
            response_due: row.response_due,
            outcome: row.outcome,
            required_action: row.required_action,
            final_response: row.final_response,
            outcome_document_id: row.outcome_document_id,
            status: row.status,
            closed_at: row.closed_at,
            created_at: row.created_at,
            overdue: this.overdue(row.status, row.acknowledgement_due, row.response_due),
            evidence: row.evidence ?? [],
        };
    }

    async portalAppeals(actor: ResourceActor) {
        const customerIds = await this.customerIds(actor);
        const rows = await this.prisma.appeal_cases.findMany({
            where: { customer_id: { in: customerIds } },
            include: {
                challenged_decision: { select: { id: true, decision_number: true, decision_date: true, decision_type: true, decision_result: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        const evidence = await this.portalEvidence('appeal_case', rows.map((row) => row.id));
        return rows.map((row) => this.appealProjection({ ...row, evidence: evidence.get(row.id) ?? [] }));
    }

    async history(entityType: string, id: string, actor: ResourceActor) {
        const allowed = new Set([
            'certification_change_case',
            'special_audit_case',
            'complaint_case',
            'appeal_case',
        ]);
        if (!allowed.has(entityType)) throw new BadRequestException('Loại case không hợp lệ');
        if (entityType === 'certification_change_case') {
            const row = await this.prisma.certification_change_cases.findUnique({ where: { id } });
            if (!row) throw new NotFoundException('Không tìm thấy change case');
            this.assertAssigned(actor, [row.owner_id, row.submitted_by]);
        } else if (entityType === 'special_audit_case') {
            const row = await this.prisma.special_audit_cases.findUnique({ where: { id } });
            if (!row) throw new NotFoundException('Không tìm thấy special audit');
            this.assertAssigned(actor, [row.owner_id, row.created_by]);
        } else if (entityType === 'complaint_case') {
            const row = await this.prisma.complaint_cases.findUnique({ where: { id } });
            if (!row) throw new NotFoundException('Không tìm thấy complaint');
            this.assertAssigned(actor, [row.owner_id, row.investigator_id, row.decision_owner_id]);
        } else {
            const row = await this.prisma.appeal_cases.findUnique({ where: { id } });
            if (!row) throw new NotFoundException('Không tìm thấy appeal');
            this.assertAssigned(actor, [row.owner_id, row.reviewer_id, row.decision_owner_id]);
        }
        return this.prisma.audit_logs.findMany({
            where: { entity_type: entityType, entity_id: id },
            select: { id: true, action: true, user_id: true, outcome: true, created_at: true },
            orderBy: { created_at: 'asc' },
        });
    }
}
