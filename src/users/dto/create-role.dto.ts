import {
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';

import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateRoleDto {
    @ApiProperty({ example: 'quality_manager' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    @Matches(
        /^[A-Za-z][A-Za-z0-9_]*$/,
        {
            message:
                'Tên role chỉ được chứa chữ, số và dấu gạch dưới',
        },
    )
    role_name!: string;

    @ApiPropertyOptional({ example: 'Quản lý chất lượng' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;
}
