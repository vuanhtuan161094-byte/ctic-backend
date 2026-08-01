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

    // Lấy danh sách hồ sơ đăng ký chứng nhận
    async findAll() {
        return this.prisma.certification_applications.findMany({
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        tax_code: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    // Tạo hồ sơ đăng ký chứng nhận
    async create(
        dto: CreateCertificationApplicationDto,
    ) {
        // Kiểm tra khách hàng có tồn tại không
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

        // Không cho tạo hồ sơ cho khách hàng đã ngừng hoạt động
        if (customer.status === 'inactive') {
            throw new BadRequestException(
                'Khách hàng đã ngừng hoạt động',
            );
        }

        // Kiểm tra mã hồ sơ đã tồn tại chưa
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

        // Tạo hồ sơ đăng ký
        return this.prisma.certification_applications.create({
            data: {
                customer_id: dto.customer_id,
                application_code:
                    dto.application_code,

                application_date:
                    new Date(dto.application_date),

                certification_type:
                    dto.certification_type,

                standard_name:
                    dto.standard_name,

                certification_scope:
                    dto.certification_scope,

                site_count:
                    dto.site_count ?? 1,

                employee_count:
                    dto.employee_count,

                shift_count:
                    dto.shift_count,

                requested_audit_date:
                    dto.requested_audit_date
                        ? new Date(dto.requested_audit_date)
                        : undefined,
            },
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                    },
                },
            },
        });
    }
}