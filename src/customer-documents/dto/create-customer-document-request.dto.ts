import {
    IsDateString,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';

export const CUSTOMER_DOCUMENT_CATEGORIES = [
    'LEGAL',
    'MANAGEMENT_SYSTEM',
    'SCOPE_SITE',
    'EMPLOYEE',
    'OTHER',
] as const;

export class CreateCustomerDocumentRequestDto {
    @IsUUID('4')
    application_id!: string;

    @IsIn(CUSTOMER_DOCUMENT_CATEGORIES)
    category!: (typeof CUSTOMER_DOCUMENT_CATEGORIES)[number];

    @IsString()
    @MinLength(3)
    @MaxLength(255)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    description?: string;

    @IsOptional()
    @IsDateString()
    due_date?: string;
}
