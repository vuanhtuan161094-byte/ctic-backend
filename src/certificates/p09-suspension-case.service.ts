import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    hasValidSuspensionApproval, parseSuspensionEvidence,
    SUSPENSION_EXTENSION_ENTITY, SUSPENSION_REVIEW_ENTITY,
    SUSPENSION_REVIEW_SCHEMA, suspensionDeadlineStatus, suspensionType,
    type SuspensionAction,
} from './p09-suspension-case';
import {
    DecideP09SuspensionReviewDto, RequestP09SuspensionReviewDto,
} from './dto/p09-suspension-case.dto';

@Injectable()
export class P09SuspensionCaseService {
    constructor(private readonly prisma: PrismaService) {}

    private today(): Date {
        const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        // en-CA is expected YYYY-MM-DD; UTC fallback keeps audits conservative.
        return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : new Date();
    }

    private async certificate(database: Pick<Prisma.TransactionClient, 'certificates'>, id: string) {
        const certificate = await database.certificates.findUnique({
            where: { id }, select: {
                id: true, cert_number: true, status: true,
                certificate_series_id: true, expire_date: true,
                certificate_series: { select: { project_id: true } },
                status_histories: {
                    where: { to_status: 'suspended' },
                    orderBy: [{ effective_date: 'desc' }, { created_at: 'desc' }],
                    take: 1,
                    select: { id: true, effective_date: true, certification_decision_id: true },
                },
            },
        });
        if (!certificate) throw new NotFoundException('Không tìm thấy chứng chỉ');
        if (certificate.status?.toLowerCase() !== 'suspended') {
            throw new BadRequestException('Hồ sơ xem xét đình chỉ chỉ áp dụng cho chứng chỉ đang bị đình chỉ');
        }
        const suspension = certificate.status_histories[0];
        if (!suspension) throw new BadRequestException(
            'Thiếu lịch sử quyết định F.13 đình chỉ: không thể giả định mốc 3+3 tháng',
        );
        return { certificate, suspension,
            deadline: suspensionDeadlineStatus(suspension.effective_date, this.today()) };
    }

    private async f11(database: Pick<Prisma.TransactionClient, 'technical_reviews'>,
        id: string, projectId: string) {
        const review = await database.technical_reviews.findUnique({
            where: { id },
            select: {
                id: true, reviewer_id: true, status: true,
                reports: { select: {
                    audit_plan_id: true,
                    audit_plans: { select: { project_id: true } },
                } },
            },
        });
        if (review?.status !== 'completed' ||
            review.reports.audit_plans.project_id !== projectId) {
            throw new BadRequestException('F.11 phải hoàn thành và thuộc chính hồ sơ chứng nhận');
        }
        return review;
    }

    private async assignedReviewer(database: Pick<Prisma.TransactionClient, 'users'>, reviewerId: string) {
        const user = await database.users.findFirst({
            where: {
                id: reviewerId, status: 'active',
                user_roles: { some: { roles: { role_name: 'DECISION_MAKER' } } },
            },
            select: { id: true },
        });
        if (!user) throw new ForbiddenException('Người quyết định độc lập không có quyền hoặc đã bị khóa');
    }

    async eligibleReviewers() {
        return this.prisma.users.findMany({
            where: {
                status: 'active',
                user_roles: { some: { roles: { role_name: 'DECISION_MAKER' } } },
            },
            select: { id: true, username: true, full_name: true },
            orderBy: [{ full_name: 'asc' }, { username: 'asc' }],
        });
    }

    async get(id: string) {
        const { certificate, suspension, deadline } = await this.certificate(this.prisma, id);
        const [extension, recommendation] = await Promise.all([
            this.prisma.workflow_approvals.findFirst({
                where: { entity_type: SUSPENSION_EXTENSION_ENTITY, entity_id: id },
                orderBy: [{ step_no: 'desc' }],
                select: { id: true, status: true, approver_id: true, approved_at: true, comment: true },
            }),
            this.prisma.workflow_approvals.findFirst({
                where: { entity_type: SUSPENSION_REVIEW_ENTITY, entity_id: id },
                orderBy: [{ step_no: 'desc' }],
                select: { id: true, status: true, approver_id: true, approved_at: true, comment: true },
            }),
        ]);
        const present = (row: typeof extension) => row ? ({
            id: row.id, status: row.status,
            reviewer_id: row.approver_id, reviewed_at: row.approved_at,
            evidence: parseSuspensionEvidence(row.comment),
        }) : null;
        // A later declined request must not erase an earlier valid extension.
        const approvedRows = await this.prisma.workflow_approvals.findMany({
            where: {
                entity_type: SUSPENSION_EXTENSION_ENTITY,
                entity_id: id,
                status: 'approved',
            },
            orderBy: [{ step_no: 'desc' }],
            select: {
                status: true, approver_id: true, approved_at: true, comment: true,
            },
        });
        const approvedExtension = approvedRows.some((row) =>
            hasValidSuspensionApproval({
                row, action: 'EXTEND_3_MONTHS', certificateId: id,
                seriesId: certificate.certificate_series_id,
                projectId: certificate.certificate_series.project_id,
                historyId: suspension.id,
            }),
        );
        return {
            certificate: { id, cert_number: certificate.cert_number, status: certificate.status },
            suspension: { id: suspension.id, effective_date: suspension.effective_date,
                decision_id: suspension.certification_decision_id },
            deadline, approved_extension: approvedExtension, extension: present(extension),
            recommendation: present(recommendation),
            requires_f13: deadline.after_maximum ||
                (recommendation?.status === 'approved'),
            // Never auto-publish, withdraw or restore by elapsed time.
            legal_status_unchanged: true,
        };
    }

