import {
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'auditor01' })
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    @Matches(/^[A-Za-z0-9._-]+$/, {
        message:
            'Username chỉ được chứa chữ, số, dấu chấm, gạch ngang và gạch dưới',
    })
    username?: string;

    @ApiPropertyOptional({ example: 'auditor.updated@example.com' })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @ApiPropertyOptional({ example: 'Nguyễn Văn Chuyên gia' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    full_name?: string;

    @ApiPropertyOptional({
        enum: ['active', 'inactive', 'locked'],
        example: 'active',
    })
    @IsOptional()
    @IsString()
    @IsIn([
        'active',
        'inactive',
        'locked',
    ])
    status?: string;
}
