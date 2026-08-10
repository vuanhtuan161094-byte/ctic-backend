import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationApplicationDto } from './dto/create-certification-application.dto';

@Injectable()
export class CertificationApplicationsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findAll() {
        return this.prisma.certification_applications.findMany({
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
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

    async create(dto: CreateCertificationApplicationDto) {
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

        const existingApplication =
            await this.prisma.certification_applications.findUnique({
                where: {
                    application_code:
                        dto.application_code,
                },
            });

        if (existingApplication) {
            throw new BadRequestException(
                'Mã hồ sơ đăng ký đã tồn tại',
            );
        }

        if (!dto.declaration_accepted) {
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

        return this.prisma.certification_applications.create({
            data: {
                customer_id: dto.customer_id,
                application_code:
                    dto.application_code.trim(),
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
    }

    async update(id: string, dto: CreateCertificationApplicationDto) {
        const existing = await this.prisma.certification_applications.findUnique({
            where: { id },
            include: {
                certification_projects: {
                    select: { id: true, project_code: true },
                },
                application_reviews: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: { workflow_status: true },
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
        const workflowStatus = existing.application_reviews[0]?.workflow_status;
        if (['PENDING_CHECK', 'RETURNED_TO_CHECKER', 'PENDING_APPROVAL'].includes(workflowStatus ?? '')) {
            throw new BadRequestException(
                'Đơn đang được đánh giá viên xử lý; hãy hoàn tất hoặc trả lại bước người lập trước khi sửa',
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
        const duplicate = await this.prisma.certification_applications.findFirst({
            where: {
                application_code: dto.application_code.trim(),
                NOT: { id },
            },
            select: { id: true },
        });
        if (duplicate) {
            throw new BadRequestException('Mã hồ sơ đăng ký đã tồn tại');
        }
        if (!dto.declaration_accepted) {
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
        const nextStatus = ['accepted', 'rejected'].includes(existing.status.toLowerCase())
            ? 'under_review'
            : existing.status;

        return this.prisma.$transaction(async (tx) => {
            await tx.certification_application_sites.deleteMany({
                where: { application_id: id },
            });
            return tx.certification_applications.update({
                where: { id },
                data: {
                    customer_id: dto.customer_id,
                    application_code: dto.application_code.trim(),
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
                    status: nextStatus,
                    sites: { create: normalizedSites },
                },
                include: {
                    customers: {
                        select: {
                            id: true,
                            customer_code: true,
                            company_name: true,
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
                            checker: {
                                select: { id: true, username: true, full_name: true },
                            },
                            approver: {
                                select: { id: true, username: true, full_name: true },
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
                    select: { id: true, workflow_status: true },
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
        if (application.application_reviews.some((review) =>
            ['PENDING_CHECK', 'RETURNED_TO_CHECKER', 'PENDING_APPROVAL'].includes(review.workflow_status),
        )) {
            throw new BadRequestException(
                'Không thể xóa đơn đang trong quy trình kiểm tra kỹ thuật',
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
