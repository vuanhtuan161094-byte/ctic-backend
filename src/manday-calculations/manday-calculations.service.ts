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

    private roundToHalf(value: number): number {
        return Math.round((value + Number.EPSILON) * 2) / 2;
    }

    private isHalfDay(value: number): boolean {
        return Math.abs(value * 2 - Math.round(value * 2)) < 0.0001;
    }

    private normalizeInitialStageSplit(
        finalMandays: number,
        stage1Mandays?: number,
        stage2Mandays?: number,
    ): {
        stage1Mandays: number;
        stage2Mandays: number;
        normalized: boolean;
    } {
        if (finalMandays < 1.5) {
            throw new BadRequestException(
                'Ngày công chứng nhận lần đầu phải tối thiểu 1,5 MD để bảo đảm Stage 1 tối thiểu 0,5 MD và Stage 2 tối thiểu 1 MD',
            );
        }

        const suppliedIsValid =
            stage1Mandays !== undefined &&
            stage2Mandays !== undefined &&
            stage1Mandays >= 0.5 &&
            stage2Mandays >= 1 &&
            this.isHalfDay(stage1Mandays) &&
            this.isHalfDay(stage2Mandays) &&
            Math.abs(stage1Mandays + stage2Mandays - finalMandays) <= 0.01;

        if (suppliedIsValid) {
            return {
                stage1Mandays: this.roundMandays(stage1Mandays),
                stage2Mandays: this.roundMandays(stage2Mandays),
                normalized: false,
            };
        }

        let normalizedStage1 = Math.max(
            0.5,
            this.roundToHalf(finalMandays * 0.2),
        );

        if (finalMandays - normalizedStage1 < 1) {
            normalizedStage1 = this.roundToHalf(finalMandays - 1);
        }

        const normalizedStage2 = this.roundToHalf(
            finalMandays - normalizedStage1,
        );

        if (normalizedStage1 < 0.5 || normalizedStage2 < 1) {
            throw new BadRequestException(
                'Không thể phân bổ Stage 1/Stage 2 theo giới hạn tối thiểu. Hãy kiểm tra lại MD lần đầu.',
            );
        }

        return {
            stage1Mandays: normalizedStage1,
            stage2Mandays: normalizedStage2,
            normalized: true,
        };
    }

    private decimalToNumber(value: unknown): number | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }

        return Number(value);
    }

    private compactStandardType(value?: string | null): string {
        const source = (value ?? '').trim();
        const normalized = source.toUpperCase();
        const systems: string[] = [];

        if (/ISO\s*9001|\bQMS\b/.test(normalized)) systems.push('QMS');
        if (/ISO\s*14001|\bEMS\b/.test(normalized)) systems.push('EMS');
        if (/ISO\s*45001|\bOHSMS\b|\bOH&S\b/.test(normalized)) systems.push('OHSMS');

        if (systems.length > 1) {
            return `IMS-${systems.join('-')}`.slice(0, 30);
        }
        if (systems[0] === 'QMS') return 'ISO 9001';
        if (systems[0] === 'EMS') return 'ISO 14001';
        if (systems[0] === 'OHSMS') return 'ISO 45001';

        return source.slice(0, 30) || 'MANAGEMENT_SYSTEM';
    }


    private parseReviewAdjustments(
        value: string | null | undefined,
        adjustmentType: 'increase' | 'reduction' | 'ims_reduction',
    ): Array<{
        adjustment_type: string;
        factor_code: string;
        percentage: number;
        reason: string;
    }> {
        if (!value?.trim()) return [];

        try {
            const parsed = JSON.parse(value) as unknown;
            const rows = Array.isArray(parsed) ? parsed : [parsed];

            return rows.flatMap((row, index) => {
                if (!row || typeof row !== 'object') return [];
                const item = row as Record<string, unknown>;
                const percentage = Number(
                    item.percentage ?? item.percent ?? item.rate ?? 0,
                );
                if (!Number.isFinite(percentage) || percentage <= 0) return [];

                const factorCode = String(
                    item.factor_code ?? item.factorCode ?? item.code ?? item.factor ?? `${adjustmentType}_${index + 1}`,
                ).trim();
                const reason = String(
                    item.reason ?? item.basis ?? item.description ?? item.label ?? 'Đồng bộ từ bản xem xét đăng ký',
                ).trim();

                return [{
                    adjustment_type: adjustmentType,
                    factor_code: factorCode || `${adjustmentType}_${index + 1}`,
                    percentage,
                    reason: reason || 'Đồng bộ từ bản xem xét đăng ký',
                }];
            });
        } catch {
            return [];
        }
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

        const generalAdjustmentFactor =
            1 +
            increasePercent / 100 -
            reductionPercent / 100;

        const imsAdjustmentFactor =
            1 - imsReductionPercent / 100;

        // Làm tròn về 0,5 MD gần nhất tại điểm bắt đầu, sau đó áp dụng
        // tăng/giảm chung và giảm IMS theo thứ tự tuần tự.
        const roundedBaseMandays = Math.max(0.5, this.roundToHalf(dto.base_mandays));
        const preImsMandays = roundedBaseMandays * generalAdjustmentFactor;
        const finalMandays = this.roundToHalf(
            preImsMandays * imsAdjustmentFactor,
        );

        if (finalMandays <= 0) {
            throw new BadRequestException(
                'Ngày công cuối cùng phải lớn hơn 0',
            );
        }

        const stage1Mandays = dto.stage1_mandays;
        const stage2Mandays = dto.stage2_mandays;

        if (stage1Mandays !== undefined && stage1Mandays < 0.5) {
            throw new BadRequestException(
                'Ngày công Stage 1 không được nhỏ hơn 0,5 MD',
            );
        }

        if (stage2Mandays !== undefined && stage2Mandays < 1) {
            throw new BadRequestException(
                'Ngày công Stage 2 không được nhỏ hơn 1 MD',
            );
        }

        if (stage1Mandays !== undefined && !this.isHalfDay(stage1Mandays)) {
            throw new BadRequestException('Ngày công Stage 1 phải là bội số của 0,5 MD');
        }
        if (stage2Mandays !== undefined && !this.isHalfDay(stage2Mandays)) {
            throw new BadRequestException('Ngày công Stage 2 phải là bội số của 0,5 MD');
        }

        const normalizedSplit = this.normalizeInitialStageSplit(
            finalMandays,
            stage1Mandays,
            stage2Mandays,
        );

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

        if (!this.isHalfDay(onsiteMandays) || !this.isHalfDay(offsiteMandays)) {
            throw new BadRequestException(
                'Ngày công tại chỗ và ngoài hiện trường phải là bội số của 0,5 MD',
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
            roundedBaseMandays,
            preImsMandays: this.roundMandays(preImsMandays),
            finalMandays,
            stage1Mandays: normalizedSplit.stage1Mandays,
            stage2Mandays: normalizedSplit.stage2Mandays,
            onsiteMandays: this.roundToHalf(onsiteMandays),
            offsiteMandays: this.roundToHalf(offsiteMandays),
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
                standard_type: this.compactStandardType(dto.standard_type),
                effective_personnel: dto.effective_personnel,
                total_sites: result.totalSites,
                sampled_sites: result.sampledSites,
                complexity_level: dto.complexity_level,
                base_mandays: result.roundedBaseMandays,
                stage1_mandays: result.stage1Mandays,
                stage2_mandays: result.stage2Mandays,
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


    async syncFromApplicationReview(
        projectId: string,
        calculatedBy?: string,
    ) {
        const existing = await this.prisma.manday_calculations.findFirst({
            where: { project_id: projectId },
            orderBy: { version_no: 'desc' },
            include: this.includeRelations,
        });

        if (existing) {
            return {
                created: false,
                message: 'Hồ sơ đã có bản tính man-day.',
                calculation: existing,
            };
        }

        const project = await this.prisma.certification_projects.findUnique({
            where: { id: projectId },
            include: {
                certification_applications: {
                    include: {
                        sites: { orderBy: { site_no: 'asc' } },
                        application_reviews: {
                            where: {
                                workflow_status: 'APPROVED',
                            },
                            orderBy: { created_at: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
        });

        if (!project) {
            throw new NotFoundException('Không tìm thấy dự án chứng nhận');
        }

        const application = project.certification_applications;
        const review = application.application_reviews[0];

        if (!review) {
            throw new BadRequestException(
                'Hồ sơ chưa có bản xem xét đăng ký đã được đánh giá viên xác nhận.',
            );
        }

        if (!['ACCEPTED', 'APPROVED'].includes((review.result ?? '').trim().toUpperCase())) {
            throw new BadRequestException(
                'Bản xem xét gần nhất không có kết quả chấp nhận nên không thể đồng bộ man-day.',
            );
        }

        const baseMandays = this.decimalToNumber(review.base_mandays);
        const finalMandays = this.decimalToNumber(review.final_mandays);
        const sourceStage1Mandays = this.decimalToNumber(review.stage1_mandays);
        const sourceStage2Mandays = this.decimalToNumber(review.stage2_mandays);
        const effectivePersonnel = review.effective_personnel
            ?? application.employee_count
            ?? application.total_employee_count;

        if (!baseMandays || !finalMandays || !effectivePersonnel) {
            throw new BadRequestException(
                'Bản xem xét chưa có đủ nhân sự hiệu dụng, MD cơ sở hoặc MD lần đầu để đồng bộ.',
            );
        }

        const normalizedFinalMandays = this.roundToHalf(finalMandays);
        const normalizedSplit = this.normalizeInitialStageSplit(
            normalizedFinalMandays,
            sourceStage1Mandays,
            sourceStage2Mandays,
        );
        const stage1Mandays = normalizedSplit.stage1Mandays;
        const stage2Mandays = normalizedSplit.stage2Mandays;

        const adjustments = [
            ...this.parseReviewAdjustments(review.increase_factors, 'increase'),
            ...this.parseReviewAdjustments(review.reduction_factors, 'reduction'),
        ];

        const integrationReduction = Number(review.integration_reduction_percent ?? 0);
        if (integrationReduction > 0) {
            adjustments.push({
                adjustment_type: 'ims_reduction',
                factor_code: 'IMS_MD11',
                percentage: integrationReduction,
                reason: 'Giảm thời lượng đánh giá tích hợp đã được xác nhận trong bản xem xét đăng ký.',
            });
        }

        const calculationCode = await this.generateCalculationCode();
        const now = new Date();
        const standardType = this.compactStandardType(application.standard_name);
        const totalSites = Math.max(
            1,
            application.site_count ?? application.sites.length ?? 1,
        );

        const calculation = await this.prisma.manday_calculations.create({
            data: {
                project_id: projectId,
                calculation_code: calculationCode,
                version_no: 1,
                audit_type: 'initial',
                standard_type: standardType,
                effective_personnel: effectivePersonnel,
                total_sites: totalSites,
                sampled_sites: totalSites,
                complexity_level: review.risk_level,
                base_mandays: baseMandays,
                stage1_mandays: stage1Mandays,
                stage2_mandays: stage2Mandays,
                onsite_mandays: normalizedFinalMandays,
                offsite_mandays: 0,
                increase_percent: Number(review.increase_percent ?? 0),
                reduction_percent: Number(review.reduction_percent ?? 0),
                ims_integration_percent: Number(review.ims_integration_percent ?? 0),
                combined_audit_capability_percent: Number(review.combined_audit_capability_percent ?? 0),
                ims_reduction_percent: integrationReduction,
                final_mandays: normalizedFinalMandays,
                calculation_basis: [
                    `Đồng bộ từ bản xem xét đăng ký ${application.application_code}.`,
                    `Tiêu chuẩn áp dụng: ${application.standard_name}.`,
                    `Review ID: ${review.id}.`,
                    Math.abs(normalizedFinalMandays - finalMandays) > 0.001
                        ? `MD lần đầu được chuẩn hóa từ ${finalMandays} thành ${normalizedFinalMandays} MD theo bước 0,5 MD.`
                        : null,
                    normalizedSplit.normalized
                        ? `Hệ thống đã chuẩn hóa phân bổ từ ${sourceStage1Mandays ?? '-'} / ${sourceStage2Mandays ?? '-'} thành Stage 1 = ${stage1Mandays} MD và Stage 2 = ${stage2Mandays} MD theo giới hạn tối thiểu.`
                        : null,
                    review.conclusion ? `Kết luận: ${review.conclusion}` : null,
                ].filter(Boolean).join(' '),
                status: 'approved',
                calculated_by: calculatedBy ?? review.prepared_by_id ?? review.reviewer_id,
                approved_by: review.checker_id ?? review.approver_id ?? calculatedBy,
                calculated_at: review.created_at,
                approved_at: review.approved_at ?? review.checked_at ?? now,
                adjustments: adjustments.length
                    ? {
                        create: adjustments.map((adjustment) => ({
                            adjustment_type: adjustment.adjustment_type,
                            factor_code: adjustment.factor_code,
                            percentage: adjustment.percentage,
                            reason: adjustment.reason,
                        })),
                    }
                    : undefined,
            },
            include: this.includeRelations,
        });

        return {
            created: true,
            message: 'Đã đồng bộ bản tính man-day từ bản xem xét đăng ký.',
            calculation,
        };
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
                    standard_type: this.compactStandardType(mergedDto.standard_type),
                    effective_personnel:
                        mergedDto.effective_personnel,
                    total_sites: result.totalSites,
                    sampled_sites: result.sampledSites,
                    complexity_level:
                        mergedDto.complexity_level,
                    base_mandays: result.roundedBaseMandays,
                    stage1_mandays:
                        result.stage1Mandays,
                    stage2_mandays:
                        result.stage2Mandays,
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