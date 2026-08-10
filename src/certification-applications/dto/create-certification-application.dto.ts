import { Transform, Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEmail,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

import { CertificationApplicationSiteDto } from './certification-application-site.dto';

export class CreateCertificationApplicationDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    @IsNotEmpty()
    customer_id!: string;

    @ApiProperty({ example: 'APP-2026-0003', maxLength: 50 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    application_code!: string;

    @ApiProperty({ example: '2026-08-01', format: 'date' })
    @IsDateString()
    @IsNotEmpty()
    application_date!: string;

    @ApiPropertyOptional({ example: 'INITIAL', maxLength: 50 })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    certification_type?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    other_certification_type?: string;

    @ApiProperty({ example: 'ISO 9001:2015', maxLength: 500 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    standard_name!: string;

    @ApiProperty({ example: 'Gia công cơ khí chính xác linh kiện ngũ kim.' })
    @IsString()
    @IsNotEmpty()
    certification_scope!: string;

    @ApiPropertyOptional({ example: '8.3', maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    excluded_clauses?: string;

    @ApiPropertyOptional({ maxLength: 255 })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    company_name_en?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    headquarters_address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    representative_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    representative_position?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    representative_phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    representative_fax?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    representative_email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    contact_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    contact_position?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    contact_phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    contact_fax?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    contact_email?: string;

    @ApiPropertyOptional({ minimum: 1, default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    site_count?: number;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    total_employee_count?: number;

    @ApiPropertyOptional({ minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    employee_count?: number;

    @ApiPropertyOptional({ minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    shift_count?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    shift1_count?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    shift2_count?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    shift3_count?: number;

    @IsOptional()
    @IsBoolean()
    external_provider_used?: boolean;

    @IsOptional()
    @IsString()
    outsourced_processes?: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    requested_audit_date?: string;

    @IsOptional()
    @IsDateString()
    stage1_requested_date?: string;

    @IsOptional()
    @IsDateString()
    stage2_requested_date?: string;

    @IsOptional()
    @IsBoolean()
    other_management_systems?: boolean;

    @IsOptional()
    @IsString()
    management_system_details?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    associated_documents?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(255)
    consultant_organization?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    consultant_name?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    certificate_languages?: string[];

    @IsOptional()
    @IsString()
    other_requests?: string;

    @IsBoolean()
    declaration_accepted!: boolean;

    @IsOptional()
    @IsArray()
    @Transform(({ value }) => Array.isArray(value)
        ? value.filter((site, index) => {
            if (index === 0) return true;
            const name = String(site?.site_name ?? '').trim();
            const address = String(site?.address ?? '').trim();
            const activities = String(site?.activities ?? '').trim();
            const employees = Number(site?.employee_count ?? 0);
            const generatedName = /^Địa điểm \d+$/i.test(name);
            return Boolean(address || activities || employees > 0 || (name && !generatedName));
        })
        : value)
    @ValidateNested({ each: true })
    @Type(() => CertificationApplicationSiteDto)
    sites?: CertificationApplicationSiteDto[];
}
