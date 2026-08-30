import {
    IsEmail,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
    ValidateIf,
} from 'class-validator';

export class CreateCustomerOrganizationChangeRequestDto {
    @IsOptional()
    @IsUUID()
    customer_id?: string;

    @IsString()
    @MinLength(5)
    @MaxLength(2000)
    reason!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    company_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    tax_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @ValidateIf((_object, value) => value !== '')
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsUUID()
    contact_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    contact_full_name?: string;

    @IsOptional()
    @ValidateIf((_object, value) => value !== '')
    @IsEmail()
    @MaxLength(255)
    contact_email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    contact_phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    contact_position?: string;
}
