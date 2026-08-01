import {
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class ResetUserPasswordDto {
    @ApiProperty({
        example: 'NewStrongPassword@2026',
        minLength: 8,
        writeOnly: true,
    })
    @IsString()
    @MinLength(8)
    @MaxLength(100)
    new_password!: string;
}
