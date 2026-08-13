import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
    IsDateString,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export class CreateCertificationBodyCapabilityDto {
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
    notes?: string;
}

export class UpdateCertificationBodyCapabilityDto extends PartialType(
    CreateCertificationBodyCapabilityDto,
) { }
