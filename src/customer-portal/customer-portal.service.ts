import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    ResourceAccessService,
    type ResourceActor,
} from '../security/resource-access.service';
import {
    CertificationApplicationsService,
} from '../certification-applications/certification-applications.service';
import type {
    CreateCertificationApplicationDto,
} from '../certification-applications/dto/create-certification-application.dto';
import {
    WorkItemsService,
} from '../work-items/work-items.service';
import {
    WORK_ITEM_ACTIONS,
} from '../work-items/work-item.constants';
import type {
    CustomerCertificationApplicationDto,
} from './dto/customer-certification-application.dto';
import type {
    CreateCustomerOrganizationChangeRequestDto,
} from './dto/create-customer-organization-change-request.dto';
import type {
    ReviewCustomerOrganizationChangeRequestDto,
} from './dto/review-customer-organization-change-request.dto';
import type {
    CreateCustomerUserAccessRequestDto,
} from './dto/create-customer-user-access-request.dto';
import type {
    ReviewCustomerUserAccessRequestDto,
} from './dto/review-customer-user-access-request.dto';

const CUSTOMER_SAFE_NOTIFICATION_CATEGORIES = new Set([
    'CAP_DUE',
    'CERTIFICATE_EXPIRING',
    'CERTIFICATE_STATUS_CHANGED',
]);

@Injectable()
export class CustomerPortalService {
    constructor(
        private readonly prisma:
            PrismaService,
        private readonly resourceAccess:
            ResourceAccessService,
        private readonly applications:
            CertificationApplicationsService,
        private readonly workItems:
            WorkItemsService,
    ) { }

    private normalize(value?: string | null) {
        return (value ?? '')
            .trim()
            .toLowerCase();
    }

    private isCustomerSafeNotification(input: {
        category: string;
        notification_type: string;
    }) {
        const notificationType = input.notification_type.toUpperCase();
        return (
            CUSTOMER_SAFE_NOTIFICATION_CATEGORIES.has(input.category) ||
            notificationType.startsWith('CUSTOMER_') ||
            notificationType.startsWith('PORTAL_')
        );
    }

    private customerNotificationDestination(input: {
        category: string;
        notification_type: string;
    }) {
        if (input.category === 'CAP_DUE') {
            return '/customer-portal/corrective-actions';
        }
        if (input.category.startsWith('CERTIFICATE_')) {
            return '/customer-portal/certificates';
        }

        const notificationType = input.notification_type.toUpperCase();
        if (notificationType.includes('ORGANIZATION_CHANGE')) {
            return '/customer-portal/profile';
        }
        if (notificationType.includes('USER_ACCESS')) {
            return '/customer-portal/users';
        }
        if (notificationType.includes('DOCUMENT')) {
            return '/customer-portal/documents';
        }
        if (
            notificationType.includes('RESULT') ||
            notificationType.includes('F12')
        ) {
            return '/customer-portal/results';
        }
        return '/customer-portal/notifications';
    }

    private async accessibleCustomerIds(
        actor: ResourceActor,
    ) {
        const ids =
            await this.resourceAccess
                .getAccessibleCustomerIds(actor);

        if (!ids.size) {
            throw new ForbiddenException(
                'Tài khoản chưa được gán cho tổ chức khách hàng đang hoạt động',
            );
        }

        return Array.from(ids);
    }

    private async resolveCustomerId(
        actor: ResourceActor,
        requestedCustomerId?: string,
    ) {
        const ids =
            await this.accessibleCustomerIds(actor);

        if (requestedCustomerId) {
            if (!ids.includes(requestedCustomerId)) {
                throw new ForbiddenException(
                    'Bạn không có quyền thao tác với tổ chức khách hàng này',
                );
            }
            return requestedCustomerId;
        }

        if (ids.length !== 1) {
            throw new BadRequestException(
                'Tài khoản được gán cho nhiều tổ chức. Vui lòng chọn tổ chức trước khi tạo đơn.',
            );
        }

        return ids[0];
    }

    private toApplicationDto(
        input: CustomerCertificationApplicationDto,
        customerId: string,
        applicationCode?: string,
    ): CreateCertificationApplicationDto {
        return {
            customer_id: customerId,
            application_code: applicationCode,
            application_date: input.application_date,
            certification_type: input.certification_type,
            standard_name: input.standard_name,
            certification_scope: input.certification_scope,
            headquarters_address: input.headquarters_address,
            representative_name: input.representative_name,
            representative_position: input.representative_position,
            representative_phone: input.representative_phone,
            representative_email: input.representative_email,
            contact_name: input.contact_name,
            contact_position: input.contact_position,
            contact_phone: input.contact_phone,
            contact_email: input.contact_email,
            total_employee_count: input.total_employee_count,
            employee_count: input.employee_count,
            shift_count: input.shift_count,
            shift1_count: input.shift1_count,
            shift2_count: input.shift2_count,
            shift3_count: input.shift3_count,
            external_provider_used: input.external_provider_used,
            outsourced_processes: input.outsourced_processes,
            requested_audit_date: input.requested_audit_date,
            stage1_requested_date: input.stage1_requested_date,
            stage2_requested_date: input.stage2_requested_date,
            other_management_systems: input.other_management_systems,
            management_system_details: input.management_system_details,
            certificate_languages: input.certificate_languages,
            other_requests: input.other_requests,
            declaration_accepted: input.declaration_accepted,
            sites: input.sites,
        };
    }

    private customerApplicationStatus(
        status?: string | null,
        reviewStatus?: string | null,
        hasProject = false,
    ) {
        if (hasProject) return 'IN_CERTIFICATION';

        const review = this.normalize(reviewStatus);
        if (review === 'approved') return 'ACCEPTED';
        if (review === 'returned') return 'REVISION_REQUIRED';
        if (review === 'submitted') return 'UNDER_REVIEW';

        const application = this.normalize(status);
        if (application === 'submitted' || application === 'under_review') {
            return 'SUBMITTED';
        }
        if (application === 'rejected') return 'REJECTED';
        if (application === 'cancelled') return 'CANCELLED';
        return 'DRAFT';
    }

