import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationProjectScopeDto } from './dto/create-certification-project-scope.dto';

type ReviewIndustryScope = {
    isic_nace_mapping_id: string;
    nace_iaf_mapping_id: string;
    management_system: string;
    scope_description: string;
    is_primary?: boolean;
};

@Injectable()
export class CertificationProjectScopesService {
    private readonly detailInclude = {
        project: {
            select: {
                id:
                    true,

                project_code:
                    true,

                standard_name:
                    true,

                status:
                    true,
            },
        },

        isic_nace_mapping: {
            include: {
                source_code:
                    true,

                target_code:
                    true,

                approved_by_user: {
                    select: {
                        id:
                            true,

                        username:
                            true,

                        full_name:
                            true,
                    },
                },
            },
        },

        nace_iaf_mapping: {
            include: {
                nace_code:
                    true,

                iaf_scope:
                    true,

                approved_by_user: {
                    select: {
                        id:
                            true,

                        username:
                            true,

                        full_name:
                            true,
                    },
                },
            },
        },

        selected_by_user: {
            select: {
                id:
                    true,

                username:
                    true,

                full_name:
                    true,
            },
        },

        approved_by_user: {
            select: {
                id:
                    true,

                username:
                    true,

                full_name:
                    true,
            },
        },
    } as const;

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private normalize(
        value?: string | null,
    ): string {
        return value
            ?.trim()
            .toUpperCase() ?? '';
    }


    private standardFromManagementSystem(
        managementSystem: string,
    ): string {
        const normalized = this.normalize(
            managementSystem,
        );

        if (normalized === 'QMS') {
            return 'ISO 9001:2015';
        }

        if (normalized === 'EMS') {
            return 'ISO 14001:2015';
        }

        if (
            normalized === 'OHSMS' ||
            normalized === 'OH&SMS'
        ) {
            return 'ISO 45001:2018';
        }

        return normalized;
    }

    private parseReviewIndustryScopes(
        rawValue?: string | null,
    ): ReviewIndustryScope[] {
        if (!rawValue?.trim()) {
            return [];
        }

        try {
            const parsed = JSON.parse(
                rawValue,
            ) as unknown;

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.filter(
                (
                    item,
                ): item is ReviewIndustryScope => {
                    if (
                        !item ||
                        typeof item !== 'object'
                    ) {
                        return false;
                    }

                    const value = item as Record<string, unknown>;

                    return (
                        typeof value.isic_nace_mapping_id === 'string' &&
                        typeof value.nace_iaf_mapping_id === 'string' &&
                        typeof value.management_system === 'string' &&
                        typeof value.scope_description === 'string'
                    );
                },
            );
        } catch {
            throw new BadRequestException(
                'Dữ liệu phạm vi ngành trong bản xem xét bị lỗi định dạng. Hãy mở lại bước xem xét đơn và lưu lại mã ISIC/NACE/IAF.',
            );
        }
    }

    private resolveManagementSystem(
        standardName: string,
    ): string {
        const standard =
            this.normalize(
                standardName,
            );

        if (
            standard.includes(
                'ISO 9001',
            )
        ) {
            return 'QMS';
        }

        if (
            standard.includes(
                'ISO 14001',
            )
        ) {
            return 'EMS';
        }

        if (
            standard.includes(
                'ISO 45001',
            )
        ) {
            return 'OHSMS';
        }

        if (
            standard.includes(
                'ISO 27001',
            )
        ) {
            return 'ISMS';
        }

        if (
            standard.includes(
                'ISO 50001',
            )
        ) {
            return 'ENERGY';
        }

        throw new BadRequestException(
            `Chưa cấu hình hệ thống quản lý cho tiêu chuẩn ${standardName}`,
        );
    }

