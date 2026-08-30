import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

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

        const quotation = dto.quotation_id
            ? await this.prisma.quotations.findUnique({ where: { id: dto.quotation_id } })
            : null;

        if (dto.quotation_id && !quotation) {
            throw new NotFoundException('Không tìm thấy báo giá');
        }
        if (quotation && (quotation.status !== 'ACCEPTED' || quotation.customer_id !== dto.customer_id)) {
            throw new BadRequestException('Hợp đồng chỉ được liên kết báo giá ACCEPTED của cùng khách hàng');
        }
        if (quotation && dto.currency && dto.currency.trim().toUpperCase() !== quotation.currency) {
            throw new BadRequestException('Tiền tệ hợp đồng phải khớp báo giá đã chấp nhận');
        }
        if (quotation && dto.total_value && !new Prisma.Decimal(dto.total_value).equals(quotation.total_amount)) {
            throw new BadRequestException('Giá trị hợp đồng phải khớp báo giá đã chấp nhận');
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

                total_value: quotation?.total_amount ?? (dto.total_value ? new Prisma.Decimal(dto.total_value) : undefined),
                currency: quotation?.currency ?? dto.currency?.trim().toUpperCase(),
                quotation_id: quotation?.id,
                commercial_status: dto.sign_date ? 'SIGNED' : 'DRAFT',
                payment_terms: dto.payment_terms?.trim(),
                renewal_date: dto.renewal_date ? new Date(dto.renewal_date) : undefined,
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
