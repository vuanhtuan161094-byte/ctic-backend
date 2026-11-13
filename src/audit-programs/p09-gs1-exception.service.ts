import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { firstSurveillanceDeadline, isFirstSurveillanceEvent } from './surveillance-deadline';
import {
    configuredQmrIds, dateKey, GS1_EXCEPTION_ENTITY_TYPE,
    GS1_EXCEPTION_SCHEMA, readGs1ExceptionEvidence,
} from './p09-gs1-exception';
import { DecideGs1ExceptionDto, RequestGs1ExceptionDto } from './dto/p09-gs1-exception.dto';

@Injectable()
export class P09Gs1ExceptionService {
    constructor(private readonly prisma: PrismaService) {}

    private assertQmrConfigured(userId: string) {
        if (!configuredQmrIds().has(userId.toLowerCase())) {
            throw new ForbiddenException(
                'Tài khoản này chưa được chỉ định là QMR cho ngoại lệ P.09; cấu hình P09_QMR_APPROVER_IDS chưa hợp lệ hoặc chưa có.',
            );
        }
    }

    async availableApprovers() {
        const ids = Array.from(configuredQmrIds());
        if (!ids.length) return [];
        return this.prisma.users.findMany({
            where: {
                id: { in: ids },
                status: 'active',
                user_roles: { some: { roles: { role_name: 'ADMIN' } } },
            },
            select: { id: true, username: true, full_name: true },
            orderBy: [{ full_name: 'asc' }, { username: 'asc' }],
        });
    }

    private async programEvent(
        database: Pick<Prisma.TransactionClient, 'audit_program_events'>,
        programId: string, eventId: string,
    ) {
        const event = await database.audit_program_events.findUnique({
            where: { id: eventId },
            select: {
                id: true, event_type: true, planned_start_date: true,
                audit_programs: { select: { id: true, project_id: true } },
            },
        });
        if (!event || event.audit_programs.id !== programId) {
            throw new NotFoundException('Không tìm thấy sự kiện giám sát trong chương trình');
        }
        if (!isFirstSurveillanceEvent(event.event_type)) {
            throw new BadRequestException('Ngoại lệ QMR chỉ áp dụng giám sát lần 1');
        }
        return event;
    }

    private async decisionForProject(
        database: Pick<Prisma.TransactionClient, 'certification_decisions'>, projectId: string,
    ) {
        const decision = await database.certification_decisions.findFirst({
            where: {
                project_id: projectId, status: 'issued',
                decision_result: 'approved',
                decision_type: { in: ['GRANT', 'RECERTIFY'] },
            },
            orderBy: [{ decision_date: 'desc' }, { created_at: 'desc' }],
            select: { id: true, decision_date: true },
        });
        if (!decision) {
            throw new BadRequestException('Chưa có quyết định chứng nhận hợp lệ để xác định hạn giám sát');
        }
        return decision;
    }

    async latest(programId: string, eventId: string) {
        await this.programEvent(this.prisma, programId, eventId);
        const latest = await this.prisma.workflow_approvals.findFirst({
            where: { entity_type: GS1_EXCEPTION_ENTITY_TYPE, entity_id: eventId },
            orderBy: [{ step_no: 'desc' }],
            select: { id: true, status: true, approver_id: true, approved_at: true, comment: true },
        });
        if (!latest) return { status: 'none', evidence: null };
        const evidence = readGs1ExceptionEvidence(latest.comment);
        return {
            status: latest.status, id: latest.id,
            approver_id: latest.approver_id,
            approved_at: latest.approved_at,
            evidence,
        };
    }

