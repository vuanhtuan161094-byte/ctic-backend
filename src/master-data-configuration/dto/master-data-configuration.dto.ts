import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    IsUrl,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    CONFIGURABLE_NUMBERING_ENTITY_TYPES,
} from '../numbering-runtime-policy';

export class CreateSchemeDto {
    @IsString() @IsNotEmpty() @MaxLength(100) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    code!: string;
    @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
    @IsOptional() @IsDateString() effective_from?: string;
    @IsOptional() @IsDateString() effective_to?: string;
    @IsOptional() @IsString() @MaxLength(1000) accreditation_metadata?: string;
}

export class UpdateSchemeDto extends PartialType(CreateSchemeDto) { }

export class CreateStandardEditionDto {
    @IsUUID() scheme_id!: string;
    @IsString() @IsNotEmpty() @MaxLength(100) standard_code!: string;
    @IsString() @IsNotEmpty() @MaxLength(255) standard_name!: string;
    @IsString() @IsNotEmpty() @MaxLength(50) edition!: string;
    @IsDateString() effective_from!: string;
    @IsOptional() @IsDateString() withdrawn_at?: string;
    @IsOptional() @IsUUID() superseded_by_id?: string;
    @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'SUPERSEDED', 'WITHDRAWN']) status?: string;
}

export class UpdateStandardEditionDto extends PartialType(CreateStandardEditionDto) { }

export class CreateSchemeConfigurationDto {
    @IsUUID() scheme_id!: string;
    @Type(() => Number) @IsInt() @Min(1) version_no!: number;
    @IsDateString() effective_from!: string;
    @IsOptional() @IsDateString() effective_to?: string;
    @Type(() => Number) @IsInt() @Min(1) cycle_duration_months!: number;
    @Type(() => Number) @IsInt() @Min(1) surveillance_frequency_months!: number;
    @IsBoolean() stage1_applicable!: boolean;
    @Type(() => Number) @IsInt() @Min(1) validity_duration_months!: number;
    @Type(() => Number) @IsInt() @Min(0) renewal_window_days!: number;
    @Type(() => Number) @IsInt() @Min(0) reminder_lead_days!: number;
    @IsArray() @ArrayNotEmpty() @IsString({ each: true }) required_audit_types!: string[];
    @IsArray() @ArrayNotEmpty() @IsString({ each: true }) required_decision_types!: string[];
}

export class OrganizationProfileDto {
    @IsString() @IsNotEmpty() @MaxLength(255) legal_name!: string;
    @IsString() @IsNotEmpty() @MaxLength(255) display_name!: string;
    @IsString() @IsNotEmpty() @MaxLength(50) short_name!: string;
    @IsOptional() @IsString() @MaxLength(500) logo_reference?: string;
    @IsOptional() @IsString() @MaxLength(1000) address?: string;
    @IsOptional() @IsEmail() @MaxLength(255) email?: string;
    @IsOptional() @IsString() @MaxLength(50) phone?: string;
    @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(255) website?: string;
    @IsOptional() @IsString() @MaxLength(1000) document_footer?: string;
    @IsString() @IsNotEmpty() @MaxLength(255) portal_title!: string;
    @IsString() @IsNotEmpty() @MaxLength(100) timezone!: string;
    @IsString() @IsNotEmpty() @MaxLength(20) locale!: string;
    @IsIn(['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']) date_format!: string;
    @IsString() @IsNotEmpty() @MaxLength(10) default_language!: string;
    @Type(() => Number) @IsInt() @Min(0) @Max(3650) certificate_reminder_days!: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(0) file_retention_days?: number;
}

export class CreateNumberingSeriesDto {
    @IsIn([...CONFIGURABLE_NUMBERING_ENTITY_TYPES])
    entity_type!: string;
    @IsString() @IsNotEmpty() @MaxLength(50) @Matches(/^[A-Z0-9._/-]+$/)
    prefix!: string;
    @Type(() => Number) @IsInt() @Min(3) @Max(12) padding!: number;
    @IsDateString() effective_from!: string;
    @IsOptional() @IsDateString() effective_to?: string;
}

export class ReplaceNumberingSeriesDto {
    @IsString() @IsNotEmpty() @MaxLength(50) @Matches(/^[A-Z0-9._/-]+$/)
    prefix!: string;
    @Type(() => Number) @IsInt() @Min(3) @Max(12) padding!: number;
    @IsDateString() effective_from!: string;
    @IsOptional() @IsDateString() effective_to?: string;
    @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class EndNumberingSeriesDto {
    @IsDateString() effective_to!: string;
    @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class CancelScheduledNumberingSeriesDto {
    @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class ImportUploadDto {
    @IsIn(['SCHEME', 'STANDARD_EDITION', 'IAF_SCOPE', 'INDUSTRY_CLASSIFICATION', 'ISIC_NACE_MAPPING', 'NACE_IAF_MAPPING'])
    entity_type!: string;
    @IsOptional() @IsIn(['CREATE_ONLY']) import_mode?: string;
}
