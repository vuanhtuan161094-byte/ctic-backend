import { Transform, Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

const moneyPattern = /^\d{1,15}(?:\.\d{1,4})?$/;

export class QuotationLineDto {
    @IsString() @IsNotEmpty() @MaxLength(1000) description!: string;
    @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) quantity!: string;
    @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) unit_price!: string;
}

export class CreateQuotationDto {
    @IsString() @IsNotEmpty() @MaxLength(50) quotation_number!: string;
    @IsUUID() customer_id!: string;
    @IsOptional() @IsUUID() application_id?: string;
    @IsOptional() @IsUUID() project_id?: string;
    @IsOptional() @IsUUID() scheme_id?: string;
    @IsDateString() quotation_date!: string;
    @IsOptional() @IsDateString() validity_date?: string;
    @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
    @IsOptional() @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) discount_amount?: string;
    @IsOptional() @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) tax_amount?: string;
    @IsOptional() @IsString() @MaxLength(4000) commercial_notes?: string;
    @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuotationLineDto)
    lines!: QuotationLineDto[];
}

export class UpdateQuotationDto {
    @IsOptional() @IsDateString() validity_date?: string;
    @IsOptional() @IsUUID() scheme_id?: string;
    @IsOptional() @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) discount_amount?: string;
    @IsOptional() @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) tax_amount?: string;
    @IsOptional() @IsString() @MaxLength(4000) commercial_notes?: string;
    @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuotationLineDto)
    lines?: QuotationLineDto[];
}

export class QuotationTransitionDto {
    @IsIn(['SUBMIT_REVIEW', 'APPROVE', 'SEND', 'ACCEPT', 'REJECT', 'CANCEL'])
    action!: string;
}

export class CreateBillingMilestoneDto {
    @IsUUID() contract_id!: string;
    @IsOptional() @IsUUID() project_id?: string;
    @IsIn(['CONTRACT_SIGNING', 'STAGE_1', 'STAGE_2', 'SURVEILLANCE', 'RECERTIFICATION', 'CERTIFICATE_ISSUANCE', 'CUSTOM'])
    milestone_type!: string;
    @IsString() @IsNotEmpty() @MaxLength(255) milestone_name!: string;
    @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) planned_amount!: string;
    @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
    @IsOptional() @IsDateString() planned_date?: string;
    @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class UpdateBillingMilestoneDto {
    @IsOptional() @IsString() @MaxLength(100) invoice_reference?: string;
    @IsOptional() @IsDateString() invoice_date?: string;
    @IsOptional() @Transform(({ value }) => String(value)) @IsString() @Matches(moneyPattern) paid_amount?: string;
    @IsOptional() @IsDateString() paid_date?: string;
    @IsOptional() @IsIn(['PLANNED', 'READY_TO_INVOICE', 'INVOICED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']) status?: string;
    @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReportingQueryDto {
    @IsOptional() @IsIn(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'QUARTER', 'YEAR', 'CUSTOM']) preset?: string;
    @IsOptional() @IsDateString() from?: string;
    @IsOptional() @IsDateString() to?: string;
    @IsOptional() @IsUUID() scheme_id?: string;
    @IsOptional() @IsUUID() customer_id?: string;
    @IsOptional() @IsUUID() expert_id?: string;
    @IsOptional() @IsString() @MaxLength(50) audit_type?: string;
    @IsOptional() @IsString() @MaxLength(50) status?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
