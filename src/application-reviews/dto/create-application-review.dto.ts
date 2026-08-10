import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

import { ApplicationReviewItemDto } from './application-review-item.dto';

class IndustryScopeDto {
    @IsUUID()
    isic_code_id!: string;

    @IsString()
    @MaxLength(30)
    isic_code!: string;

    @IsString()
    @MaxLength(30)
    isic_revision!: string;

    @IsString()
    @MaxLength(500)
    isic_title!: string;

    @IsUUID()
    isic_nace_mapping_id!: string;

    @IsUUID()
    nace_code_id!: string;

    @IsString()
    @MaxLength(30)
    nace_code!: string;

    @IsString()
    @MaxLength(500)
    nace_title!: string;

    @IsUUID()
    nace_iaf_mapping_id!: string;

    @IsString()
    @MaxLength(30)
    iaf_code!: string;

    @IsString()
    @MaxLength(300)
    iaf_name!: string;

    @IsIn(['QMS', 'EMS', 'OHSMS'])
    management_system!: 'QMS' | 'EMS' | 'OHSMS';

    @IsString()
    @MaxLength(2000)
    scope_description!: string;

    @IsOptional()
    @IsBoolean()
    is_primary?: boolean;
}

export class CreateApplicationReviewDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    application_id!: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID()
    reviewer_id?: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'Tài khoản được phân công kiểm tra kỹ thuật' })
    @IsOptional()
    @IsUUID()
    checker_user_id?: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'Tài khoản được phân công phê duyệt xem xét' })
    @IsOptional()
    @IsUUID()
    approver_user_id?: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    review_date?: string;

    @ApiProperty({ enum: ['ACCEPTED', 'REJECTED', 'NEED_MORE_INFO'] })
    @IsIn(['ACCEPTED', 'REJECTED', 'NEED_MORE_INFO'])
    result!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    comment?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ApplicationReviewItemDto)
    review_items?: ApplicationReviewItemDto[];

    @IsOptional()
    @IsString()
    audit_field?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    iaf_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    isic_code?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IndustryScopeDto)
    industry_scopes?: IndustryScopeDto[];

    @IsOptional()
    @IsUUID()
    proposed_auditor_id?: string;

    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    proposed_auditor_ids?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ims_integration_criteria?: string[];

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    ims_integration_percent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    combined_audit_capability_percent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    effective_personnel?: number;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    risk_level?: string;

    @IsOptional()
    @IsIn(['IAF_MD5', 'IAF_MD11', 'OTHER'])
    manday_method?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    base_mandays?: number;

    @IsOptional()
    @IsString()
    increase_factors?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    increase_percent?: number;

    @IsOptional()
    @IsString()
    reduction_factors?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(30)
    reduction_percent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(20)
    integration_reduction_percent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    final_mandays?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    stage1_mandays?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    stage2_mandays?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    surveillance_mandays?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    recertification_mandays?: number;

    @IsOptional()
    @IsDateString()
    stage1_proposed_date?: string;

    @IsOptional()
    @IsDateString()
    stage2_proposed_date?: string;

    @IsOptional()
    @IsDateString()
    surveillance1_date?: string;

    @IsOptional()
    @IsDateString()
    surveillance2_date?: string;

    @IsOptional()
    @IsDateString()
    recertification_date?: string;

    @IsOptional()
    @IsString()
    conclusion?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    client_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    checked_by_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    approved_by_name?: string;
}
