import {
    IsArray,
    IsString,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class UpdateRolePermissionsDto {
    @ApiProperty({
        type: [String],
        example: [
            'reports.read',
            'reports.manage',
            'documents.manage',
        ],
    })
    @IsArray()
    @IsString({
        each: true,
    })
    permission_names!: string[];
}
