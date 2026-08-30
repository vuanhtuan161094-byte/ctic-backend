import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class ReviewCustomerOrganizationChangeRequestDto {
    @IsIn(['APPROVE', 'REJECT'])
    decision!: 'APPROVE' | 'REJECT';

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    comment?: string;
}
