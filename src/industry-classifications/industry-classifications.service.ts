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

    async getSummary() {
        const [
            isicTotal,
            isicClasses,
            naceTotal,
            naceClasses,
            iafTotal,
            isicNaceApproved,
            qmsApproved,
            emsApproved,
            ohsmsApproved,
        ] = await Promise.all([
            this.prisma.industry_classifications.count({ where: { classification_type: 'ISIC', revision: 'ISIC_REV_4', is_active: true } }),
            this.prisma.industry_classifications.count({ where: { classification_type: 'ISIC', revision: 'ISIC_REV_4', level: 4, is_active: true } }),
            this.prisma.industry_classifications.count({ where: { classification_type: 'NACE', revision: 'NACE_REV_2', is_active: true } }),
            this.prisma.industry_classifications.count({ where: { classification_type: 'NACE', revision: 'NACE_REV_2', level: 4, is_active: true } }),
            this.prisma.iaf_scopes.count({ where: { is_active: true } }),
            this.prisma.industry_code_mappings.count({ where: { mapping_status: 'APPROVED', source_code: { classification_type: 'ISIC', revision: 'ISIC_REV_4' }, target_code: { classification_type: 'NACE', revision: 'NACE_REV_2' } } }),
            this.prisma.nace_iaf_mappings.count({ where: { management_system: 'QMS', mapping_status: 'APPROVED' } }),
            this.prisma.nace_iaf_mappings.count({ where: { management_system: 'EMS', mapping_status: 'APPROVED' } }),
            this.prisma.nace_iaf_mappings.count({ where: { management_system: 'OHSMS', mapping_status: 'APPROVED' } }),
        ]);

        return {
            chain: ['ISIC_REV_4', 'NACE_REV_2', 'IAF'],
            counts: {
                isic_total: isicTotal,
                isic_classes: isicClasses,
                nace_total: naceTotal,
                nace_classes: naceClasses,
                iaf_total: iafTotal,
                isic_nace_approved: isicNaceApproved,
                nace_iaf_qms_approved: qmsApproved,
                nace_iaf_ems_approved: emsApproved,
                nace_iaf_ohsms_approved: ohsmsApproved,
            },
            sources: [
                { key: 'ISIC_REV_4', label: 'ISIC Rev.4', owner: 'United Nations Statistics Division', purpose: 'Danh mục hoạt động kinh tế dùng làm đầu vào tra cứu của khách hàng.', url: 'https://unstats.un.org/unsd/classifications/Family/Detail/27' },
                { key: 'ISIC4_NACE2', label: 'ISIC Rev.4 → NACE Rev.2', owner: 'United Nations Statistics Division', purpose: 'Bảng quy đổi chính thức giữa ISIC và NACE.', url: 'https://unstats.un.org/unsd/classifications/Econ/tables/ISIC/ISIC4_NACE2/ISIC4_NACE2.txt' },
                { key: 'NACE_REV_2', label: 'NACE Rev.2', owner: 'Eurostat', purpose: 'Danh mục NACE dùng cho ánh xạ phạm vi IAF.', url: 'https://ec.europa.eu/eurostat/web/nace' },
                { key: 'IAF_ID1_2023', label: 'IAF ID 1:2023', owner: 'International Accreditation Forum', purpose: 'Bảng phạm vi QMS/EMS dựa trên NACE Rev.2.', url: 'https://iaf.nu/iaf_system/uploads/documents/IAF_ID1_2023_Issue_3_Version2_13062023.pdf' },
                { key: 'IAF_MD22_2023', label: 'IAF MD 22:2023', owner: 'International Accreditation Forum', purpose: 'Bảng phạm vi OH&SMS dựa trên NACE Rev.2.', url: 'https://iaf.nu/iaf_system/uploads/documents/IAF_MD22_Issue_2_Version2_14062023.pdf' },
            ],
        };
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

                    derived:
                        false,

                    derived_from_nace_codes: [] as string[],
                }),
            );
    }

    private isOutsideIafTable(
        naceCode: string,
    ) {
        return /^(?:97|98|99)(?:\.|$)/.test(
            naceCode.trim(),
        );
    }

    private async getDescendantClasses(
        source: {
            id: string;
            classification_type: string;
            revision: string;
            code: string;
            level: number;
        },
    ) {
        if (source.level === 4) {
            return [source];
        }

        const rows =
            await this.prisma.industry_classifications.findMany({
                where: {
                    classification_type:
                        source.classification_type,

                    revision:
                        source.revision,

                    is_active:
                        true,
                },

                select: {
                    id: true,
                    classification_type: true,
                    revision: true,
                    code: true,
                    title_en: true,
                    title_vi: true,
                    parent_code: true,
                    level: true,
                    is_active: true,
                },
            });

        const childrenByParent =
            new Map<string, typeof rows>();

        for (const row of rows) {
            if (!row.parent_code) {
                continue;
            }

            const bucket =
                childrenByParent.get(
                    row.parent_code,
                ) ?? [];

            bucket.push(row);
            childrenByParent.set(
                row.parent_code,
                bucket,
            );
        }

        const descendants:
            typeof rows = [];

        const pending = [
            source.code,
        ];

        const visited =
            new Set<string>();

        while (pending.length) {
            const parentCode =
                pending.shift()!;

            if (visited.has(parentCode)) {
                continue;
            }

            visited.add(parentCode);

            for (
                const child of
                childrenByParent.get(parentCode) ?? []
            ) {
                if (child.level === 4) {
                    descendants.push(child);
                } else {
                    pending.push(
                        child.code,
                    );
                }
            }
        }

        return descendants;
    }

    private async resolveIafForNace(
        nace: {
            id: string;
            classification_type: string;
            revision: string;
            code: string;
            title_en: string;
            title_vi: string | null;
            parent_code: string | null;
            level: number;
            is_active: boolean;
        },
        managementSystem: string,
    ) {
        const direct =
            await this.getApprovedIafMappings(
                nace.id,
                managementSystem,
            );

        if (direct.length) {
            return {
                iaf_candidates:
                    direct,

                resolution_status:
                    direct.length === 1
                        ? 'DIRECT_UNIQUE'
                        : 'DIRECT_MULTIPLE',

                derived_from_nace_classes:
                    [] as string[],

                outside_iaf_table:
                    false,
            };
        }

        const descendants =
            await this.getDescendantClasses(
                nace,
            );

        if (!descendants.length) {
            return {
                iaf_candidates: [],
                resolution_status:
                    this.isOutsideIafTable(
                        nace.code,
                    )
                        ? 'OUTSIDE_IAF_TABLE'
                        : 'UNRESOLVED',
                derived_from_nace_classes: [],
                outside_iaf_table:
                    this.isOutsideIafTable(
                        nace.code,
                    ),
            };
        }

        const mappings =
            await this.prisma.nace_iaf_mappings.findMany({
                where: {
                    nace_code_id: {
                        in:
                            descendants.map(
                                (row) => row.id,
                            ),
                    },

                    management_system:
                        managementSystem,

                    mapping_status:
                        'APPROVED',
                },

                include: {
                    iaf_scope:
                        true,

                    nace_code: {
                        select: {
                            code: true,
                        },
                    },
                },
            });

        const validMappings =
            mappings.filter(
                (mapping) =>
                    mapping.iaf_scope
                        .is_active &&
                    this.isCurrentlyValid(
                        mapping.valid_from,
                        mapping.valid_to,
                    ),
            );

        const candidates =
            new Map<string, {
                mapping_id: string;
                iaf_code: string;
                iaf_name: string;
                source_document: string | null;
                derived: boolean;
                derived_from_nace_codes: string[];
            }>();

        for (const mapping of validMappings) {
            const code =
                mapping.iaf_scope
                    .iaf_code;

            const existing =
                candidates.get(code);

            if (existing) {
                if (
                    !existing.derived_from_nace_codes.includes(
                        mapping.nace_code.code,
                    )
                ) {
                    existing.derived_from_nace_codes.push(
                        mapping.nace_code.code,
                    );
                }
                continue;
            }

            candidates.set(
                code,
                {
                    mapping_id:
                        `DERIVED:${nace.id}:${managementSystem}:${code}`,
                    iaf_code:
                        code,
                    iaf_name:
                        mapping.iaf_scope
                            .iaf_name,
                    source_document:
                        mapping.source_document,
                    derived:
                        true,
                    derived_from_nace_codes: [
                        mapping.nace_code.code,
                    ],
                },
            );
        }

        const iafCandidates =
            [...candidates.values()]
                .map((candidate) => ({
                    ...candidate,
                    derived_from_nace_codes:
                        candidate.derived_from_nace_codes
                            .sort(),
                }))
                .sort(
                    (a, b) =>
                        Number(a.iaf_code) -
                        Number(b.iaf_code),
                );

        const descendantCodes =
            descendants.map(
                (row) => row.code,
            );

        const outsideIafTable =
            !iafCandidates.length &&
            descendantCodes.length > 0 &&
            descendantCodes.every(
                (childCode) =>
                    this.isOutsideIafTable(
                        childCode,
                    ),
            );

        return {
            iaf_candidates:
                iafCandidates,

            resolution_status:
                outsideIafTable
                    ? 'OUTSIDE_IAF_TABLE'
                    : iafCandidates.length === 1
                        ? 'DERIVED_UNIQUE'
                        : iafCandidates.length > 1
                            ? 'DERIVED_MULTIPLE'
                            : 'UNRESOLVED',

            derived_from_nace_classes:
                descendantCodes.sort(),

            outside_iaf_table:
                outsideIafTable,
        };
    }

    private async getApprovedIsicNaceMappings(
        source: {
            id: string;
            classification_type: string;
            revision: string;
            code: string;
            level: number;
        },
    ) {
        const sourceClasses =
            await this.getDescendantClasses(
                source,
            );

        const sourceIds =
            source.level === 4
                ? [source.id]
                : sourceClasses.map(
                    (row) => row.id,
                );

        if (!sourceIds.length) {
            return [];
        }

        const mappings =
            await this.prisma.industry_code_mappings.findMany({
                where: {
                    source_code_id: {
                        in:
                            sourceIds,
                    },

                    mapping_status:
                        'APPROVED',
                },

                include: {
                    source_code: {
                        select: {
                            code: true,
                        },
                    },

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

        const uniqueTargets =
            new Map<string, typeof activeMappings[number] & {
                derived_from_isic_codes: string[];
            }>();

        for (const mapping of activeMappings) {
            const existing =
                uniqueTargets.get(
                    mapping.target_code_id,
                );

            if (existing) {
                if (
                    !existing.derived_from_isic_codes.includes(
                        mapping.source_code.code,
                    )
                ) {
                    existing.derived_from_isic_codes.push(
                        mapping.source_code.code,
                    );
                }
                continue;
            }

            uniqueTargets.set(
                mapping.target_code_id,
                {
                    ...mapping,
                    derived_from_isic_codes: [
                        mapping.source_code.code,
                    ],
                },
            );
        }

        return [...uniqueTargets.values()];
    }

    private buildIafSummary(
        naceCandidates: Array<{
            iaf_candidates: Array<{
                iaf_code: string;
                iaf_name: string;
                source_document?: string | null;
            }>;
            outside_iaf_table?: boolean;
        }>,
    ) {
        const candidates =
            new Map<string, {
                iaf_code: string;
                iaf_name: string;
                source_document?: string | null;
            }>();

        for (const naceCandidate of naceCandidates) {
            for (const iaf of naceCandidate.iaf_candidates) {
                if (!candidates.has(iaf.iaf_code)) {
                    candidates.set(
                        iaf.iaf_code,
                        {
                            iaf_code:
                                iaf.iaf_code,
                            iaf_name:
                                iaf.iaf_name,
                            source_document:
                                iaf.source_document,
                        },
                    );
                }
            }
        }

        const values =
            [...candidates.values()]
                .sort(
                    (a, b) =>
                        Number(a.iaf_code) -
                        Number(b.iaf_code),
                );

        const allOutside =
            naceCandidates.length > 0 &&
            naceCandidates.every(
                (candidate) =>
                    candidate.outside_iaf_table ===
                    true,
            );

        return {
            status:
                allOutside
                    ? 'OUTSIDE_IAF_TABLE'
                    : values.length === 1
                        ? 'UNIQUE'
                        : values.length > 1
                            ? 'MULTIPLE'
                            : 'UNRESOLVED',
            candidates:
                values,
            iaf_codes:
                values.map(
                    (value) => value.iaf_code,
                ),
        };
    }

    async getMappingCoverage(
        managementSystem: string,
    ) {
        const safeManagementSystem =
            this.normalize(
                managementSystem,
            );

        if (
            !['QMS', 'EMS', 'OHSMS'].includes(
                safeManagementSystem,
            )
        ) {
            throw new BadRequestException(
                'Hệ thống quản lý phải là QMS, EMS hoặc OHSMS',
            );
        }

        const isicClasses =
            await this.prisma.industry_classifications.findMany({
                where: {
                    classification_type:
                        'ISIC',
                    revision:
                        'ISIC_REV_4',
                    level:
                        4,
                    is_active:
                        true,
                },
                select: {
                    id: true,
                    code: true,
                    title_en: true,
                    title_vi: true,
                },
            });

        const isicNaceMappings =
            await this.prisma.industry_code_mappings.findMany({
                where: {
                    source_code_id: {
                        in:
                            isicClasses.map(
                                (row) => row.id,
                            ),
                    },
                    mapping_status:
                        'APPROVED',
                },
                include: {
                    target_code:
                        true,
                },
            });

        const targetNaceIds =
            [...new Set(
                isicNaceMappings.map(
                    (row) => row.target_code_id,
                ),
            )];

        const naceIafMappings =
            await this.prisma.nace_iaf_mappings.findMany({
                where: {
                    nace_code_id: {
                        in:
                            targetNaceIds,
                    },
                    management_system:
                        safeManagementSystem,
                    mapping_status:
                        'APPROVED',
                },
                include: {
                    iaf_scope:
                        true,
                },
            });

        const naceMappingsById =
            new Map<string, typeof isicNaceMappings>();

        for (const mapping of isicNaceMappings) {
            const bucket =
                naceMappingsById.get(
                    mapping.source_code_id,
                ) ?? [];
            bucket.push(mapping);
            naceMappingsById.set(
                mapping.source_code_id,
                bucket,
            );
        }

        const iafByNaceId =
            new Map<string, Set<string>>();

        for (const mapping of naceIafMappings) {
            if (
                !mapping.iaf_scope.is_active ||
                !this.isCurrentlyValid(
                    mapping.valid_from,
                    mapping.valid_to,
                )
            ) {
                continue;
            }

            const bucket =
                iafByNaceId.get(
                    mapping.nace_code_id,
                ) ?? new Set<string>();
            bucket.add(
                mapping.iaf_scope
                    .iaf_code,
            );
            iafByNaceId.set(
                mapping.nace_code_id,
                bucket,
            );
        }

        let resolved = 0;
        let unique = 0;
        let multiple = 0;
        let outside = 0;
        const unresolved: Array<{
            code: string;
            title: string;
            missing_nace_codes: string[];
        }> = [];

        for (const isic of isicClasses) {
            const mappings =
                naceMappingsById.get(
                    isic.id,
                ) ?? [];

            if (!mappings.length) {
                unresolved.push({
                    code: isic.code,
                    title:
                        isic.title_vi ??
                        isic.title_en,
                    missing_nace_codes: [],
                });
                continue;
            }

            const iafCodes =
                new Set<string>();
            const missingNaceCodes:
                string[] = [];
            let allOutside =
                true;

            for (const mapping of mappings) {
                const naceCode =
                    mapping.target_code.code;

                if (
                    !this.isOutsideIafTable(
                        naceCode,
                    )
                ) {
                    allOutside =
                        false;
                }

                const codes =
                    iafByNaceId.get(
                        mapping.target_code_id,
                    );

                if (
                    !codes?.size &&
                    !this.isOutsideIafTable(
                        naceCode,
                    )
                ) {
                    missingNaceCodes.push(
                        naceCode,
                    );
                    continue;
                }

                for (const code of codes ?? []) {
                    iafCodes.add(code);
                }
            }

            if (allOutside) {
                outside += 1;
                continue;
            }

            if (missingNaceCodes.length) {
                unresolved.push({
                    code: isic.code,
                    title:
                        isic.title_vi ??
                        isic.title_en,
                    missing_nace_codes:
                        [...new Set(
                            missingNaceCodes,
                        )].sort(),
                });
                continue;
            }

            if (iafCodes.size) {
                resolved += 1;
                if (iafCodes.size === 1) {
                    unique += 1;
                } else {
                    multiple += 1;
                }
            } else {
                unresolved.push({
                    code: isic.code,
                    title:
                        isic.title_vi ??
                        isic.title_en,
                    missing_nace_codes: [],
                });
            }
        }

        return {
            management_system:
                safeManagementSystem,
            total_isic_classes:
                isicClasses.length,
            resolved,
            unique_iaf:
                unique,
            multiple_iaf:
                multiple,
            outside_iaf_table:
                outside,
            unresolved:
                unresolved.length,
            unresolved_items:
                unresolved.slice(0, 50),
            complete_for_certifiable_isic:
                unresolved.length === 0,
            note:
                'Các ISIC quy đổi duy nhất tới NACE 97/98/99 được ghi nhận là ngoài bảng IAF, không được gán IAF giả.',
        };
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

        if (
            !['QMS', 'EMS', 'OHSMS'].includes(
                safeManagementSystem,
            )
        ) {
            throw new BadRequestException(
                'Hệ thống quản lý phải là QMS, EMS hoặc OHSMS',
            );
        }

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
            const resolved =
                await this.resolveIafForNace(
                    source,
                    safeManagementSystem,
                );

            const naceCandidates = [
                {
                    nace:
                        source,
                    mapping_type:
                        resolved.resolution_status.startsWith(
                            'DERIVED_',
                        )
                            ? 'DERIVED_FROM_CHILDREN'
                            : 'DIRECT',
                    iaf_candidates:
                        resolved.iaf_candidates,
                    resolution_status:
                        resolved.resolution_status,
                    derived_from_nace_classes:
                        resolved.derived_from_nace_classes,
                    outside_iaf_table:
                        resolved.outside_iaf_table,
                },
            ];

            return {
                source,
                management_system:
                    safeManagementSystem,
                nace_candidates:
                    naceCandidates,
                iaf_summary:
                    this.buildIafSummary(
                        naceCandidates,
                    ),
                requires_selection:
                    resolved.iaf_candidates.length > 1,
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

        const activeMappings =
            await this.getApprovedIsicNaceMappings(
                source,
            );

        const naceCandidates =
            await Promise.all(
                activeMappings.map(
                    async (
                        mapping,
                    ) => {
                        const resolved =
                            await this.resolveIafForNace(
                                mapping.target_code,
                                safeManagementSystem,
                            );

                        return {
                            mapping_id:
                                mapping.id,
                            mapping_type:
                                source.level === 4
                                    ? mapping.mapping_type
                                    : 'DERIVED_FROM_CHILDREN',
                            nace:
                                mapping.target_code,
                            iaf_candidates:
                                resolved.iaf_candidates,
                            resolution_status:
                                resolved.resolution_status,
                            derived_from_isic_codes:
                                mapping.derived_from_isic_codes,
                            derived_from_nace_classes:
                                resolved.derived_from_nace_classes,
                            outside_iaf_table:
                                resolved.outside_iaf_table,
                        };
                    },
                ),
            );

        const iafSummary =
            this.buildIafSummary(
                naceCandidates,
            );

        return {
            source,
            management_system:
                safeManagementSystem,
            nace_candidates:
                naceCandidates,
            iaf_summary:
                iafSummary,
            requires_selection:
                naceCandidates.length !== 1 ||
                (
                    naceCandidates[0]?.mapping_type !==
                    'EXACT' &&
                    naceCandidates[0]?.mapping_type !==
                    'DIRECT'
                ),
            iaf_auto_resolved:
                iafSummary.status ===
                'UNIQUE',
            review_required:
                true,
        };
    }

}