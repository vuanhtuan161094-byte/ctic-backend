import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class ReviewCustomerDocumentRequestDto {
    @IsIn(['ACCEPT', 'REVISION_REQUIRED'])
    decision!: 'ACCEPT' | 'REVISION_REQUIRED';

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    comment?: string;
}
