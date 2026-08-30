import {
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class UploadCustomerOrganizationChangeAttachmentDto {
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;
}
