import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';

@Injectable()
export class ExpertsService {
    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private normalizeStatus(
        status?: string,
    ) {
        const safeStatus =
            status
                ?.trim()
                .toLowerCase();

        if (
            safeStatus === 'active' ||
            safeStatus === 'inactive'
        ) {
            return safeStatus;
        }

        return undefined;
    }

    async findAll(
        search?: string,
        status?: string,
    ) {
        const safeSearch =
            search?.trim();

        const safeStatus =
            this.normalizeStatus(
                status,
            );

        return this.prisma.experts.findMany({
            where: {
                ...(safeStatus
                    ? {
                        status:
                            safeStatus,
                    }
                    : {}),

                ...(safeSearch
                    ? {
                        OR: [
                            {
                                full_name: {
                                    contains:
                                        safeSearch,
                                },
                            },
                            {
                                email: {
                                    contains:
                                        safeSearch,
                                },
                            },
                            {
                                phone: {
                                    contains:
                                        safeSearch,
                                },
                            },
                        ],
                    }
                    : {}),
            },

            orderBy: [
                {
                    status:
                        'asc',
                },
                {
                    full_name:
                        'asc',
                },
            ],
        });
    }

    async findOne(
        id: string,
    ) {
        const expert =
            await this.prisma.experts.findUnique({
                where: {
                    id,
                },
            });

        if (!expert) {
            throw new NotFoundException(
                'Không tìm thấy chuyên gia',
            );
        }

        return expert;
    }

    async create(
        dto: CreateExpertDto,
    ) {
        const email =
            dto.email
                ?.trim()
                .toLowerCase();

        if (email) {
            const existingEmail =
                await this.prisma.experts.findUnique({
                    where: {
                        email,
                    },
                });

            if (existingEmail) {
                throw new ConflictException(
                    'Email chuyên gia đã tồn tại',
                );
            }
        }

        return this.prisma.experts.create({
            data: {
                full_name:
                    dto.full_name.trim(),

                email:
                    email ?? null,

                phone:
                    dto.phone
                        ?.trim() ??
                    null,

                status:
                    this.normalizeStatus(
                        dto.status,
                    ) ?? 'active',
            },
        });
    }

    async update(
        id: string,
        dto: UpdateExpertDto,
    ) {
        await this.findOne(
            id,
        );

        const email =
            dto.email
                ?.trim()
                .toLowerCase();

        if (email) {
            const existingEmail =
                await this.prisma.experts.findFirst({
                    where: {
                        email,

                        id: {
                            not:
                                id,
                        },
                    },
                });

            if (existingEmail) {
                throw new ConflictException(
                    'Email chuyên gia đã được sử dụng',
                );
            }
        }

        return this.prisma.experts.update({
            where: {
                id,
            },

            data: {
                ...(dto.full_name !== undefined
                    ? {
                        full_name:
                            dto.full_name.trim(),
                    }
                    : {}),

                ...(dto.email !== undefined
                    ? {
                        email:
                            email ?? null,
                    }
                    : {}),

                ...(dto.phone !== undefined
                    ? {
                        phone:
                            dto.phone.trim(),
                    }
                    : {}),

                ...(dto.status !== undefined
                    ? {
                        status:
                            this.normalizeStatus(
                                dto.status,
                            ),
                    }
                    : {}),
            },
        });
    }

    async deactivate(
        id: string,
    ) {
        await this.findOne(
            id,
        );

        const expert =
            await this.prisma.experts.update({
                where: {
                    id,
                },

                data: {
                    status:
                        'inactive',
                },
            });

        return {
            message:
                'Đã ngừng hoạt động chuyên gia',
            expert,
        };
    }
}