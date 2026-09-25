import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { CreateExpertCompetencyDto } from './dto/create-expert-competency.dto';
import { CreateExpertCompetencyEvidenceDto } from './dto/create-expert-competency-evidence.dto';
import { CreateExpertCompetencyReviewDto } from './dto/create-expert-competency-review.dto';
import { ReactivateExpertCompetencyDto } from './dto/reactivate-expert-competency.dto';
import { RenewExpertCompetencyDto } from './dto/renew-expert-competency.dto';
import { SuspendExpertCompetencyDto } from './dto/suspend-expert-competency.dto';
import { UpdateExpertCompetencyDto } from './dto/update-expert-competency.dto';
import { VoidExpertCompetencyEvidenceDto } from './dto/void-expert-competency-evidence.dto';
import { CreateOwnCompetencyDto } from './dto/competency-submission.dto';

@Injectable()
export class ExpertCompetenciesService {
    private async ownExpert(userId: string) {
        const expert = await this.prisma.experts.findFirst({ where: { user_id: userId }, select: { id: true } });
        if (!expert) throw new ForbiddenException('Tài khoản chưa liên kết hồ sơ chuyên gia');
        return expert;
    }

    private async assertOwned(id: string, userId: string) {
        const expert = await this.ownExpert(userId);
        const row = await this.getCoreOrThrow(id);
        if (row.expert_id !== expert.id) throw new ForbiddenException('Chỉ được thao tác năng lực của chính mình');
        return row;
    }

    async findOwn(userId: string) {
        const expert = await this.ownExpert(userId);
        return this.prisma.expert_competencies.findMany({
            where: { expert_id: expert.id },
            include: { evidence_records: true, action_records: { where: { action_type: 'RETURN' }, orderBy: { created_at: 'desc' }, take: 1 } },
            orderBy: [{ standard_code: 'asc' }, { created_at: 'desc' }],
        });
    }

    async createOwn(dto: CreateOwnCompetencyDto, userId: string) {
        const expert = await this.ownExpert(userId);
        return this.create({ ...dto, expert_id: expert.id }, userId);
    }

    async updateOwn(id: string, dto: UpdateExpertCompetencyDto, userId: string) {
        await this.assertOwned(id, userId);
        return this.update(id, dto, userId, true);
    }

    async addOwnEvidence(id: string, dto: CreateExpertCompetencyEvidenceDto, userId: string) {
        await this.assertOwned(id, userId);
        return this.addEvidence(id, dto, userId, true);
    }

    async submitOwn(id: string, userId: string) {
        await this.assertOwned(id, userId);
        return this.transitionSubmission(id, userId, 'SUBMIT', undefined, true);
    }

    async submit(id: string, userId: string) {
        return this.transitionSubmission(id, userId, 'SUBMIT');
    }

    async returnSubmission(id: string, userId: string, reason: string) {
        if (!reason?.trim()) throw new BadRequestException('Phải nhập lý do yêu cầu bổ sung');
        return this.transitionSubmission(id, userId, 'RETURN', reason.trim());
    }

