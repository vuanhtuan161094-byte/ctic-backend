import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class SurveillanceSiteDto {
    @IsInt()
    @Min(1)
    site_no!: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    site_name?: string;

    @IsString()
    address!: string;

    @IsOptional()
    @IsString()
    activities?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    employee_count?: number;

    @IsOptional()
    @IsBoolean()
    is_headquarters?: boolean;
}

export class SurveillanceInformationDataDto {
    @IsOptional() @IsString() @MaxLength(255) company_name?: string;
    @IsOptional() @IsString() @MaxLength(255) company_name_en?: string;
    @IsOptional() @IsString() @MaxLength(2) country_code?: string;
    @IsOptional() @IsString() @MaxLength(100) country_name?: string;
    @IsOptional() @IsString() @MaxLength(30) tax_code?: string;
    @IsOptional() @IsString() registered_address?: string;
    @IsOptional() @IsString() headquarters_address?: string;

    @IsOptional() @IsString() @MaxLength(100) representative_name?: string;
    @IsOptional() @IsString() @MaxLength(100) representative_position?: string;
    @IsOptional() @IsString() @MaxLength(30) representative_phone?: string;
    @IsOptional() @IsString() @MaxLength(255) representative_email?: string;

    @IsOptional() @IsString() @MaxLength(100) contact_name?: string;
    @IsOptional() @IsString() @MaxLength(100) contact_position?: string;
    @IsOptional() @IsString() @MaxLength(30) contact_phone?: string;
    @IsOptional() @IsString() @MaxLength(255) contact_email?: string;

    @IsOptional() @IsString() @MaxLength(500) standard_name?: string;
    @IsOptional() @IsString() certification_scope?: string;
    @IsOptional() @IsString() @MaxLength(500) excluded_clauses?: string;

    @IsOptional() @IsInt() @Min(0) site_count?: number;
    @IsOptional() @IsInt() @Min(0) total_employee_count?: number;
    @IsOptional() @IsInt() @Min(0) employee_count?: number;
    @IsOptional() @IsInt() @Min(0) shift_count?: number;

    @IsOptional() @IsBoolean() external_provider_used?: boolean;
    @IsOptional() @IsString() outsourced_processes?: string;
    @IsOptional() @IsString() management_system_details?: string;
    @IsOptional() @IsString() @MaxLength(255) certificate_languages?: string;
    @IsOptional() @IsString() other_requests?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SurveillanceSiteDto)
    sites?: SurveillanceSiteDto[];
}

export class SaveSurveillanceInformationDto {
    @IsObject()
    @ValidateNested()
    @Type(() => SurveillanceInformationDataDto)
    data!: SurveillanceInformationDataDto;

    @IsOptional()
    @IsIn(['KEEP_CURRENT', 'RECALCULATED'])
    manday_decision?: 'KEEP_CURRENT' | 'RECALCULATED';

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.5)
    effective_mandays?: number;

    @IsOptional()
    @IsString()
    note?: string;
}
