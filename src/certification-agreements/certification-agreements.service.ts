import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationAgreementDto } from './dto/create-certification-agreement.dto';

@Injectable()
export class CertificationAgreementsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Lấy danh sách thỏa thuận chứng nhận
    async findAll() {
        return this.prisma.certification_agreements.findMany({
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
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                        sign_date: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    // Lấy chi tiết một thỏa thuận chứng nhận
    async findOne(id: string) {
        const agreement =
            await this.prisma.certification_agreements.findUnique({
                where: {
                    id,
                },
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
                    contracts: {
                        select: {
                            id: true,
                            contract_number: true,
                            sign_date: true,
                            start_date: true,
                            end_date: true,
                        },
                    },
                },
            });

        if (!agreement) {
            throw new NotFoundException(
                'Không tìm thấy thỏa thuận chứng nhận',
            );
        }

        return agreement;
    }

    // Tạo thỏa thuận chứng nhận
    async create(
        dto: CreateCertificationAgreementDto,
    ) {
        // Kiểm tra khách hàng tồn tại
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

        // Không tạo hồ sơ mới cho khách hàng đã ngừng hoạt động
        if (customer.status === 'inactive') {
            throw new BadRequestException(
                'Khách hàng đã ngừng hoạt động',
            );
        }

        // Kiểm tra số thỏa thuận đã tồn tại
        const existingAgreement =
            await this.prisma.certification_agreements.findUnique({
                where: {
                    agreement_number:
                        dto.agreement_number,
                },
            });

        if (existingAgreement) {
            throw new BadRequestException(
                'Số thỏa thuận chứng nhận đã tồn tại',
            );
        }

        // Nếu có contract_id thì kiểm tra hợp đồng
        if (dto.contract_id) {
            const contract =
                await this.prisma.contracts.findUnique({
                    where: {
                        id: dto.contract_id,
                    },
                });

            if (!contract) {
                throw new NotFoundException(
                    'Không tìm thấy hợp đồng',
                );
            }

            // Hợp đồng và thỏa thuận phải cùng một khách hàng
            if (
                contract.customer_id !==
                dto.customer_id
            ) {
                throw new BadRequestException(
                    'Hợp đồng không thuộc khách hàng đã chọn',
                );
            }
        }

        return this.prisma.certification_agreements.create({
            data: {
                customer_id: dto.customer_id,
                contract_id: dto.contract_id,
                agreement_number:
                    dto.agreement_number,
                sign_date: new Date(dto.sign_date),
            },
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                    },
                },
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                    },
                },
            },
        });
    }
}