import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationReviewDto } from './dto/create-application-review.dto';
import {
    ApproveApplicationReviewDto,
    CheckApplicationReviewDto,
} from './dto/review-workflow-action.dto';

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

const CHECKER_ROLES = new Set([
    'ADMIN',
    'AUDITOR',
    'LEAD_AUDITOR',
    'TECHNICAL_REVIEWER',
]);

const APPROVER_ROLES = new Set([
    'ADMIN',
    'APPROVER',
    'CERTIFICATION_MANAGER',
    'TECHNICAL_REVIEWER',
]);

@Injectable()
export class ApplicationReviewsService {
    constructor(private readonly prisma: PrismaService) { }

    private normalizeRole(value: string) {
        return value.trim().toUpperCase();
    }

    private hasAdminRole(roles: string[] = []) {
        return roles.some((role) => this.normalizeRole(role) === 'ADMIN');
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
            checkers: withNormalizedRoles
                .filter((user) => user.normalizedRoles.some((role) => CHECKER_ROLES.has(role)))
                .map(({ normalizedRoles: _normalizedRoles, ...user }) => user),
            approvers: withNormalizedRoles
                .filter((user) => user.normalizedRoles.some((role) => APPROVER_ROLES.has(role)))
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
                checker: {
                    select: { id: true, username: true, full_name: true },
                },
                approver: {
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
            },
            orderBy: { created_at: 'desc' },
        });
    }

    private async getAndValidateChecker(checkerId: string) {
        const checker = await this.prisma.users.findFirst({
            where: {
                id: checkerId,
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

        if (!checker) {
            throw new BadRequestException(
                'Người kiểm tra không tồn tại hoặc không hoạt động',
            );
        }

        const checkerRoles = checker.user_roles.map((item) =>
            this.normalizeRole(item.roles.role_name),
        );

        if (!checkerRoles.some((role) => CHECKER_ROLES.has(role))) {
            throw new BadRequestException(
                'Tài khoản được chọn chưa có vai trò đánh giá viên/người kiểm tra kỹ thuật',
            );
        }

        return checker;
    }

    async create(dto: CreateApplicationReviewDto, currentUserId?: string) {
        if (!currentUserId) {
            throw new ForbiddenException('Không xác định được tài khoản người lập');
        }
        if (!dto.checker_user_id) {
            throw new BadRequestException(
                'Phải phân công đánh giá viên/người kiểm tra kỹ thuật trước khi gửi xem xét',
            );
        }

        const application = await this.prisma.certification_applications.findUnique({
            where: { id: dto.application_id },
            include: {
                application_reviews: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: { workflow_status: true },
                },
            },
        });

        if (!application) {
            throw new NotFoundException('Không tìm thấy hồ sơ đăng ký chứng nhận');
        }

        const activeWorkflow = application.application_reviews[0]?.workflow_status;
        if (['PENDING_CHECK', 'PENDING_APPROVAL'].includes(activeWorkflow ?? '')) {
            throw new BadRequestException(
                'Đơn này đang trong quy trình kiểm tra/phê duyệt. Không thể gửi thêm bản xem xét mới.',
            );
        }

        const normalizedResult = dto.result.trim().toUpperCase();
        const normalizedMandays = this.normalizeReviewMandays(dto);

        const proposedAuditorIds = Array.from(new Set([
            ...(dto.proposed_auditor_ids ?? []),
            ...(dto.proposed_auditor_id ? [dto.proposed_auditor_id] : []),
        ]));
        const supportedStandardCount = application.standard_name
            .split('+')
            .map((item) => item.trim())
            .filter((item) => /9001|14001|45001/i.test(item))
            .length;

        if (supportedStandardCount > 1 && !proposedAuditorIds.length) {
            throw new BadRequestException(
                'Đánh giá tích hợp phải có ít nhất một chuyên gia dự kiến để tính khả năng đánh giá kết hợp',
            );
        }

        if (proposedAuditorIds.length) {
            const auditors = await this.prisma.experts.findMany({
                where: { id: { in: proposedAuditorIds } },
                select: { id: true, status: true, profile_status: true },
            });
            if (auditors.length !== proposedAuditorIds.length) {
                throw new NotFoundException('Không tìm thấy một hoặc nhiều chuyên gia đề xuất');
            }
            if (auditors.some((auditor) => auditor.status !== 'active' || auditor.profile_status !== 'APPROVED')) {
                throw new BadRequestException(
                    'Chuyên gia đề xuất chưa được phê duyệt hoặc đang ngừng hoạt động',
                );
            }
        }

        const checker = await this.getAndValidateChecker(
            dto.checker_user_id,
        );

        const normalizedIndustryScopes = dto.industry_scopes?.length
            ? await this.validateIndustryScopes(dto.industry_scopes)
            : [];
        const primaryIndustryScope =
            normalizedIndustryScopes.find((scope) => scope.is_primary) ??
            normalizedIndustryScopes[0];

        return this.prisma.$transaction(async (tx) => {
            const now = new Date();
            const review = await tx.application_reviews.create({
                data: {
                    application_id: dto.application_id,
                    reviewer_id: currentUserId,
                    prepared_by_id: currentUserId,
                    checker_id: checker.id,
                    approver_id: null,
                    workflow_status: 'PENDING_CHECK',
                    submitted_at: now,
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
                    checked_by_name: checker.full_name ?? checker.username,
                },
                include: {
                    certification_applications: {
                        select: { application_code: true, standard_name: true },
                    },
                    checker: { select: { id: true, username: true, full_name: true } },
                    approver: { select: { id: true, username: true, full_name: true } },
                },
            });

            await tx.application_review_actions.create({
                data: {
                    review_id: review.id,
                    action: 'SUBMIT_FOR_CHECK',
                    from_status: 'DRAFT',
                    to_status: 'PENDING_CHECK',
                    actor_id: currentUserId,
                    comment: dto.comment?.trim(),
                },
            });

            await tx.certification_applications.update({
                where: { id: dto.application_id },
                data: { status: 'pending_check' },
            });

            await tx.notifications.upsert({
                where: { source_key: `application-review:${review.id}:check` },
                create: {
                    user_id: checker.id,
                    source_key: `application-review:${review.id}:check`,
                    notification_type: 'APPLICATION_REVIEW_CHECK',
                    title: 'Đơn đăng ký chờ kiểm tra kỹ thuật',
                    message: `${application.application_code} đã được gửi tới bạn để kiểm tra.`,
                    severity: 'warning',
                    entity_type: 'application_review',
                    entity_id: review.id,
                },
                update: {
                    user_id: checker.id,
                    status: 'unread',
                    read_at: null,
                    updated_at: now,
                },
            });

            return review;
        });
    }

    private async getWorkflowReview(reviewId: string) {
        const review = await this.prisma.application_reviews.findUnique({
            where: { id: reviewId },
            include: {
                certification_applications: {
                    select: { id: true, application_code: true },
                },
            },
        });
        if (!review) {
            throw new NotFoundException('Không tìm thấy bản xem xét đăng ký');
        }
        return review;
    }

    async check(
        reviewId: string,
        dto: CheckApplicationReviewDto,
        currentUserId: string,
        currentRoles: string[],
    ) {
        const review = await this.getWorkflowReview(reviewId);
        if (!['PENDING_CHECK', 'RETURNED_TO_CHECKER', 'PENDING_APPROVAL'].includes(review.workflow_status)) {
            throw new BadRequestException('Bản xem xét hiện không ở bước đánh giá viên kiểm tra/xác nhận');
        }
        if (review.checker_id !== currentUserId && !this.hasAdminRole(currentRoles)) {
            throw new ForbiddenException('Bạn không phải người được phân công kiểm tra bản xem xét này');
        }

        const nextStatus = dto.action === 'CHECKED'
            ? 'APPROVED'
            : 'RETURNED_TO_PREPARER';
        const resultToApplicationStatus: Record<string, string> = {
            ACCEPTED: 'accepted',
            REJECTED: 'rejected',
            NEED_MORE_INFO: 'need_more_info',
        };
        const applicationStatus = dto.action === 'CHECKED'
            ? (resultToApplicationStatus[review.result] ?? 'accepted')
            : 'under_review';
        const now = new Date();

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.application_reviews.update({
                where: { id: reviewId },
                data: {
                    workflow_status: nextStatus,
                    checked_at: dto.action === 'CHECKED' ? now : undefined,
                    approved_at: dto.action === 'CHECKED' ? now : undefined,
                    returned_at: dto.action === 'RETURN' ? now : undefined,
                    checker_comment: dto.comment?.trim(),
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

            const targetUserId = review.prepared_by_id;
            if (targetUserId) {
                await tx.notifications.upsert({
                    where: { source_key: `application-review:${reviewId}:${nextStatus}` },
                    create: {
                        user_id: targetUserId,
                        source_key: `application-review:${reviewId}:${nextStatus}`,
                        notification_type: 'APPLICATION_REVIEW_WORKFLOW',
                        title: dto.action === 'CHECKED'
                            ? 'Bản xem xét đã được đánh giá viên xác nhận'
                            : 'Bản xem xét được yêu cầu chỉnh sửa',
                        message: `${review.certification_applications.application_code}: ${dto.comment?.trim() || 'Quy trình đã được cập nhật.'}`,
                        severity: dto.action === 'CHECKED' ? 'success' : 'error',
                        entity_type: 'application_review',
                        entity_id: reviewId,
                    },
                    update: { status: 'unread', read_at: null, updated_at: now },
                });
            }
            return updated;
        });
    }

    async approve(
        reviewId: string,
        dto: ApproveApplicationReviewDto,
        currentUserId: string,
        currentRoles: string[],
    ) {
        const review = await this.getWorkflowReview(reviewId);
        if (review.workflow_status !== 'PENDING_APPROVAL') {
            throw new BadRequestException('Bản xem xét hiện không ở bước phê duyệt');
        }
        if (review.approver_id !== currentUserId && !this.hasAdminRole(currentRoles)) {
            throw new ForbiddenException('Bạn không phải người được phân công phê duyệt bản xem xét này');
        }

        const resultToApplicationStatus: Record<string, string> = {
            ACCEPTED: 'accepted',
            REJECTED: 'rejected',
            NEED_MORE_INFO: 'need_more_info',
        };
        const nextStatus = dto.action === 'APPROVE'
            ? 'APPROVED'
            : dto.action === 'REJECT'
                ? 'REJECTED'
                : 'RETURNED_TO_CHECKER';
        const applicationStatus = dto.action === 'APPROVE'
            ? (resultToApplicationStatus[review.result] ?? 'accepted')
            : dto.action === 'REJECT'
                ? 'rejected'
                : 'pending_check';
        const now = new Date();

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.application_reviews.update({
                where: { id: reviewId },
                data: {
                    workflow_status: nextStatus,
                    approved_at: dto.action === 'APPROVE' ? now : undefined,
                    returned_at: dto.action === 'RETURN' ? now : undefined,
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

            const targetUserId = dto.action === 'RETURN'
                ? review.checker_id
                : review.prepared_by_id;
            if (targetUserId) {
                await tx.notifications.upsert({
                    where: { source_key: `application-review:${reviewId}:${nextStatus}` },
                    create: {
                        user_id: targetUserId,
                        source_key: `application-review:${reviewId}:${nextStatus}`,
                        notification_type: 'APPLICATION_REVIEW_WORKFLOW',
                        title: dto.action === 'APPROVE'
                            ? 'Bản xem xét đã được phê duyệt'
                            : dto.action === 'REJECT'
                                ? 'Bản xem xét bị từ chối'
                                : 'Bản xem xét được trả lại bước kiểm tra',
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
    }
}
