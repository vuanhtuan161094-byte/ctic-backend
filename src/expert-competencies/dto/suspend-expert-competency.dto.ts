import {
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendExpertCompetencyDto {
    @ApiProperty({
        example: 'Năng lực hết hiệu lực hoặc cần đánh giá lại.',
        description: 'Lý do đình chỉ năng lực',
    })
    @IsString()
    @IsNotEmpty()
    reason!: string;
}
