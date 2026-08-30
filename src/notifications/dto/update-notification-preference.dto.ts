import {
    IsBoolean,
} from 'class-validator';
import {
    ApiProperty,
} from '@nestjs/swagger';

export class UpdateNotificationPreferenceDto {
    @ApiProperty({
        example: true,
    })
    @IsBoolean()
    enabled!: boolean;
}
