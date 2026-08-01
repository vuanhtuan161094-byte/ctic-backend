import {
    IsIn,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class ReviewCorrectiveActionDto {
    @ApiProperty({
        example: 'accepted',
        enum: [
            'accepted',
            'revision_required',
        ],
        description: 'Kết quả xem xét hành động khắc phục',
    })
    @IsIn([
        'accepted',
        'revision_required',
    ])
    review_result!: string;

    @ApiPropertyOptional({
        example: 'Nguyên nhân và hành động khắc phục phù hợp.',
        description: 'Ý kiến của chuyên gia xem xét',
    })
    @IsOptional()
    @IsString()
    review_comment?: string;
}
