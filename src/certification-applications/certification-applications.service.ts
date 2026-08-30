import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationApplicationDto } from './dto/create-certification-application.dto';

@Injectable()
export class CertificationApplicationsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private prismaErrorCode(error: unknown) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof (error as { code?: unknown }).code === 'string'
        ) {
            return (error as { code: string }).code;
        }
        return undefined;
    }

    private applicationYear(applicationDate: string) {
        const date = new Date(applicationDate);
        const year = date.getUTCFullYear();
        if (!Number.isFinite(year) || year < 2000 || year > 9999) {
            return new Date().getUTCFullYear();
        }
        return year;
    }

    private async nextApplicationCode(
        tx: Prisma.TransactionClient,
        applicationDate: string,
    ) {
        const year = this.applicationYear(applicationDate);
        const prefix = `APP-${year}-`;
        const recent = await tx.certification_applications.findMany({
            where: {
                application_code: {
                    startsWith: prefix,
                },
            },
            select: {
                application_code: true,
            },
            orderBy: {
                application_code: 'desc',
            },
            take: 50,
        });

        let maxSequence = 0;
        for (const item of recent) {
            const suffix = item.application_code.slice(prefix.length);
            if (!/^\d+$/.test(suffix)) continue;
            maxSequence = Math.max(maxSequence, Number(suffix));
        }

        return `${prefix}${String(maxSequence + 1).padStart(4, '0')}`;
    }

    async findAll() {
        return this.prisma.certification_applications.findMany({
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        country_code: true,
                        tax_code: true,
                        address: true,
                        phone: true,
                        email: true,
                        status: true,
                    },
                },
                sites: {
                    orderBy: {
                        site_no: 'asc',
                    },
                },
                certification_projects: {
                    select: {
                        id: true,
                        project_code: true,
                        status: true,
                    },
                },
                application_reviews: {
                    include: {
                        users: {
                            select: {
                                id: true,
                                username: true,
                                full_name: true,
                            },
                        },
                        proposed_auditor: {
                            select: {
                                id: true,
                                employee_code: true,
                                full_name: true,
                                email: true,
                            },
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
                        workflow_actions: {
                            include: {
                                actor: {
                                    select: { id: true, username: true, full_name: true },
                                },
                            },
                            orderBy: { created_at: 'desc' },
                        },
                    },
                    orderBy: {
                        created_at: 'desc',
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    async create(
        dto: CreateCertificationApplicationDto,
        options?: { requireDeclaration?: boolean },
    ) {
        const customer =
            await this.prisma.customers.findUnique({
                where: {
                    id: dto.customer_id,
                },
            });

        if (!customer) {
            throw new NotFoundException(
                'Không tìm thấy khách hàng',
            );
        }

        if (customer.status === 'inactive') {
            throw new BadRequestException(
                'Khách hàng đã ngừng hoạt động',
            );
        }

        if (
            (options?.requireDeclaration ?? true) &&
            !dto.declaration_accepted
        ) {
            throw new BadRequestException(
                'Khách hàng phải xác nhận cam kết thông tin đăng ký',
            );
        }

        const sites = (dto.sites ?? [])
            .filter((site) => site.address.trim())
            .map((site, index) => ({
                site_no: site.site_no ?? index + 1,
                site_name: site.site_name?.trim() || undefined,
                address: site.address.trim(),
                activities: site.activities?.trim() || undefined,
                employee_count: site.employee_count,
                is_headquarters: site.is_headquarters ?? index === 0,
            }));

        const normalizedSites = sites.length
            ? sites
            : [{
                site_no: 1,
                site_name: 'Trụ sở chính',
                address: (
                    dto.headquarters_address ??
                    customer.address ??
                    ''
                ).trim(),
                activities: dto.certification_scope.trim(),
                employee_count: dto.employee_count,
                is_headquarters: true,
            }];

        if (!normalizedSites[0]?.address) {
            throw new BadRequestException(
                'Phải khai báo ít nhất một địa điểm chứng nhận',
            );
        }

        const countedShifts = [
            dto.shift1_count,
            dto.shift2_count,
            dto.shift3_count,
        ].filter((value) => Number(value ?? 0) > 0).length;

        const shiftCount = dto.shift_count ?? (countedShifts || 1);

        const execute = async () => this.prisma.$transaction(
            async (tx) => {
                const application_code = await this.nextApplicationCode(
                    tx,
                    dto.application_date,
                );
                return tx.certification_applications.create({
            data: {
                customer_id: dto.customer_id,
                application_code,
                application_date:
                    new Date(dto.application_date),
                certification_type:
                    dto.certification_type?.trim(),
                other_certification_type:
                    dto.other_certification_type?.trim(),
                standard_name:
                    dto.standard_name.trim(),
                certification_scope:
                    dto.certification_scope.trim(),
                excluded_clauses:
                    dto.excluded_clauses?.trim(),
                company_name_en:
                    dto.company_name_en?.trim(),
                headquarters_address:
                    dto.headquarters_address?.trim() ??
                    customer.address,
                representative_name:
                    dto.representative_name?.trim(),
                representative_position:
                    dto.representative_position?.trim(),
                representative_phone:
                    dto.representative_phone?.trim(),
                representative_fax:
                    dto.representative_fax?.trim(),
                representative_email:
                    dto.representative_email?.trim(),
                contact_name:
                    dto.contact_name?.trim(),
                contact_position:
                    dto.contact_position?.trim(),
                contact_phone:
                    dto.contact_phone?.trim(),
                contact_fax:
                    dto.contact_fax?.trim(),
                contact_email:
                    dto.contact_email?.trim(),
                site_count: normalizedSites.length,
                total_employee_count:
                    dto.total_employee_count,
                employee_count:
                    dto.employee_count,
                shift_count: shiftCount,
                shift1_count: dto.shift1_count,
                shift2_count: dto.shift2_count,
                shift3_count: dto.shift3_count,
                external_provider_used:
                    dto.external_provider_used,
                outsourced_processes:
                    dto.outsourced_processes?.trim(),
                requested_audit_date:
                    dto.requested_audit_date
                        ? new Date(dto.requested_audit_date)
                        : undefined,
                stage1_requested_date:
                    dto.stage1_requested_date
                        ? new Date(dto.stage1_requested_date)
                        : undefined,
                stage2_requested_date:
                    dto.stage2_requested_date
                        ? new Date(dto.stage2_requested_date)
                        : undefined,
                other_management_systems:
                    dto.other_management_systems,
                management_system_details:
                    dto.management_system_details?.trim(),
                associated_documents:
                    dto.associated_documents?.length
                        ? JSON.stringify(dto.associated_documents)
                        : undefined,
                consultant_organization:
                    dto.consultant_organization?.trim(),
                consultant_name:
                    dto.consultant_name?.trim(),
                certificate_languages:
                    dto.certificate_languages?.join(', '),
                other_requests:
                    dto.other_requests?.trim(),
                declaration_accepted:
                    dto.declaration_accepted,
                sites: {
                    create: normalizedSites,
                },
            },
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        country_code: true,
                        address: true,
                    },
                },
                sites: {
                    orderBy: {
                        site_no: 'asc',
                    },
                },
            },
        });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                return await execute();
            } catch (error) {
                const code = this.prismaErrorCode(error);
                const retryable = code === 'P2002' || code === 'P2034';
                if (!retryable || attempt === 3) {
                    if (retryable) {
                        throw new ConflictException(
                            'Không thể cấp mã đơn đăng ký do có yêu cầu đồng thời. Vui lòng thử lại.',
                        );
                    }
                    throw error;
                }
            }
        }

        throw new ConflictException('Không thể cấp mã đơn đăng ký');
    }

    private normalizedText(value: unknown) {
        return String(value ?? '').trim();
    }

    private canonicalSites(sites: Array<{
        site_no: number;
        site_name?: string | null;
        address: string;
        activities?: string | null;
        employee_count?: number | null;
        is_headquarters?: boolean | null;
    }>) {
        return [...sites]
            .sort((left, right) => left.site_no - right.site_no)
            .map((site) => ({
                site_no: site.site_no,
                site_name: this.normalizedText(site.site_name),
                address: this.normalizedText(site.address),
                activities: this.normalizedText(site.activities),
                employee_count: site.employee_count ?? null,
                is_headquarters: Boolean(site.is_headquarters),
            }));
    }

    private materialApplicationSnapshot(input: {
        customer_id: string;
        certification_type?: string | null;
        other_certification_type?: string | null;
        standard_name: string;
        certification_scope: string;
        excluded_clauses?: string | null;
        headquarters_address?: string | null;
        total_employee_count?: number | null;
        employee_count?: number | null;
        shift_count?: number | null;
        shift1_count?: number | null;
        shift2_count?: number | null;
        shift3_count?: number | null;
        external_provider_used?: boolean | null;
        outsourced_processes?: string | null;
        other_management_systems?: boolean | null;
        management_system_details?: string | null;
        sites: Array<{
            site_no: number;
            site_name?: string | null;
            address: string;
            activities?: string | null;
            employee_count?: number | null;
            is_headquarters?: boolean | null;
        }>;
    }) {
        return {
            customer_id: input.customer_id,
            certification_type: this.normalizedText(input.certification_type).toUpperCase(),
            other_certification_type: this.normalizedText(input.other_certification_type),
            standard_name: this.normalizedText(input.standard_name).toUpperCase(),
            certification_scope: this.normalizedText(input.certification_scope),
            excluded_clauses: this.normalizedText(input.excluded_clauses),
            headquarters_address: this.normalizedText(input.headquarters_address),
            total_employee_count: input.total_employee_count ?? null,
            employee_count: input.employee_count ?? null,
            shift_count: input.shift_count ?? null,
            shift1_count: input.shift1_count ?? null,
            shift2_count: input.shift2_count ?? null,
            shift3_count: input.shift3_count ?? null,
            external_provider_used: input.external_provider_used ?? null,
            outsourced_processes: this.normalizedText(input.outsourced_processes),
            other_management_systems: input.other_management_systems ?? null,
            management_system_details: this.normalizedText(input.management_system_details),
            sites: this.canonicalSites(input.sites),
        };
    }

    private materialApplicationChanges(
        before: Record<string, unknown>,
        after: Record<string, unknown>,
    ) {
        const labels: Record<string, string> = {
            customer_id: 'khách hàng',
            certification_type: 'loại chứng nhận',
            other_certification_type: 'loại chứng nhận khác',
            standard_name: 'tiêu chuẩn/chương trình',
            certification_scope: 'phạm vi chứng nhận',
            excluded_clauses: 'điều khoản loại trừ',
            headquarters_address: 'địa chỉ trụ sở',
            total_employee_count: 'tổng số nhân sự',
            employee_count: 'nhân sự hiệu dụng',
            shift_count: 'số ca',
            shift1_count: 'nhân sự ca 1',
            shift2_count: 'nhân sự ca 2',
            shift3_count: 'nhân sự ca 3',
            external_provider_used: 'sử dụng nhà cung cấp bên ngoài',
            outsourced_processes: 'quá trình thuê ngoài',
            other_management_systems: 'hệ thống quản lý khác',
            management_system_details: 'thông tin hệ thống quản lý',
            sites: 'địa điểm/hoạt động tại địa điểm',
        };

        return Object.keys(labels)
            .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
            .map((key) => labels[key]);
    }

    async update(
        id: string,
        dto: CreateCertificationApplicationDto,
        currentUserId: string,
        options?: { requireDeclaration?: boolean },
    ) {
        const existing = await this.prisma.certification_applications.findUnique({
            where: { id },
            include: {
                sites: {
                    orderBy: { site_no: 'asc' },
                },
                certification_projects: {
                    select: { id: true, project_code: true },
                },
                application_reviews: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        workflow_status: true,
                        prepared_by_id: true,
                    },
                },
            },
        });

        if (!existing) {
            throw new NotFoundException('Không tìm thấy đơn đăng ký chứng nhận');
        }
        if (existing.certification_projects.length) {
            throw new BadRequestException(
                `Đơn đã liên kết với hồ sơ ${existing.certification_projects[0].project_code}; không thể sửa thông tin gốc`,
            );
        }

        const latestReview = existing.application_reviews[0];
        if (latestReview?.workflow_status === 'SUBMITTED') {
            throw new BadRequestException(
                'Đơn đang được reviewer xem xét; reviewer phải trả lại trước khi sửa',
            );
        }

        const customer = await this.prisma.customers.findUnique({
            where: { id: dto.customer_id },
        });
        if (!customer) {
            throw new NotFoundException('Không tìm thấy khách hàng');
        }
        if (customer.status === 'inactive') {
            throw new BadRequestException('Khách hàng đã ngừng hoạt động');
        }

        const applicationCode = dto.application_code?.trim() || existing.application_code;
        const duplicate = await this.prisma.certification_applications.findFirst({
            where: {
                application_code: applicationCode,
                NOT: { id },
            },
            select: { id: true },
        });
        if (duplicate) {
            throw new BadRequestException('Mã hồ sơ đăng ký đã tồn tại');
        }
        if (
            (options?.requireDeclaration ?? true) &&
            !dto.declaration_accepted
        ) {
            throw new BadRequestException(
                'Khách hàng phải xác nhận cam kết thông tin đăng ký',
            );
        }

        const sites = (dto.sites ?? [])
            .filter((site) => site.address.trim())
            .map((site, index) => ({
                site_no: site.site_no ?? index + 1,
                site_name: site.site_name?.trim() || undefined,
                address: site.address.trim(),
                activities: site.activities?.trim() || undefined,
                employee_count: site.employee_count,
                is_headquarters: site.is_headquarters ?? index === 0,
            }));
        const normalizedSites = sites.length
            ? sites
            : [{
                site_no: 1,
                site_name: 'Trụ sở chính',
                address: (dto.headquarters_address ?? customer.address ?? '').trim(),
                activities: dto.certification_scope.trim(),
                employee_count: dto.employee_count,
                is_headquarters: true,
            }];
        if (!normalizedSites[0]?.address) {
            throw new BadRequestException(
                'Phải khai báo ít nhất một địa điểm chứng nhận',
            );
        }

        const countedShifts = [
            dto.shift1_count,
            dto.shift2_count,
            dto.shift3_count,
        ].filter((value) => Number(value ?? 0) > 0).length;
        const shiftCount = dto.shift_count ?? (countedShifts || 1);

        const beforeSnapshot = this.materialApplicationSnapshot({
            ...existing,
            sites: existing.sites,
        });
        const afterSnapshot = this.materialApplicationSnapshot({
            customer_id: dto.customer_id,
            certification_type: dto.certification_type,
            other_certification_type: dto.other_certification_type,
            standard_name: dto.standard_name,
            certification_scope: dto.certification_scope,
            excluded_clauses: dto.excluded_clauses,
            headquarters_address: dto.headquarters_address?.trim() ?? customer.address,
            total_employee_count: dto.total_employee_count,
            employee_count: dto.employee_count,
            shift_count: shiftCount,
            shift1_count: dto.shift1_count,
            shift2_count: dto.shift2_count,
            shift3_count: dto.shift3_count,
            external_provider_used: dto.external_provider_used,
            outsourced_processes: dto.outsourced_processes,
            other_management_systems: dto.other_management_systems,
            management_system_details: dto.management_system_details,
            sites: normalizedSites,
        });
        const materialChanges = this.materialApplicationChanges(
            beforeSnapshot,
            afterSnapshot,
        );
        const invalidatesApproval =
            latestReview?.workflow_status === 'APPROVED' &&
            materialChanges.length > 0;
        const nextApplicationStatus = invalidatesApproval
            ? 'under_review'
            : existing.status;

        return this.prisma.$transaction(async (tx) => {
            await tx.certification_application_sites.deleteMany({
                where: { application_id: id },
            });

            await tx.certification_applications.update({
                where: { id },
                data: {
                    customer_id: dto.customer_id,
                    application_code: applicationCode,
                    application_date: new Date(dto.application_date),
                    certification_type: dto.certification_type?.trim(),
                    other_certification_type: dto.other_certification_type?.trim(),
                    standard_name: dto.standard_name.trim(),
                    certification_scope: dto.certification_scope.trim(),
                    excluded_clauses: dto.excluded_clauses?.trim(),
                    company_name_en: dto.company_name_en?.trim(),
                    headquarters_address: dto.headquarters_address?.trim() ?? customer.address,
                    representative_name: dto.representative_name?.trim(),
                    representative_position: dto.representative_position?.trim(),
                    representative_phone: dto.representative_phone?.trim(),
                    representative_fax: dto.representative_fax?.trim(),
                    representative_email: dto.representative_email?.trim(),
                    contact_name: dto.contact_name?.trim(),
                    contact_position: dto.contact_position?.trim(),
                    contact_phone: dto.contact_phone?.trim(),
                    contact_fax: dto.contact_fax?.trim(),
                    contact_email: dto.contact_email?.trim(),
                    site_count: normalizedSites.length,
                    total_employee_count: dto.total_employee_count,
                    employee_count: dto.employee_count,
                    shift_count: shiftCount,
                    shift1_count: dto.shift1_count,
                    shift2_count: dto.shift2_count,
                    shift3_count: dto.shift3_count,
                    external_provider_used: dto.external_provider_used,
                    outsourced_processes: dto.outsourced_processes?.trim(),
                    requested_audit_date: dto.requested_audit_date
                        ? new Date(dto.requested_audit_date)
                        : null,
                    stage1_requested_date: dto.stage1_requested_date
                        ? new Date(dto.stage1_requested_date)
                        : null,
                    stage2_requested_date: dto.stage2_requested_date
                        ? new Date(dto.stage2_requested_date)
                        : null,
                    other_management_systems: dto.other_management_systems,
                    management_system_details: dto.management_system_details?.trim(),
                    associated_documents: dto.associated_documents?.length
                        ? JSON.stringify(dto.associated_documents)
                        : null,
                    consultant_organization: dto.consultant_organization?.trim(),
                    consultant_name: dto.consultant_name?.trim(),
                    certificate_languages: dto.certificate_languages?.join(', '),
                    other_requests: dto.other_requests?.trim(),
                    declaration_accepted: dto.declaration_accepted,
                    status: nextApplicationStatus,
                    sites: { create: normalizedSites },
                },
            });

            if (invalidatesApproval && latestReview) {
                const now = new Date();
                const invalidationComment =
                    `Tự động yêu cầu xem xét lại do thay đổi dữ liệu trọng yếu của đơn: ${materialChanges.join(', ')}.`;

                await tx.application_reviews.update({
                    where: { id: latestReview.id },
                    data: {
                        workflow_status: 'RETURNED',
                        submitted_at: null,
                        approved_at: null,
                        returned_at: now,
                        approved_by_name: null,
                        approver_comment: null,
                    },
                });

                await tx.application_review_actions.create({
                    data: {
                        review_id: latestReview.id,
                        action: 'INVALIDATE_APPLICATION_CHANGE',
                        from_status: 'APPROVED',
                        to_status: 'RETURNED',
                        actor_id: currentUserId,
                        comment: invalidationComment,
                    },
                });

                if (latestReview.prepared_by_id) {
                    await tx.notifications.upsert({
                        where: {
                            user_id_source_key_channel: {
                                user_id: latestReview.prepared_by_id,
                                source_key: `application-review:${latestReview.id}:application-invalidated`,
                                channel: 'IN_APP',
                            },
                        },
                        create: {
                            user_id: latestReview.prepared_by_id,
                            source_key: `application-review:${latestReview.id}:application-invalidated`,
                            notification_type: 'APPLICATION_REVIEW_INVALIDATED',
                            category: 'WORKFLOW_UPDATE',
                            title: 'Bản xem xét cần thực hiện lại',
                            message: invalidationComment,
                            severity: 'WARNING',
                            entity_type: 'application_review',
                            entity_id: latestReview.id,
                        },
                        update: {
                            user_id: latestReview.prepared_by_id,
                            message: invalidationComment,
                            status: 'unread',
                            read_at: null,
                            updated_at: now,
                        },
                    });
                }
            }

            return tx.certification_applications.findUnique({
                where: { id },
                include: {
                    customers: {
                        select: {
                            id: true,
                            customer_code: true,
                            company_name: true,
                            country_code: true,
                            address: true,
                        },
                    },
                    sites: { orderBy: { site_no: 'asc' } },
                    certification_projects: {
                        select: { id: true, project_code: true, status: true },
                    },
                    application_reviews: {
                        include: {
                            prepared_by: {
                                select: { id: true, username: true, full_name: true },
                            },
                            users: {
                                select: { id: true, username: true, full_name: true },
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
                    },
                },
            });
        });
    }

    async remove(id: string) {
        const application = await this.prisma.certification_applications.findUnique({
            where: { id },
            include: {
                certification_projects: {
                    select: { id: true, project_code: true },
                },
                application_reviews: {
                    select: {
                        id: true,
                        workflow_status: true,
                        workflow_actions: {
                            where: { action: 'APPROVE' },
                            take: 1,
                            select: { id: true },
                        },
                        capability_snapshots: {
                            take: 1,
                            select: { id: true },
                        },
                    },
                },
            },
        });
        if (!application) {
            throw new NotFoundException('Không tìm thấy đơn đăng ký chứng nhận');
        }
        if (application.certification_projects.length) {
            throw new BadRequestException(
                `Không thể xóa vì đơn đã liên kết với hồ sơ ${application.certification_projects[0].project_code}`,
            );
        }

        const hasActiveOrApprovedReview = application.application_reviews.some(
            (review) =>
                ['SUBMITTED', 'APPROVED'].includes(review.workflow_status) ||
                review.workflow_actions.length > 0 ||
                review.capability_snapshots.length > 0,
        );
        if (hasActiveOrApprovedReview) {
            throw new BadRequestException(
                'Không thể xóa đơn đang được reviewer xử lý hoặc đã từng được phê duyệt; cần giữ lịch sử xem xét',
            );
        }

        const reviewIds = application.application_reviews.map((review) => review.id);
        await this.prisma.$transaction(async (tx) => {
            if (reviewIds.length) {
                await tx.notifications.deleteMany({
                    where: {
                        entity_type: 'application_review',
                        entity_id: { in: reviewIds },
                    },
                });
                await tx.application_review_actions.deleteMany({
                    where: { review_id: { in: reviewIds } },
                });
                await tx.application_review_capability_snapshots.deleteMany({
                    where: { review_id: { in: reviewIds } },
                });
                await tx.application_reviews.deleteMany({
                    where: { id: { in: reviewIds } },
                });
            }
            await tx.certification_application_sites.deleteMany({
                where: { application_id: id },
            });
            await tx.certification_applications.delete({ where: { id } });
        });

        return {
            success: true,
            id,
            application_code: application.application_code,
        };
    }

}
