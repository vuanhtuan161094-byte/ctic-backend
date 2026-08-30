import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    CUSTOMER_DOCUMENT_CATEGORIES,
} from './create-customer-document-request.dto';

export class UploadCustomerApplicationDocumentDto {
    @IsIn(CUSTOMER_DOCUMENT_CATEGORIES)
    category!: (typeof CUSTOMER_DOCUMENT_CATEGORIES)[number];

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;
}
