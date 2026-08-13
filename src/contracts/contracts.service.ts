import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';

@Injectable()
export class ContractsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Lấy danh sách hợp đồng
    async findAll() {
        return this.prisma.contracts.findMany({
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        country_code: true,
                        tax_code: true,
                        status: true,
                    },
                },
                certification_agreements: true,
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    // Lấy chi tiết hợp đồng
    async findOne(id: string) {
        const contract = await this.prisma.contracts.findUnique({
            where: {
                id,
            },
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        country_code: true,
                        tax_code: true,
                        status: true,
                    },
                },
                certification_agreements: true,
            },
        });

        if (!contract) {
            throw new NotFoundException(
                'Không tìm thấy hợp đồng',
            );
        }

        return contract;
    }

    // Tạo hợp đồng
    async create(dto: CreateContractDto) {
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

        const existingContract =
            await this.prisma.contracts.findUnique({
                where: {
                    contract_number:
                        dto.contract_number,
                },
            });

        if (existingContract) {
            throw new BadRequestException(
                'Số hợp đồng đã tồn tại',
            );
        }

        if (
            dto.start_date &&
            dto.end_date &&
            new Date(dto.end_date) <
            new Date(dto.start_date)
        ) {
            throw new BadRequestException(
                'Ngày kết thúc không được trước ngày bắt đầu',
            );
        }

        return this.prisma.contracts.create({
            data: {
                customer_id: dto.customer_id,
                contract_number:
                    dto.contract_number,

                sign_date: dto.sign_date
                    ? new Date(dto.sign_date)
                    : undefined,

                start_date: dto.start_date
                    ? new Date(dto.start_date)
                    : undefined,

                end_date: dto.end_date
                    ? new Date(dto.end_date)
                    : undefined,

                total_value: dto.total_value,
                currency: dto.currency?.trim().toUpperCase(),
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
