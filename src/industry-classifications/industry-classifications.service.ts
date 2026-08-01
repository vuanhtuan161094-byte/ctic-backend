import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
    CreateIafScopeDto,
    CreateIndustryClassificationDto,
    CreateIndustryCodeMappingDto,
    CreateNaceIafMappingDto,
} from './dto/industry-classification.dto';

@Injectable()
export class IndustryClassificationsService {
    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private normalize(
        value: string,
    ) {
        return value
            .trim()
            .toUpperCase();
    }

    private parseDate(
        value?: string,
    ) {
        if (!value) {
            return null;
        }

        const match =
            value.match(
                /^(\d{4})-(\d{2})-(\d{2})/,
            );

        if (!match) {
            throw new BadRequestException(
                'Ngày hiệu lực không hợp lệ',
            );
        }

        const year =
            Number(match[1]);

        const month =
            Number(match[2]);

        const day =
            Number(match[3]);

        const date =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day,
                ),
            );

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            throw new BadRequestException(
                'Ngày hiệu lực không hợp lệ',
            );
        }

        return date;
    }

    private validatePeriod(
        validFrom: Date | null,
        validTo: Date | null,
    ) {
        if (
            validFrom &&
            validTo &&
            validTo < validFrom
        ) {
            throw new BadRequestException(
                'Ngày kết thúc hiệu lực phải bằng hoặc sau ngày bắt đầu',
            );
        }
    }

    private isCurrentlyValid(
        validFrom:
            Date | null,
        validTo:
            Date | null,
    ) {
        const today =
            new Date();

        today.setUTCHours(
            0,
            0,
            0,
            0,
        );

        if (
            validFrom &&
            validFrom > today
        ) {
            return false;
        }

        if (
            validTo &&
            validTo < today
        ) {
            return false;
        }

        return true;
    }

    private async getClassificationOrThrow(
        id: string,
    ) {
        const code =
            await this.prisma.industry_classifications.findUnique({
                where: {
                    id,
                },
            });

        if (!code) {
            throw new NotFoundException(
                'Không tìm thấy mã phân loại ngành',
            );
        }

        return code;
    }

    async createClassification(
        dto:
            CreateIndustryClassificationDto,
    ) {
        const classificationType =
            this.normalize(
                dto.classification_type,
            );

        const revision =
            this.normalize(
                dto.revision,
            );

        const code =
            dto.code.trim();

        const existing =
            await this.prisma.industry_classifications.findFirst({
                where: {
                    classification_type:
                        classificationType,

                    revision,

                    code,
                },
            });

        if (existing) {
            throw new ConflictException(
                'Mã phân loại đã tồn tại trong phiên bản này',
            );
        }

        const validFrom =
            this.parseDate(
                dto.valid_from,
            );

        const validTo =
            this.parseDate(
                dto.valid_to,
            );

        this.validatePeriod(
            validFrom,
            validTo,
        );

        return this.prisma.industry_classifications.create({
            data: {
                classification_type:
                    classificationType,

                revision,

                code,

                title_en:
                    dto.title_en.trim(),

                title_vi:
                    dto.title_vi
                        ?.trim() ??
                    null,

                parent_code:
                    dto.parent_code
                        ?.trim() ??
                    null,

                level:
                    dto.level,

                valid_from:
                    validFrom,

                valid_to:
                    validTo,

                is_active:
                    dto.is_active ??
                    true,
            },
        });
    }

    async findClassifications(
        classificationType?: string,
        revision?: string,
        search?: string,
        active?: string,
    ) {
        const activeFilter =
            active === undefined
                ? undefined
                : active
                    .trim()
                    .toLowerCase() ===
                'true';

        const safeSearch =
            search?.trim();

        return this.prisma.industry_classifications.findMany({
            where: {
                ...(classificationType
                    ? {
                        classification_type:
                            this.normalize(
                                classificationType,
                            ),
                    }
                    : {}),

                ...(revision
                    ? {
                        revision:
                            this.normalize(
                                revision,
                            ),
                    }
                    : {}),

                ...(activeFilter !== undefined
                    ? {
                        is_active:
                            activeFilter,
                    }
                    : {}),

                ...(safeSearch
                    ? {
                        OR: [
                            {
                                code: {
                                    contains:
                                        safeSearch,
                                },
                            },
                            {
                                title_en: {
                                    contains:
                                        safeSearch,
                                },
                            },
                            {
                                title_vi: {
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
                    classification_type:
                        'asc',
                },
                {
                    revision:
                        'asc',
                },
                {
                    code:
                        'asc',
                },
            ],
        });
    }

    async createIndustryMapping(
        dto:
            CreateIndustryCodeMappingDto,
    ) {
        const source =
            await this.getClassificationOrThrow(
                dto.source_code_id,
            );

        const target =
            await this.getClassificationOrThrow(
                dto.target_code_id,
            );

        if (
            source.classification_type !==
            'ISIC'
        ) {
            throw new BadRequestException(
                'Mã nguồn phải là mã ISIC',
            );
        }

        if (
            target.classification_type !==
            'NACE'
        ) {
            throw new BadRequestException(
                'Mã đích phải là mã NACE',
            );
        }

        const existing =
            await this.prisma.industry_code_mappings.findFirst({
                where: {
                    source_code_id:
                        source.id,

                    target_code_id:
                        target.id,
                },
            });

        if (existing) {
            throw new ConflictException(
                'Quan hệ ISIC - NACE đã tồn tại',
            );
        }

        const validFrom =
            this.parseDate(
                dto.valid_from,
            );

        const validTo =
            this.parseDate(
                dto.valid_to,
            );

        this.validatePeriod(
            validFrom,
            validTo,
        );

        return this.prisma.industry_code_mappings.create({
            data: {
                source_code_id:
                    source.id,

                target_code_id:
                    target.id,

                mapping_type:
                    this.normalize(
                        dto.mapping_type,
                    ),

                mapping_status:
                    'DRAFT',

                note:
                    dto.note
                        ?.trim() ??
                    null,

                valid_from:
                    validFrom,

                valid_to:
                    validTo,
            },

            include: {
                source_code:
                    true,

                target_code:
                    true,
            },
        });
    }

    async approveIndustryMapping(
        id: string,
        userId: string,
    ) {
        const mapping =
            await this.prisma.industry_code_mappings.findUnique({
                where: {
                    id,
                },
            });

        if (!mapping) {
            throw new NotFoundException(
                'Không tìm thấy quan hệ ISIC - NACE',
            );
        }

        return this.prisma.industry_code_mappings.update({
            where: {
                id,
            },

            data: {
                mapping_status:
                    'APPROVED',

                approved_by:
                    userId,

                approved_at:
                    new Date(),
            },

            include: {
                source_code:
                    true,

                target_code:
                    true,

                approved_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                    },
                },
            },
        });
    }

    async findIndustryMappings(
        sourceCodeId?: string,
        targetCodeId?: string,
        status?: string,
    ) {
        return this.prisma.industry_code_mappings.findMany({
            where: {
                ...(sourceCodeId
                    ? {
                        source_code_id:
                            sourceCodeId,
                    }
                    : {}),

                ...(targetCodeId
                    ? {
                        target_code_id:
                            targetCodeId,
                    }
                    : {}),

                ...(status
                    ? {
                        mapping_status:
                            this.normalize(
                                status,
                            ),
                    }
                    : {}),
            },

            orderBy: {
                created_at:
                    'desc',
            },

            include: {
                source_code:
                    true,

                target_code:
                    true,

                approved_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                    },
                },
            },
        });
    }

    async createIafScope(
        dto: CreateIafScopeDto,
    ) {
        const iafCode =
            dto.iaf_code.trim();

        const existing =
            await this.prisma.iaf_scopes.findUnique({
                where: {
                    iaf_code:
                        iafCode,
                },
            });

        if (existing) {
            throw new ConflictException(
                'Mã IAF đã tồn tại',
            );
        }

        return this.prisma.iaf_scopes.create({
            data: {
                iaf_code:
                    iafCode,

                iaf_name:
                    dto.iaf_name.trim(),

                description:
                    dto.description
                        ?.trim() ??
                    null,

                is_active:
                    dto.is_active ??
                    true,
            },
        });
    }

    async findIafScopes(
        active?: string,
        search?: string,
    ) {
        const activeFilter =
            active === undefined
                ? undefined
                : active
                    .trim()
                    .toLowerCase() ===
                'true';

        return this.prisma.iaf_scopes.findMany({
            where: {
                ...(activeFilter !== undefined
                    ? {
                        is_active:
                            activeFilter,
                    }
                    : {}),

                ...(search?.trim()
                    ? {
                        OR: [
                            {
                                iaf_code: {
                                    contains:
                                        search.trim(),
                                },
                            },
                            {
                                iaf_name: {
                                    contains:
                                        search.trim(),
                                },
                            },
                        ],
                    }
                    : {}),
            },

            orderBy: {
                iaf_code:
                    'asc',
            },
        });
    }

    async createNaceIafMapping(
        dto:
            CreateNaceIafMappingDto,
    ) {
        const naceCode =
            await this.getClassificationOrThrow(
                dto.nace_code_id,
            );

        if (
            naceCode.classification_type !==
            'NACE'
        ) {
            throw new BadRequestException(
                'Mã được chọn không phải mã NACE',
            );
        }

        const iafScope =
            await this.prisma.iaf_scopes.findUnique({
                where: {
                    id:
                        dto.iaf_scope_id,
                },
            });

        if (!iafScope) {
            throw new NotFoundException(
                'Không tìm thấy mã IAF',
            );
        }

        const managementSystem =
            this.normalize(
                dto.management_system,
            );

        const existing =
            await this.prisma.nace_iaf_mappings.findFirst({
                where: {
                    nace_code_id:
                        naceCode.id,

                    iaf_scope_id:
                        iafScope.id,

                    management_system:
                        managementSystem,
                },
            });

        if (existing) {
            throw new ConflictException(
                'Quan hệ NACE - IAF đã tồn tại cho hệ thống quản lý này',
            );
        }

        const validFrom =
            this.parseDate(
                dto.valid_from,
            );

        const validTo =
            this.parseDate(
                dto.valid_to,
            );

        this.validatePeriod(
            validFrom,
            validTo,
        );

        return this.prisma.nace_iaf_mappings.create({
            data: {
                nace_code_id:
                    naceCode.id,

                iaf_scope_id:
                    iafScope.id,

                management_system:
                    managementSystem,

                mapping_status:
                    'DRAFT',

                source_document:
                    dto.source_document
                        ?.trim() ??
                    null,

                note:
                    dto.note
                        ?.trim() ??
                    null,

                valid_from:
                    validFrom,

                valid_to:
                    validTo,
            },

            include: {
                nace_code:
                    true,

                iaf_scope:
                    true,
            },
        });
    }

    async approveNaceIafMapping(
        id: string,
        userId: string,
    ) {
        const mapping =
            await this.prisma.nace_iaf_mappings.findUnique({
                where: {
                    id,
                },
            });

        if (!mapping) {
            throw new NotFoundException(
                'Không tìm thấy quan hệ NACE - IAF',
            );
        }

        return this.prisma.nace_iaf_mappings.update({
            where: {
                id,
            },

            data: {
                mapping_status:
                    'APPROVED',

                approved_by:
                    userId,

                approved_at:
                    new Date(),
            },

            include: {
                nace_code:
                    true,

                iaf_scope:
                    true,

                approved_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                    },
                },
            },
        });
    }

    async findNaceIafMappings(
        naceCodeId?: string,
        iafScopeId?: string,
        managementSystem?: string,
        status?: string,
    ) {
        return this.prisma.nace_iaf_mappings.findMany({
            where: {
                ...(naceCodeId
                    ? {
                        nace_code_id:
                            naceCodeId,
                    }
                    : {}),

                ...(iafScopeId
                    ? {
                        iaf_scope_id:
                            iafScopeId,
                    }
                    : {}),

                ...(managementSystem
                    ? {
                        management_system:
                            this.normalize(
                                managementSystem,
                            ),
                    }
                    : {}),

                ...(status
                    ? {
                        mapping_status:
                            this.normalize(
                                status,
                            ),
                    }
                    : {}),
            },

            orderBy: {
                created_at:
                    'desc',
            },

            include: {
                nace_code:
                    true,

                iaf_scope:
                    true,

                approved_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                    },
                },
            },
        });
    }

    private async getApprovedIafMappings(
        naceCodeId: string,
        managementSystem: string,
    ) {
        const mappings =
            await this.prisma.nace_iaf_mappings.findMany({
                where: {
                    nace_code_id:
                        naceCodeId,

                    management_system:
                        managementSystem,

                    mapping_status:
                        'APPROVED',
                },

                include: {
                    iaf_scope:
                        true,
                },
            });

        return mappings
            .filter(
                (mapping) =>
                    mapping.iaf_scope
                        .is_active &&
                    this.isCurrentlyValid(
                        mapping.valid_from,
                        mapping.valid_to,
                    ),
            )
            .map(
                (mapping) => ({
                    mapping_id:
                        mapping.id,

                    iaf_code:
                        mapping.iaf_scope
                            .iaf_code,

                    iaf_name:
                        mapping.iaf_scope
                            .iaf_name,

                    source_document:
                        mapping.source_document,
                }),
            );
    }

    async resolve(
        classificationType: string,
        revision: string,
        code: string,
        managementSystem: string,
    ) {
        const safeType =
            this.normalize(
                classificationType,
            );

        const safeRevision =
            this.normalize(
                revision,
            );

        const safeManagementSystem =
            this.normalize(
                managementSystem,
            );

        const source =
            await this.prisma.industry_classifications.findFirst({
                where: {
                    classification_type:
                        safeType,

                    revision:
                        safeRevision,

                    code:
                        code.trim(),

                    is_active:
                        true,
                },
            });

        if (!source) {
            throw new NotFoundException(
                'Không tìm thấy mã ngành',
            );
        }

        if (
            safeType ===
            'NACE'
        ) {
            const iafMappings =
                await this.getApprovedIafMappings(
                    source.id,
                    safeManagementSystem,
                );

            return {
                source,

                management_system:
                    safeManagementSystem,

                nace_candidates: [
                    {
                        nace:
                            source,

                        mapping_type:
                            'DIRECT',

                        iaf_candidates:
                            iafMappings,
                    },
                ],

                review_required:
                    true,
            };
        }

        if (
            safeType !==
            'ISIC'
        ) {
            throw new BadRequestException(
                'Chỉ hỗ trợ tra cứu từ ISIC hoặc NACE',
            );
        }

        const mappings =
            await this.prisma.industry_code_mappings.findMany({
                where: {
                    source_code_id:
                        source.id,

                    mapping_status:
                        'APPROVED',
                },

                include: {
                    target_code:
                        true,
                },
            });

        const activeMappings =
            mappings.filter(
                (mapping) =>
                    mapping.target_code
                        .is_active &&
                    this.isCurrentlyValid(
                        mapping.valid_from,
                        mapping.valid_to,
                    ),
            );

        const naceCandidates =
            await Promise.all(
                activeMappings.map(
                    async (
                        mapping,
                    ) => ({
                        mapping_id:
                            mapping.id,

                        mapping_type:
                            mapping.mapping_type,

                        nace:
                            mapping.target_code,

                        iaf_candidates:
                            await this.getApprovedIafMappings(
                                mapping.target_code_id,
                                safeManagementSystem,
                            ),
                    }),
                ),
            );

        return {
            source,

            management_system:
                safeManagementSystem,

            nace_candidates:
                naceCandidates,

            requires_selection:
                naceCandidates.length !== 1 ||
                naceCandidates[0]
                    ?.mapping_type !==
                'EXACT',

            review_required:
                true,
        };
    }
}