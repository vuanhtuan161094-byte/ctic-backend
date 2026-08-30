import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCustomerUserAccessRequestDto {
    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID()
    customer_id?: string;

    @ApiProperty({ enum: ['ADD_USER', 'REVOKE_ACCESS', 'REACTIVATE_ACCESS'] })
    @IsString()
    @IsIn(['ADD_USER', 'REVOKE_ACCESS', 'REACTIVATE_ACCESS'])
    request_type!: 'ADD_USER' | 'REVOKE_ACCESS' | 'REACTIVATE_ACCESS';

    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf((dto: CreateCustomerUserAccessRequestDto) => dto.request_type !== 'ADD_USER')
    @IsUUID()
    target_user_id?: string;

    @ApiPropertyOptional({ example: 'portal.user@example.com' })
    @ValidateIf((dto: CreateCustomerUserAccessRequestDto) => dto.request_type === 'ADD_USER')
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
    @ValidateIf((dto: CreateCustomerUserAccessRequestDto) => dto.request_type === 'ADD_USER')
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    full_name?: string;

    @ApiProperty({ example: 'Bổ sung người phụ trách chứng nhận của công ty.' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    reason!: string;
}
