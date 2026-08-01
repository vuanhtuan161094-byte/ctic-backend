import {
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'auditor.updated@ctic.vn' })
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
