import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export class CreateCertificationBodyCapabilityDto {
    @ApiPropertyOptional({ format: 'uuid', description: 'Phiên bản tiêu chuẩn cụ thể, ví dụ ISO 9001:2015' })
    @IsOptional()
    @IsUUID()
    standard_edition_id?: string;

    @ApiProperty({ example: 'ISO_9001' })
    @IsString()
    @MaxLength(100)
    program_code!: string;

    @ApiProperty({ example: 'ISO 9001' })
    @IsString()
    @MaxLength(255)
    program_name!: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    iaf_scope_id!: string;

    @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: 'ACTIVE' | 'INACTIVE';

    @ApiProperty({ format: 'date' })
    @IsDateString()
    effective_from!: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    effective_to?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    notes?: string;
}

export class CreateCertificationBodyCapabilityBatchDto {
    @ApiProperty({ format: 'uuid', description: 'Phiên bản tiêu chuẩn được cấp năng lực' })
    @IsUUID()
    standard_edition_id!: string;

    @ApiProperty({ type: [String], description: 'Danh sách lĩnh vực IAF được cấp năng lực' })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @IsUUID('4', { each: true })
    iaf_scope_ids!: string[];

    @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: 'ACTIVE' | 'INACTIVE';

    @ApiProperty({ format: 'date' })
    @IsDateString()
    effective_from!: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    effective_to?: string;

    @ApiPropertyOptional({ description: 'Ghi chú hoặc tham chiếu chứng thư/phạm vi công nhận' })
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    notes?: string;
}

export class UpdateCertificationBodyCapabilityDto extends PartialType(
    CreateCertificationBodyCapabilityDto,
) { }
