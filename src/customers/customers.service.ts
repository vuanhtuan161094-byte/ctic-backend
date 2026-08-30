import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';

import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerPortalUserDto } from './dto/create-customer-portal-user.dto';

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
            username: true,
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

    private customerRoleOnly(
        userRoles: Array<{
            roles: {
                role_name: string;
            };
        }>,
    ) {
        const roles = userRoles
            .map(({ roles }) => roles.role_name.trim().toUpperCase())
            .filter(Boolean);

        return roles.length === 1 && roles[0] === 'CUSTOMER';
    }

    private generateTemporaryPassword() {
        return `${randomBytes(12).toString('base64url')}Aa1!`;
    }

    private normalizePortalUsernameBase(
        email: string,
    ) {
        const localPart = email.split('@')[0] ?? 'customer';
        const normalized = localPart
            .normalize('NFKD')
            .replace(/[^a-zA-Z0-9._-]+/g, '.')
            .replace(/^[._-]+|[._-]+$/g, '')
            .slice(0, 42);

        return normalized.length >= 3
            ? normalized
            : `customer.${normalized || 'user'}`;
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

    async provisionPortalUser(
        customerId: string,
        dto: CreateCustomerPortalUserDto,
        createdBy: string,
    ) {
        const email = dto.email.trim().toLowerCase();
        const fullName = dto.full_name.trim();
        const requestedUsername = dto.username?.trim() || null;
        const generatedPassword = this.generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(generatedPassword, 10);

        try {
            return await this.prisma.$transaction(async (transaction) => {
                const customer = await transaction.customers.findUnique({
                    where: { id: customerId },
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        status: true,
                    },
                });

                if (!customer) {
                    throw new NotFoundException('Không tìm thấy khách hàng');
                }
                if (!this.isActive(customer.status)) {
                    throw new BadRequestException('Khách hàng đang ngừng hoạt động; không thể cấp tài khoản Portal mới');
                }

                const existingUser = await transaction.users.findUnique({
                    where: { email },
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        full_name: true,
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
                });

                if (existingUser) {
                    if (!this.isActive(existingUser.status)) {
                        throw new ConflictException('Email đã thuộc một tài khoản đang bị khóa/ngừng hoạt động');
                    }
                    if (!this.customerRoleOnly(existingUser.user_roles)) {
                        throw new ConflictException('Email đã thuộc tài khoản nội bộ hoặc tài khoản có vai trò không phù hợp với Portal khách hàng');
                    }

                    const where = this.customerUserAccessKey(customerId, existingUser.id);
                    const existingMapping = await transaction.customer_user_access.findUnique({
                        where,
                        select: CUSTOMER_USER_ACCESS_SELECT,
                    });

                    const mapping = existingMapping && this.isActive(existingMapping.status)
                        ? existingMapping
                        : await transaction.customer_user_access.upsert({
                            where,
                            create: {
                                customer_id: customerId,
                                user_id: existingUser.id,
                                status: 'active',
                                created_by: createdBy,
                            },
                            update: {
                                status: 'active',
                            },
                            select: CUSTOMER_USER_ACCESS_SELECT,
                        });

                    if (!existingMapping || !this.isActive(existingMapping.status)) {
                        await transaction.customer_user_access_history.create({
                            data: {
                                customer_user_access_id: mapping.id,
                                customer_id: customerId,
                                user_id: existingUser.id,
                                action: existingMapping ? 'REACTIVATED' : 'ASSIGNED',
                                source_type: 'ADMIN_DIRECT',
                                changed_by: createdBy,
                                note: 'Tài khoản Portal được liên kết trực tiếp từ hồ sơ khách hàng.',
                            },
                        });
                    }

                    await transaction.audit_logs.create({
                        data: {
                            user_id: createdBy,
                            action: 'CUSTOMER_PORTAL_ACCESS_LINKED',
                            entity_type: 'customer_user_access',
                            entity_id: mapping.id,
                            details_json: JSON.stringify({
                                customer_id: customerId,
                                user_id: existingUser.id,
                                email,
                                created_new_user: false,
                            }),
                        },
                    });

                    return {
                        created_new_user: false,
                        customer: {
                            id: customer.id,
                            customer_code: customer.customer_code,
                            company_name: customer.company_name,
                        },
                        user: {
                            id: existingUser.id,
                            username: existingUser.username,
                            email: existingUser.email,
                            full_name: existingUser.full_name,
                            status: existingUser.status,
                        },
                        access: mapping,
                        temporary_password: null,
                        note: existingMapping && this.isActive(existingMapping.status)
                            ? 'Tài khoản đã có quyền truy cập khách hàng này.'
                            : 'Đã liên kết tài khoản CUSTOMER hiện có với khách hàng.',
                    };
                }

                let username = requestedUsername || this.normalizePortalUsernameBase(email);
                if (requestedUsername) {
                    const duplicateUsername = await transaction.users.findUnique({
                        where: { username },
                        select: { id: true },
                    });
                    if (duplicateUsername) {
                        throw new ConflictException('Tên đăng nhập đã được sử dụng');
                    }
                } else {
                    const base = username;
                    let counter = 1;
                    while (await transaction.users.findUnique({
                        where: { username },
                        select: { id: true },
                    })) {
                        const suffix = `.${counter}`;
                        username = `${base.slice(0, Math.max(3, 50 - suffix.length))}${suffix}`;
                        counter += 1;
                        if (counter > 999) {
                            throw new ConflictException('Không thể tự tạo tên đăng nhập duy nhất; vui lòng nhập tên đăng nhập thủ công');
                        }
                    }
                }

                const customerRole = await transaction.roles.findFirst({
                    where: { role_name: 'CUSTOMER' },
                    select: { id: true },
                });
                if (!customerRole) {
                    throw new BadRequestException('Hệ thống chưa có vai trò CUSTOMER');
                }

                const user = await transaction.users.create({
                    data: {
                        username,
                        email,
                        password_hash: passwordHash,
                        full_name: fullName,
                        status: 'active',
                    },
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        full_name: true,
                        status: true,
                    },
                });

                await transaction.user_roles.create({
                    data: {
                        user_id: user.id,
                        role_id: customerRole.id,
                    },
                });

                const mapping = await transaction.customer_user_access.create({
                    data: {
                        customer_id: customerId,
                        user_id: user.id,
                        status: 'active',
                        created_by: createdBy,
                    },
                    select: CUSTOMER_USER_ACCESS_SELECT,
                });

                await transaction.customer_user_access_history.create({
                    data: {
                        customer_user_access_id: mapping.id,
                        customer_id: customerId,
                        user_id: user.id,
                        action: 'ASSIGNED',
                        source_type: 'ADMIN_DIRECT',
                        changed_by: createdBy,
                        note: 'Tài khoản CUSTOMER được tạo trực tiếp từ hồ sơ khách hàng.',
                    },
                });

                await transaction.audit_logs.create({
                    data: {
                        user_id: createdBy,
                        action: 'CUSTOMER_PORTAL_USER_PROVISIONED',
                        entity_type: 'user',
                        entity_id: user.id,
                        details_json: JSON.stringify({
                            customer_id: customerId,
                            user_id: user.id,
                            username: user.username,
                            email: user.email,
                            created_new_user: true,
                        }),
                    },
                });

                return {
                    created_new_user: true,
                    customer: {
                        id: customer.id,
                        customer_code: customer.customer_code,
                        company_name: customer.company_name,
                    },
                    user,
                    access: mapping,
                    temporary_password: generatedPassword,
                    note: 'Mật khẩu ban đầu chỉ được trả về ở phản hồi này. Hãy sao chép và gửi cho khách hàng qua kênh phù hợp.',
                };
            });
        } catch (error) {
            if (this.hasErrorCode(error, 'P2002')) {
                throw new ConflictException('Email hoặc tên đăng nhập đã được sử dụng');
            }
            throw error;
        }
    }

    async resetPortalUserPassword(
        customerId: string,
        userId: string,
        changedBy: string,
    ) {
        const temporaryPassword = this.generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);

        return this.prisma.$transaction(async (transaction) => {
            const mapping = await transaction.customer_user_access.findUnique({
                where: this.customerUserAccessKey(customerId, userId),
                select: {
                    id: true,
                    status: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            full_name: true,
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
                    },
                },
            });

            if (!mapping) {
                throw new NotFoundException('Tài khoản Portal chưa được liên kết với khách hàng này');
            }
            if (!this.customerRoleOnly(mapping.user.user_roles)) {
                throw new BadRequestException('Tài khoản mục tiêu không phải tài khoản CUSTOMER thuần');
            }
            if (!this.isActive(mapping.user.status)) {
                throw new BadRequestException('Tài khoản đang bị khóa/ngừng hoạt động');
            }

            await transaction.users.update({
                where: { id: userId },
                data: {
                    password_hash: passwordHash,
                    failed_login_count: 0,
                    locked_until: null,
                },
            });

            await transaction.audit_logs.create({
                data: {
                    user_id: changedBy,
                    action: 'CUSTOMER_PORTAL_PASSWORD_RESET',
                    entity_type: 'user',
                    entity_id: userId,
                    details_json: JSON.stringify({
                        customer_id: customerId,
                        user_id: userId,
                        username: mapping.user.username,
                        email: mapping.user.email,
                    }),
                },
            });

            return {
                user: {
                    id: mapping.user.id,
                    username: mapping.user.username,
                    email: mapping.user.email,
                    full_name: mapping.user.full_name,
                    status: mapping.user.status,
                },
                temporary_password: temporaryPassword,
                note: 'Mật khẩu mới chỉ được trả về một lần.',
            };
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
                    const [customer, targetUser] = await Promise.all([
                        transaction.customers.findUnique({
                            where: { id: customerId },
                            select: { id: true, status: true },
                        }),
                        transaction.users.findUnique({
                            where: { id: userId },
                            select: {
                                id: true,
                                status: true,
                                user_roles: {
                                    select: {
                                        roles: { select: { role_name: true } },
                                    },
                                },
                            },
                        }),
                    ]);

                    if (!customer) throw new NotFoundException('Customer not found');
                    if (!this.isActive(customer.status)) {
                        throw new BadRequestException('Customer is not active');
                    }
                    if (!targetUser) throw new NotFoundException('Target user not found');
                    if (!this.isActive(targetUser.status)) {
                        throw new BadRequestException('Target user is not active');
                    }

                    const hasCustomerRole = targetUser.user_roles.some(
                        ({ roles }) => roles.role_name.trim().toUpperCase() === 'CUSTOMER',
                    );
                    if (!hasCustomerRole) {
                        throw new BadRequestException('Target user must have the CUSTOMER role');
                    }

                    const where = this.customerUserAccessKey(customerId, userId);
                    const existing = await transaction.customer_user_access.findUnique({
                        where,
                        select: CUSTOMER_USER_ACCESS_SELECT,
                    });
                    if (existing && this.isActive(existing.status)) return existing;

                    const mapping = await transaction.customer_user_access.upsert({
                        where,
                        create: {
                            customer_id: customerId,
                            user_id: userId,
                            status: 'active',
                            created_by: createdBy,
                        },
                        update: { status: 'active' },
                        select: CUSTOMER_USER_ACCESS_SELECT,
                    });
                    await transaction.customer_user_access_history.create({
                        data: {
                            customer_user_access_id: mapping.id,
                            customer_id: customerId,
                            user_id: userId,
                            action: existing ? 'REACTIVATED' : 'ASSIGNED',
                            source_type: 'ADMIN_DIRECT',
                            changed_by: createdBy,
                        },
                    });
                    return mapping;
                },
            );
        } catch (error) {
            if (!this.hasErrorCode(error, 'P2002')) throw error;

            const concurrentMapping = await this.prisma.customer_user_access.findUnique({
                where: this.customerUserAccessKey(customerId, userId),
                select: CUSTOMER_USER_ACCESS_SELECT,
            });
            if (concurrentMapping && this.isActive(concurrentMapping.status)) {
                return concurrentMapping;
            }
            throw error;
        }
    }

    async revokeUserAccess(
        customerId: string,
        userId: string,
        changedBy?: string,
    ) {
        return this.prisma.$transaction(
            async (transaction) => {
                const customer = await transaction.customers.findUnique({
                    where: { id: customerId },
                    select: { id: true },
                });
                if (!customer) throw new NotFoundException('Customer not found');

                const where = this.customerUserAccessKey(customerId, userId);
                const existing = await transaction.customer_user_access.findUnique({
                    where,
                    select: CUSTOMER_USER_ACCESS_SELECT,
                });
                if (!existing) {
                    throw new NotFoundException('Customer user access mapping not found');
                }
                if (existing.status.trim().toLowerCase() === 'revoked') return existing;

                const activeCount = await transaction.customer_user_access.count({
                    where: { customer_id: customerId, status: 'active' },
                });
                if (activeCount <= 1) {
                    throw new BadRequestException('Cannot revoke the last active customer portal user');
                }

                const mapping = await transaction.customer_user_access.update({
                    where,
                    data: { status: 'revoked' },
                    select: CUSTOMER_USER_ACCESS_SELECT,
                });
                await transaction.customer_user_access_history.create({
                    data: {
                        customer_user_access_id: mapping.id,
                        customer_id: customerId,
                        user_id: userId,
                        action: 'REVOKED',
                        source_type: 'ADMIN_DIRECT',
                        changed_by: changedBy ?? null,
                    },
                });
                return mapping;
            },
        );
    }

}
