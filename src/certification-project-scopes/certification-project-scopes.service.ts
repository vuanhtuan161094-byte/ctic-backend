import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationProjectScopeDto } from './dto/create-certification-project-scope.dto';

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