    async request(id: string, dto: RequestP09SuspensionReviewDto, actor: string) {
        if (!['EXTEND_3_MONTHS', 'RECOMMEND_RESTORE', 'RECOMMEND_WITHDRAW',
            'RECOMMEND_REDUCE_SCOPE'].includes(dto.action) ||
            !dto.reason?.trim() || dto.reason.trim().length < 20 ||
            !dto.corrective_evidence?.trim() || dto.corrective_evidence.trim().length < 8) {
            throw new BadRequestException('Thiếu lý do hoặc chứng cứ xem xét đình chỉ');
        }
        if (dto.decision_maker_id.toLowerCase() === actor.toLowerCase()) {
            throw new ForbiddenException('Người lập đề nghị không được tự ra quyết định');
        }
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM dbo.certificates WITH (UPDLOCK, HOLDLOCK) WHERE id = ${id}`;
            const { certificate, suspension, deadline } = await this.certificate(tx, id);
            if (dto.action === 'EXTEND_3_MONTHS' && deadline.after_maximum) {
                throw new BadRequestException('Quá 6 tháng, không được tiếp tục gia hạn đình chỉ');
            }
            if (dto.action === 'RECOMMEND_RESTORE' && deadline.after_maximum) {
                throw new BadRequestException('Đã quá 6 tháng: cần xử lý thu hồi hoặc thu hẹp phạm vi theo P.09');
            }
            await this.assignedReviewer(tx, dto.decision_maker_id);
            const review = await this.f11(tx, dto.technical_review_id, certificate.certificate_series.project_id);
            if (review.reviewer_id.toLowerCase() === actor.toLowerCase() ||
                review.reviewer_id.toLowerCase() === dto.decision_maker_id.toLowerCase()) {
                throw new ForbiddenException('Người thẩm xét F.11 phải độc lập với người yêu cầu và người quyết định');
            }
            const group = suspensionType(dto.action as SuspensionAction);
            const last = await tx.workflow_approvals.findFirst({
                where: { entity_type: group, entity_id: id },
                orderBy: [{ step_no: 'desc' }],
                select: { step_no: true, status: true, comment: true, approver_id: true, approved_at: true },
            });
            if (last?.status === 'pending') throw new ConflictException('Đang có đề nghị chờ quyết định');
            if (dto.action === 'EXTEND_3_MONTHS') {
                // A newer declined request must not erase an older grant of
                // the sole permitted extension for the same suspension.
                const pastApprovals = await tx.workflow_approvals.findMany({
                    where: {
                        entity_type: SUSPENSION_EXTENSION_ENTITY, entity_id: id,
                        status: 'approved',
                    },
                    orderBy: [{ step_no: 'desc' }],
                    select: {
                        status: true, approver_id: true, approved_at: true, comment: true,
                    },
                });
                if (pastApprovals.some((row) => hasValidSuspensionApproval({
                    row, action: 'EXTEND_3_MONTHS', certificateId: id,
                    seriesId: certificate.certificate_series_id,
                    projectId: certificate.certificate_series.project_id,
                    historyId: suspension.id,
                }))) {
                    throw new ConflictException(
                        'Đã duyệt gia hạn 3 tháng cho lần đình chỉ này; không thể gia hạn lần hai',
                    );
                }
            }
            const evidence = {
                schema: SUSPENSION_REVIEW_SCHEMA, action: dto.action,
                certificate_id: id, series_id: certificate.certificate_series_id,
                project_id: certificate.certificate_series.project_id,
                suspension_history_id: suspension.id,
                suspended_at: suspension.effective_date.toISOString().slice(0, 10),
                technical_review_id: review.id,
                requested_by: actor, requested_at: new Date().toISOString(),
                reason: dto.reason.trim(), corrective_evidence: dto.corrective_evidence.trim(),
            };
            const created = await tx.workflow_approvals.create({
                data: {
                    entity_type: group, entity_id: id, step_no: (last?.step_no ?? 0) + 1,
                    approver_id: dto.decision_maker_id, status: 'pending',
                    comment: JSON.stringify(evidence),
                },
                select: { id: true, status: true, step_no: true },
            });
            await tx.audit_logs.create({ data: {
                user_id: actor, action: 'P09_SUSPENSION_REVIEW_REQUEST',
                entity_type: group, entity_id: id, outcome: 'SUCCESS',
                details_json: JSON.stringify({
                    review_id: created.id, technical_review_id: review.id,
                    action: dto.action, history_id: suspension.id,
                }),
            } });
            return { ...created, action: dto.action, legal_status_unchanged: true };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async decide(id: string, action: SuspensionAction, dto: DecideP09SuspensionReviewDto, actor: string) {
        if (!['EXTEND_3_MONTHS', 'RECOMMEND_RESTORE', 'RECOMMEND_WITHDRAW',
            'RECOMMEND_REDUCE_SCOPE'].includes(action) ||
            !['approved', 'rejected'].includes(dto.decision) ||
            !dto.comment?.trim() || dto.comment.trim().length < 20) {
            throw new BadRequestException('Quyết định xem xét đình chỉ hoặc căn cứ chưa hợp lệ');
        }
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM dbo.certificates WITH (UPDLOCK, HOLDLOCK) WHERE id = ${id}`;
            const { certificate, suspension, deadline } = await this.certificate(tx, id);
            await this.assignedReviewer(tx, actor);
            const group = suspensionType(action);
            const latest = await tx.workflow_approvals.findFirst({
                where: { entity_type: group, entity_id: id },
                orderBy: [{ step_no: 'desc' }],
                select: { id: true, status: true, approver_id: true, comment: true },
            });
            const proof = parseSuspensionEvidence(latest?.comment);
            if (!latest || latest.status !== 'pending' || !proof ||
                proof.action !== action || proof.certificate_id !== id ||
                proof.series_id !== certificate.certificate_series_id ||
                proof.project_id !== certificate.certificate_series.project_id ||
                proof.suspension_history_id !== suspension.id) {
                throw new ConflictException('Đề nghị không còn hợp lệ với quyết định đình chỉ hiện hành');
            }
            if (latest.approver_id.toLowerCase() !== actor.toLowerCase() ||
                proof.requested_by.toLowerCase() === actor.toLowerCase()) {
                throw new ForbiddenException('Chỉ người quyết định độc lập được chỉ định mới được xem xét');
            }
            if ((action === 'EXTEND_3_MONTHS' || action === 'RECOMMEND_RESTORE') &&
                deadline.after_maximum && dto.decision === 'approved') {
                throw new BadRequestException('Đã vượt 6 tháng, không được gia hạn/khôi phục theo luồng này');
            }
            const f11 = await this.f11(tx, proof.technical_review_id, certificate.certificate_series.project_id);
            if (f11.reviewer_id.toLowerCase() === actor.toLowerCase()) {
                throw new ForbiddenException('Người thẩm xét F.11 không được tự quyết định');
            }
            const auditMember = await tx.audit_team_members.findFirst({
                where: {
                    audit_team_appointments: { audit_plan_id: f11.reports.audit_plan_id },
                    experts: { user_id: actor },
                    assignment_status: { not: 'cancelled' },
                }, select: { id: true },
            });
            if (auditMember) throw new ForbiddenException('Thành viên đoàn đánh giá không được quyết định cùng hồ sơ');
            const reviewedAt = new Date();
            const change = await tx.workflow_approvals.updateMany({
                where: { id: latest.id, status: 'pending', approver_id: actor },
                data: {
                    status: dto.decision,
                    approved_at: dto.decision === 'approved' ? reviewedAt : null,
                    comment: JSON.stringify({ ...proof,
                        reviewer_comment: dto.comment.trim(), reviewed_at: reviewedAt.toISOString() }),
                },
            });
            if (change.count !== 1) throw new ConflictException('Trạng thái xem xét vừa thay đổi');
            await tx.audit_logs.create({ data: {
                user_id: actor, entity_type: group, entity_id: id,
                action: 'P09_SUSPENSION_REVIEW_DECIDE', outcome: 'SUCCESS',
                details_json: JSON.stringify({
                    review_id: latest.id, action, decision: dto.decision,
                    history_id: suspension.id, f11_id: proof.technical_review_id,
                }),
            } });
            return {
                id: latest.id, status: dto.decision, action,
                f11_id: proof.technical_review_id,
                legal_status_unchanged: true, requires_f13: true,
            };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
}
