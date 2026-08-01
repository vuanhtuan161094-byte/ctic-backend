import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationReviewDto } from './dto/create-application-review.dto';

@Injectable()
export class ApplicationReviewsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Lấy danh sách kết quả xem xét
    async findAll() {
        return this.prisma.application_reviews.findMany({
            include: {
                certification_applications: {
                    select: {
                        id: true,
                        application_code: true,
                        standard_name: true,
                        status: true,
                        customers: {
                            select: {
                                company_name: true,
                            },
                        },
                    },
                },
                users: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    // Tạo kết quả xem xét hồ sơ
    async create(dto: CreateApplicationReviewDto) {
        const application =
            await this.prisma.certification_applications.findUnique({
                where: {
                    id: dto.application_id,
                },
            });

        if (!application) {
            throw new NotFoundException(
                'Không tìm thấy hồ sơ đăng ký chứng nhận',
            );
        }

        const allowedResults = [
            'ACCEPTED',
            'REJECTED',
            'NEED_MORE_INFO',
        ];

        const normalizedResult = dto.result
            .trim()
            .toUpperCase();

        if (!allowedResults.includes(normalizedResult)) {
            throw new BadRequestException(
                'Kết quả xem xét không hợp lệ',
            );
        }

        const applicationStatus: Record<string, string> = {
            ACCEPTED: 'accepted',
            REJECTED: 'rejected',
            NEED_MORE_INFO: 'need_more_info',
        };

        // Tạo kết quả xem xét và cập nhật trạng thái hồ sơ cùng lúc
        return this.prisma.$transaction(async (tx) => {
            const review =
                await tx.application_reviews.create({
                    data: {
                        application_id:
                            dto.application_id,

                        reviewer_id:
                            dto.reviewer_id,

                        review_date:
                            dto.review_date
                                ? new Date(
                                    dto.review_date,
                                )
                                : new Date(),

                        result:
                            normalizedResult,

                        comment:
                            dto.comment,
                    },

                    include: {
                        certification_applications: {
                            select: {
                                application_code: true,
                                standard_name: true,
                            },
                        },
                    },
                });

            await tx.certification_applications.update({
                where: {
                    id: dto.application_id,
                },
                data: {
                    status:
                        applicationStatus[
                        normalizedResult
                        ],
                },
            });

            return review;
        });
    }
}