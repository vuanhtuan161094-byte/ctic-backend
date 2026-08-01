import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMandayCalculationDto } from './dto/create-manday-calculation.dto';
import { UpdateMandayCalculationDto } from './dto/update-manday-calculation.dto';
import { MandayAdjustmentDto } from './dto/manday-adjustment.dto';

@Injectable()
export class MandayCalculationsService {
    constructor(private readonly prisma: PrismaService) { }

    private readonly includeRelations = {
        certification_projects: {
            include: {
                certification_applications: {
                    select: {
                        id: true,
                        application_code: true,
                        standard_name: true,
                        employee_count: true,
                        site_count: true,
                    },
                },
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                    },
                },
                certification_agreements: {
                    select: {
                        id: true,
                        agreement_number: true,
                    },
                },
            },
        },
        calculator: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },
        approver: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },
        adjustments: {
            orderBy: {
                created_at: 'asc' as const,
            },
        },
    };

    private roundMandays(value: number): number {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    private decimalToNumber(value: unknown): number | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }

        return Number(value);
    }

    private sumAdjustment(
        adjustments: MandayAdjustmentDto[],
        adjustmentType: string,
    ): number {
        return adjustments
            .filter(
                (adjustment) =>
                    adjustment.adjustment_type === adjustmentType,
            )
            .reduce(
                (total, adjustment) =>
                    total + Number(adjustment.percentage),
                0,
            );
    }

    private prepareCalculation(dto: CreateMandayCalculationDto) {
        const adjustments = dto.adjustments ?? [];

        const hasIncreaseAdjustments = adjustments.some(
            (item) => item.adjustment_type === 'increase',
        );

        const hasReductionAdjustments = adjustments.some(
            (item) => item.adjustment_type === 'reduction',
        );

        const hasImsReductionAdjustments = adjustments.some(
            (item) => item.adjustment_type === 'ims_reduction',
        );

        const increasePercent = hasIncreaseAdjustments
            ? this.sumAdjustment(adjustments, 'increase')
            : (dto.increase_percent ?? 0);

        const reductionPercent = hasReductionAdjustments
            ? this.sumAdjustment(adjustments, 'reduction')
            : (dto.reduction_percent ?? 0);

        const imsReductionPercent = hasImsReductionAdjustments
            ? this.sumAdjustment(adjustments, 'ims_reduction')
            : (dto.ims_reduction_percent ?? 0);

        if (reductionPercent > 30) {
            throw new BadRequestException(
                'Tổng tỷ lệ giảm ngày công không được vượt quá 30%',
            );
        }

        if (imsReductionPercent > 20) {
            throw new BadRequestException(
                'Tỷ lệ giảm đối với hệ thống quản lý tích hợp không được vượt quá 20%',
            );
        }

        const totalSites = dto.total_sites ?? 1;
        const sampledSites = dto.sampled_sites ?? 1;

        if (sampledSites > totalSites) {
            throw new BadRequestException(
                'Số địa điểm lấy mẫu không được lớn hơn tổng số địa điểm',
            );
        }

        const adjustmentFactor =
            1 +
            increasePercent / 100 -
            reductionPercent / 100 -
            imsReductionPercent / 100;

        const finalMandays = this.roundMandays(
            dto.base_mandays * adjustmentFactor,
        );

        if (finalMandays <= 0) {
            throw new BadRequestException(
                'Ngày công cuối cùng phải lớn hơn 0',
            );
        }

        const stage1Mandays = dto.stage1_mandays;
        const stage2Mandays = dto.stage2_mandays;

        if (
            stage1Mandays !== undefined &&
            stage2Mandays !== undefined &&
            Math.abs(stage1Mandays + stage2Mandays - finalMandays) > 0.01
        ) {
            throw new BadRequestException(
                'Tổng ngày công giai đoạn 1 và giai đoạn 2 phải bằng ngày công cuối cùng',
            );
        }

        let onsiteMandays: number;
        let offsiteMandays: number;

        if (
            dto.onsite_mandays === undefined &&
            dto.offsite_mandays === undefined
        ) {
            onsiteMandays = finalMandays;
            offsiteMandays = 0;
        } else if (dto.onsite_mandays !== undefined) {
            onsiteMandays = dto.onsite_mandays;
            offsiteMandays =
                dto.offsite_mandays ??
                this.roundMandays(finalMandays - onsiteMandays);
        } else {
            offsiteMandays = dto.offsite_mandays ?? 0;
            onsiteMandays = this.roundMandays(
                finalMandays - offsiteMandays,
            );
        }

        if (onsiteMandays < 0 || offsiteMandays < 0) {
            throw new BadRequestException(
                'Ngày công tại chỗ và ngoài hiện trường không được nhỏ hơn 0',
            );
        }

        if (
            Math.abs(
                onsiteMandays + offsiteMandays - finalMandays,
            ) > 0.01
        ) {
            throw new BadRequestException(
                'Tổng ngày công tại chỗ và ngoài hiện trường phải bằng ngày công cuối cùng',
            );
        }

        if (onsiteMandays < finalMandays * 0.8) {
            throw new BadRequestException(
                'Thời gian đánh giá tại chỗ phải đạt tối thiểu 80% tổng ngày công',
            );
        }

        return {
            totalSites,
            sampledSites,
            increasePercent: this.roundMandays(increasePercent),
            reductionPercent: this.roundMandays(reductionPercent),
            imsReductionPercent:
                this.roundMandays(imsReductionPercent),
            finalMandays,
            onsiteMandays: this.roundMandays(onsiteMandays),
            offsiteMandays: this.roundMandays(offsiteMandays),
        };
    }

    private async generateCalculationCode(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `MC-${year}-`;

        const latestCalculation =
            await this.prisma.manday_calculations.findFirst({
                where: {
                    calculation_code: {
                        startsWith: prefix,
                    },
                },
                orderBy: {
                    calculation_code: 'desc',
                },
                select: {
                    calculation_code: true,
                },
            });

        let nextNumber = 1;

        if (latestCalculation) {
            const currentNumber = Number(
                latestCalculation.calculation_code.replace(prefix, ''),
            );

            if (!Number.isNaN(currentNumber)) {
                nextNumber = currentNumber + 1;
            }
        }

        return `${prefix}${String(nextNumber).padStart(4, '0')}`;
    }

    async create(
        dto: CreateMandayCalculationDto,
        calculatedBy?: string,
    ) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id: dto.project_id,
                },
                select: {
                    id: true,
                    project_code: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        const latestVersion =
            await this.prisma.manday_calculations.findFirst({
                where: {
                    project_id: dto.project_id,
                },
                orderBy: {
                    version_no: 'desc',
                },
                select: {
                    version_no: true,
                },
            });

        const versionNo = (latestVersion?.version_no ?? 0) + 1;
        const calculationCode =
            await this.generateCalculationCode();

        const result = this.prepareCalculation(dto);

        return this.prisma.manday_calculations.create({
            data: {
                project_id: dto.project_id,
                calculation_code: calculationCode,
                version_no: versionNo,
                audit_type: dto.audit_type,
                standard_type: dto.standard_type,
                effective_personnel: dto.effective_personnel,
                total_sites: result.totalSites,
                sampled_sites: result.sampledSites,
                complexity_level: dto.complexity_level,
                base_mandays: dto.base_mandays,
                stage1_mandays: dto.stage1_mandays,
                stage2_mandays: dto.stage2_mandays,
                onsite_mandays: result.onsiteMandays,
                offsite_mandays: result.offsiteMandays,
                increase_percent: result.increasePercent,
                reduction_percent: result.reductionPercent,
                ims_integration_percent:
                    dto.ims_integration_percent ?? 0,
                combined_audit_capability_percent:
                    dto.combined_audit_capability_percent ?? 0,
                ims_reduction_percent:
                    result.imsReductionPercent,
                final_mandays: result.finalMandays,
                calculation_basis: dto.calculation_basis,
                status: dto.status ?? 'draft',
                calculated_by: calculatedBy,
                adjustments: dto.adjustments?.length
                    ? {
                        create: dto.adjustments.map(
                            (adjustment) => ({
                                adjustment_type:
                                    adjustment.adjustment_type,
                                factor_code:
                                    adjustment.factor_code,
                                percentage:
                                    adjustment.percentage,
                                reason: adjustment.reason,
                            }),
                        ),
                    }
                    : undefined,
            },
            include: this.includeRelations,
        });
    }

    async findAll() {
        return this.prisma.manday_calculations.findMany({
            orderBy: {
                created_at: 'desc',
            },
            include: this.includeRelations,
        });
    }

    async findByProject(projectId: string) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id: projectId,
                },
                select: {
                    id: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        return this.prisma.manday_calculations.findMany({
            where: {
                project_id: projectId,
            },
            orderBy: {
                version_no: 'desc',
            },
            include: this.includeRelations,
        });
    }

    async findOne(id: string) {
        const calculation =
            await this.prisma.manday_calculations.findUnique({
                where: {
                    id,
                },
                include: this.includeRelations,
            });

        if (!calculation) {
            throw new NotFoundException(
                'Không tìm thấy bản tính ngày công',
            );
        }

        return calculation;
    }

    async update(
        id: string,
        dto: UpdateMandayCalculationDto,
    ) {
        const current = await this.findOne(id);

        if (current.status === 'approved') {
            throw new BadRequestException(
                'Không thể sửa bản tính ngày công đã được phê duyệt',
            );
        }

        if (
            dto.project_id &&
            dto.project_id !== current.project_id
        ) {
            throw new BadRequestException(
                'Không được thay đổi dự án của bản tính ngày công',
            );
        }

        const currentAdjustments =
            current.adjustments.map((adjustment) => ({
                adjustment_type: adjustment.adjustment_type,
                factor_code: adjustment.factor_code,
                percentage: Number(adjustment.percentage),
                reason: adjustment.reason,
            }));

        const mergedDto: CreateMandayCalculationDto = {
            project_id: current.project_id,
            audit_type: dto.audit_type ?? current.audit_type,
            standard_type:
                dto.standard_type ?? current.standard_type,
            effective_personnel:
                dto.effective_personnel ??
                current.effective_personnel,
            total_sites: dto.total_sites ?? current.total_sites,
            sampled_sites:
                dto.sampled_sites ?? current.sampled_sites,
            complexity_level:
                dto.complexity_level ??
                current.complexity_level ??
                undefined,
            base_mandays:
                dto.base_mandays ??
                Number(current.base_mandays),
            stage1_mandays:
                dto.stage1_mandays !== undefined
                    ? dto.stage1_mandays
                    : this.decimalToNumber(
                        current.stage1_mandays,
                    ),
            stage2_mandays:
                dto.stage2_mandays !== undefined
                    ? dto.stage2_mandays
                    : this.decimalToNumber(
                        current.stage2_mandays,
                    ),
            onsite_mandays:
                dto.onsite_mandays !== undefined
                    ? dto.onsite_mandays
                    : Number(current.onsite_mandays),
            offsite_mandays:
                dto.offsite_mandays !== undefined
                    ? dto.offsite_mandays
                    : Number(current.offsite_mandays),
            increase_percent:
                dto.increase_percent !== undefined
                    ? dto.increase_percent
                    : Number(current.increase_percent),
            reduction_percent:
                dto.reduction_percent !== undefined
                    ? dto.reduction_percent
                    : Number(current.reduction_percent),
            ims_integration_percent:
                dto.ims_integration_percent !== undefined
                    ? dto.ims_integration_percent
                    : Number(
                        current.ims_integration_percent,
                    ),
            combined_audit_capability_percent:
                dto.combined_audit_capability_percent !==
                    undefined
                    ? dto.combined_audit_capability_percent
                    : Number(
                        current.combined_audit_capability_percent,
                    ),
            ims_reduction_percent:
                dto.ims_reduction_percent !== undefined
                    ? dto.ims_reduction_percent
                    : Number(
                        current.ims_reduction_percent,
                    ),
            calculation_basis:
                dto.calculation_basis ??
                current.calculation_basis ??
                undefined,
            status: dto.status ?? current.status ?? 'draft',
            adjustments:
                dto.adjustments ?? currentAdjustments,
        };

        const result = this.prepareCalculation(mergedDto);

        return this.prisma.$transaction(async (transaction) => {
            if (dto.adjustments !== undefined) {
                await transaction.manday_adjustments.deleteMany({
                    where: {
                        calculation_id: id,
                    },
                });
            }

            return transaction.manday_calculations.update({
                where: {
                    id,
                },
                data: {
                    audit_type: mergedDto.audit_type,
                    standard_type: mergedDto.standard_type,
                    effective_personnel:
                        mergedDto.effective_personnel,
                    total_sites: result.totalSites,
                    sampled_sites: result.sampledSites,
                    complexity_level:
                        mergedDto.complexity_level,
                    base_mandays: mergedDto.base_mandays,
                    stage1_mandays:
                        mergedDto.stage1_mandays,
                    stage2_mandays:
                        mergedDto.stage2_mandays,
                    onsite_mandays:
                        result.onsiteMandays,
                    offsite_mandays:
                        result.offsiteMandays,
                    increase_percent:
                        result.increasePercent,
                    reduction_percent:
                        result.reductionPercent,
                    ims_integration_percent:
                        mergedDto.ims_integration_percent ??
                        0,
                    combined_audit_capability_percent:
                        mergedDto.combined_audit_capability_percent ??
                        0,
                    ims_reduction_percent:
                        result.imsReductionPercent,
                    final_mandays:
                        result.finalMandays,
                    calculation_basis:
                        mergedDto.calculation_basis,
                    status: mergedDto.status,
                    adjustments:
                        dto.adjustments !== undefined &&
                            dto.adjustments.length > 0
                            ? {
                                create: dto.adjustments.map(
                                    (adjustment) => ({
                                        adjustment_type:
                                            adjustment.adjustment_type,
                                        factor_code:
                                            adjustment.factor_code,
                                        percentage:
                                            adjustment.percentage,
                                        reason: adjustment.reason,
                                    }),
                                ),
                            }
                            : undefined,
                },
                include: this.includeRelations,
            });
        });
    }

    async approve(id: string, approvedBy?: string) {
        const calculation = await this.findOne(id);

        if (!approvedBy) {
            throw new BadRequestException(
                'Không xác định được người phê duyệt',
            );
        }

        if (calculation.status === 'approved') {
            throw new BadRequestException(
                'Bản tính ngày công đã được phê duyệt',
            );
        }

        return this.prisma.manday_calculations.update({
            where: {
                id,
            },
            data: {
                status: 'approved',
                approved_by: approvedBy,
                approved_at: new Date(),
            },
            include: this.includeRelations,
        });
    }

    async remove(id: string) {
        const calculation = await this.findOne(id);

        if (calculation.status === 'approved') {
            throw new BadRequestException(
                'Không thể xóa bản tính ngày công đã được phê duyệt',
            );
        }

        await this.prisma.$transaction(async (transaction) => {
            await transaction.manday_adjustments.deleteMany({
                where: {
                    calculation_id: id,
                },
            });

            await transaction.manday_calculations.delete({
                where: {
                    id,
                },
            });
        });

        return {
            message: 'Đã xóa bản tính ngày công',
        };
    }
}