    private async getProjectOrThrow(
        id: string,
    ) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id,
                },

                include: {
                    certification_applications: {
                        select: {
                            standard_name:
                                true,

                            certification_scope:
                                true,
                        },
                    },
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        return project;
    }

    private async getScopeOrThrow(
        id: string,
    ) {
        const scope =
            await this.prisma.certification_project_scopes.findUnique({
                where: {
                    id,
                },

                include:
                    this.detailInclude,
            });

        if (!scope) {
            throw new NotFoundException(
                'Không tìm thấy phạm vi ngành của dự án',
            );
        }

        return scope;
    }

    async create(
        dto: CreateCertificationProjectScopeDto,
        userId: string,
    ) {
        const project =
            await this.getProjectOrThrow(
                dto.project_id,
            );

        const [
            isicNaceMapping,
            naceIafMapping,
        ] =
            await Promise.all([
                this.prisma.industry_code_mappings.findUnique({
                    where: {
                        id:
                            dto.isic_nace_mapping_id,
                    },

                    include: {
                        source_code:
                            true,

                        target_code:
                            true,
                    },
                }),

                this.prisma.nace_iaf_mappings.findUnique({
                    where: {
                        id:
                            dto.nace_iaf_mapping_id,
                    },

                    include: {
                        nace_code:
                            true,

                        iaf_scope:
                            true,
                    },
                }),
            ]);

        if (!isicNaceMapping) {
            throw new NotFoundException(
                'Không tìm thấy ánh xạ ISIC - NACE',
            );
        }

        if (!naceIafMapping) {
            throw new NotFoundException(
                'Không tìm thấy ánh xạ NACE - IAF',
            );
        }

        if (
            this.normalize(
                isicNaceMapping.mapping_status,
            ) !==
            'APPROVED'
        ) {
            throw new BadRequestException(
                'Ánh xạ ISIC - NACE chưa được phê duyệt',
            );
        }

        if (
            this.normalize(
                naceIafMapping.mapping_status,
            ) !==
            'APPROVED'
        ) {
            throw new BadRequestException(
                'Ánh xạ NACE - IAF chưa được phê duyệt',
            );
        }

        if (
            this.normalize(
                isicNaceMapping.source_code
                    .classification_type,
            ) !==
            'ISIC' ||
            this.normalize(
                isicNaceMapping.target_code
                    .classification_type,
            ) !==
            'NACE'
        ) {
            throw new BadRequestException(
                'Ánh xạ được chọn không phải ISIC - NACE',
            );
        }

        if (
            isicNaceMapping.target_code_id !==
            naceIafMapping.nace_code_id
        ) {
            throw new BadRequestException(
                'Mã NACE của hai bảng ánh xạ không khớp nhau',
            );
        }

        if (
            !isicNaceMapping.source_code
                .is_active ||
            !isicNaceMapping.target_code
                .is_active ||
            !naceIafMapping.nace_code
                .is_active ||
            !naceIafMapping.iaf_scope
                .is_active
        ) {
            throw new BadRequestException(
                'Có mã ngành hoặc phạm vi IAF đã ngừng hiệu lực',
            );
        }

        const standardCode =
            this.normalize(
                project.standard_name ??
                project
                    .certification_applications
                    .standard_name,
            );

        const managementSystem =
            this.resolveManagementSystem(
                standardCode,
            );

        if (
            this.normalize(
                naceIafMapping.management_system,
            ) !==
            managementSystem
        ) {
            throw new BadRequestException(
                `Ánh xạ NACE - IAF không áp dụng cho ${managementSystem}`,
            );
        }

        const existing =
            await this.prisma.certification_project_scopes.findFirst({
                where: {
                    project_id:
                        dto.project_id,

                    isic_nace_mapping_id:
                        dto.isic_nace_mapping_id,

                    nace_iaf_mapping_id:
                        dto.nace_iaf_mapping_id,
                },
            });

        if (existing) {
            throw new ConflictException(
                'Phạm vi ngành này đã được gắn vào dự án',
            );
        }

        return this.prisma.certification_project_scopes.create({
            data: {
                project_id:
                    dto.project_id,

                isic_nace_mapping_id:
                    dto.isic_nace_mapping_id,

                nace_iaf_mapping_id:
                    dto.nace_iaf_mapping_id,

                management_system:
                    managementSystem,

                standard_code:
                    standardCode,

                scope_description:
                    dto.scope_description
                        ?.trim() ||
                    project
                        .certification_applications
                        .certification_scope
                        .trim(),

                status:
                    'DRAFT',

                notes:
                    dto.notes
                        ?.trim() ??
                    null,

                selected_by:
                    userId,

                selected_at:
                    new Date(),
            },

            include:
                this.detailInclude,
        });
    }

    async syncFromReview(
        projectId: string,
        userId: string,
    ) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id: projectId,
                },

                select: {
                    id: true,
                    application_id: true,
                    project_code: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        const review =
            await this.prisma.application_reviews.findFirst({
                where: {
                    application_id:
                        project.application_id,

                    industry_scopes_json: {
                        not: null,
                    },
                },

                orderBy: [
                    {
                        approved_at:
                            'desc',
                    },
                    {
                        checked_at:
                            'desc',
                    },
                    {
                        created_at:
                            'desc',
                    },
                ],

                select: {
                    id: true,
                    industry_scopes_json: true,
                    workflow_status: true,
                    result: true,
                },
            });

        if (!review) {
            throw new BadRequestException(
                'Bản xem xét đơn chưa có phạm vi ISIC/NACE/IAF. Hãy hoàn tất bước xem xét ngành nghề trước khi phân công đoàn.',
            );
        }

        const scopes =
            this.parseReviewIndustryScopes(
                review.industry_scopes_json,
            );

        if (!scopes.length) {
            throw new BadRequestException(
                'Bản xem xét đơn không có phạm vi ngành hợp lệ để đồng bộ.',
            );
        }

        const synchronized =
            await this.prisma.$transaction(
                async (
                    transaction,
                ) => {
                    const results: Array<{ id: string }> = [];
                    const synchronizedAt =
                        new Date();

                    for (
                        const scope of scopes
                    ) {
                        const [
                            isicNaceMapping,
                            naceIafMapping,
                        ] = await Promise.all([
                            transaction.industry_code_mappings.findUnique({
                                where: {
                                    id: scope.isic_nace_mapping_id,
                                },
                            }),
                            transaction.nace_iaf_mappings.findUnique({
                                where: {
                                    id: scope.nace_iaf_mapping_id,
                                },
                            }),
                        ]);

                        if (
                            !isicNaceMapping ||
                            this.normalize(
                                isicNaceMapping.mapping_status,
                            ) !== 'APPROVED'
                        ) {
                            throw new BadRequestException(
                                'Có ánh xạ ISIC-NACE trong bản xem xét chưa được phê duyệt hoặc đã bị xóa.',
                            );
                        }

                        if (
                            !naceIafMapping ||
                            this.normalize(
                                naceIafMapping.mapping_status,
                            ) !== 'APPROVED'
                        ) {
                            throw new BadRequestException(
                                'Có ánh xạ NACE-IAF trong bản xem xét chưa được phê duyệt hoặc đã bị xóa.',
                            );
                        }

                        const existing =
                            await transaction.certification_project_scopes.findFirst({
                                where: {
                                    project_id:
                                        projectId,
                                    isic_nace_mapping_id:
                                        scope.isic_nace_mapping_id,
                                    nace_iaf_mapping_id:
                                        scope.nace_iaf_mapping_id,
                                },
                            });

                        const data = {
                            management_system:
                                this.normalize(
                                    scope.management_system,
                                ),
                            standard_code:
                                this.standardFromManagementSystem(
                                    scope.management_system,
                                ),
                            scope_description:
                                scope.scope_description.trim(),
                            status:
                                'APPROVED',
                            notes:
                                `Đồng bộ từ bản xem xét đơn ${review.id}`,
                            selected_by:
                                userId,
                            selected_at:
                                synchronizedAt,
                            approved_by:
                                userId,
                            approved_at:
                                synchronizedAt,
                        } as const;

                        if (existing) {
                            results.push(
                                await transaction.certification_project_scopes.update({
                                    where: {
                                        id: existing.id,
                                    },
                                    data,
                                }),
                            );
                        } else {
                            results.push(
                                await transaction.certification_project_scopes.create({
                                    data: {
                                        project_id:
                                            projectId,
                                        isic_nace_mapping_id:
                                            scope.isic_nace_mapping_id,
                                        nace_iaf_mapping_id:
                                            scope.nace_iaf_mapping_id,
                                        ...data,
                                    },
                                }),
                            );
                        }
                    }

                    return results;
                },
            );

        return {
            project_id:
                projectId,
            project_code:
                project.project_code,
            synchronized_count:
                synchronized.length,
            review_id:
                review.id,
            scopes:
                await this.findByProject(
                    projectId,
                    'APPROVED',
                ),
        };
    }

    async findByProject(
        projectId: string,
        status?: string,
    ) {
        await this.getProjectOrThrow(
            projectId,
        );

        return this.prisma.certification_project_scopes.findMany({
            where: {
                project_id:
                    projectId,

                ...(status
                    ? {
                        status:
                            this.normalize(
                                status,
                            ),
                    }
                    : {}),
            },

            orderBy: [
                {
                    status:
                        'asc',
                },
                {
                    created_at:
                        'asc',
                },
            ],

            include:
                this.detailInclude,
        });
    }

    async findOne(
        id: string,
    ) {
        return this.getScopeOrThrow(
            id,
        );
    }

    async approve(
        id: string,
        userId: string,
    ) {
        const scope =
            await this.getScopeOrThrow(
                id,
            );

        if (
            scope.status ===
            'APPROVED'
        ) {
            return scope;
        }

        if (
            scope.status !==
            'DRAFT'
        ) {
            throw new BadRequestException(
                'Chỉ được phê duyệt phạm vi ở trạng thái DRAFT',
            );
        }

        return this.prisma.certification_project_scopes.update({
            where: {
                id,
            },

            data: {
                status:
                    'APPROVED',

                approved_by:
                    userId,

                approved_at:
                    new Date(),
            },

            include:
                this.detailInclude,
        });
    }
}