import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class ApplicationReviewIndustryScopeDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    isic_code_id!: string;

    @ApiProperty({ example: '2220' })
    @IsString()
    @MaxLength(30)
    isic_code!: string;

    @ApiProperty({ example: 'ISIC_REV_4' })
    @IsString()
    @MaxLength(30)
    isic_revision!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(500)
    isic_title!: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    isic_nace_mapping_id!: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    nace_code_id!: string;

    @ApiProperty({ example: '22.29' })
    @IsString()
    @MaxLength(30)
    nace_code!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(500)
    nace_title!: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    nace_iaf_mapping_id!: string;

    @ApiProperty({ example: '14' })
    @IsString()
    @MaxLength(20)
    iaf_code!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(500)
    iaf_name!: string;

    @ApiProperty({ enum: ['QMS', 'EMS', 'OHSMS'] })
    @IsIn(['QMS', 'EMS', 'OHSMS'])
    management_system!: 'QMS' | 'EMS' | 'OHSMS';

    @ApiProperty()
    @IsString()
    scope_description!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_primary?: boolean;
}