    async request(programId: string, eventId: string, dto: RequestGs1ExceptionDto, requesterId: string) {
        const qmrId = dto.qmr_approver_id.toLowerCase();
        this.assertQmrConfigured(qmrId);
        if (qmrId === requesterId.toLowerCase()) {
            throw new ForbiddenException('Người đề nghị không được tự phê duyệt ngoại lệ');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.proposed_start_date) ||
            !dto.reason?.trim() || dto.reason.trim().length < 20) {
            throw new BadRequestException('Thiếu ngày dự kiến hoặc lý do ngoại lệ đủ chi tiết');
        }
        if (dateKey(dto.proposed_start_date) !== dto.proposed_start_date) {
            throw new BadRequestException('Ngày ngoại lệ không hợp lệ');
        }
        return this.prisma.$transaction(async (transaction) => {
            // Prevent two concurrent requests from allocating the same event step.
            await transaction.$queryRaw`
                SELECT id FROM dbo.audit_program_events WITH (UPDLOCK, HOLDLOCK)
                WHERE id = ${eventId}
            `;
            const event = await this.programEvent(transaction, programId, eventId);
            // Only active ADMIN users independently configured as QMR can be
            // assigned. The later decision endpoint checks the actor again.
            const eligible = await transaction.users.findFirst({
                where: {
                    id: dto.qmr_approver_id, status: 'active',
                    user_roles: { some: { roles: { role_name: 'ADMIN' } } },
                },
                select: { id: true },
            });
            if (!eligible) throw new BadRequestException(
                'QMR được chỉ định phải có tài khoản ADMIN đang hoạt động',
            );
            const decision = await this.decisionForProject(transaction, event.audit_programs.project_id);
            const deadline = firstSurveillanceDeadline(decision.decision_date);
            if (new Date(dto.proposed_start_date).getTime() <= deadline.getTime()) {
                throw new BadRequestException('Lịch trong 12 tháng không cần phê duyệt ngoại lệ');
            }
            const previous = await transaction.workflow_approvals.findFirst({
                where: { entity_type: GS1_EXCEPTION_ENTITY_TYPE, entity_id: eventId },
                orderBy: [{ step_no: 'desc' }],
                select: { step_no: true, status: true },
            });
            if (previous?.status === 'pending') {
                throw new ConflictException('Đã có đề nghị ngoại lệ đang chờ QMR xem xét');
            }
            const evidence = {
                schema: GS1_EXCEPTION_SCHEMA,
                project_id: event.audit_programs.project_id,
                program_id: programId,
                decision_id: decision.id,
                decision_date: dateKey(decision.decision_date),
                approved_date: dto.proposed_start_date,
                reason: dto.reason.trim(),
                requested_by: requesterId,
                requested_at: new Date().toISOString(),
            };
            const approval = await transaction.workflow_approvals.create({
                data: {
                    entity_type: GS1_EXCEPTION_ENTITY_TYPE,
                    entity_id: eventId,
                    step_no: (previous?.step_no ?? 0) + 1,
                    approver_id: dto.qmr_approver_id,
                    status: 'pending',
                    comment: JSON.stringify(evidence),
                },
                select: { id: true, step_no: true, status: true },
            });
            await transaction.audit_logs.create({
                data: {
                    user_id: requesterId, entity_type: GS1_EXCEPTION_ENTITY_TYPE,
                    entity_id: eventId, action: 'P09_GS1_EXCEPTION_REQUEST',
                    outcome: 'SUCCESS', details_json: JSON.stringify({
                        approval_id: approval.id, project_id: evidence.project_id,
                        proposed_date: evidence.approved_date, decision_id: evidence.decision_id,
                    }),
                },
            });
            return { ...approval, proposed_start_date: evidence.approved_date, deadline: dateKey(deadline) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async decide(programId: string, eventId: string, dto: DecideGs1ExceptionDto, qmrId: string) {
        this.assertQmrConfigured(qmrId);
        if (!['approved', 'rejected'].includes(dto.decision) ||
            !dto.comment?.trim() || dto.comment.trim().length < 20) {
            throw new BadRequestException('Quyết định và nhận xét QMR phải có căn cứ');
        }
        return this.prisma.$transaction(async (transaction) => {
            await transaction.$queryRaw`
                SELECT id FROM dbo.audit_program_events WITH (UPDLOCK, HOLDLOCK)
                WHERE id = ${eventId}
            `;
            const event = await this.programEvent(transaction, programId, eventId);
            const latest = await transaction.workflow_approvals.findFirst({
                where: { entity_type: GS1_EXCEPTION_ENTITY_TYPE, entity_id: eventId },
                orderBy: [{ step_no: 'desc' }],
                select: { id: true, status: true, approver_id: true, comment: true },
            });
            const evidence = readGs1ExceptionEvidence(latest?.comment);
            if (!latest || !evidence || latest.status !== 'pending') {
                throw new ConflictException('Không có đề nghị ngoại lệ đang chờ duyệt');
            }
            if (evidence.program_id !== programId ||
                evidence.project_id !== event.audit_programs.project_id ||
                latest.approver_id.toLowerCase() !== qmrId.toLowerCase()) {
                throw new ForbiddenException('Không được phê duyệt ngoại lệ của người khác hoặc hồ sơ khác');
            }
            if (evidence.requested_by.toLowerCase() === qmrId.toLowerCase()) {
                throw new ForbiddenException('QMR không được phê duyệt đề nghị của chính mình');
            }
            const current = await this.decisionForProject(transaction, event.audit_programs.project_id);
            if (current.id !== evidence.decision_id || dateKey(current.decision_date) !== evidence.decision_date) {
                throw new ConflictException('Quyết định chứng nhận đã thay đổi, phải lập đề nghị ngoại lệ mới');
            }
            const reviewedAt = new Date();
            const result = await transaction.workflow_approvals.updateMany({
                where: { id: latest.id, status: 'pending', approver_id: qmrId },
                data: {
                    status: dto.decision,
                    approved_at: dto.decision === 'approved' ? reviewedAt : null,
                    comment: JSON.stringify({
                        ...evidence, reviewer_comment: dto.comment.trim(),
                        reviewed_at: reviewedAt.toISOString(),
                    }),
                },
            });
            if (result.count !== 1) {
                throw new ConflictException('Trạng thái phê duyệt đã thay đổi');
            }
            await transaction.audit_logs.create({
                data: {
                    user_id: qmrId, entity_type: GS1_EXCEPTION_ENTITY_TYPE,
                    entity_id: eventId, action: 'P09_GS1_EXCEPTION_DECIDE',
                    outcome: 'SUCCESS', details_json: JSON.stringify({
                        approval_id: latest.id, decision: dto.decision,
                        project_id: evidence.project_id, date: evidence.approved_date,
                    }),
                },
            });
            return {
                id: latest.id, status: dto.decision,
                proposed_start_date: evidence.approved_date,
                reviewed_at: reviewedAt,
            };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
}
