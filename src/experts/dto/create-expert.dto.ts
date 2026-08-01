import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateExpertDto {
    @ApiProperty({
        example: 'Nguyễn Văn Chuyên gia',
        description: 'Họ và tên chuyên gia',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    full_name!: string;

    @ApiPropertyOptional({
        example: 'auditor@ctic.vn',
        description: 'Email chuyên gia',
        format: 'email',
        maxLength: 255,
    })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @ApiPropertyOptional({
        example: '0901234567',
        description: 'Số điện thoại',
        maxLength: 20,
    })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @ApiPropertyOptional({
        example: 'active',
        enum: [
            'active',
            'inactive',
        ],
        default: 'active',
        description: 'Trạng thái hoạt động',
    })
    @IsOptional()
    @IsIn([
        'active',
        'inactive',
    ])
    status?: string;
}
