import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
    constructor(private prisma: PrismaService) { }

    // Lấy danh sách khách hàng
    async findAll() {
        return this.prisma.customers.findMany();
    }

    // Lấy chi tiết một khách hàng
    async findOne(id: string) {
        const customer = await this.prisma.customers.findUnique({
            where: {
                id,
            },
        });

        if (!customer) {
            throw new NotFoundException(
                'Không tìm thấy khách hàng',
            );
        }

        return customer;
    }

    // Tạo khách hàng mới
    async create(dto: CreateCustomerDto) {
        const existingCode =
            await this.prisma.customers.findUnique({
                where: {
                    customer_code: dto.customer_code,
                },
            });

        if (existingCode) {
            throw new BadRequestException(
                'Mã khách hàng đã tồn tại',
            );
        }

        if (dto.tax_code) {
            const existingTax =
                await this.prisma.customers.findUnique({
                    where: {
                        tax_code: dto.tax_code,
                    },
                });

            if (existingTax) {
                throw new BadRequestException(
                    'Mã số thuế đã tồn tại',
                );
            }
        }

        return this.prisma.customers.create({
            data: dto,
        });
    }

    // Cập nhật khách hàng
    async update(
        id: string,
        dto: UpdateCustomerDto,
    ) {
        await this.findOne(id);

        return this.prisma.customers.update({
            where: {
                id,
            },
            data: dto,
        });
    }

    // Ngừng hoạt động khách hàng
    async remove(id: string) {
        const customer = await this.findOne(id);

        if (customer.status === 'inactive') {
            throw new BadRequestException(
                'Khách hàng đã ngừng hoạt động',
            );
        }

        return this.prisma.customers.update({
            where: {
                id,
            },
            data: {
                status: 'inactive',
            },
        });
    }
}