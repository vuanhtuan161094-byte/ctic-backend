import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ValidateIf,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class ReviewCustomerUserAccessRequestDto {
    @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
    @IsString()
    @IsIn(['APPROVE', 'REJECT'])
    decision!: 'APPROVE' | 'REJECT';

    @ApiPropertyOptional({ example: 'Đã xác minh yêu cầu với đầu mối khách hàng.' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    comment?: string;

    @ApiPropertyOptional({ example: 'customer.portal01' })
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    username?: string;

    @ApiPropertyOptional({ minLength: 8, writeOnly: true })
    @ValidateIf((dto: ReviewCustomerUserAccessRequestDto) => dto.temporary_password !== undefined)
    @IsString()
    @MinLength(8)
    @MaxLength(100)
    temporary_password?: string;
}
