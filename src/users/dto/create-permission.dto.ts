import {
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
    @ApiProperty({
        example: 'reports.read',
        description: 'Mã quyền theo cấu trúc module.hành_động',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @Matches(
        /^[A-Za-z][A-Za-z0-9_.-]*$/,
        {
            message:
                'Permission chỉ được chứa chữ, số, dấu chấm, gạch ngang và gạch dưới',
        },
    )
    permission_name!: string;
}
