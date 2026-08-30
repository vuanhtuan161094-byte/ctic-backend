import {
    ArrayUnique,
    IsArray,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

import {
    ApiProperty,
} from '@nestjs/swagger';

export class UpdateUserPermissionOverridesDto {
    @ApiProperty({
        type: [String],
        example: [
            'reports.manage',
        ],
    })
    @IsArray()
    @ArrayUnique()
    @IsString({
        each: true,
    })
    allow_permissions!: string[];

    @ApiProperty({
        type: [String],
        example: [
            'technical_reviews.perform',
        ],
    })
    @IsArray()
    @ArrayUnique()
    @IsString({
        each: true,
    })
    deny_permissions!: string[];

    @ApiProperty({
        example: 'Giới hạn phạm vi công việc theo phân công nội bộ',
        minLength: 3,
        maxLength: 500,
    })
    @IsString()
    @MinLength(3)
    @MaxLength(500)
    reason!: string;
}
