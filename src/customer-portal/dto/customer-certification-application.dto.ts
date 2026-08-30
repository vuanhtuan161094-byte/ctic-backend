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

import {
    CertificationApplicationSiteDto,
} from '../../certification-applications/dto/certification-application-site.dto';

export class CustomerCertificationApplicationDto {
    @ApiPropertyOptional({
        format: 'uuid',
        description:
            'Chỉ cần khi tài khoản được gán cho nhiều tổ chức khách hàng. Backend luôn kiểm tra mapping trước khi sử dụng.',
    })
    @IsOptional()
    @IsUUID()
    customer_id?: string;

    @ApiProperty({ example: '2026-08-22', format: 'date' })
    @IsDateString()
    application_date!: string;

    @ApiPropertyOptional({ example: 'INITIAL', maxLength: 50 })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    certification_type?: string;

    @ApiProperty({ example: 'ISO 9001:2015', maxLength: 500 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    standard_name!: string;

    @ApiProperty({ example: 'Sản xuất và gia công linh kiện cơ khí.' })
    @IsString()
    @IsNotEmpty()
    certification_scope!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    headquarters_address?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    representative_name?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    representative_position?: string;

    @ApiPropertyOptional({ maxLength: 30 })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    representative_phone?: string;

    @ApiPropertyOptional({ maxLength: 255 })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    representative_email?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    contact_name?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    contact_position?: string;

    @ApiPropertyOptional({ maxLength: 30 })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    contact_phone?: string;

    @ApiPropertyOptional({ maxLength: 255 })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    contact_email?: string;

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

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    shift1_count?: number;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    shift2_count?: number;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    shift3_count?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    external_provider_used?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    outsourced_processes?: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    requested_audit_date?: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    stage1_requested_date?: string;

    @ApiPropertyOptional({ format: 'date' })
    @IsOptional()
    @IsDateString()
    stage2_requested_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    other_management_systems?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    management_system_details?: string;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    certificate_languages?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    other_requests?: string;

    @ApiProperty({ default: false })
    @IsBoolean()
    declaration_accepted!: boolean;

    @ApiPropertyOptional({
        type: [CertificationApplicationSiteDto],
    })
    @IsOptional()
    @IsArray()
    @Transform(({ value }) => Array.isArray(value)
        ? value.filter((site, index) => {
            if (index === 0) return true;
            const name = String(site?.site_name ?? '').trim();
            const address = String(site?.address ?? '').trim();
            const activities = String(site?.activities ?? '').trim();
            const employees = Number(site?.employee_count ?? 0);
            return Boolean(address || activities || employees > 0 || name);
        })
        : value)
    @ValidateNested({ each: true })
    @Type(() => CertificationApplicationSiteDto)
    sites?: CertificationApplicationSiteDto[];
}
