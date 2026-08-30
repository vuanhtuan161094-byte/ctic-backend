import {
    IsEmail,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCustomerPortalUserDto {
    @ApiProperty({
        example: 'Nguyễn Văn A',
        maxLength: 100,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    full_name!: string;

    @ApiProperty({
        example: 'contact@customer.vn',
        maxLength: 255,
    })
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @ApiPropertyOptional({
        example: 'customer.nguyenvana',
        description: 'Để trống để CMP tự tạo từ email.',
        minLength: 3,
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    username?: string;
}