    async getProfile(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        return this.prisma.customers.findMany({
            where: {
                id: {
                    in: customerIds,
                },
                status: 'active',
            },
            select: {
                id: true,
                customer_code: true,
                company_name: true,
                country_code: true,
                country_name: true,
                tax_code: true,
                address: true,
                phone: true,
                email: true,
                status: true,
                contacts: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                        phone: true,
                        position: true,
                    },
                    orderBy: {
                        full_name: 'asc',
                    },
                },
            },
            orderBy: {
                company_name: 'asc',
            },
        });
    }

    private actorUserId(actor: ResourceActor) {
        const userId = actor.userId?.trim();
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được tài khoản đang đăng nhập',
            );
        }
        return userId;
    }

    private parseSnapshot<T>(value: string): T {
        try {
            return JSON.parse(value) as T;
        } catch {
            throw new BadRequestException(
                'Dữ liệu snapshot của yêu cầu thay đổi không hợp lệ',
            );
        }
    }

    private normalizeRequestedText(
        value: string | undefined,
        current: string | null,
    ) {
        if (value === undefined) return current;
        const normalized = value.trim();
        return normalized || null;
    }

    async getOrganizationChangeRequests(actor: ResourceActor) {
        const customerIds = await this.accessibleCustomerIds(actor);
        const items = await this.prisma.customer_organization_change_requests.findMany({
            where: { customer_id: { in: customerIds } },
            select: {
                id: true,
                request_code: true,
                customer_id: true,
                status: true,
                reason: true,
                before_snapshot: true,
                after_snapshot: true,
                review_comment: true,
                submitted_at: true,
                reviewed_at: true,
                applied_at: true,
                created_at: true,
                customer: {
                    select: {
                        customer_code: true,
                        company_name: true,
                    },
                },
                reviewer: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });

        const attachmentEntityIds = items.map((item) => item.id);
        const attachments = attachmentEntityIds.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'customer_organization_change_request',
                    entity_id: { in: attachmentEntityIds },
                    document_type: 'organization_change_attachment',
                    file_kind: 'attachment',
                },
                select: {
                    id: true,
                    entity_id: true,
                    original_name: true,
                    mime_type: true,
                    file_size: true,
                    version_no: true,
                    note: true,
                    created_at: true,
                },
                orderBy: { created_at: 'desc' },
            })
            : [];

        return items.map((item) => ({
            ...item,
            before_snapshot: this.parseSnapshot<Record<string, unknown>>(item.before_snapshot),
            after_snapshot: this.parseSnapshot<Record<string, unknown>>(item.after_snapshot),
            attachments: attachments
                .filter((attachment) => attachment.entity_id === item.id)
                .map((attachment) => ({
                    ...attachment,
                    download_url: `/document-files/customer/${attachment.id}/download`,
                })),
        }));
    }

    async createOrganizationChangeRequest(
        dto: CreateCustomerOrganizationChangeRequestDto,
        actor: ResourceActor,
    ) {
        const requestedBy = this.actorUserId(actor);
        const customerId = await this.resolveCustomerId(actor, dto.customer_id);
        const reason = dto.reason.trim();

        const pending = await this.prisma.customer_organization_change_requests.findFirst({
            where: {
                customer_id: customerId,
                status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
            },
            select: { id: true, request_code: true },
        });
        if (pending) {
            throw new BadRequestException(
                `Tổ chức đang có yêu cầu ${pending.request_code} chờ xử lý. Vui lòng hoàn tất yêu cầu hiện tại trước khi gửi yêu cầu mới.`,
            );
        }

        const customer = await this.prisma.customers.findFirst({
            where: { id: customerId, status: 'active' },
            select: {
                id: true,
                customer_code: true,
                company_name: true,
                country_code: true,
                country_name: true,
                tax_code: true,
                address: true,
                phone: true,
                email: true,
                contacts: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                        phone: true,
                        position: true,
                    },
                    orderBy: { full_name: 'asc' },
                },
            },
        });
        if (!customer) {
            throw new NotFoundException('Không tìm thấy tổ chức khách hàng đang hoạt động');
        }

        const hasContactChanges = [
            dto.contact_full_name,
            dto.contact_email,
            dto.contact_phone,
            dto.contact_position,
        ].some((value) => value !== undefined);

        const contact = dto.contact_id
            ? customer.contacts.find((item) => item.id === dto.contact_id) ?? null
            : null;
        if (dto.contact_id && !contact) {
            throw new ForbiddenException('Người liên hệ không thuộc tổ chức khách hàng này');
        }
        if (hasContactChanges && !contact && !dto.contact_full_name?.trim()) {
            throw new BadRequestException('Họ tên người liên hệ là bắt buộc khi đề nghị thêm người liên hệ mới');
        }

        const before = {
            organization: {
                id: customer.id,
                customer_code: customer.customer_code,
                company_name: customer.company_name,
                country_code: customer.country_code,
                country_name: customer.country_name,
                tax_code: customer.tax_code,
                address: customer.address,
                phone: customer.phone,
                email: customer.email,
            },
            contact,
        };

        const requestedCompanyName = dto.company_name?.trim();
        if (dto.company_name !== undefined && !requestedCompanyName) {
            throw new BadRequestException('Tên tổ chức không được để trống');
        }

        const after = {
            organization: {
                ...before.organization,
                company_name: requestedCompanyName ?? before.organization.company_name,
                address: this.normalizeRequestedText(dto.address, before.organization.address),
                tax_code: this.normalizeRequestedText(dto.tax_code, before.organization.tax_code),
                phone: this.normalizeRequestedText(dto.phone, before.organization.phone),
                email: this.normalizeRequestedText(dto.email, before.organization.email),
            },
            contact: hasContactChanges
                ? {
                    id: contact?.id ?? null,
                    full_name: dto.contact_full_name?.trim() || contact?.full_name || '',
                    email: this.normalizeRequestedText(dto.contact_email, contact?.email ?? null),
                    phone: this.normalizeRequestedText(dto.contact_phone, contact?.phone ?? null),
                    position: this.normalizeRequestedText(dto.contact_position, contact?.position ?? null),
                }
                : contact,
        };

        if (JSON.stringify(before) === JSON.stringify(after)) {
            throw new BadRequestException('Yêu cầu chưa có nội dung thay đổi so với hồ sơ hiện tại');
        }

        const requestCode = `OCR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const created = await this.prisma.$transaction(async (tx) => {
            const request = await tx.customer_organization_change_requests.create({
                data: {
                    request_code: requestCode,
                    customer_id: customerId,
                    requested_by: requestedBy,
                    status: 'SUBMITTED',
                    reason,
                    before_snapshot: JSON.stringify(before),
                    after_snapshot: JSON.stringify(after),
                },
                select: {
                    id: true,
                    request_code: true,
                    customer_id: true,
                    status: true,
                    reason: true,
                    submitted_at: true,
                },
            });

            await this.workItems.openWorkItem({
                sourceKey: `customer-org-change:${request.id}:review`,
                workType: 'CUSTOMER_ORGANIZATION_CHANGE_REVIEW',
                actionCode: WORK_ITEM_ACTIONS.CUSTOMER_ORGANIZATION_CHANGE_REVIEW,
                title: `Xem xét thay đổi hồ sơ ${customer.customer_code}`,
                description: `Khách hàng gửi yêu cầu ${request.request_code} thay đổi thông tin tổ chức.`,
                entityType: 'customer_organization_change_request',
                entityId: request.id,
                assignedRole: 'COORDINATOR',
                priority: 'HIGH',
                dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                destinationPath: `/customer-change-requests?request_id=${request.id}`,
                context: {
                    request_id: request.id,
                    request_code: request.request_code,
                    customer_id: customerId,
                    customer_code: customer.customer_code,
                    source: 'CUSTOMER_PORTAL',
                },
            }, tx);

            return request;
        });

        return created;
    }

    async getOrganizationChangeReviewQueue(status?: string) {
        const normalizedStatus = status?.trim().toUpperCase();
        const allowed = new Set(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED']);
        if (normalizedStatus && !allowed.has(normalizedStatus)) {
            throw new BadRequestException('Trạng thái yêu cầu thay đổi không hợp lệ');
        }

        const items = await this.prisma.customer_organization_change_requests.findMany({
            where: normalizedStatus ? { status: normalizedStatus } : undefined,
            select: {
                id: true,
                request_code: true,
                status: true,
                reason: true,
                before_snapshot: true,
                after_snapshot: true,
                review_comment: true,
                submitted_at: true,
                reviewed_at: true,
                applied_at: true,
                customer: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                    },
                },
                requester: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                    },
                },
                reviewer: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
            },
            orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
        });

        const ids = items.map((item) => item.id);
        const attachments = ids.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'customer_organization_change_request',
                    entity_id: { in: ids },
                    document_type: 'organization_change_attachment',
                    file_kind: 'attachment',
                },
                select: {
                    id: true,
                    entity_id: true,
                    original_name: true,
                    mime_type: true,
                    file_size: true,
                    version_no: true,
                    note: true,
                    created_at: true,
                },
                orderBy: { created_at: 'desc' },
            })
            : [];

        return items.map((item) => ({
            ...item,
            before_snapshot: this.parseSnapshot<Record<string, unknown>>(item.before_snapshot),
            after_snapshot: this.parseSnapshot<Record<string, unknown>>(item.after_snapshot),
            attachments: attachments
                .filter((attachment) => attachment.entity_id === item.id)
                .map((attachment) => ({
                    ...attachment,
                    download_url: `/document-files/${attachment.id}/download`,
                })),
        }));
    }

    async reviewOrganizationChangeRequest(
        id: string,
        dto: ReviewCustomerOrganizationChangeRequestDto,
        reviewerId: string,
    ) {
        const decision = dto.decision.toUpperCase();
        const comment = dto.comment?.trim() || null;
        if (decision === 'REJECT' && !comment) {
            throw new BadRequestException('Cần nhập lý do khi từ chối yêu cầu thay đổi');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            const item = await tx.customer_organization_change_requests.findUnique({
                where: { id },
                select: {
                    id: true,
                    request_code: true,
                    customer_id: true,
                    requested_by: true,
                    status: true,
                    after_snapshot: true,
                },
            });
            if (!item) {
                throw new NotFoundException('Không tìm thấy yêu cầu thay đổi hồ sơ');
            }
            if (!['SUBMITTED', 'UNDER_REVIEW'].includes(item.status)) {
                throw new BadRequestException('Yêu cầu thay đổi đã được xử lý và không thể ra quyết định lại');
            }

            const now = new Date();
            if (decision === 'REJECT') {
                const updated = await tx.customer_organization_change_requests.update({
                    where: { id },
                    data: {
                        status: 'REJECTED',
                        reviewed_by: reviewerId,
                        reviewed_at: now,
                        review_comment: comment,
                    },
                });
                await this.workItems.completeWorkItem(
                    { sourceKey: `customer-org-change:${id}:review` },
                    reviewerId,
                    tx,
                );
                return { item: updated, requestedBy: item.requested_by, approved: false };
            }

            const after = this.parseSnapshot<{
                organization: {
                    company_name: string;
                    address: string | null;
                    tax_code: string | null;
                    phone: string | null;
                    email: string | null;
                };
                contact: {
                    id: string | null;
                    full_name: string;
                    email: string | null;
                    phone: string | null;
                    position: string | null;
                } | null;
            }>(item.after_snapshot);

            await tx.customers.update({
                where: { id: item.customer_id },
                data: {
                    company_name: after.organization.company_name,
                    address: after.organization.address,
                    tax_code: after.organization.tax_code,
                    phone: after.organization.phone,
                    email: after.organization.email,
                },
            });

            if (after.contact) {
                if (after.contact.id) {
                    const existingContact = await tx.contacts.findFirst({
                        where: { id: after.contact.id, customer_id: item.customer_id },
                        select: { id: true },
                    });
                    if (!existingContact) {
                        throw new BadRequestException('Người liên hệ trong snapshot không còn thuộc tổ chức này');
                    }
                    await tx.contacts.update({
                        where: { id: after.contact.id },
                        data: {
                            full_name: after.contact.full_name,
                            email: after.contact.email,
                            phone: after.contact.phone,
                            position: after.contact.position,
                        },
                    });
                } else {
                    await tx.contacts.create({
                        data: {
                            customer_id: item.customer_id,
                            full_name: after.contact.full_name,
                            email: after.contact.email,
                            phone: after.contact.phone,
                            position: after.contact.position,
                        },
                    });
                }
            }

            const updated = await tx.customer_organization_change_requests.update({
                where: { id },
                data: {
                    status: 'APPROVED',
                    reviewed_by: reviewerId,
                    reviewed_at: now,
                    applied_at: now,
                    review_comment: comment,
                },
            });
            await this.workItems.completeWorkItem(
                { sourceKey: `customer-org-change:${id}:review` },
                reviewerId,
                tx,
            );
            return { item: updated, requestedBy: item.requested_by, approved: true };
        });

        const notificationType = result.approved
            ? 'CUSTOMER_ORGANIZATION_CHANGE_APPROVED'
            : 'CUSTOMER_ORGANIZATION_CHANGE_REJECTED';
        await this.prisma.notifications.upsert({
            where: {
                user_id_source_key_channel: {
                    user_id: result.requestedBy,
                    source_key: `customer-org-change:${id}:${result.approved ? 'approved' : 'rejected'}`,
                    channel: 'IN_APP',
                },
            },
            create: {
                user_id: result.requestedBy,
                source_key: `customer-org-change:${id}:${result.approved ? 'approved' : 'rejected'}`,
                notification_type: notificationType,
                category: 'CUSTOMER_PROFILE_CHANGE',
                title: result.approved ? 'Yêu cầu thay đổi hồ sơ đã được chấp thuận' : 'Yêu cầu thay đổi hồ sơ cần xem lại',
                message: result.approved
                    ? `Yêu cầu ${result.item.request_code} đã được chấp thuận và hồ sơ tổ chức đã được cập nhật.`
                    : `Yêu cầu ${result.item.request_code} không được chấp thuận. Vui lòng xem lý do phản hồi.`,
                severity: result.approved ? 'INFO' : 'WARNING',
                entity_type: 'customer_organization_change_request',
                entity_id: id,
                destination_path: '/customer-portal/profile',
            },
            update: {
                notification_type: notificationType,
                category: 'CUSTOMER_PROFILE_CHANGE',
                title: result.approved ? 'Yêu cầu thay đổi hồ sơ đã được chấp thuận' : 'Yêu cầu thay đổi hồ sơ cần xem lại',
                message: result.approved
                    ? `Yêu cầu ${result.item.request_code} đã được chấp thuận và hồ sơ tổ chức đã được cập nhật.`
                    : `Yêu cầu ${result.item.request_code} không được chấp thuận. Vui lòng xem lý do phản hồi.`,
                severity: result.approved ? 'INFO' : 'WARNING',
                status: 'unread',
                read_at: null,
                destination_path: '/customer-portal/profile',
            },
        });

        return result.item;
    }


    private normalizeEmail(value: string) {
        return value.trim().toLowerCase();
    }

    private customerUserRequestCode() {
        return `CUA-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
    }

    private customerRoleOnly(userRoles: Array<{ roles: { role_name: string } }>) {
        const roles = userRoles
            .map(({ roles }) => roles.role_name.trim().toUpperCase())
            .filter(Boolean);
        return roles.length > 0 && roles.every((role) => role === 'CUSTOMER');
    }

    async getCustomerUserAccess(actor: ResourceActor) {
        const customerIds = await this.accessibleCustomerIds(actor);
        const [customers, history] = await Promise.all([
            this.prisma.customers.findMany({
                where: { id: { in: customerIds }, status: 'active' },
                select: {
                    id: true,
                    customer_code: true,
                    company_name: true,
                    user_access: {
                        select: {
                            id: true,
                            user_id: true,
                            status: true,
                            created_at: true,
                            updated_at: true,
                            user: {
                                select: {
                                    id: true,
                                    email: true,
                                    full_name: true,
                                    status: true,
                                },
                            },
                        },
                        orderBy: [{ status: 'asc' }, { created_at: 'asc' }],
                    },
                },
                orderBy: { company_name: 'asc' },
            }),
            this.prisma.customer_user_access_history.findMany({
                where: { customer_id: { in: customerIds } },
                select: {
                    id: true,
                    customer_id: true,
                    user_id: true,
                    action: true,
                    source_type: true,
                    changed_at: true,
                    user: {
                        select: {
                            email: true,
                            full_name: true,
                        },
                    },
                    source_request: {
                        select: {
                            request_code: true,
                        },
                    },
                },
                orderBy: { changed_at: 'desc' },
                take: 300,
            }),
        ]);

        return customers.map((customer) => ({
            customer_id: customer.id,
            customer_code: customer.customer_code,
            company_name: customer.company_name,
            users: customer.user_access.map((access) => ({
                access_id: access.id,
                user_id: access.user_id,
                email: access.user.email,
                full_name: access.user.full_name,
                account_status: access.user.status ?? 'active',
                access_status: access.status,
                created_at: access.created_at,
                updated_at: access.updated_at,
            })),
            history: history
                .filter((item) => item.customer_id === customer.id)
                .map((item) => ({
                    id: item.id,
                    user_id: item.user_id,
                    email: item.user.email,
                    full_name: item.user.full_name,
                    action: item.action,
                    source: item.source_type === 'CUSTOMER_REQUEST' ? 'CUSTOMER_REQUEST' : 'CERTIFICATION_BODY',
                    request_code: item.source_request?.request_code ?? null,
                    changed_at: item.changed_at,
                })),
        }));
    }

    async getCustomerUserAccessRequests(actor: ResourceActor) {
        const customerIds = await this.accessibleCustomerIds(actor);
        return this.prisma.customer_user_access_requests.findMany({
            where: { customer_id: { in: customerIds } },
            select: {
                id: true,
                request_code: true,
                customer_id: true,
                request_type: true,
                target_user_id: true,
                requested_email: true,
                requested_full_name: true,
                status: true,
                reason: true,
                review_comment: true,
                resolved_user_id: true,
                submitted_at: true,
                reviewed_at: true,
                applied_at: true,
                customer: {
                    select: { customer_code: true, company_name: true },
                },
                target_user: {
                    select: { email: true, full_name: true },
                },
                resolved_user: {
                    select: { email: true, full_name: true },
                },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    async createCustomerUserAccessRequest(
        dto: CreateCustomerUserAccessRequestDto,
        actor: ResourceActor,
    ) {
        const customerId = await this.resolveCustomerId(actor, dto.customer_id);
        const requesterId = this.actorUserId(actor);
        const requestType = dto.request_type.toUpperCase() as 'ADD_USER' | 'REVOKE_ACCESS' | 'REACTIVATE_ACCESS';
        const reason = dto.reason.trim();

        const customer = await this.prisma.customers.findFirst({
            where: { id: customerId, status: 'active' },
            select: { id: true, customer_code: true, company_name: true },
        });
        if (!customer) {
            throw new BadRequestException('Tổ chức khách hàng không còn hoạt động');
        }

        let targetUserId: string | null = null;
        let requestedEmail: string | null = null;
        let requestedFullName: string | null = null;

        if (requestType === 'ADD_USER') {
            requestedEmail = this.normalizeEmail(dto.email ?? '');
            requestedFullName = dto.full_name?.trim() || null;
            if (!requestedEmail || !requestedFullName) {
                throw new BadRequestException('Cần nhập email và họ tên người dùng cần bổ sung');
            }

            const existingUser = await this.prisma.users.findUnique({
                where: { email: requestedEmail },
                select: {
                    id: true,
                    status: true,
                    user_roles: { select: { roles: { select: { role_name: true } } } },
                },
            });
            if (existingUser) {
                if (
                    this.normalize(existingUser.status) !== 'active' ||
                    !this.customerRoleOnly(existingUser.user_roles)
                ) {
                    throw new BadRequestException(
                        'Email này đã gắn với tài khoản không phù hợp để cấp quyền Portal tự động. Vui lòng liên hệ tổ chức chứng nhận.',
                    );
                }
                targetUserId = existingUser.id;
                const mapping = await this.prisma.customer_user_access.findUnique({
                    where: { customer_id_user_id: { customer_id: customerId, user_id: existingUser.id } },
                    select: { status: true },
                });
                if (mapping && this.normalize(mapping.status) === 'active') {
                    throw new BadRequestException('Người dùng này đã có quyền Portal đang hoạt động cho tổ chức');
                }
            }

            const duplicate = await this.prisma.customer_user_access_requests.findFirst({
                where: {
                    customer_id: customerId,
                    request_type: 'ADD_USER',
                    requested_email: requestedEmail,
                    status: 'SUBMITTED',
                },
                select: { id: true },
            });
            if (duplicate) {
                throw new BadRequestException('Đã có yêu cầu bổ sung người dùng này đang chờ xem xét');
            }
        } else {
            if (!dto.target_user_id) {
                throw new BadRequestException('Cần chọn người dùng Portal cần thay đổi quyền truy cập');
            }
            targetUserId = dto.target_user_id;
            const mapping = await this.prisma.customer_user_access.findUnique({
                where: { customer_id_user_id: { customer_id: customerId, user_id: targetUserId } },
                select: {
                    id: true,
                    status: true,
                    user: { select: { email: true, full_name: true } },
                },
            });
            if (!mapping) {
                throw new NotFoundException('Không tìm thấy người dùng Portal thuộc tổ chức này');
            }
            const mappingStatus = this.normalize(mapping.status);
            if (requestType === 'REVOKE_ACCESS' && mappingStatus !== 'active') {
                throw new BadRequestException('Quyền truy cập của người dùng này đã ngừng hoạt động');
            }
            if (requestType === 'REACTIVATE_ACCESS' && mappingStatus === 'active') {
                throw new BadRequestException('Quyền truy cập của người dùng này đang hoạt động');
            }
            if (requestType === 'REVOKE_ACCESS') {
                const activeCount = await this.prisma.customer_user_access.count({
                    where: { customer_id: customerId, status: 'active' },
                });
                if (activeCount <= 1) {
                    throw new BadRequestException('Không thể ngừng người dùng Portal cuối cùng của tổ chức');
                }
            }
            requestedEmail = mapping.user.email;
            requestedFullName = mapping.user.full_name;

            const duplicate = await this.prisma.customer_user_access_requests.findFirst({
                where: {
                    customer_id: customerId,
                    target_user_id: targetUserId,
                    status: 'SUBMITTED',
                },
                select: { id: true },
            });
            if (duplicate) {
                throw new BadRequestException('Đã có yêu cầu thay đổi quyền của người dùng này đang chờ xem xét');
            }
        }

        const requestCode = this.customerUserRequestCode();
        return this.prisma.$transaction(async (tx) => {
            const created = await tx.customer_user_access_requests.create({
                data: {
                    request_code: requestCode,
                    customer_id: customerId,
                    requested_by: requesterId,
                    request_type: requestType,
                    target_user_id: targetUserId,
                    requested_email: requestedEmail,
                    requested_full_name: requestedFullName,
                    reason,
                    status: 'SUBMITTED',
                },
            });

            await this.workItems.openWorkItem({
                sourceKey: `customer-user-access:${created.id}:review`,
                workType: 'CUSTOMER_USER_ACCESS_REVIEW',
                actionCode: WORK_ITEM_ACTIONS.CUSTOMER_USER_ACCESS_REVIEW,
                title: `Xem xét yêu cầu tài khoản Portal ${created.request_code}`,
                description: `${customer.customer_code} · ${customer.company_name}`,
                entityType: 'customer_user_access_request',
                entityId: created.id,
                assignedRole: 'ADMIN',
                priority: 'HIGH',
                destinationPath: '/customer-user-requests',
                context: { customer_id: customerId, request_type: requestType },
            }, tx);

            return created;
        });
    }

    async getCustomerUserAccessReviewQueue(status?: string) {
        const normalizedStatus = status?.trim().toUpperCase();
        if (normalizedStatus && !['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(normalizedStatus)) {
            throw new BadRequestException('Trạng thái yêu cầu tài khoản không hợp lệ');
        }
        const items = await this.prisma.customer_user_access_requests.findMany({
            where: { status: normalizedStatus || undefined },
            select: {
                id: true,
                request_code: true,
                request_type: true,
                status: true,
                reason: true,
                requested_email: true,
                requested_full_name: true,
                target_user_id: true,
                resolved_user_id: true,
                submitted_at: true,
                reviewed_at: true,
                applied_at: true,
                review_comment: true,
                customer: { select: { id: true, customer_code: true, company_name: true } },
                requester: { select: { id: true, email: true, full_name: true } },
                target_user: { select: { id: true, email: true, full_name: true, status: true } },
                resolved_user: { select: { id: true, email: true, full_name: true, status: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        const emailCandidates = Array.from(new Set(
            items
                .filter((item) => item.request_type === 'ADD_USER' && item.requested_email)
                .map((item) => item.requested_email!),
        ));
        const existingUsers = emailCandidates.length
            ? await this.prisma.users.findMany({
                where: { email: { in: emailCandidates } },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    full_name: true,
                    status: true,
                    user_roles: { select: { roles: { select: { role_name: true } } } },
                },
            })
            : [];
        const byEmail = new Map(existingUsers.map((user) => [this.normalizeEmail(user.email), user]));

        return items.map((item) => {
            const existing = item.requested_email
                ? byEmail.get(this.normalizeEmail(item.requested_email))
                : undefined;
            let resolutionMode: 'CREATE_NEW_USER' | 'EXISTING_CUSTOMER_USER' | 'CONFLICT' | null = null;
            if (item.request_type === 'ADD_USER') {
                resolutionMode = !existing
                    ? 'CREATE_NEW_USER'
                    : this.normalize(existing.status) === 'active' && this.customerRoleOnly(existing.user_roles)
                        ? 'EXISTING_CUSTOMER_USER'
                        : 'CONFLICT';
            }
            return {
                ...item,
                resolution_mode: resolutionMode,
                existing_user: existing
                    ? {
                        id: existing.id,
                        username: existing.username,
                        email: existing.email,
                        full_name: existing.full_name,
                        status: existing.status,
                    }
                    : null,
            };
        });
    }

    async reviewCustomerUserAccessRequest(
        id: string,
        dto: ReviewCustomerUserAccessRequestDto,
        reviewerId: string,
    ) {
        const decision = dto.decision.toUpperCase();
        const comment = dto.comment?.trim() || null;
        if (decision === 'REJECT' && !comment) {
            throw new BadRequestException('Cần nhập lý do khi từ chối yêu cầu tài khoản Portal');
        }

        const passwordHash = dto.temporary_password
            ? await bcrypt.hash(dto.temporary_password, 10)
            : null;

        const result = await this.prisma.$transaction(async (tx) => {
            const item = await tx.customer_user_access_requests.findUnique({
                where: { id },
                select: {
                    id: true,
                    request_code: true,
                    customer_id: true,
                    requested_by: true,
                    request_type: true,
                    target_user_id: true,
                    requested_email: true,
                    requested_full_name: true,
                    status: true,
                },
            });
            if (!item) {
                throw new NotFoundException('Không tìm thấy yêu cầu tài khoản Portal');
            }
            if (item.status !== 'SUBMITTED') {
                throw new BadRequestException('Yêu cầu tài khoản đã được xử lý và không thể ra quyết định lại');
            }

            const now = new Date();
            if (decision === 'REJECT') {
                const updated = await tx.customer_user_access_requests.update({
                    where: { id },
                    data: {
                        status: 'REJECTED',
                        reviewed_by: reviewerId,
                        reviewed_at: now,
                        review_comment: comment,
                    },
                });
                await this.workItems.completeWorkItem(
                    { sourceKey: `customer-user-access:${id}:review` },
                    reviewerId,
                    tx,
                );
                return { item: updated, requestedBy: item.requested_by, resolvedUserId: null, approved: false };
            }

            const customer = await tx.customers.findFirst({
                where: { id: item.customer_id, status: 'active' },
                select: { id: true },
            });
            if (!customer) {
                throw new BadRequestException('Tổ chức khách hàng không còn hoạt động');
            }

            let resolvedUserId: string;
            let accessId: string;
            let historyAction: 'ASSIGNED' | 'REACTIVATED' | 'REVOKED';

            if (item.request_type === 'ADD_USER') {
                const email = this.normalizeEmail(item.requested_email ?? '');
                if (!email || !item.requested_full_name) {
                    throw new BadRequestException('Yêu cầu bổ sung người dùng thiếu thông tin email/họ tên');
                }
                const existing = await tx.users.findUnique({
                    where: { email },
                    select: {
                        id: true,
                        status: true,
                        user_roles: { select: { roles: { select: { role_name: true } } } },
                    },
                });

                if (existing) {
                    if (this.normalize(existing.status) !== 'active' || !this.customerRoleOnly(existing.user_roles)) {
                        throw new BadRequestException('Tài khoản trùng email không đủ điều kiện để gán Portal tự động');
                    }
                    resolvedUserId = existing.id;
                } else {
                    const username = dto.username?.trim();
                    if (!username || !passwordHash) {
                        throw new BadRequestException('Khi tạo tài khoản mới, Admin phải nhập username và mật khẩu tạm thời');
                    }
                    const usernameExists = await tx.users.findUnique({
                        where: { username },
                        select: { id: true },
                    });
                    if (usernameExists) {
                        throw new ConflictException('Username đã tồn tại');
                    }
                    const customerRole = await tx.roles.findFirst({
                        where: { role_name: 'CUSTOMER' },
                        select: { id: true },
                    });
                    if (!customerRole) {
                        throw new BadRequestException('Hệ thống chưa có vai trò CUSTOMER');
                    }
                    const createdUser = await tx.users.create({
                        data: {
                            username,
                            email,
                            password_hash: passwordHash,
                            full_name: item.requested_full_name,
                            status: 'active',
                        },
                    });
                    await tx.user_roles.create({
                        data: { user_id: createdUser.id, role_id: customerRole.id },
                    });
                    await tx.audit_logs.create({
                        data: {
                            user_id: reviewerId,
                            action: 'CUSTOMER_PORTAL_USER_CREATED',
                            entity_type: 'user',
                            entity_id: createdUser.id,
                        },
                    });
                    resolvedUserId = createdUser.id;
                }

                const existingMapping = await tx.customer_user_access.findUnique({
                    where: { customer_id_user_id: { customer_id: item.customer_id, user_id: resolvedUserId } },
                    select: { id: true, status: true },
                });
                if (existingMapping && this.normalize(existingMapping.status) === 'active') {
                    throw new BadRequestException('Quyền Portal đã được cấp trước khi yêu cầu này được duyệt');
                }
                const mapping = await tx.customer_user_access.upsert({
                    where: { customer_id_user_id: { customer_id: item.customer_id, user_id: resolvedUserId } },
                    create: {
                        customer_id: item.customer_id,
                        user_id: resolvedUserId,
                        status: 'active',
                        created_by: reviewerId,
                    },
                    update: { status: 'active' },
                    select: { id: true },
                });
                accessId = mapping.id;
                historyAction = existingMapping ? 'REACTIVATED' : 'ASSIGNED';
            } else {
                if (!item.target_user_id) {
                    throw new BadRequestException('Yêu cầu thay đổi quyền không có người dùng mục tiêu');
                }
                resolvedUserId = item.target_user_id;
                const mapping = await tx.customer_user_access.findUnique({
                    where: { customer_id_user_id: { customer_id: item.customer_id, user_id: resolvedUserId } },
                    select: {
                        id: true,
                        status: true,
                        user: {
                            select: {
                                status: true,
                                user_roles: { select: { roles: { select: { role_name: true } } } },
                            },
                        },
                    },
                });
                if (!mapping) {
                    throw new NotFoundException('Quyền Portal mục tiêu không còn tồn tại');
                }
                accessId = mapping.id;
                if (item.request_type === 'REVOKE_ACCESS') {
                    if (this.normalize(mapping.status) !== 'active') {
                        throw new BadRequestException('Quyền Portal đã được ngừng trước khi yêu cầu được duyệt');
                    }
                    const activeCount = await tx.customer_user_access.count({
                        where: { customer_id: item.customer_id, status: 'active' },
                    });
                    if (activeCount <= 1) {
                        throw new BadRequestException('Không thể ngừng người dùng Portal cuối cùng của tổ chức');
                    }
                    await tx.customer_user_access.update({
                        where: { id: mapping.id },
                        data: { status: 'revoked' },
                    });
                    historyAction = 'REVOKED';
                } else {
                    if (this.normalize(mapping.status) === 'active') {
                        throw new BadRequestException('Quyền Portal đã được khôi phục trước khi yêu cầu được duyệt');
                    }
                    if (
                        this.normalize(mapping.user.status) !== 'active' ||
                        !this.customerRoleOnly(mapping.user.user_roles)
                    ) {
                        throw new BadRequestException('Tài khoản không đủ điều kiện để khôi phục quyền Portal');
                    }
                    await tx.customer_user_access.update({
                        where: { id: mapping.id },
                        data: { status: 'active' },
                    });
                    historyAction = 'REACTIVATED';
                }
            }

            await tx.customer_user_access_history.create({
                data: {
                    customer_user_access_id: accessId,
                    customer_id: item.customer_id,
                    user_id: resolvedUserId,
                    action: historyAction,
                    source_type: 'CUSTOMER_REQUEST',
                    source_request_id: item.id,
                    changed_by: reviewerId,
                    note: comment,
                },
            });

            const updated = await tx.customer_user_access_requests.update({
                where: { id },
                data: {
                    status: 'APPROVED',
                    reviewed_by: reviewerId,
                    reviewed_at: now,
                    review_comment: comment,
                    resolved_user_id: resolvedUserId,
                    applied_at: now,
                },
            });
            await this.workItems.completeWorkItem(
                { sourceKey: `customer-user-access:${id}:review` },
                reviewerId,
                tx,
            );
            return { item: updated, requestedBy: item.requested_by, resolvedUserId, approved: true };
        });

        const sourceSuffix = result.approved ? 'approved' : 'rejected';
        await this.prisma.notifications.upsert({
            where: {
                user_id_source_key_channel: {
                    user_id: result.requestedBy,
                    source_key: `customer-user-access:${id}:${sourceSuffix}`,
                    channel: 'IN_APP',
                },
            },
            create: {
                user_id: result.requestedBy,
                source_key: `customer-user-access:${id}:${sourceSuffix}`,
                notification_type: result.approved ? 'CUSTOMER_USER_ACCESS_APPROVED' : 'CUSTOMER_USER_ACCESS_REJECTED',
                category: 'CUSTOMER_USER_ACCESS',
                title: result.approved ? 'Yêu cầu tài khoản Portal đã được chấp thuận' : 'Yêu cầu tài khoản Portal không được chấp thuận',
                message: result.approved
                    ? `Yêu cầu ${result.item.request_code} đã được áp dụng.`
                    : `Yêu cầu ${result.item.request_code} không được chấp thuận. Vui lòng xem phản hồi.`,
                severity: result.approved ? 'INFO' : 'WARNING',
                entity_type: 'customer_user_access_request',
                entity_id: id,
                destination_path: '/customer-portal/users',
            },
            update: {
                status: 'unread',
                read_at: null,
                destination_path: '/customer-portal/users',
            },
        });

        if (result.approved && result.resolvedUserId && result.resolvedUserId !== result.requestedBy) {
            await this.prisma.notifications.upsert({
                where: {
                    user_id_source_key_channel: {
                        user_id: result.resolvedUserId,
                        source_key: `customer-user-access:${id}:granted`,
                        channel: 'IN_APP',
                    },
                },
                create: {
                    user_id: result.resolvedUserId,
                    source_key: `customer-user-access:${id}:granted`,
                    notification_type: 'CUSTOMER_USER_ACCESS_GRANTED',
                    category: 'CUSTOMER_USER_ACCESS',
                    title: 'Quyền truy cập Portal đã được cập nhật',
                    message: 'Tổ chức chứng nhận đã cập nhật quyền truy cập Portal của tài khoản này.',
                    severity: 'INFO',
                    entity_type: 'customer_user_access_request',
                    entity_id: id,
                    destination_path: '/customer-portal/users',
                },
                update: {
                    status: 'unread',
                    read_at: null,
                    destination_path: '/customer-portal/users',
                },
            });
        }

        return result.item;
    }

    async getApplications(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        const items =
            await this.prisma.certification_applications.findMany({
                where: {
                    customer_id: {
                        in: customerIds,
                    },
                },
                select: {
                    id: true,
                    customer_id: true,
                    application_code: true,
                    application_date: true,
                    certification_type: true,
                    standard_name: true,
                    certification_scope: true,
                    headquarters_address: true,
                    representative_name: true,
                    representative_position: true,
                    representative_phone: true,
                    representative_email: true,
                    contact_name: true,
                    contact_position: true,
                    contact_phone: true,
                    contact_email: true,
                    total_employee_count: true,
                    employee_count: true,
                    shift_count: true,
                    shift1_count: true,
                    shift2_count: true,
                    shift3_count: true,
                    external_provider_used: true,
                    outsourced_processes: true,
                    requested_audit_date: true,
                    stage1_requested_date: true,
                    stage2_requested_date: true,
                    other_management_systems: true,
                    management_system_details: true,
                    certificate_languages: true,
                    other_requests: true,
                    declaration_accepted: true,
                    status: true,
                    created_at: true,
                    updated_at: true,
                    customers: {
                        select: {
                            id: true,
                            customer_code: true,
                            company_name: true,
                        },
                    },
                    sites: {
                        select: {
                            site_no: true,
                            site_name: true,
                            address: true,
                            activities: true,
                            employee_count: true,
                            is_headquarters: true,
                        },
                        orderBy: {
                            site_no: 'asc',
                        },
                    },
                    application_reviews: {
                        select: {
                            workflow_status: true,
                            submitted_at: true,
                            approved_at: true,
                            returned_at: true,
                        },
                        orderBy: {
                            created_at: 'desc',
                        },
                        take: 1,
                    },
                    certification_projects: {
                        select: {
                            id: true,
                            project_code: true,
                            status: true,
                        },
                        take: 1,
                    },
                },
                orderBy: {
                    created_at: 'desc',
                },
            });

        return items.map((item) => {
            const latestReview = item.application_reviews[0] ?? null;
            const project = item.certification_projects[0] ?? null;

            return {
                ...item,
                application_reviews: undefined,
                certification_projects: undefined,
                portal_status:
                    this.customerApplicationStatus(
                        item.status,
                        latestReview?.workflow_status,
                        Boolean(project),
                    ),
                review: latestReview
                    ? {
                        status:
                            latestReview.workflow_status,
                        submitted_at:
                            latestReview.submitted_at,
                        approved_at:
                            latestReview.approved_at,
                        returned_at:
                            latestReview.returned_at,
                    }
                    : null,
                project,
                can_edit:
                    !project &&
                    !['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IN_CERTIFICATION']
                        .includes(
                            this.customerApplicationStatus(
                                item.status,
                                latestReview?.workflow_status,
                                Boolean(project),
                            ),
                        ),
                can_submit:
                    !project &&
                    Boolean(item.declaration_accepted) &&
                    ['DRAFT', 'REVISION_REQUIRED']
                        .includes(
                            this.customerApplicationStatus(
                                item.status,
                                latestReview?.workflow_status,
                                Boolean(project),
                            ),
                        ),
            };
        });
    }

    async createApplication(
        dto: CustomerCertificationApplicationDto,
        actor: ResourceActor,
    ) {
        const customerId =
            await this.resolveCustomerId(
                actor,
                dto.customer_id,
            );

        return this.applications.create(
            this.toApplicationDto(
                dto,
                customerId,
            ),
            { requireDeclaration: false },
        );
    }

    async updateApplication(
        applicationId: string,
        dto: CustomerCertificationApplicationDto,
        actor: ResourceActor,
    ) {
        const customerIds =
            await this.accessibleCustomerIds(actor);
        const existing =
            await this.prisma.certification_applications.findFirst({
                where: {
                    id: applicationId,
                    customer_id: {
                        in: customerIds,
                    },
                },
                select: {
                    id: true,
                    customer_id: true,
                    application_code: true,
                    status: true,
                    certification_projects: {
                        select: {
                            id: true,
                        },
                        take: 1,
                    },
                    application_reviews: {
                        select: {
                            workflow_status: true,
                        },
                        orderBy: {
                            created_at: 'desc',
                        },
                        take: 1,
                    },
                },
            });

        if (!existing) {
            throw new NotFoundException(
                'Không tìm thấy đơn đăng ký thuộc tổ chức của bạn',
            );
        }

        if (existing.certification_projects.length) {
            throw new BadRequestException(
                'Đơn đã chuyển thành hồ sơ chứng nhận và không còn được sửa trên cổng khách hàng',
            );
        }

        const portalStatus =
            this.customerApplicationStatus(
                existing.status,
                existing.application_reviews[0]?.workflow_status,
                false,
            );

        if (!['DRAFT', 'REVISION_REQUIRED'].includes(portalStatus)) {
            throw new BadRequestException(
                'Đơn đang được xử lý và chưa thể sửa. Vui lòng chờ tổ chức chứng nhận trả lại nếu cần bổ sung.',
            );
        }

        const requestedCustomerId =
            await this.resolveCustomerId(
                actor,
                dto.customer_id ?? existing.customer_id,
            );

        if (requestedCustomerId !== existing.customer_id) {
            throw new BadRequestException(
                'Không thể chuyển đơn đăng ký sang tổ chức khách hàng khác',
            );
        }

        const actorUserId = actor.userId?.trim();
        if (!actorUserId) {
            throw new ForbiddenException(
                'Không xác định được tài khoản đang thao tác',
            );
        }

        return this.applications.update(
            applicationId,
            this.toApplicationDto(
                dto,
                existing.customer_id,
                existing.application_code,
            ),
            actorUserId,
            { requireDeclaration: false },
        );
    }

    async submitApplication(
        applicationId: string,
        actor: ResourceActor,
    ) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        const application =
            await this.prisma.certification_applications.findFirst({
                where: {
                    id: applicationId,
                    customer_id: {
                        in: customerIds,
                    },
                },
                select: {
                    id: true,
                    application_code: true,
                    standard_name: true,
                    certification_scope: true,
                    declaration_accepted: true,
                    status: true,
                    certification_projects: {
                        select: {
                            id: true,
                        },
                        take: 1,
                    },
                    application_reviews: {
                        select: {
                            workflow_status: true,
                        },
                        orderBy: {
                            created_at: 'desc',
                        },
                        take: 1,
                    },
                },
            });

        if (!application) {
            throw new NotFoundException(
                'Không tìm thấy đơn đăng ký thuộc tổ chức của bạn',
            );
        }

        const portalStatus =
            this.customerApplicationStatus(
                application.status,
                application.application_reviews[0]?.workflow_status,
                Boolean(application.certification_projects.length),
            );

        if (!['DRAFT', 'REVISION_REQUIRED'].includes(portalStatus)) {
            throw new BadRequestException(
                'Đơn không ở trạng thái cho phép gửi',
            );
        }

        if (
            !application.declaration_accepted ||
            !application.standard_name.trim() ||
            !application.certification_scope.trim()
        ) {
            throw new BadRequestException(
                'Đơn chưa đủ thông tin bắt buộc hoặc chưa xác nhận cam kết',
            );
        }

        const updated =
            await this.prisma.certification_applications.update({
                where: {
                    id: application.id,
                },
                data: {
                    status: 'submitted',
                },
                select: {
                    id: true,
                    application_code: true,
                    status: true,
                    updated_at: true,
                },
            });

        await this.workItems.openWorkItem({
            sourceKey:
                `customer-application:${application.id}:submitted`,
            workType:
                'CUSTOMER_APPLICATION_INTAKE',
            actionCode:
                WORK_ITEM_ACTIONS.APPLICATION_INTAKE,
            title:
                `Tiếp nhận đơn ${application.application_code}`,
            description:
                'Khách hàng đã gửi đơn đăng ký từ cổng khách hàng. Cần kiểm tra hồ sơ và phân công người xem xét.',
            entityType:
                'certification_application',
            entityId:
                application.id,
            assignedRole:
                'COORDINATOR',
            priority:
                'HIGH',
            destinationPath:
                `/applications/${application.id}`,
            context: {
                application_id:
                    application.id,
                application_code:
                    application.application_code,
                source:
                    'CUSTOMER_PORTAL',
            },
        });

        return {
            ...updated,
            portal_status:
                'SUBMITTED',
        };
    }

    async getSchedule(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        const plans =
            await this.prisma.audit_plans.findMany({
                where: {
                    certification_projects: {
                        certification_applications: {
                            customer_id: {
                                in: customerIds,
                            },
                        },
                    },
                    NOT: {
                        status: 'draft',
                    },
                },
                select: {
                    id: true,
                    plan_code: true,
                    audit_type: true,
                    planned_start_date: true,
                    planned_end_date: true,
                    location: true,
                    audit_scope: true,
                    audit_criteria: true,
                    status: true,
                    certification_projects: {
                        select: {
                            id: true,
                            project_code: true,
                            standard_name: true,
                            certification_applications: {
                                select: {
                                    customer_id: true,
                                    customers: {
                                        select: {
                                            customer_code: true,
                                            company_name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: [
                    {
                        planned_start_date: 'asc',
                    },
                    {
                        created_at: 'asc',
                    },
                ],
            });

        return plans.map((plan) => ({
            id: plan.id,
            plan_code: plan.plan_code,
            audit_type: plan.audit_type,
            planned_start_date: plan.planned_start_date,
            planned_end_date: plan.planned_end_date,
            location: plan.location,
            audit_scope: plan.audit_scope,
            audit_criteria: plan.audit_criteria,
            status: plan.status,
            project: {
                id: plan.certification_projects.id,
                project_code:
                    plan.certification_projects.project_code,
                standard_name:
                    plan.certification_projects.standard_name,
            },
            customer:
                plan.certification_projects
                    .certification_applications
                    .customers,
        }));
    }

    async getCertificates(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        const certificates =
            await this.prisma.certificates.findMany({
                where: {
                    certificate_series: {
                        certification_project: {
                            certification_applications: {
                                customer_id: {
                                    in: customerIds,
                                },
                            },
                        },
                    },
                },
                select: {
                    id: true,
                    verification_code: true,
                    cert_number: true,
                    version_no: true,
                    issue_date: true,
                    expire_date: true,
                    status: true,
                    organization_name: true,
                    organization_address: true,
                    management_system: true,
                    standard_name: true,
                    certification_scope: true,
                    change_reason: true,
                    created_at: true,
                    certificate_series: {
                        select: {
                            series_code: true,
                            certification_project: {
                                select: {
                                    id: true,
                                    project_code: true,
                                    certification_applications: {
                                        select: {
                                            customer_id: true,
                                            customers: {
                                                select: {
                                                    customer_code: true,
                                                    company_name: true,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: [
                    {
                        created_at: 'desc',
                    },
                    {
                        version_no: 'desc',
                    },
                ],
            });

        const ids = certificates.map((item) => item.id);
        const pdfs = ids.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'certificate',
                    entity_id: {
                        in: ids,
                    },
                    document_type: 'certificate_pdf',
                    mime_type: 'application/pdf',
                    is_current: true,
                },
                select: {
                    entity_id: true,
                },
            })
            : [];
        const pdfSet = new Set(
            pdfs.map((item) => item.entity_id),
        );

        return certificates.map((certificate) => ({
            id: certificate.id,
            verification_code:
                certificate.verification_code,
            cert_number:
                certificate.cert_number,
            version_no:
                certificate.version_no,
            issue_date:
                certificate.issue_date,
            expire_date:
                certificate.expire_date,
            status:
                certificate.status,
            organization_name:
                certificate.organization_name,
            organization_address:
                certificate.organization_address,
            management_system:
                certificate.management_system,
            standard_name:
                certificate.standard_name,
            certification_scope:
                certificate.certification_scope,
            change_reason:
                certificate.change_reason,
            series_code:
                certificate.certificate_series.series_code,
            project: {
                id:
                    certificate.certificate_series
                        .certification_project.id,
                project_code:
                    certificate.certificate_series
                        .certification_project.project_code,
            },
            customer:
                certificate.certificate_series
                    .certification_project
                    .certification_applications
                    .customers,
            official_pdf_available:
                pdfSet.has(certificate.id),
            public_verification_path:
                `/public/certificates/${certificate.verification_code}`,
            public_pdf_path:
                pdfSet.has(certificate.id)
                    ? `/public/certificates/${certificate.verification_code}/pdf`
                    : null,
        }));
    }

    async getResultNotifications(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        const items =
            await this.prisma.audit_result_notifications.findMany({
                where: {
                    sent_at: {
                        not: null,
                    },
                    technical_reviews: {
                        reports: {
                            audit_plans: {
                                certification_projects: {
                                    certification_applications: {
                                        customer_id: {
                                            in: customerIds,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                select: {
                    id: true,
                    notification_number: true,
                    notification_date: true,
                    audit_type: true,
                    audit_start_date: true,
                    audit_end_date: true,
                    notification_result: true,
                    has_certification_changes: true,
                    organization_name: true,
                    organization_address: true,
                    recipient_name: true,
                    management_system: true,
                    standard_name: true,
                    certification_scope: true,
                    next_audit_due_date: true,
                    status: true,
                    sent_at: true,
                    technical_reviews: {
                        select: {
                            reports: {
                                select: {
                                    audit_plans: {
                                        select: {
                                            id: true,
                                            plan_code: true,
                                            certification_projects: {
                                                select: {
                                                    id: true,
                                                    project_code: true,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    sent_at: 'desc',
                },
            });

        return items.map((item) => ({
            id: item.id,
            notification_number:
                item.notification_number,
            notification_date:
                item.notification_date,
            audit_type:
                item.audit_type,
            audit_start_date:
                item.audit_start_date,
            audit_end_date:
                item.audit_end_date,
            notification_result:
                item.notification_result,
            has_certification_changes:
                item.has_certification_changes,
            organization_name:
                item.organization_name,
            organization_address:
                item.organization_address,
            recipient_name:
                item.recipient_name,
            management_system:
                item.management_system,
            standard_name:
                item.standard_name,
            certification_scope:
                item.certification_scope,
            next_audit_due_date:
                item.next_audit_due_date,
            status:
                item.status,
            sent_at:
                item.sent_at,
            plan: {
                id:
                    item.technical_reviews.reports.audit_plans.id,
                plan_code:
                    item.technical_reviews.reports.audit_plans.plan_code,
            },
            project:
                item.technical_reviews.reports.audit_plans
                    .certification_projects,
        }));
    }

    async getNotifications(
        actor: ResourceActor,
        limit = 100,
    ) {
        const userId = actor.userId?.trim();
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được tài khoản đang đăng nhập',
            );
        }
        await this.accessibleCustomerIds(actor);

        const safeLimit = Math.min(
            Math.max(Math.trunc(limit || 100), 1),
            200,
        );
        const rows =
            await this.prisma.notifications.findMany({
                where: {
                    user_id: userId,
                    channel: 'IN_APP',
                },
                select: {
                    id: true,
                    notification_type: true,
                    category: true,
                    title: true,
                    message: true,
                    severity: true,
                    status: true,
                    read_at: true,
                    created_at: true,
                    due_date: true,
                    entity_type: true,
                    entity_id: true,
                },
                orderBy: {
                    created_at: 'desc',
                },
                take: safeLimit * 2,
            });

        const items = rows
            .filter((item) =>
                this.isCustomerSafeNotification(item),
            )
            .slice(0, safeLimit)
            .map((item) => ({
                id: item.id,
                category: item.category,
                severity: item.severity,
                title: item.title,
                message: item.message,
                status: item.status,
                read_at: item.read_at,
                created_at: item.created_at,
                due_date: item.due_date,
                entity_type: item.entity_type,
                entity_id: item.entity_id,
                destination_path:
                    this.customerNotificationDestination(item),
                context: null,
                work_item: null,
                project_id: null,
                audit_event_id: null,
                channel: 'IN_APP',
            }));

        return {
            summary: {
                total:
                    items.filter((item) =>
                        item.status === 'unread',
                    ).length,
                critical:
                    items.filter((item) =>
                        item.status === 'unread' &&
                        item.severity === 'CRITICAL',
                    ).length,
                warning:
                    items.filter((item) =>
                        item.status === 'unread' &&
                        item.severity === 'WARNING',
                    ).length,
                info:
                    items.filter((item) =>
                        item.status === 'unread' &&
                        ['INFO', 'NORMAL'].includes(item.severity),
                    ).length,
            },
            filter: {
                status: 'all',
                category: null,
                severity: null,
                limit: safeLimit,
            },
            items,
        };
    }

    async markNotificationRead(
        notificationId: string,
        actor: ResourceActor,
    ) {
        const userId = actor.userId?.trim();
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được tài khoản đang đăng nhập',
            );
        }
        await this.accessibleCustomerIds(actor);

        const notification = await this.prisma.notifications.findFirst({
            where: {
                id: notificationId,
                user_id: userId,
                channel: 'IN_APP',
            },
            select: {
                id: true,
                category: true,
                notification_type: true,
                status: true,
            },
        });

        if (
            !notification ||
            !this.isCustomerSafeNotification(notification)
        ) {
            throw new NotFoundException(
                'Không tìm thấy thông báo thuộc cổng khách hàng',
            );
        }

        if (notification.status !== 'unread') {
            return notification;
        }

        return this.prisma.notifications.update({
            where: { id: notification.id },
            data: {
                status: 'read',
                read_at: new Date(),
            },
            select: {
                id: true,
                status: true,
                read_at: true,
            },
        });
    }

    async markAllNotificationsRead(actor: ResourceActor) {
        const userId = actor.userId?.trim();
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được tài khoản đang đăng nhập',
            );
        }
        await this.accessibleCustomerIds(actor);

        const result = await this.prisma.notifications.updateMany({
            where: {
                user_id: userId,
                channel: 'IN_APP',
                status: 'unread',
                OR: [
                    {
                        category: {
                            in: Array.from(
                                CUSTOMER_SAFE_NOTIFICATION_CATEGORIES,
                            ),
                        },
                    },
                    {
                        notification_type: {
                            startsWith: 'CUSTOMER_',
                        },
                    },
                    {
                        notification_type: {
                            startsWith: 'PORTAL_',
                        },
                    },
                ],
            },
            data: {
                status: 'read',
                read_at: new Date(),
            },
        });

        return { updated: result.count };
    }

    async getCertificationCases(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);

        const items =
            await this.prisma.certification_projects.findMany({
                where: {
                    certification_applications: {
                        customer_id: {
                            in: customerIds,
                        },
                    },
                },
                select: {
                    id: true,
                    project_code: true,
                    standard_name: true,
                    status: true,
                    created_at: true,
                    updated_at: true,
                    certification_applications: {
                        select: {
                            id: true,
                            application_code: true,
                            certification_scope: true,
                            customers: {
                                select: {
                                    id: true,
                                    customer_code: true,
                                    company_name: true,
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    updated_at: 'desc',
                },
            });

        return items.map((item) => ({
            id: item.id,
            project_code: item.project_code,
            standard_name: item.standard_name,
            status: item.status,
            certification_scope:
                item.certification_applications
                    .certification_scope,
            application: {
                id: item.certification_applications.id,
                application_code:
                    item.certification_applications
                        .application_code,
            },
            customer:
                item.certification_applications
                    .customers,
            created_at: item.created_at,
            updated_at: item.updated_at,
        }));
    }

    async getDashboard(actor: ResourceActor) {
        const customerIds =
            await this.accessibleCustomerIds(actor);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            customers,
            applications,
            projects,
            upcomingAudits,
            openFindings,
            certificates,
            notifications,
        ] = await Promise.all([
            this.prisma.customers.findMany({
                where: {
                    id: {
                        in: customerIds,
                    },
                },
                select: {
                    id: true,
                    customer_code: true,
                    company_name: true,
                },
                orderBy: {
                    company_name: 'asc',
                },
            }),
            this.prisma.certification_applications.count({
                where: {
                    customer_id: {
                        in: customerIds,
                    },
                },
            }),
            this.prisma.certification_projects.count({
                where: {
                    certification_applications: {
                        customer_id: {
                            in: customerIds,
                        },
                    },
                    status: {
                        notIn: [
                            'cancelled',
                            'closed',
                        ],
                    },
                },
            }),
            this.prisma.audit_plans.findMany({
                where: {
                    certification_projects: {
                        certification_applications: {
                            customer_id: {
                                in: customerIds,
                            },
                        },
                    },
                    planned_start_date: {
                        gte: today,
                    },
                    NOT: {
                        status: 'draft',
                    },
                },
                select: {
                    id: true,
                    plan_code: true,
                    audit_type: true,
                    planned_start_date: true,
                    planned_end_date: true,
                    location: true,
                    certification_projects: {
                        select: {
                            project_code: true,
                            standard_name: true,
                        },
                    },
                },
                orderBy: {
                    planned_start_date: 'asc',
                },
                take: 5,
            }),
            this.prisma.audit_findings.count({
                where: {
                    reports: {
                        audit_plans: {
                            certification_projects: {
                                certification_applications: {
                                    customer_id: {
                                        in: customerIds,
                                    },
                                },
                            },
                        },
                    },
                    finding_type: {
                        in: ['nc', 'major_nc', 'minor_nc'],
                    },
                    status: {
                        notIn: ['closed', 'accepted'],
                    },
                },
            }),
            this.prisma.certificates.count({
                where: {
                    certificate_series: {
                        certification_project: {
                            certification_applications: {
                                customer_id: {
                                    in: customerIds,
                                },
                            },
                        },
                    },
                    status: {
                        in: ['active', 'suspended'],
                    },
                },
            }),
            this.getNotifications(actor, 50),
        ]);

        return {
            customers,
            summary: {
                applications,
                active_projects: projects,
                open_corrective_actions: openFindings,
                active_certificates: certificates,
                unread_notifications:
                    notifications.summary.total,
            },
            upcoming_audits:
                upcomingAudits.map((item) => ({
                    id: item.id,
                    plan_code: item.plan_code,
                    audit_type: item.audit_type,
                    planned_start_date:
                        item.planned_start_date,
                    planned_end_date:
                        item.planned_end_date,
                    location: item.location,
                    project_code:
                        item.certification_projects.project_code,
                    standard_name:
                        item.certification_projects.standard_name,
                })),
        };
    }
}
