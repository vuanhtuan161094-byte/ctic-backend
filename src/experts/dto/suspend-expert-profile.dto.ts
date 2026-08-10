import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendExpertProfileDto {
    @ApiProperty({ description: 'Lý do tạm đình chỉ hồ sơ chuyên gia' })
    @IsString()
    @IsNotEmpty()
    reason!: string;
}
