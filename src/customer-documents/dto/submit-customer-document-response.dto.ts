import {
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class SubmitCustomerDocumentResponseDto {
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;
}
