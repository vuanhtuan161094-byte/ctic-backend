import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { IndustryScopeDto } from './create-application-review.dto';

export class CapabilityPrecheckDto {
    @ApiProperty({ type: [String], description: 'Tiêu chuẩn/phiên bản đang chọn trong đơn đăng ký' })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    standard_names!: string[];

    @ApiProperty({ type: [IndustryScopeDto], required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IndustryScopeDto)
    industry_scopes?: IndustryScopeDto[];
}
