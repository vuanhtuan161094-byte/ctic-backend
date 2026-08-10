import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MandaySiteInputDto {
  @ApiPropertyOptional({ example: 'Trụ sở chính' })
  @IsOptional()
  @IsString()
  site_name?: string;

  @ApiPropertyOptional({ example: 75, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  employee_count?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_headquarters?: boolean;
}

export class SuggestMandayDto {
  @ApiProperty({
    example: ['ISO 9001:2015', 'ISO 14001:2015'],
    description: 'Các tiêu chuẩn hệ thống quản lý trong phạm vi đánh giá',
  })
  @IsArray()
  @IsString({ each: true })
  standards!: string[];

  @ApiProperty({ example: 120, minimum: 1 })
  @IsInt()
  @Min(1)
  effective_personnel!: number;

  @ApiPropertyOptional({
    example: 'initial',
    enum: ['initial', 'surveillance', 'recertification'],
    default: 'initial',
  })
  @IsOptional()
  @IsIn(['initial', 'surveillance', 'recertification'])
  audit_type?: 'initial' | 'surveillance' | 'recertification';

  @ApiPropertyOptional({
    example: 'medium',
    enum: ['high', 'medium', 'low', 'limited', 'special'],
  })
  @IsOptional()
  @IsIn(['high', 'medium', 'low', 'limited', 'special'])
  ems_complexity?: string;

  @ApiPropertyOptional({
    example: 'medium',
    enum: ['high', 'medium', 'low'],
  })
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  ohsms_complexity?: string;

  @ApiPropertyOptional({
    example: 'single',
    enum: ['single', 'sampling', 'non_sampling'],
    default: 'single',
  })
  @IsOptional()
  @IsIn(['single', 'sampling', 'non_sampling'])
  site_sampling_mode?: 'single' | 'sampling' | 'non_sampling';

  @ApiPropertyOptional({ type: () => MandaySiteInputDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MandaySiteInputDto)
  sites?: MandaySiteInputDto[];

  @ApiPropertyOptional({
    example: false,
    description: 'Hệ thống đã chứng minh hiệu lực trong cả chu kỳ để áp dụng 0,8√x khi tái chứng nhận',
  })
  @IsOptional()
  @IsBoolean()
  system_effective_over_cycle?: boolean;

  @ApiPropertyOptional({
    example: 50,
    minimum: 0,
    maximum: 50,
    description: 'Tỷ lệ giảm thời gian cho từng địa điểm được lấy mẫu, không quá 50%',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  sampled_site_reduction_percent?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  increase_percent?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 30 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  reduction_percent?: number;

  @ApiPropertyOptional({ example: 100, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ims_integration_percent?: number;

  @ApiPropertyOptional({ example: 50, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  combined_audit_capability_percent?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 20 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  ims_reduction_percent?: number;
}
