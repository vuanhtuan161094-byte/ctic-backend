import {
    ArrayNotEmpty,
    IsArray,
    IsString,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserRolesDto {
    @ApiProperty({ type: [String], example: ['auditor'] })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({
        each: true,
    })
    role_names!: string[];
}
