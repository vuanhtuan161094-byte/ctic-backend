import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CertificationBodyCapabilitiesService } from '../certification-body-capabilities/certification-body-capabilities.service';
import { SecurityAuditService } from '../security/security-audit.service';
import { CreateApplicationReviewDto } from './dto/create-application-review.dto';
import { ReviewApplicationReviewDto } from './dto/review-workflow-action.dto';

type NormalizedIndustryScope = {
    isic_code_id: string;
    isic_code: string;
    isic_revision: string;
    isic_title: string;
    isic_nace_mapping_id: string;
    nace_code_id: string;
    nace_code: string;
    nace_title: string;
    nace_iaf_mapping_id: string;
    iaf_code: string;
    iaf_name: string;
    management_system: 'QMS' | 'EMS' | 'OHSMS';
    scope_description: string;
    is_primary: boolean;
};

const REVIEWER_ROLES = new Set([
    'AUDITOR',
    'LEAD_AUDITOR',
    'TECHNICAL_REVIEWER',
]);

@Injectable()
export class ApplicationReviewsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly certificationBodyCapabilities: CertificationBodyCapabilitiesService,
        private readonly securityAudit: SecurityAuditService,
    ) { }

    private normalizeRole(value: string) {
        return value.trim().toUpperCase();
    }

    private roundToHalf(value: number): number {
        return Math.round((value + Number.EPSILON) * 2) / 2;
    }

    private isHalfDay(value: number): boolean {
        return Math.abs(value * 2 - Math.round(value * 2)) < 0.0001;
    }

    private normalizeReviewMandays(dto: CreateApplicationReviewDto) {
        const finalMandays = dto.final_mandays;

        if (finalMandays === undefined) {
            return {
                stage1Mandays: dto.stage1_mandays,
                stage2Mandays: dto.stage2_mandays,
                surveillanceMandays: dto.surveillance_mandays,
                recertificationMandays: dto.recertification_mandays,
            };
        }

        if (finalMandays < 1.5) {
            throw new BadRequestException(
                'Ngày công chứng nhận lần đầu phải tối thiểu 1,5 MD',
            );
        }

        const suppliedSplitIsValid =
            dto.stage1_mandays !== undefined &&
            dto.stage2_mandays !== undefined &&
            dto.stage1_mandays >= 0.5 &&
            dto.stage2_mandays >= 1 &&
            this.isHalfDay(dto.stage1_mandays) &&
            this.isHalfDay(dto.stage2_mandays) &&
            Math.abs(
                dto.stage1_mandays +
                dto.stage2_mandays -
                finalMandays,
            ) <= 0.01;

        let stage1Mandays: number;
        let stage2Mandays: number;

        if (suppliedSplitIsValid) {
            stage1Mandays = dto.stage1_mandays!;
            stage2Mandays = dto.stage2_mandays!;
        } else {
            stage1Mandays = Math.max(
                0.5,
                this.roundToHalf(finalMandays * 0.2),
            );

            if (finalMandays - stage1Mandays < 1) {
                stage1Mandays = this.roundToHalf(finalMandays - 1);
            }

            stage2Mandays = this.roundToHalf(finalMandays - stage1Mandays);
        }

        return {
            stage1Mandays,
            stage2Mandays,
            surveillanceMandays: Math.max(
                1,
                this.roundToHalf(finalMandays / 3),
            ),
            recertificationMandays: Math.max(
                1,
                this.roundToHalf((finalMandays * 2) / 3),
            ),
        };
    }

    private async validateIndustryScopes(
        scopes: NonNullable<CreateApplicationReviewDto['industry_scopes']>,
    ): Promise<NormalizedIndustryScope[]> {
        const uniqueKeys = new Set<string>();
        const normalized: NormalizedIndustryScope[] = [];

        for (const [index, scope] of scopes.entries()) {
            const uniqueKey = [
                scope.isic_nace_mapping_id,
                scope.nace_iaf_mapping_id,
                scope.management_system,
            ].join(':');

            if (uniqueKeys.has(uniqueKey)) {
                throw new BadRequestException(
                    `Phạm vi mã ngành số ${index + 1} bị trùng`,
                );
            }
            uniqueKeys.add(uniqueKey);

            const isicNaceMapping =
                await this.prisma.industry_code_mappings.findUnique({
                    where: { id: scope.isic_nace_mapping_id },
                    include: {
                        source_code: true,
                        target_code: true,
                    },
                });

            if (
                !isicNaceMapping ||
                isicNaceMapping.mapping_status !== 'APPROVED' ||
                isicNaceMapping.source_code_id !== scope.isic_code_id ||
                isicNaceMapping.target_code_id !== scope.nace_code_id ||
                isicNaceMapping.source_code.classification_type !== 'ISIC' ||
                isicNaceMapping.target_code.classification_type !== 'NACE'
            ) {
                throw new BadRequestException(
                    `Ánh xạ ISIC–NACE số ${index + 1} chưa hợp lệ hoặc chưa được phê duyệt`,
                );
            }

            const naceIafMapping =
                await this.prisma.nace_iaf_mappings.findUnique({
                    where: { id: scope.nace_iaf_mapping_id },
                    include: { iaf_scope: true },
                });

            if (
                !naceIafMapping ||
                naceIafMapping.mapping_status !== 'APPROVED' ||
                naceIafMapping.nace_code_id !== scope.nace_code_id ||
                naceIafMapping.management_system !== scope.management_system ||
                !naceIafMapping.iaf_scope.is_active
            ) {
                throw new BadRequestException(
                    `Ánh xạ NACE–IAF số ${index + 1} chưa hợp lệ hoặc chưa được phê duyệt`,
                );
            }

            normalized.push({
                isic_code_id: isicNaceMapping.source_code.id,
                isic_code: isicNaceMapping.source_code.code,
                isic_revision: isicNaceMapping.source_code.revision,
                isic_title:
                    isicNaceMapping.source_code.title_vi ??
                    isicNaceMapping.source_code.title_en,
                isic_nace_mapping_id: isicNaceMapping.id,
                nace_code_id: isicNaceMapping.target_code.id,
                nace_code: isicNaceMapping.target_code.code,
                nace_title:
                    isicNaceMapping.target_code.title_vi ??
                    isicNaceMapping.target_code.title_en,
                nace_iaf_mapping_id: naceIafMapping.id,
                iaf_code: naceIafMapping.iaf_scope.iaf_code,
                iaf_name: naceIafMapping.iaf_scope.iaf_name,
                management_system: scope.management_system,
                scope_description: scope.scope_description.trim(),
                is_primary: scope.is_primary ?? index === 0,
            });
        }

        return normalized;
    }

    private async findAssigneeUsers() {
        const users = await this.prisma.users.findMany({
            where: { status: 'active' },
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
                user_roles: {
                    select: {
                        roles: {
                            select: { role_name: true },
                        },
                    },
                },
            },
            orderBy: [
                { full_name: 'asc' },
                { username: 'asc' },
            ],
        });

        return users.map((user) => ({
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            roles: user.user_roles.map((item) => item.roles.role_name),
        }));
    }

    async findAssignees() {
        const users = await this.findAssigneeUsers();
        const withNormalizedRoles = users.map((user) => ({
            ...user,
            normalizedRoles: user.roles.map((role) => this.normalizeRole(role)),
        }));

        return {
            reviewers: withNormalizedRoles
                .filter((user) => user.normalizedRoles.some((role) => REVIEWER_ROLES.has(role)))
                .map(({ normalizedRoles: _normalizedRoles, ...user }) => user),
        };
    }

    async findAll() {
        return this.prisma.application_reviews.findMany({
            include: {
                certification_applications: {
                    include: {
                        customers: {
                            select: {
                                id: true,
                                customer_code: true,
                                company_name: true,
                            },
                        },
                        sites: { orderBy: { site_no: 'asc' } },
                    },
                },
                users: {
                    select: { id: true, username: true, full_name: true },
                },
                prepared_by: {
                    select: { id: true, username: true, full_name: true },
                },
                proposed_auditor: {
                    select: {
                        id: true,
                        employee_code: true,
                        full_name: true,
                        email: true,
                    },
                },
                workflow_actions: {
                    include: {
                        actor: {
                            select: { id: true, username: true, full_name: true },
                        },
                    },
                    orderBy: { created_at: 'desc' },
                },
                capability_snapshots: {
                    orderBy: [{ program_code: 'asc' }, { iaf_code: 'asc' }],
                },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    private async getAndValidateReviewer(reviewerId: string) {
        const reviewer = await this.prisma.users.findFirst({
            where: {
                id: reviewerId,
                status: 'active',
            },
            select: {
                id: true,
                username: true,
                full_name: true,
                user_roles: {
                    select: { roles: { select: { role_name: true } } },
                },
            },
        });

        if (!reviewer) {
            throw new BadRequestException(
                'Reviewer không tồn tại hoặc không hoạt động',
            );
        }

        const reviewerRoles = reviewer.user_roles.map((item) =>
            this.normalizeRole(item.roles.role_name),
        );

        if (!reviewerRoles.some((role) => REVIEWER_ROLES.has(role))) {
            throw new BadRequestException(
                'Tài khoản được chọn chưa có vai trò đánh giá viên/chuyên gia được phép xem xét đơn',
            );
        }

        return reviewer;
    }

    private assertMandaysReady(values: {
        manday_method?: string | null;
        base_mandays?: unknown;
        final_mandays?: unknown;
        stage1_mandays?: unknown;
        stage2_mandays?: unknown;
    }) {
        const base = Number(values.base_mandays);
        const final = Number(values.final_mandays);
        const stage1 = Number(values.stage1_mandays);
        const stage2 = Number(values.stage2_mandays);
        const valid = Boolean(values.manday_method) &&
            Number.isFinite(base) && base > 0 &&
            Number.isFinite(final) && final >= 1.5 &&
            Number.isFinite(stage1) && stage1 >= 0.5 && this.isHalfDay(stage1) &&
            Number.isFinite(stage2) && stage2 >= 1 && this.isHalfDay(stage2) &&
            Math.abs(stage1 + stage2 - final) <= 0.01;
        if (!valid) {
            throw new BadRequestException(
                'Phải hoàn tất phép tính ngày công hợp lệ trước khi gửi hoặc phê duyệt bản xem xét',
            );
        }
    }

    private assertSubmissionReady(
        application: { standard_name: string; certification_scope: string | null; declaration_accepted: boolean },
        dto: CreateApplicationReviewDto,
        scopes: NormalizedIndustryScope[],
        mandays: ReturnType<ApplicationReviewsService['normalizeReviewMandays']>,
        reviewerId?: string,
    ) {
        if (!reviewerId) {
            throw new BadRequestException('Phải phân công một reviewer trước khi gửi bản xem xét');
        }
        if (!application.standard_name?.trim() || !application.certification_scope?.trim() || !application.declaration_accepted) {
            throw new BadRequestException('Thông tin bắt buộc của đơn đăng ký chưa đầy đủ');
        }
        if (dto.result.trim().toUpperCase() !== 'ACCEPTED' || !dto.conclusion?.trim()) {
            throw new BadRequestException('Kết luận xem xét chưa đủ điều kiện để gửi reviewer');
        }
        if (!scopes.length) {
            throw new BadRequestException('Phải hoàn tất phân loại ISIC → NACE → IAF trước khi gửi reviewer');
        }
        this.assertMandaysReady({
            manday_method: dto.manday_method,
            base_mandays: dto.base_mandays,
            final_mandays: dto.final_mandays,
            stage1_mandays: mandays.stage1Mandays,
            stage2_mandays: mandays.stage2Mandays,
        });
    }

    async create(dto: CreateApplicationReviewDto, currentUserId?: string) {
        if (!currentUserId) {
            throw new ForbiddenException('Không xác định được tài khoản người lập');
        }

        const submissionAction = dto.submission_action ?? 'SUBMIT';
        const isSubmit = submissionAction === 'SUBMIT';
        const application = await this.prisma.certification_applications.findUnique({
            where: { id: dto.application_id },
            include: {
                application_reviews: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        workflow_status: true,
                        prepared_by_id: true,
                        reviewer_id: true,
                    },
                },
            },
        });

        if (!application) {
            throw new NotFoundException('Không tìm thấy hồ sơ đăng ký chứng nhận');
        }

        const existing = application.application_reviews[0];
        if (existing?.workflow_status === 'SUBMITTED') {
            throw new BadRequestException(
                'Bản xem xét đã được gửi reviewer; reviewer phải trả lại trước khi sửa',
            );
        }
        if (existing?.prepared_by_id && existing.prepared_by_id !== currentUserId) {
            throw new ForbiddenException('Chỉ coordinator đã lập bản xem xét mới được sửa hoặc gửi lại');
        }

        const reviewerId = dto.reviewer_id ?? existing?.reviewer_id ?? undefined;
        const reviewer = reviewerId
            ? await this.getAndValidateReviewer(reviewerId)
            : null;
        if (reviewer?.id === currentUserId) {
            throw new BadRequestException('Người lập/coordinator và reviewer phải là hai tài khoản khác nhau');
        }

        const normalizedResult = dto.result.trim().toUpperCase();
        const normalizedMandays = isSubmit
            ? this.normalizeReviewMandays(dto)
            : {
                stage1Mandays: dto.stage1_mandays,
                stage2Mandays: dto.stage2_mandays,
                surveillanceMandays: dto.surveillance_mandays,
                recertificationMandays: dto.recertification_mandays,
            };
        const normalizedIndustryScopes = dto.industry_scopes?.length
            ? await this.validateIndustryScopes(dto.industry_scopes)
            : [];
        if (isSubmit) {
            this.assertSubmissionReady(
                application,
                dto,
                normalizedIndustryScopes,
                normalizedMandays,
                reviewer?.id,
            );
        }

        const proposedAuditorIds = Array.from(new Set([
            ...(dto.proposed_auditor_ids ?? []),
            ...(dto.proposed_auditor_id ? [dto.proposed_auditor_id] : []),
        ]));
        if (proposedAuditorIds.length) {
            const auditors = await this.prisma.experts.findMany({
                where: { id: { in: proposedAuditorIds } },
                select: { id: true },
            });
            if (auditors.length !== proposedAuditorIds.length) {
                throw new NotFoundException('Không tìm thấy một hoặc nhiều chuyên gia đề xuất');
            }
        }

        const primaryIndustryScope =
            normalizedIndustryScopes.find((scope) => scope.is_primary) ??
            normalizedIndustryScopes[0];

        return this.prisma.$transaction(async (tx) => {
            const now = new Date();
            const fromStatus = existing?.workflow_status ?? 'DRAFT';
            const nextStatus = isSubmit
                ? 'SUBMITTED'
                : ['RETURNED', 'APPROVED'].includes(fromStatus)
                    ? 'RETURNED'
                    : 'DRAFT';
            const reviewData = {
                application_id: dto.application_id,
                reviewer_id: reviewer?.id ?? null,
                prepared_by_id: currentUserId,
                checker_id: null,
                approver_id: null,
                workflow_status: nextStatus,
                submitted_at: isSubmit ? now : undefined,
                review_date: dto.review_date ? new Date(dto.review_date) : now,
                result: normalizedResult,
                comment: dto.comment?.trim(),
                review_items_json: dto.review_items?.length
                    ? JSON.stringify(dto.review_items)
                    : undefined,
                audit_field: dto.audit_field?.trim(),
                isic_code: primaryIndustryScope?.isic_code ?? dto.isic_code?.trim(),
                iaf_code: primaryIndustryScope?.iaf_code ?? dto.iaf_code?.trim(),
                industry_scopes_json: normalizedIndustryScopes.length
                    ? JSON.stringify(normalizedIndustryScopes)
                    : undefined,
                proposed_auditor_id: dto.proposed_auditor_id ?? proposedAuditorIds[0],
                proposed_auditors_json: proposedAuditorIds.length
                    ? JSON.stringify(proposedAuditorIds)
                    : undefined,
                ims_integration_criteria_json: dto.ims_integration_criteria?.length
                    ? JSON.stringify(dto.ims_integration_criteria)
                    : undefined,
                ims_integration_percent: dto.ims_integration_percent,
                combined_audit_capability_percent: dto.combined_audit_capability_percent,
                effective_personnel: dto.effective_personnel,
                risk_level: dto.risk_level?.trim(),
                ems_complexity: dto.ems_complexity?.trim(),
                ohsms_complexity: dto.ohsms_complexity?.trim(),
                manday_method: dto.manday_method,
                base_mandays: dto.base_mandays,
                increase_factors: dto.increase_factors?.trim(),
                increase_percent: dto.increase_percent,
                reduction_factors: dto.reduction_factors?.trim(),
                reduction_percent: dto.reduction_percent,
                integration_reduction_percent: dto.integration_reduction_percent,
                final_mandays: dto.final_mandays,
                stage1_mandays: normalizedMandays.stage1Mandays,
                stage2_mandays: normalizedMandays.stage2Mandays,
                surveillance_mandays: normalizedMandays.surveillanceMandays,
                recertification_mandays: normalizedMandays.recertificationMandays,
                stage1_proposed_date: dto.stage1_proposed_date ? new Date(dto.stage1_proposed_date) : undefined,
                stage2_proposed_date: dto.stage2_proposed_date ? new Date(dto.stage2_proposed_date) : undefined,
                surveillance1_date: dto.surveillance1_date ? new Date(dto.surveillance1_date) : undefined,
                surveillance2_date: dto.surveillance2_date ? new Date(dto.surveillance2_date) : undefined,
                recertification_date: dto.recertification_date ? new Date(dto.recertification_date) : undefined,
                conclusion: dto.conclusion?.trim(),
                client_code: dto.client_code?.trim(),
                checked_by_name: null,
                approved_by_name: null,
                checked_at: null,
                approved_at: null,
                returned_at: null,
                checker_comment: null,
                approver_comment: null,
            };
            const review = await tx.application_reviews.upsert({
                where: { id: existing?.id ?? '00000000-0000-0000-0000-000000000000' },
                create: reviewData,
                update: reviewData,
                include: {
                    certification_applications: {
                        select: { application_code: true, standard_name: true },
                    },
                    users: { select: { id: true, username: true, full_name: true } },
                },
            });

            const action = fromStatus === 'APPROVED'
                ? isSubmit
                    ? 'REVISE_AND_RESUBMIT'
                    : 'REOPEN_APPROVED'
                : isSubmit
                    ? fromStatus === 'RETURNED' ? 'RESUBMIT' : 'SUBMIT'
                    : 'SAVE_DRAFT';
            await tx.application_review_actions.create({
                data: {
                    review_id: review.id,
                    action,
                    from_status: fromStatus,
                    to_status: nextStatus,
                    actor_id: currentUserId,
                    comment: dto.comment?.trim(),
                },
            });

            await tx.certification_applications.update({
                where: { id: dto.application_id },
                data: {
                    status: isSubmit || fromStatus === 'APPROVED'
                        ? 'under_review'
                        : 'draft',
                },
            });

            if (isSubmit && reviewer) {
                await tx.notifications.upsert({
                    where: { source_key: `application-review:${review.id}:submitted` },
                    create: {
                        user_id: reviewer.id,
                        source_key: `application-review:${review.id}:submitted`,
                        notification_type: 'APPLICATION_REVIEW_SUBMITTED',
                        title: 'Đơn đăng ký chờ reviewer xem xét',
                        message: `${application.application_code} đã được gửi tới bạn để phê duyệt hoặc trả lại.`,
                        severity: 'warning',
                        entity_type: 'application_review',
                        entity_id: review.id,
                    },
                    update: {
                        user_id: reviewer.id,
                        status: 'unread',
                        read_at: null,
                        updated_at: now,
                    },
                });
            }

            return review;
        });
    }

    private async getWorkflowReview(reviewId: string) {
        const review = await this.prisma.application_reviews.findUnique({
            where: { id: reviewId },
            include: {
                certification_applications: {
                    select: {
                        id: true,
                        application_code: true,
                        declaration_accepted: true,
                        standard_name: true,
                        certification_scope: true,
                    },
                },
                users: {
                    select: { id: true, username: true, full_name: true },
                },
            },
        });
        if (!review) {
            throw new NotFoundException('Không tìm thấy bản xem xét đăng ký');
        }
        return review;
    }

    async review(
        reviewId: string,
        dto: ReviewApplicationReviewDto,
        currentUserId: string,
        currentRoles: string[],
    ) {
        const review = await this.getWorkflowReview(reviewId);
        if (review.workflow_status !== 'SUBMITTED') {
            throw new BadRequestException('Bản xem xét hiện không ở trạng thái đã gửi reviewer');
        }
        if (review.reviewer_id !== currentUserId) {
            throw new ForbiddenException('Bạn không phải reviewer được phân công cho bản xem xét này');
        }
        if (!currentRoles.some((role) => REVIEWER_ROLES.has(this.normalizeRole(role)))) {
            throw new ForbiddenException('Tài khoản không có vai trò đánh giá viên/chuyên gia được phép xem xét đơn');
        }
        if (review.prepared_by_id === currentUserId) {
            throw new ForbiddenException('Người lập/coordinator không được tự phê duyệt bản xem xét');
        }
        if (dto.action === 'RETURN' && !dto.comment?.trim()) {
            throw new BadRequestException('Phải nhập lý do khi trả lại bản xem xét');
        }

        let capabilityEvaluation: Awaited<ReturnType<CertificationBodyCapabilitiesService['evaluateReview']>> | null = null;
        if (dto.action === 'APPROVE') {
            if (
                review.result !== 'ACCEPTED' ||
                !review.certification_applications.declaration_accepted ||
                !review.certification_applications.standard_name?.trim() ||
                !review.certification_applications.certification_scope?.trim() ||
                !review.conclusion?.trim()
            ) {
                throw new BadRequestException('Thông tin bắt buộc của đơn hoặc kết luận xem xét chưa đủ điều kiện phê duyệt');
            }
            this.assertMandaysReady(review);
            capabilityEvaluation = await this.certificationBodyCapabilities.evaluateReview(reviewId);
            if (capabilityEvaluation.overall_result !== 'CAPABLE') {
                await this.securityAudit.write({
                    userId: currentUserId,
                    action: 'APPLICATION_REVIEW_APPROVAL_CAPABILITY_DENIED',
                    entityType: 'application_review',
                    entityId: reviewId,
                    outcome: 'blocked',
                    statusCode: 400,
                });
                throw new BadRequestException(
                    capabilityEvaluation.overall_result === 'NOT_CAPABLE'
                        ? 'Không thể phê duyệt: tổ chức chứng nhận không đủ năng lực cho toàn bộ Program + IAF đăng ký'
                        : 'Không thể phê duyệt: phân loại ISIC/NACE/IAF cần được xác nhận đầy đủ',
                );
            }
        }

        const nextStatus = dto.action === 'APPROVE' ? 'APPROVED' : 'RETURNED';
        const applicationStatus = dto.action === 'APPROVE' ? 'accepted' : 'under_review';
        const now = new Date();

        const updatedReview = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.application_reviews.update({
                where: { id: reviewId },
                data: {
                    workflow_status: nextStatus,
                    approved_at: dto.action === 'APPROVE' ? now : undefined,
                    returned_at: dto.action === 'RETURN' ? now : undefined,
                    approved_by_name: dto.action === 'APPROVE'
                        ? review.users?.full_name ?? review.users?.username
                        : undefined,
                    approver_comment: dto.comment?.trim(),
                },
            });
            await tx.application_review_actions.create({
                data: {
                    review_id: reviewId,
                    action: dto.action,
                    from_status: review.workflow_status,
                    to_status: nextStatus,
                    actor_id: currentUserId,
                    comment: dto.comment?.trim(),
                },
            });
            await tx.certification_applications.update({
                where: { id: review.application_id },
                data: { status: applicationStatus },
            });

            if (dto.action === 'APPROVE' && capabilityEvaluation) {
                const previousSnapshotVersion =
                    await tx.application_review_capability_snapshots.aggregate({
                        where: { review_id: reviewId },
                        _max: { approval_version: true },
                    });
                const approvalVersion =
                    (previousSnapshotVersion._max.approval_version ?? 0) + 1;

                await tx.application_review_capability_snapshots.createMany({
                    data: this.certificationBodyCapabilities.snapshotData(
                        capabilityEvaluation,
                        currentUserId,
                        approvalVersion,
                    ),
                });
            }

            const targetUserId = review.prepared_by_id;
            if (targetUserId) {
                await tx.notifications.upsert({
                    where: { source_key: `application-review:${reviewId}:${nextStatus}` },
                    create: {
                        user_id: targetUserId,
                        source_key: `application-review:${reviewId}:${nextStatus}`,
                        notification_type: 'APPLICATION_REVIEW_WORKFLOW',
                        title: dto.action === 'APPROVE'
                            ? 'Bản xem xét đã được phê duyệt'
                            : 'Bản xem xét được trả lại coordinator',
                        message: `${review.certification_applications.application_code}: ${dto.comment?.trim() || 'Quy trình đã được cập nhật.'}`,
                        severity: dto.action === 'APPROVE' ? 'success' : 'warning',
                        entity_type: 'application_review',
                        entity_id: reviewId,
                    },
                    update: { status: 'unread', read_at: null, updated_at: now },
                });
            }
            return updated;
        });
        await this.securityAudit.write({
            userId: currentUserId,
            action: dto.action === 'APPROVE'
                ? 'APPLICATION_REVIEW_APPROVED_WITH_CAPABILITY'
                : 'APPLICATION_REVIEW_RETURNED',
            entityType: 'application_review',
            entityId: reviewId,
            outcome: 'success',
            statusCode: 200,
        });
        return updatedReview;
    }

    evaluateCapability(reviewId: string) {
        return this.certificationBodyCapabilities.evaluateReview(reviewId);
    }
}
