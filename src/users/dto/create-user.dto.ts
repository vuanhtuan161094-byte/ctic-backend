import {
    ArrayNotEmpty,
    IsArray,
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateUserDto {
    @ApiProperty({ example: 'auditor01' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    username!: string;

    @ApiProperty({ example: 'auditor01@example.com' })
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @ApiProperty({
        example: 'StrongPassword@2026',
        minLength: 8,
        writeOnly: true,
    })
    @IsString()
    @MinLength(8)
    @MaxLength(100)
    password!: string;

    @ApiPropertyOptional({ example: 'Nguyễn Văn Chuyên gia' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    full_name?: string;

    @ApiProperty({ type: [String], example: ['auditor'] })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({
        each: true,
    })
    role_names!: string[];
}
