import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const CUSTOMER_USER_ACCESS_SELECT = {
    id: true,
    user_id: true,
    customer_id: true,
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
} as const;

@Injectable()
export class CustomersService {
    constructor(private prisma: PrismaService) { }

    private isActive(
        status: string | null | undefined,
    ) {
        return status
            ?.trim()
            .toLowerCase() === 'active';
    }

    private hasErrorCode(
        error: unknown,
        code: string,
    ) {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (
                error as {
                    code?: unknown;
                }
            ).code === code
        );
    }


    private normalizeCountryCode(
        value: string | null | undefined,
    ) {
        const normalized = String(value ?? 'VN')
            .trim()
            .toUpperCase();

        if (!/^[A-Z]{2}$/.test(normalized)) {
            throw new BadRequestException(
                'Mã quốc gia phải gồm đúng 2 chữ cái',
            );
        }

        return normalized;
    }

    private normalizeCountryName(
        countryCode: string,
        value: string | null | undefined,
    ) {
        const normalized = String(value ?? '').trim();

        if (countryCode === 'OT') {
            if (!normalized) {
                throw new BadRequestException(
                    'Vui lòng nhập tên quốc gia khi chọn Khác',
                );
            }

            if (normalized.length > 100) {
                throw new BadRequestException(
                    'Tên quốc gia không được vượt quá 100 ký tự',
                );
            }

            return normalized;
        }

        return null;
    }

    private normalizeTaxCode(
        countryCode: string,
        value: string | null | undefined,
    ) {
        const raw = String(value ?? '').trim();

        if (!raw) {
            return null;
        }

        if (countryCode === 'VN') {
            const normalized = raw.replace(/[\s-]/g, '');

            if (!/^\d{10}(?:\d{3})?$/.test(normalized)) {
                throw new BadRequestException(
                    'Mã số thuế Việt Nam phải gồm 10 hoặc 13 chữ số',
                );
            }

            return normalized;
        }

        if (raw.length > 20) {
            throw new BadRequestException(
                'Tax ID/Business ID không được vượt quá 20 ký tự',
            );
        }

        return raw;
    }

    private customerUserAccessKey(
        customerId: string,
        userId: string,
    ) {
        return {
            customer_id_user_id: {
                customer_id: customerId,
                user_id: userId,
            },
        };
    }

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
        const customerCode = dto.customer_code.trim();
        const countryCode = this.normalizeCountryCode(
            dto.country_code,
        );
        const countryName = this.normalizeCountryName(
            countryCode,
            dto.country_name,
        );
        const taxCode = this.normalizeTaxCode(
            countryCode,
            dto.tax_code,
        );

        const existingCode =
            await this.prisma.customers.findUnique({
                where: {
                    customer_code: customerCode,
                },
            });

        if (existingCode) {
            throw new BadRequestException(
                'Mã khách hàng đã tồn tại',
            );
        }

        if (taxCode) {
            const existingTax =
                await this.prisma.customers.findFirst({
                    where: {
                        tax_code: taxCode,
                    },
                });

            if (existingTax) {
                throw new BadRequestException(
                    'Mã số thuế / Tax ID đã tồn tại',
                );
            }
        }

        return this.prisma.customers.create({
            data: {
                customer_code: customerCode,
                company_name: dto.company_name.trim(),
                country_code: countryCode,
                country_name: countryName,
                tax_code: taxCode,
                address: dto.address?.trim(),
                email: dto.email?.trim(),
                phone: dto.phone?.trim(),
            },
        });
    }

    // Cập nhật khách hàng
    async update(
        id: string,
        dto: UpdateCustomerDto,
    ) {
        const current = await this.findOne(id);
        const customerCode = dto.customer_code?.trim()
            ?? current.customer_code;
        const countryCode = this.normalizeCountryCode(
            dto.country_code ?? current.country_code,
        );
        const countryName = this.normalizeCountryName(
            countryCode,
            dto.country_name !== undefined
                ? dto.country_name
                : current.country_name,
        );
        const taxCode = this.normalizeTaxCode(
            countryCode,
            dto.tax_code !== undefined
                ? dto.tax_code
                : current.tax_code,
        );

        const duplicateCode =
            await this.prisma.customers.findFirst({
                where: {
                    customer_code: customerCode,
                    NOT: { id },
                },
                select: { id: true },
            });

        if (duplicateCode) {
            throw new BadRequestException(
                'Mã khách hàng đã tồn tại',
            );
        }

        if (taxCode) {
            const duplicateTax =
                await this.prisma.customers.findFirst({
                    where: {
                        tax_code: taxCode,
                        NOT: { id },
                    },
                    select: { id: true },
                });

            if (duplicateTax) {
                throw new BadRequestException(
                    'Mã số thuế / Tax ID đã tồn tại',
                );
            }
        }

        return this.prisma.customers.update({
            where: { id },
            data: {
                customer_code: customerCode,
                company_name: dto.company_name?.trim()
                    ?? current.company_name,
                country_code: countryCode,
                country_name: countryName,
                tax_code: taxCode,
                address: dto.address === undefined
                    ? current.address
                    : dto.address?.trim() || null,
                email: dto.email === undefined
                    ? current.email
                    : dto.email?.trim() || null,
                phone: dto.phone === undefined
                    ? current.phone
                    : dto.phone?.trim() || null,
            },
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

    // Khôi phục hoạt động trên chính hồ sơ khách hàng cũ
    async reactivate(id: string) {
        const customer = await this.findOne(id);

        if (customer.status === 'active') {
            throw new BadRequestException(
                'Khách hàng đang hoạt động',
            );
        }

        return this.prisma.customers.update({
            where: {
                id,
            },
            data: {
                status: 'active',
            },
        });
    }

    async findUserAccess(
        customerId: string,
    ) {
        const customer =
            await this.prisma.customers.findUnique({
                where: {
                    id: customerId,
                },
                select: {
                    id: true,
                },
            });

        if (!customer) {
            throw new NotFoundException(
                'Customer not found',
            );
        }

        return this.prisma.customer_user_access.findMany({
            where: {
                customer_id: customerId,
            },
            select: CUSTOMER_USER_ACCESS_SELECT,
            orderBy: [
                {
                    created_at: 'asc',
                },
                {
                    id: 'asc',
                },
            ],
        });
    }

    async assignUserAccess(
        customerId: string,
        userId: string,
        createdBy: string,
    ) {
        try {
            return await this.prisma.$transaction(
                async (transaction) => {
                    const [
                        customer,
                        targetUser,
                    ] = await Promise.all([
                        transaction.customers.findUnique({
                            where: {
                                id: customerId,
                            },
                            select: {
                                id: true,
                                status: true,
                            },
                        }),
                        transaction.users.findUnique({
                            where: {
                                id: userId,
                            },
                            select: {
                                id: true,
                                status: true,
                                user_roles: {
                                    select: {
                                        roles: {
                                            select: {
                                                role_name: true,
                                            },
                                        },
                                    },
                                },
                            },
                        }),
                    ]);

                    if (!customer) {
                        throw new NotFoundException(
                            'Customer not found',
                        );
                    }

                    if (!this.isActive(customer.status)) {
                        throw new BadRequestException(
                            'Customer is not active',
                        );
                    }

                    if (!targetUser) {
                        throw new NotFoundException(
                            'Target user not found',
                        );
                    }

                    if (!this.isActive(targetUser.status)) {
                        throw new BadRequestException(
                            'Target user is not active',
                        );
                    }

                    const hasCustomerRole =
                        targetUser.user_roles.some(
                            ({ roles }) =>
                                roles.role_name
                                    .trim()
                                    .toUpperCase() ===
                                'CUSTOMER',
                        );

                    if (!hasCustomerRole) {
                        throw new BadRequestException(
                            'Target user must have the CUSTOMER role',
                        );
                    }

                    const where =
                        this.customerUserAccessKey(
                            customerId,
                            userId,
                        );

                    const existing =
                        await transaction.customer_user_access.findUnique({
                            where,
                            select: CUSTOMER_USER_ACCESS_SELECT,
                        });

                    if (
                        existing &&
                        this.isActive(existing.status)
                    ) {
                        return existing;
                    }

                    return transaction.customer_user_access.upsert({
                        where,
                        create: {
                            customer_id: customerId,
                            user_id: userId,
                            status: 'active',
                            created_by: createdBy,
                        },
                        update: {
                            status: 'active',
                        },
                        select: CUSTOMER_USER_ACCESS_SELECT,
                    });
                },
            );
        } catch (error) {
            if (
                !this.hasErrorCode(
                    error,
                    'P2002',
                )
            ) {
                throw error;
            }

            const concurrentMapping =
                await this.prisma.customer_user_access.findUnique({
                    where:
                        this.customerUserAccessKey(
                            customerId,
                            userId,
                        ),
                    select: CUSTOMER_USER_ACCESS_SELECT,
                });

            if (
                concurrentMapping &&
                this.isActive(
                    concurrentMapping.status,
                )
            ) {
                return concurrentMapping;
            }

            throw error;
        }
    }

    async revokeUserAccess(
        customerId: string,
        userId: string,
    ) {
        return this.prisma.$transaction(
            async (transaction) => {
                const customer =
                    await transaction.customers.findUnique({
                        where: {
                            id: customerId,
                        },
                        select: {
                            id: true,
                        },
                    });

                if (!customer) {
                    throw new NotFoundException(
                        'Customer not found',
                    );
                }

                const where =
                    this.customerUserAccessKey(
                        customerId,
                        userId,
                    );

                const existing =
                    await transaction.customer_user_access.findUnique({
                        where,
                        select: CUSTOMER_USER_ACCESS_SELECT,
                    });

                if (!existing) {
                    throw new NotFoundException(
                        'Customer user access mapping not found',
                    );
                }

                if (
                    existing.status
                        .trim()
                        .toLowerCase() === 'revoked'
                ) {
                    return existing;
                }

                return transaction.customer_user_access.update({
                    where,
                    data: {
                        status: 'revoked',
                    },
                    select: CUSTOMER_USER_ACCESS_SELECT,
                });
            },
        );
    }
}
