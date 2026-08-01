import {
    IsIn,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateReviewItemDto {
    @ApiProperty({
        example: 'accepted',
        enum: [
            'revision_required',
            'resubmitted',
            'accepted',
        ],
        description: 'Trạng thái hạng mục thẩm xét',
    })
    @IsIn([
        'revision_required',
        'resubmitted',
        'accepted',
    ])
    status!: string;

    @ApiPropertyOptional({
        example: 'Tài liệu đã đáp ứng yêu cầu thẩm xét.',
        description: 'Ý kiến người thẩm xét',
    })
    @IsOptional()
    @IsString()
    reviewer_comment?: string;

    @ApiPropertyOptional({
        example: 'Đã cập nhật tài liệu theo yêu cầu.',
        description: 'Ghi chú khi nộp lại tài liệu',
    })
    @IsOptional()
    @IsString()
    submitted_note?: string;
}