    private async transitionSubmission(id: string, userId: string, action: 'SUBMIT' | 'RETURN' | 'APPROVE', reason?: string, selfService = false) {
        if (!userId) throw new ForbiddenException('Thiếu tài khoản thực hiện thao tác');
        return this.prisma.$transaction(async (tx) => {
            const row = await tx.expert_competencies.findUnique({ where: { id } });
            if (!row) throw new NotFoundException('Không tìm thấy phạm vi năng lực chuyên gia');
            if (selfService) {
                const owner = await tx.experts.findFirst({ where: { id: row.expert_id, user_id: userId } });
                if (!owner) throw new ForbiddenException('Hồ sơ chuyên gia không thuộc tài khoản hiện tại');
            }
            const allowed = action === 'SUBMIT' ? ['DRAFT', 'RETURNED'] : ['PENDING_APPROVAL'];
            if (!allowed.includes(row.approval_status)) throw new BadRequestException(`Không thể ${action} năng lực ở trạng thái ${row.approval_status}`);
            if (action === 'APPROVE') {
                const submit = await tx.expert_competency_actions.findFirst({ where: { competency_id: id, action_type: 'SUBMIT' }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] });
                if (!submit?.actor_id) throw new BadRequestException('Không tìm thấy người gửi phê duyệt');
                if (submit.actor_id === userId) throw new BadRequestException('Người gửi không được tự phê duyệt năng lực của lần gửi này');
                await this.assertApprovalEvidence(row, tx);
            }
            const status = action === 'SUBMIT' ? 'PENDING_APPROVAL' : action === 'RETURN' ? 'RETURNED' : 'APPROVED';
            const updated = await tx.expert_competencies.update({
                where: { id, approval_status: row.approval_status, updated_at: row.updated_at },
                data: { approval_status: status, ...(action === 'APPROVE' ? { approved_by: userId, approved_at: new Date(), suspended_at: null, suspension_reason: null } : {}) },
            });
            await tx.expert_competency_actions.create({ data: {
                competency_id: id, action_type: action, from_status: row.approval_status, to_status: status,
                actor_id: userId, reason: reason ?? (action === 'SUBMIT' ? 'Gửi phê duyệt năng lực' : 'Phê duyệt năng lực chuyên gia'),
                snapshot_json: this.competencySnapshot(updated),
            } });
            return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    private readonly compactInclude = {
        experts: true,
        approved_by_user: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },
        _count: {
            select: {
                evidence_records: true,
                review_records: true,
                action_records: true,
            },
        },
    } satisfies Prisma.expert_competenciesInclude;

    private readonly governanceInclude = {
        experts: true,
        approved_by_user: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },
        evidence_records: {
            orderBy: [
                { status: 'asc' },
                { created_at: 'desc' },
            ],
            include: {
                added_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                },
                voided_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                },
            },
        },
        review_records: {
            orderBy: [
                { review_date: 'desc' },
                { created_at: 'desc' },
            ],
            include: {
                reviewed_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                },
            },
        },
        action_records: {
            orderBy: {
                created_at: 'desc',
            },
            include: {
                actor: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                },
            },
        },
    } satisfies Prisma.expert_competenciesInclude;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private parseDate(
        value: string,
        fieldName: string,
    ) {
        const match = value.match(
            /^(\d{4})-(\d{2})-(\d{2})/,
        );

        if (!match) {
            throw new BadRequestException(
                `${fieldName} không hợp lệ`,
            );
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(
            Date.UTC(
                year,
                month - 1,
                day,
            ),
        );

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            throw new BadRequestException(
                `${fieldName} không hợp lệ`,
            );
        }

        return date;
    }

    private nullableText(
        value?: string | null,
    ) {
        const trimmed = value?.trim();
        return trimmed || null;
    }

    private normalize(
        value: string,
    ) {
        return value
            .trim()
            .toUpperCase();
    }

    private startOfUtcDay(
        value = new Date(),
    ) {
        return new Date(Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
        ));
    }

    private addMonths(
        value: Date,
        months: number,
    ) {
        const result = new Date(value.getTime());
        result.setUTCMonth(result.getUTCMonth() + months);
        return result;
    }

    private competencySnapshot(
        competency: {
            id: string;
            expert_id: string;
            management_system: string;
            standard_code: string;
            competency_role: string;
            scope_level: string;
            iaf_code: string;
            nace_revision?: string | null;
            nace_code?: string | null;
            competency_level: string;
            approval_status: string;
            effective_date: Date;
            expiry_date?: Date | null;
            scope_description?: string | null;
            restriction?: string | null;
            approval_basis?: string | null;
            evidence_summary?: string | null;
        },
    ) {
        return JSON.stringify({
            id: competency.id,
            expert_id: competency.expert_id,
            management_system: competency.management_system,
            standard_code: competency.standard_code,
            competency_role: competency.competency_role,
            scope_level: competency.scope_level,
            iaf_code: competency.iaf_code,
            nace_revision: competency.nace_revision ?? null,
            nace_code: competency.nace_code ?? null,
            competency_level: competency.competency_level,
            approval_status: competency.approval_status,
            effective_date: competency.effective_date.toISOString(),
            expiry_date: competency.expiry_date?.toISOString() ?? null,
            scope_description: competency.scope_description ?? null,
            restriction: competency.restriction ?? null,
            approval_basis: competency.approval_basis ?? null,
            evidence_summary: competency.evidence_summary ?? null,
        });
    }

    private async getExpertOrThrow(
        id: string,
    ) {
        const expert = await this.prisma.experts.findUnique({
            where: { id },
        });

        if (!expert) {
            throw new NotFoundException(
                'Không tìm thấy chuyên gia',
            );
        }

        if (
            expert.status
                ?.trim()
                .toLowerCase() !== 'active'
        ) {
            throw new BadRequestException(
                'Chuyên gia không ở trạng thái hoạt động',
            );
        }

        return expert;
    }

    private validateScope(
        scopeLevel: string,
        naceCode?: string,
    ) {
        const safeScope = this.normalize(scopeLevel);

        if (
            safeScope === 'NACE' &&
            !naceCode?.trim()
        ) {
            throw new BadRequestException(
                'Năng lực cấp NACE phải có mã NACE',
            );
        }

        return safeScope;
    }

    private validateDates(
        effectiveDate: Date,
        expiryDate: Date | null,
    ) {
        if (
            expiryDate &&
            expiryDate < effectiveDate
        ) {
            throw new BadRequestException(
                'Ngày hết hiệu lực phải bằng hoặc sau ngày hiệu lực',
            );
        }
    }

    private async getCoreOrThrow(
        id: string,
    ) {
        const competency = await this.prisma.expert_competencies.findUnique({
            where: { id },
            include: this.compactInclude,
        });

        if (!competency) {
            throw new NotFoundException(
                'Không tìm thấy phạm vi năng lực chuyên gia',
            );
        }

        return competency;
    }

    private governanceStatus(
        competency: {
            approval_status: string;
            effective_date: Date;
            expiry_date: Date | null;
            approved_at: Date | null;
            evidence_summary: string | null;
            evidence_records: Array<{
                status: string;
                valid_until: Date | null;
            }>;
            review_records: Array<{
                review_date: Date;
                next_review_date: Date | null;
                result: string;
            }>;
        },
    ) {
        const today = this.startOfUtcDay();
        const threshold = new Date(
            today.getTime() + 90 * 24 * 60 * 60 * 1000,
        );
        const latestReview = competency.review_records[0] ?? null;
        const activeEvidence = competency.evidence_records.filter(
            (item) =>
                item.status === 'ACTIVE' &&
                (
                    item.valid_until === null ||
                    item.valid_until >= today
                ),
        ).length;

        let validityStatus = 'ACTIVE';
        if (['DRAFT', 'PENDING_APPROVAL', 'RETURNED'].includes(competency.approval_status)) {
            validityStatus = competency.approval_status;
        } else if (competency.approval_status === 'SUSPENDED') {
            validityStatus = 'SUSPENDED';
        } else if (competency.effective_date > today) {
            validityStatus = 'NOT_YET_EFFECTIVE';
        } else if (
            competency.expiry_date &&
            competency.expiry_date < today
        ) {
            validityStatus = 'EXPIRED';
        } else if (
            competency.expiry_date &&
            competency.expiry_date <= threshold
        ) {
            validityStatus = 'EXPIRING_90_DAYS';
        }

        const reviewBase = latestReview?.review_date ??
            competency.approved_at ??
            competency.effective_date;
        const reviewDueDate = latestReview?.next_review_date ??
            (competency.approval_status === 'APPROVED'
                ? this.addMonths(reviewBase, 12)
                : null);

        let reviewStatus = 'NOT_SCHEDULED';
        if (reviewDueDate) {
            if (reviewDueDate < today) {
                reviewStatus = 'OVERDUE';
            } else if (reviewDueDate <= threshold) {
                reviewStatus = 'DUE_90_DAYS';
            } else {
                reviewStatus = 'CURRENT';
            }
        }

        return {
            validity_status: validityStatus,
            active_evidence_count: activeEvidence,
            evidence_gap:
                competency.approval_status === 'APPROVED' &&
                activeEvidence === 0 &&
                !competency.evidence_summary?.trim(),
            latest_review: latestReview,
            review_due_date: reviewDueDate,
            review_status: reviewStatus,
            requires_management_action:
                latestReview?.result === 'UNSATISFACTORY',
        };
    }

    private async assertApprovalEvidence(
        competency: {
            id: string;
            evidence_summary: string | null;
        },
        client: Prisma.TransactionClient = this.prisma,
    ) {
        if (competency.evidence_summary?.trim()) return;

        const activeEvidence = await client.expert_competency_evidences.count({
            where: {
                competency_id: competency.id,
                status: 'ACTIVE',
                OR: [
                    { valid_until: null },
                    { valid_until: { gte: this.startOfUtcDay() } },
                ],
            },
        });

        if (activeEvidence === 0) {
            throw new BadRequestException(
                'Cần có ít nhất một bằng chứng năng lực có cấu trúc hoặc tóm tắt bằng chứng trước khi phê duyệt',
            );
        }
    }

    async create(
        dto: CreateExpertCompetencyDto,
        actorId: string,
    ) {
        await this.getExpertOrThrow(dto.expert_id);

        const managementSystem = this.normalize(dto.management_system);
        const standardCode = this.normalize(dto.standard_code);
        const competencyRole = this.normalize(dto.competency_role);
        const scopeLevel = this.validateScope(
            dto.scope_level,
            dto.nace_code,
        );
        const iafCode = dto.iaf_code.trim();
        const naceCode = scopeLevel === 'NACE'
            ? dto.nace_code?.trim() ?? null
            : null;
        const effectiveDate = this.parseDate(
            dto.effective_date,
            'Ngày hiệu lực',
        );
        const expiryDate = dto.expiry_date
            ? this.parseDate(dto.expiry_date, 'Ngày hết hiệu lực')
            : null;

        this.validateDates(effectiveDate, expiryDate);

        const existing = await this.prisma.expert_competencies.findFirst({
            where: {
                expert_id: dto.expert_id,
                management_system: managementSystem,
                standard_code: standardCode,
                competency_role: competencyRole,
                iaf_code: iafCode,
                nace_code: naceCode,
            },
        });

        if (existing) {
            throw new ConflictException(
                'Phạm vi năng lực chuyên gia đã tồn tại',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const created = await tx.expert_competencies.create({
                data: {
                    expert_id: dto.expert_id,
                    management_system: managementSystem,
                    standard_code: standardCode,
                    competency_role: competencyRole,
                    scope_level: scopeLevel,
                    iaf_code: iafCode,
                    nace_revision: scopeLevel === 'NACE'
                        ? this.nullableText(dto.nace_revision)
                        : null,
                    nace_code: naceCode,
                    competency_level: this.normalize(
                        dto.competency_level ?? 'QUALIFIED',
                    ),
                    approval_status: 'DRAFT',
                    effective_date: effectiveDate,
                    expiry_date: expiryDate,
                    scope_description: this.nullableText(dto.scope_description),
                    restriction: this.nullableText(dto.restriction),
                    approval_basis: this.nullableText(dto.approval_basis),
                    evidence_summary: this.nullableText(dto.evidence_summary),
                    notes: this.nullableText(dto.notes),
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: created.id,
                    action_type: 'CREATE',
                    from_status: null,
                    to_status: 'DRAFT',
                    reason: 'Tạo hồ sơ năng lực chuyên gia',
                    snapshot_json: this.competencySnapshot(created),
                    actor_id: actorId,
                },
            });

            return tx.expert_competencies.findUniqueOrThrow({
                where: { id: created.id },
                include: this.compactInclude,
            });
        });
    }

    async findAll(
        expertId?: string,
        managementSystem?: string,
        role?: string,
        status?: string,
        iafCode?: string,
        naceCode?: string,
    ) {
        return this.prisma.expert_competencies.findMany({
            where: {
                ...(expertId ? { expert_id: expertId } : {}),
                ...(managementSystem ? {
                    management_system: this.normalize(managementSystem),
                } : {}),
                ...(role ? {
                    competency_role: this.normalize(role),
                } : {}),
                ...(status ? {
                    approval_status: this.normalize(status),
                } : {}),
                ...(iafCode ? { iaf_code: iafCode.trim() } : {}),
                ...(naceCode ? { nace_code: naceCode.trim() } : {}),
            },
            orderBy: [
                { expert_id: 'asc' },
                { management_system: 'asc' },
                { standard_code: 'asc' },
                { competency_role: 'asc' },
            ],
            include: this.compactInclude,
        });
    }

    async findByExpert(
        expertId: string,
    ) {
        await this.getExpertOrThrow(expertId);
        return this.findAll(expertId);
    }

    async findOne(
        id: string,
    ) {
        const competency = await this.prisma.expert_competencies.findUnique({
            where: { id },
            include: this.governanceInclude,
        });

        if (!competency) {
            throw new NotFoundException(
                'Không tìm thấy phạm vi năng lực chuyên gia',
            );
        }

        const evidenceIds = competency.evidence_records.map(
            (item) => item.id,
        );
        const attachments = evidenceIds.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'expert_competency_evidence',
                    entity_id: { in: evidenceIds },
                },
                orderBy: [
                    { entity_id: 'asc' },
                    { version_no: 'desc' },
                ],
            })
            : [];
        type AttachmentWithDownload = (typeof attachments)[number] & {
            download_url: string;
        };
        const attachmentsByEvidence = new Map<string, AttachmentWithDownload[]>();
        for (const item of attachments) {
            const current = attachmentsByEvidence.get(item.entity_id) ?? [];
            current.push({
                ...item,
                download_url: `/document-files/${item.id}/download`,
            });
            attachmentsByEvidence.set(item.entity_id, current);
        }

        return {
            ...competency,
            evidence_records: competency.evidence_records.map((item) => ({
                ...item,
                attachments: attachmentsByEvidence.get(item.id) ?? [],
            })),
            governance: this.governanceStatus(competency),
        };
    }

    async update(
        id: string,
        dto: UpdateExpertCompetencyDto,
        actorId: string,
        selfService = false,
    ) {
        const competency = await this.getCoreOrThrow(id);

        if (!['DRAFT', 'RETURNED'].includes(competency.approval_status)) {
            throw new BadRequestException(
                'Chỉ được sửa năng lực ở trạng thái DRAFT hoặc RETURNED',
            );
        }

        const scopeLevel = dto.scope_level
            ? this.validateScope(
                dto.scope_level,
                dto.nace_code ?? competency.nace_code ?? undefined,
            )
            : competency.scope_level;
        const effectiveDate = dto.effective_date
            ? this.parseDate(dto.effective_date, 'Ngày hiệu lực')
            : competency.effective_date;
        const expiryDate = dto.expiry_date
            ? this.parseDate(dto.expiry_date, 'Ngày hết hiệu lực')
            : competency.expiry_date;

        this.validateDates(effectiveDate, expiryDate);

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.expert_competencies.update({
                where: { id, approval_status: competency.approval_status, updated_at: competency.updated_at,
                    ...(selfService ? { experts: { user_id: actorId } } : {}) },
                data: {
                    ...(dto.management_system !== undefined ? {
                        management_system: this.normalize(dto.management_system),
                    } : {}),
                    ...(dto.standard_code !== undefined ? {
                        standard_code: this.normalize(dto.standard_code),
                    } : {}),
                    ...(dto.competency_role !== undefined ? {
                        competency_role: this.normalize(dto.competency_role),
                    } : {}),
                    ...(dto.scope_level !== undefined ? {
                        scope_level: scopeLevel,
                    } : {}),
                    ...(dto.iaf_code !== undefined ? {
                        iaf_code: dto.iaf_code.trim(),
                    } : {}),
                    ...(dto.nace_revision !== undefined ? {
                        nace_revision: scopeLevel === 'NACE'
                            ? this.nullableText(dto.nace_revision)
                            : null,
                    } : {}),
                    ...(dto.nace_code !== undefined ? {
                        nace_code: scopeLevel === 'NACE'
                            ? this.nullableText(dto.nace_code)
                            : null,
                    } : {}),
                    ...(dto.competency_level !== undefined ? {
                        competency_level: this.normalize(dto.competency_level),
                    } : {}),
                    effective_date: effectiveDate,
                    expiry_date: expiryDate,
                    ...(dto.scope_description !== undefined ? {
                        scope_description: this.nullableText(dto.scope_description),
                    } : {}),
                    ...(dto.restriction !== undefined ? {
                        restriction: this.nullableText(dto.restriction),
                    } : {}),
                    ...(dto.approval_basis !== undefined ? {
                        approval_basis: this.nullableText(dto.approval_basis),
                    } : {}),
                    ...(dto.evidence_summary !== undefined ? {
                        evidence_summary: this.nullableText(dto.evidence_summary),
                    } : {}),
                    ...(dto.notes !== undefined ? {
                        notes: this.nullableText(dto.notes),
                    } : {}),
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: id,
                    action_type: 'UPDATE',
                    from_status: competency.approval_status,
                    to_status: competency.approval_status,
                    reason: 'Cập nhật hồ sơ năng lực dự thảo',
                    snapshot_json: this.competencySnapshot(updated),
                    actor_id: actorId,
                },
            });

            return tx.expert_competencies.findUniqueOrThrow({
                where: { id },
                include: this.compactInclude,
            });
        });
    }

    async approve(id: string, userId: string) {
        const competency = await this.getCoreOrThrow(id);
        await this.getExpertOrThrow(competency.expert_id);
        return this.transitionSubmission(id, userId, 'APPROVE');
    }

    async suspend(
        id: string,
        dto: SuspendExpertCompetencyDto,
        userId: string,
    ) {
        const competency = await this.getCoreOrThrow(id);

        if (competency.approval_status !== 'APPROVED') {
            throw new BadRequestException(
                'Chỉ được đình chỉ năng lực đã được phê duyệt',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.expert_competencies.update({
                where: { id },
                data: {
                    approval_status: 'SUSPENDED',
                    suspended_at: new Date(),
                    suspension_reason: dto.reason.trim(),
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: id,
                    action_type: 'SUSPEND',
                    from_status: 'APPROVED',
                    to_status: 'SUSPENDED',
                    reason: dto.reason.trim(),
                    snapshot_json: this.competencySnapshot(updated),
                    actor_id: userId,
                },
            });

            return tx.expert_competencies.findUniqueOrThrow({
                where: { id },
                include: this.compactInclude,
            });
        });
    }

    async reactivate(
        id: string,
        dto: ReactivateExpertCompetencyDto,
        userId: string,
    ) {
        const competency = await this.getCoreOrThrow(id);
        await this.getExpertOrThrow(competency.expert_id);

        if (competency.approval_status !== 'SUSPENDED') {
            throw new BadRequestException(
                'Chỉ được khôi phục năng lực đang bị đình chỉ',
            );
        }

        await this.assertApprovalEvidence(competency);
        const latestReview = await this.prisma.expert_competency_reviews.findFirst({
            where: { competency_id: id },
            orderBy: [
                { review_date: 'desc' },
                { created_at: 'desc' },
            ],
        });
        if (latestReview?.result === 'UNSATISFACTORY') {
            throw new BadRequestException(
                'Không thể khôi phục khi lần đánh giá năng lực gần nhất có kết quả không đạt',
            );
        }

        const effectiveDate = dto.effective_date
            ? this.parseDate(dto.effective_date, 'Ngày hiệu lực')
            : competency.effective_date;
        const expiryDate = dto.expiry_date
            ? this.parseDate(dto.expiry_date, 'Ngày hết hiệu lực')
            : competency.expiry_date;
        this.validateDates(effectiveDate, expiryDate);

        if (
            expiryDate &&
            expiryDate < this.startOfUtcDay()
        ) {
            throw new BadRequestException(
                'Năng lực đã hết hạn; cần cập nhật thời hạn mới khi khôi phục',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.expert_competencies.update({
                where: { id },
                data: {
                    approval_status: 'APPROVED',
                    approved_by: userId,
                    approved_at: new Date(),
                    effective_date: effectiveDate,
                    expiry_date: expiryDate,
                    approval_basis: dto.decision_basis.trim(),
                    suspended_at: null,
                    suspension_reason: null,
                    notes: dto.note !== undefined
                        ? this.nullableText(dto.note)
                        : competency.notes,
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: id,
                    action_type: 'REACTIVATE',
                    from_status: 'SUSPENDED',
                    to_status: 'APPROVED',
                    reason: dto.decision_basis.trim(),
                    snapshot_json: this.competencySnapshot(updated),
                    actor_id: userId,
                },
            });

            return tx.expert_competencies.findUniqueOrThrow({
                where: { id },
                include: this.compactInclude,
            });
        });
    }

    async renew(
        id: string,
        dto: RenewExpertCompetencyDto,
        userId: string,
    ) {
        const competency = await this.getCoreOrThrow(id);
        await this.getExpertOrThrow(competency.expert_id);

        if (competency.approval_status !== 'APPROVED') {
            throw new BadRequestException(
                'Chỉ được gia hạn năng lực đang được phê duyệt; năng lực đình chỉ phải khôi phục trước',
            );
        }

        await this.assertApprovalEvidence(competency);

        const latestReview = await this.prisma.expert_competency_reviews.findFirst({
            where: { competency_id: id },
            orderBy: [
                { review_date: 'desc' },
                { created_at: 'desc' },
            ],
        });
        if (!latestReview) {
            throw new BadRequestException(
                'Cần có kết quả đánh giá năng lực trước khi gia hạn',
            );
        }
        if (latestReview.result === 'UNSATISFACTORY') {
            throw new BadRequestException(
                'Không thể gia hạn khi lần tái đánh giá gần nhất có kết quả không đạt',
            );
        }
        const reviewDueDate = latestReview.next_review_date ??
            this.addMonths(latestReview.review_date, 12);
        if (reviewDueDate < this.startOfUtcDay()) {
            throw new BadRequestException(
                'Kết quả đánh giá năng lực đã quá hạn; cần thực hiện đánh giá lại trước khi gia hạn',
            );
        }

        const effectiveDate = this.parseDate(
            dto.effective_date,
            'Ngày hiệu lực',
        );
        const expiryDate = this.parseDate(
            dto.expiry_date,
            'Ngày hết hiệu lực',
        );
        this.validateDates(effectiveDate, expiryDate);

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.expert_competencies.update({
                where: { id },
                data: {
                    effective_date: effectiveDate,
                    expiry_date: expiryDate,
                    approval_basis: dto.decision_basis.trim(),
                    approved_by: userId,
                    approved_at: new Date(),
                    notes: dto.note !== undefined
                        ? this.nullableText(dto.note)
                        : competency.notes,
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: id,
                    action_type: 'RENEW',
                    from_status: 'APPROVED',
                    to_status: 'APPROVED',
                    reason: dto.decision_basis.trim(),
                    snapshot_json: this.competencySnapshot(updated),
                    actor_id: userId,
                },
            });

            return tx.expert_competencies.findUniqueOrThrow({
                where: { id },
                include: this.compactInclude,
            });
        });
    }

    async addEvidence(
        competencyId: string,
        dto: CreateExpertCompetencyEvidenceDto,
        userId: string,
        selfService = false,
    ) {
        const competency = await this.getCoreOrThrow(competencyId);
        const evidenceDate = dto.evidence_date
            ? this.parseDate(dto.evidence_date, 'Ngày bằng chứng')
            : null;
        const validUntil = dto.valid_until
            ? this.parseDate(dto.valid_until, 'Ngày hết hiệu lực bằng chứng')
            : null;
        if (
            evidenceDate &&
            validUntil &&
            validUntil < evidenceDate
        ) {
            throw new BadRequestException(
                'Ngày hết hiệu lực bằng chứng phải bằng hoặc sau ngày bằng chứng',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            if (selfService) {
                const current = await tx.expert_competencies.findUnique({ where: { id: competencyId } });
                if (!current || !['DRAFT', 'RETURNED'].includes(current.approval_status)) {
                    throw new BadRequestException('Chỉ được bổ sung bằng chứng tự khai khi DRAFT hoặc RETURNED');
                }
                const owner = await tx.experts.findFirst({ where: { id: current.expert_id, user_id: userId } });
                if (!owner) throw new ForbiddenException('Hồ sơ chuyên gia không thuộc tài khoản hiện tại');
            }
            const evidence = await tx.expert_competency_evidences.create({
                data: {
                    competency_id: competencyId,
                    evidence_type: this.normalize(dto.evidence_type),
                    title: dto.title.trim(),
                    reference_no: this.nullableText(dto.reference_no),
                    evidence_date: evidenceDate,
                    valid_until: validUntil,
                    result: this.nullableText(dto.result)?.toUpperCase() ?? null,
                    score: dto.score ?? null,
                    mandays: dto.mandays ?? null,
                    description: this.nullableText(dto.description),
                    status: 'ACTIVE',
                    added_by: userId,
                },
                include: {
                    added_by_user: {
                        select: {
                            id: true,
                            username: true,
                            full_name: true,
                            email: true,
                        },
                    },
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: competencyId,
                    action_type: 'EVIDENCE_ADDED',
                    from_status: competency.approval_status,
                    to_status: competency.approval_status,
                    reason: `${evidence.evidence_type}: ${evidence.title}`,
                    snapshot_json: JSON.stringify({
                        evidence_id: evidence.id,
                        evidence_type: evidence.evidence_type,
                        title: evidence.title,
                        reference_no: evidence.reference_no,
                        evidence_date: evidence.evidence_date?.toISOString() ?? null,
                        valid_until: evidence.valid_until?.toISOString() ?? null,
                        score: evidence.score?.toString() ?? null,
                        mandays: evidence.mandays?.toString() ?? null,
                    }),
                    actor_id: userId,
                },
            });

            return evidence;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async voidEvidence(
        competencyId: string,
        evidenceId: string,
        dto: VoidExpertCompetencyEvidenceDto,
        userId: string,
    ) {
        const competency = await this.getCoreOrThrow(competencyId);
        const evidence = await this.prisma.expert_competency_evidences.findFirst({
            where: {
                id: evidenceId,
                competency_id: competencyId,
            },
        });

        if (!evidence) {
            throw new NotFoundException(
                'Không tìm thấy bằng chứng năng lực',
            );
        }
        if (evidence.status === 'VOID') {
            return evidence;
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.expert_competency_evidences.update({
                where: { id: evidenceId },
                data: {
                    status: 'VOID',
                    voided_by: userId,
                    voided_at: new Date(),
                    void_reason: dto.reason.trim(),
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: competencyId,
                    action_type: 'EVIDENCE_VOIDED',
                    from_status: competency.approval_status,
                    to_status: competency.approval_status,
                    reason: dto.reason.trim(),
                    snapshot_json: JSON.stringify({
                        evidence_id: updated.id,
                        evidence_type: updated.evidence_type,
                        title: updated.title,
                        status: updated.status,
                        voided_at: updated.voided_at?.toISOString() ?? null,
                    }),
                    actor_id: userId,
                },
            });

            return updated;
        });
    }

    async addReview(
        competencyId: string,
        dto: CreateExpertCompetencyReviewDto,
        userId: string,
    ) {
        const competency = await this.getCoreOrThrow(competencyId);
        if (['DRAFT', 'PENDING_APPROVAL', 'RETURNED'].includes(competency.approval_status)) {
            throw new BadRequestException(
                'Chỉ ghi nhận tái đánh giá sau khi năng lực đã được phê duyệt',
            );
        }

        const reviewDate = this.parseDate(
            dto.review_date,
            'Ngày tái đánh giá',
        );
        const nextReviewDate = dto.next_review_date
            ? this.parseDate(dto.next_review_date, 'Ngày đánh giá tiếp theo')
            : this.addMonths(reviewDate, 12);
        if (nextReviewDate < reviewDate) {
            throw new BadRequestException(
                'Ngày đánh giá tiếp theo phải bằng hoặc sau ngày tái đánh giá',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const review = await tx.expert_competency_reviews.create({
                data: {
                    competency_id: competencyId,
                    review_type: this.normalize(dto.review_type),
                    review_date: reviewDate,
                    monitoring_methods: dto.monitoring_methods.trim(),
                    score: dto.score ?? null,
                    result: this.normalize(dto.result),
                    finding: this.nullableText(dto.finding),
                    required_action: this.nullableText(dto.required_action),
                    next_review_date: nextReviewDate,
                    reviewed_by: userId,
                },
                include: {
                    reviewed_by_user: {
                        select: {
                            id: true,
                            username: true,
                            full_name: true,
                            email: true,
                        },
                    },
                },
            });

            await tx.expert_competency_actions.create({
                data: {
                    competency_id: competencyId,
                    action_type: 'REVIEW_RECORDED',
                    from_status: competency.approval_status,
                    to_status: competency.approval_status,
                    reason: `${review.review_type}: ${review.result}`,
                    snapshot_json: JSON.stringify({
                        review_id: review.id,
                        review_type: review.review_type,
                        review_date: review.review_date.toISOString(),
                        monitoring_methods: review.monitoring_methods,
                        score: review.score?.toString() ?? null,
                        result: review.result,
                        next_review_date: review.next_review_date?.toISOString() ?? null,
                    }),
                    actor_id: userId,
                },
            });

            return review;
        });
    }
}
