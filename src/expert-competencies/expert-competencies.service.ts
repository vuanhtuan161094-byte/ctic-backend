import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateExpertCompetencyDto } from './dto/create-expert-competency.dto';
import { SuspendExpertCompetencyDto } from './dto/suspend-expert-competency.dto';
import { UpdateExpertCompetencyDto } from './dto/update-expert-competency.dto';

@Injectable()
export class ExpertCompetenciesService {
    private readonly detailInclude = {
        experts: true,

        approved_by_user: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },
    } as const;

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private parseDate(
        value: string,
        fieldName: string,
    ) {
        const match =
            value.match(
                /^(\d{4})-(\d{2})-(\d{2})/,
            );

        if (!match) {
            throw new BadRequestException(
                `${fieldName} không hợp lệ`,
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
                `${fieldName} không hợp lệ`,
            );
        }

        return date;
    }

    private normalize(
        value: string,
    ) {
        return value
            .trim()
            .toUpperCase();
    }

    private async getExpertOrThrow(
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

        if (
            expert.status
                ?.trim()
                .toLowerCase() !==
            'active'
        ) {
            throw new BadRequestException(
                'Chuyên gia không ở trạng thái hoạt động',
            );
        }

        return expert;
    }

    private validateScope(
        scopeLevel: string,
        naceCode?: string,
    ) {
        const safeScope =
            this.normalize(
                scopeLevel,
            );

        if (
            safeScope === 'NACE' &&
            !naceCode?.trim()
        ) {
            throw new BadRequestException(
                'Năng lực cấp NACE phải có mã NACE',
            );
        }

        return safeScope;
    }

    private validateDates(
        effectiveDate: Date,
        expiryDate: Date | null,
    ) {
        if (
            expiryDate &&
            expiryDate <
            effectiveDate
        ) {
            throw new BadRequestException(
                'Ngày hết hiệu lực phải bằng hoặc sau ngày hiệu lực',
            );
        }
    }

    private async getOrThrow(
        id: string,
    ) {
        const competency =
            await this.prisma.expert_competencies.findUnique({
                where: {
                    id,
                },

                include:
                    this.detailInclude,
            });

        if (!competency) {
            throw new NotFoundException(
                'Không tìm thấy phạm vi năng lực chuyên gia',
            );
        }

        return competency;
    }

    async create(
        dto: CreateExpertCompetencyDto,
    ) {
        await this.getExpertOrThrow(
            dto.expert_id,
        );

        const managementSystem =
            this.normalize(
                dto.management_system,
            );

        const standardCode =
            this.normalize(
                dto.standard_code,
            );

        const competencyRole =
            this.normalize(
                dto.competency_role,
            );

        const scopeLevel =
            this.validateScope(
                dto.scope_level,
                dto.nace_code,
            );

        const iafCode =
            dto.iaf_code.trim();

        const naceCode =
            scopeLevel === 'NACE'
                ? dto.nace_code
                    ?.trim() ??
                null
                : null;

        const effectiveDate =
            this.parseDate(
                dto.effective_date,
                'Ngày hiệu lực',
            );

        const expiryDate =
            dto.expiry_date
                ? this.parseDate(
                    dto.expiry_date,
                    'Ngày hết hiệu lực',
                )
                : null;

        this.validateDates(
            effectiveDate,
            expiryDate,
        );

        const existing =
            await this.prisma.expert_competencies.findFirst({
                where: {
                    expert_id:
                        dto.expert_id,

                    management_system:
                        managementSystem,

                    standard_code:
                        standardCode,

                    competency_role:
                        competencyRole,

                    iaf_code:
                        iafCode,

                    nace_code:
                        naceCode,
                },
            });

        if (existing) {
            throw new ConflictException(
                'Phạm vi năng lực chuyên gia đã tồn tại',
            );
        }

        return this.prisma.expert_competencies.create({
            data: {
                expert_id:
                    dto.expert_id,

                management_system:
                    managementSystem,

                standard_code:
                    standardCode,

                competency_role:
                    competencyRole,

                scope_level:
                    scopeLevel,

                iaf_code:
                    iafCode,

                nace_revision:
                    scopeLevel === 'NACE'
                        ? dto.nace_revision
                            ?.trim() ??
                        null
                        : null,

                nace_code:
                    naceCode,

                competency_level:
                    this.normalize(
                        dto.competency_level ??
                        'QUALIFIED',
                    ),

                approval_status:
                    'DRAFT',

                effective_date:
                    effectiveDate,

                expiry_date:
                    expiryDate,

                restriction:
                    dto.restriction
                        ?.trim() ??
                    null,

                approval_basis:
                    dto.approval_basis
                        ?.trim() ??
                    null,

                evidence_summary:
                    dto.evidence_summary
                        ?.trim() ??
                    null,

                notes:
                    dto.notes
                        ?.trim() ??
                    null,
            },

            include:
                this.detailInclude,
        });
    }

    async findAll(
        expertId?: string,
        managementSystem?: string,
        role?: string,
        status?: string,
        iafCode?: string,
        naceCode?: string,
    ) {
        return this.prisma.expert_competencies.findMany({
            where: {
                ...(expertId
                    ? {
                        expert_id:
                            expertId,
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

                ...(role
                    ? {
                        competency_role:
                            this.normalize(
                                role,
                            ),
                    }
                    : {}),

                ...(status
                    ? {
                        approval_status:
                            this.normalize(
                                status,
                            ),
                    }
                    : {}),

                ...(iafCode
                    ? {
                        iaf_code:
                            iafCode.trim(),
                    }
                    : {}),

                ...(naceCode
                    ? {
                        nace_code:
                            naceCode.trim(),
                    }
                    : {}),
            },

            orderBy: [
                {
                    expert_id:
                        'asc',
                },
                {
                    management_system:
                        'asc',
                },
                {
                    standard_code:
                        'asc',
                },
                {
                    competency_role:
                        'asc',
                },
            ],

            include:
                this.detailInclude,
        });
    }

    async findByExpert(
        expertId: string,
    ) {
        await this.getExpertOrThrow(
            expertId,
        );

        return this.findAll(
            expertId,
        );
    }

    async findOne(
        id: string,
    ) {
        return this.getOrThrow(
            id,
        );
    }

    async update(
        id: string,
        dto: UpdateExpertCompetencyDto,
    ) {
        const competency =
            await this.getOrThrow(
                id,
            );

        if (
            competency.approval_status !==
            'DRAFT'
        ) {
            throw new BadRequestException(
                'Chỉ được sửa năng lực ở trạng thái DRAFT',
            );
        }

        const scopeLevel =
            dto.scope_level
                ? this.validateScope(
                    dto.scope_level,
                    dto.nace_code ??
                    competency.nace_code ??
                    undefined,
                )
                : competency.scope_level;

        const effectiveDate =
            dto.effective_date
                ? this.parseDate(
                    dto.effective_date,
                    'Ngày hiệu lực',
                )
                : competency.effective_date;

        const expiryDate =
            dto.expiry_date
                ? this.parseDate(
                    dto.expiry_date,
                    'Ngày hết hiệu lực',
                )
                : competency.expiry_date;

        this.validateDates(
            effectiveDate,
            expiryDate,
        );

        return this.prisma.expert_competencies.update({
            where: {
                id,
            },

            data: {
                ...(dto.management_system !== undefined
                    ? {
                        management_system:
                            this.normalize(
                                dto.management_system,
                            ),
                    }
                    : {}),

                ...(dto.standard_code !== undefined
                    ? {
                        standard_code:
                            this.normalize(
                                dto.standard_code,
                            ),
                    }
                    : {}),

                ...(dto.competency_role !== undefined
                    ? {
                        competency_role:
                            this.normalize(
                                dto.competency_role,
                            ),
                    }
                    : {}),

                ...(dto.scope_level !== undefined
                    ? {
                        scope_level:
                            scopeLevel,
                    }
                    : {}),

                ...(dto.iaf_code !== undefined
                    ? {
                        iaf_code:
                            dto.iaf_code.trim(),
                    }
                    : {}),

                ...(dto.nace_revision !== undefined
                    ? {
                        nace_revision:
                            scopeLevel === 'NACE'
                                ? dto.nace_revision.trim()
                                : null,
                    }
                    : {}),

                ...(dto.nace_code !== undefined
                    ? {
                        nace_code:
                            scopeLevel === 'NACE'
                                ? dto.nace_code.trim()
                                : null,
                    }
                    : {}),

                ...(dto.competency_level !== undefined
                    ? {
                        competency_level:
                            this.normalize(
                                dto.competency_level,
                            ),
                    }
                    : {}),

                effective_date:
                    effectiveDate,

                expiry_date:
                    expiryDate,

                ...(dto.restriction !== undefined
                    ? {
                        restriction:
                            dto.restriction.trim(),
                    }
                    : {}),

                ...(dto.approval_basis !== undefined
                    ? {
                        approval_basis:
                            dto.approval_basis.trim(),
                    }
                    : {}),

                ...(dto.evidence_summary !== undefined
                    ? {
                        evidence_summary:
                            dto.evidence_summary.trim(),
                    }
                    : {}),

                ...(dto.notes !== undefined
                    ? {
                        notes:
                            dto.notes.trim(),
                    }
                    : {}),
            },

            include:
                this.detailInclude,
        });
    }

    async approve(
        id: string,
        userId: string,
    ) {
        const competency =
            await this.getOrThrow(
                id,
            );

        await this.getExpertOrThrow(
            competency.expert_id,
        );

        if (
            competency.approval_status ===
            'APPROVED'
        ) {
            return competency;
        }

        if (
            competency.approval_status ===
            'SUSPENDED'
        ) {
            throw new BadRequestException(
                'Năng lực đang bị đình chỉ',
            );
        }

        return this.prisma.expert_competencies.update({
            where: {
                id,
            },

            data: {
                approval_status:
                    'APPROVED',

                approved_by:
                    userId,

                approved_at:
                    new Date(),

                suspended_at:
                    null,

                suspension_reason:
                    null,
            },

            include:
                this.detailInclude,
        });
    }

    async suspend(
        id: string,
        dto: SuspendExpertCompetencyDto,
    ) {
        const competency =
            await this.getOrThrow(
                id,
            );

        if (
            competency.approval_status !==
            'APPROVED'
        ) {
            throw new BadRequestException(
                'Chỉ được đình chỉ năng lực đã được phê duyệt',
            );
        }

        return this.prisma.expert_competencies.update({
            where: {
                id,
            },

            data: {
                approval_status:
                    'SUSPENDED',

                suspended_at:
                    new Date(),

                suspension_reason:
                    dto.reason.trim(),
            },

            include:
                this.detailInclude,
        });
    }
}