import {
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

import {
    Type,
} from 'class-transformer';

import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateIndustryClassificationDto {
    @ApiProperty({ enum: ['ISIC', 'NACE'], example: 'ISIC' })
    @IsIn([
        'ISIC',
        'NACE',
    ])
    classification_type!: string;

    @ApiProperty({ example: 'ISIC_REV_4' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    revision!: string;

    @ApiProperty({ example: '2220' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    code!: string;

    @ApiProperty({ example: 'Manufacture of plastics products' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    title_en!: string;

    @ApiPropertyOptional({ example: 'Sản xuất sản phẩm nhựa' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    title_vi?: string;

    @ApiPropertyOptional({ example: '22' })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    parent_code?: string;

    @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(5)
    level!: number;

    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional()
    @IsDateString()
    valid_from?: string;

    @ApiPropertyOptional({ example: '2030-12-31' })
    @IsOptional()
    @IsDateString()
    valid_to?: string;

    @ApiPropertyOptional({ default: true, example: true })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}

export class CreateIndustryCodeMappingDto {
    @ApiProperty({ format: 'uuid', example: '43e3ce00-5a82-45dd-a63c-573a81a1e2cc' })
    @IsUUID()
    source_code_id!: string;

    @ApiProperty({ format: 'uuid', example: '49583782-c44e-4115-9eed-6e8b33bb3a5f' })
    @IsUUID()
    target_code_id!: string;

    @ApiProperty({
        enum: ['EXACT', 'PARTIAL', 'ONE_TO_MANY', 'MANY_TO_ONE'],
        example: 'EXACT',
    })
    @IsIn([
        'EXACT',
        'PARTIAL',
        'ONE_TO_MANY',
        'MANY_TO_ONE',
    ])
    mapping_type!: string;

    @ApiPropertyOptional({ example: 'Ánh xạ ISIC 2220 sang NACE 22.29' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional()
    @IsDateString()
    valid_from?: string;

    @ApiPropertyOptional({ example: '2030-12-31' })
    @IsOptional()
    @IsDateString()
    valid_to?: string;
}

export class CreateIafScopeDto {
    @ApiProperty({ example: '14' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    iaf_code!: string;

    @ApiProperty({ example: 'Rubber and plastic products' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    iaf_name!: string;

    @ApiPropertyOptional({ example: 'Phạm vi công nhận IAF 14' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ default: true, example: true })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}

export class CreateNaceIafMappingDto {
    @ApiProperty({ format: 'uuid', example: '49583782-c44e-4115-9eed-6e8b33bb3a5f' })
    @IsUUID()
    nace_code_id!: string;

    @ApiProperty({ format: 'uuid', example: 'b6f8d291-0d7d-4482-9c60-11b90df3c92c' })
    @IsUUID()
    iaf_scope_id!: string;

    @ApiProperty({
        enum: ['QMS', 'EMS', 'OHSMS', 'ISMS', 'ENERGY'],
        example: 'EMS',
    })
    @IsIn([
        'QMS',
        'EMS',
        'OHSMS',
        'ISMS',
        'ENERGY',
    ])
    management_system!: string;

    @ApiPropertyOptional({ example: 'IAF ID 1:2020' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    source_document?: string;

    @ApiPropertyOptional({ example: 'NACE 22.29 thuộc IAF 14' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional()
    @IsDateString()
    valid_from?: string;

    @ApiPropertyOptional({ example: '2030-12-31' })
    @IsOptional()
    @IsDateString()
    valid_to?: string;
}
