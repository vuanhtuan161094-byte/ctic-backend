import {
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';
import { MandayAdjustmentDto } from './manday-adjustment.dto';

export class CreateMandayCalculationDto {
    @ApiProperty({
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
        description: 'UUID dự án chứng nhận',
        format: 'uuid',
    })
    @IsUUID()
    project_id!: string;

    @ApiProperty({
        example: 'initial',
        enum: [
            'initial',
            'surveillance',
            'recertification',
            'transfer',
            'special',
        ],
        description: 'Loại đánh giá',
    })
    @IsIn([
        'initial',
        'surveillance',
        'recertification',
        'transfer',
        'special',
    ])
    audit_type!: string;

    @ApiProperty({
        example: 'ISO 14001:2015',
        description: 'Tiêu chuẩn hoặc hệ thống quản lý áp dụng',
    })
    @IsString()
    standard_type!: string;

    @ApiProperty({
        example: 120,
        minimum: 1,
        description: 'Số nhân sự hiệu lực dùng để tính man-day',
    })
    @IsInt()
    @Min(1)
    effective_personnel!: number;

    @ApiPropertyOptional({
        example: 1,
        minimum: 1,
        description: 'Tổng số địa điểm',
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    total_sites?: number;

    @ApiPropertyOptional({
        example: 1,
        minimum: 1,
        description: 'Số địa điểm được lấy mẫu',
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    sampled_sites?: number;

    @ApiPropertyOptional({
        example: 'medium',
        description: 'Mức độ phức tạp hoặc rủi ro',
    })
    @IsOptional()
    @IsString()
    complexity_level?: string;

    @ApiProperty({
        example: 4.5,
        minimum: 0.5,
        description: 'Số ngày công cơ sở trước điều chỉnh',
    })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.5)
    base_mandays!: number;

    @ApiPropertyOptional({
        example: 1,
        minimum: 0,
        description: 'Ngày công giai đoạn 1',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    stage1_mandays?: number;

    @ApiPropertyOptional({
        example: 3.5,
        minimum: 0,
        description: 'Ngày công giai đoạn 2',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    stage2_mandays?: number;

    @ApiPropertyOptional({
        example: 4,
        minimum: 0,
        description: 'Ngày công tại hiện trường',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    onsite_mandays?: number;

    @ApiPropertyOptional({
        example: 0.5,
        minimum: 0,
        description: 'Ngày công ngoài hiện trường',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    offsite_mandays?: number;

    @ApiPropertyOptional({
        example: 10,
        minimum: 0,
        maximum: 100,
        description: 'Tổng tỷ lệ tăng thời lượng',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    increase_percent?: number;

    @ApiPropertyOptional({
        example: 10,
        minimum: 0,
        maximum: 30,
        description: 'Tổng tỷ lệ giảm; không vượt quá 30%',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(30)
    reduction_percent?: number;

    @ApiPropertyOptional({
        example: 0,
        minimum: 0,
        maximum: 100,
        description: 'Mức độ tích hợp của hệ thống quản lý',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    ims_integration_percent?: number;

    @ApiPropertyOptional({
        example: 0,
        minimum: 0,
        maximum: 100,
        description: 'Khả năng thực hiện đánh giá kết hợp',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    combined_audit_capability_percent?: number;

    @ApiPropertyOptional({
        example: 0,
        minimum: 0,
        maximum: 20,
        description: 'Tỷ lệ giảm cho hệ thống quản lý tích hợp',
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(20)
    ims_reduction_percent?: number;

    @ApiPropertyOptional({
        example: 'Tính theo R.01 và quy mô 120 nhân sự.',
        description: 'Cơ sở tính toán và giải trình',
    })
    @IsOptional()
    @IsString()
    calculation_basis?: string;

    @ApiPropertyOptional({
        example: 'draft',
        enum: [
            'draft',
            'submitted',
            'rejected',
        ],
        default: 'draft',
        description: 'Trạng thái bản tính',
    })
    @IsOptional()
    @IsIn(['draft', 'submitted', 'rejected'])
    status?: string;

    @ApiPropertyOptional({
        type: () => MandayAdjustmentDto,
        isArray: true,
        description: 'Chi tiết từng yếu tố tăng hoặc giảm thời lượng',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MandayAdjustmentDto)
    adjustments?: MandayAdjustmentDto[];
}
