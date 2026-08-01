import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateTechnicalReviewReportDto {
    @ApiProperty({
        example: '2027-06-25',
        description: 'Ngày lập báo cáo thẩm xét',
        format: 'date',
    })
    @IsDateString()
    review_date!: string;

    @ApiProperty({
        example: 'Hồ sơ đầy đủ để thực hiện thẩm xét kỹ thuật.',
        description: 'Kết quả xem xét sơ bộ',
    })
    @IsString()
    @IsNotEmpty()
    preliminary_review_result!: string;

    @ApiProperty({
        example: 'Hồ sơ đánh giá và NC/CAP đáp ứng yêu cầu.',
        description: 'Kết quả thẩm xét kỹ thuật',
    })
    @IsString()
    @IsNotEmpty()
    technical_review_result!: string;

    @ApiProperty({
        example: 'Đủ cơ sở để đề nghị duy trì chứng nhận.',
        description: 'Kết luận thẩm xét',
    })
    @IsString()
    @IsNotEmpty()
    conclusion!: string;

    @ApiProperty({
        example: 'certification_recommended',
        enum: [
            'certification_recommended',
            'certification_not_recommended',
        ],
        description: 'Khuyến nghị chứng nhận',
    })
    @IsIn([
        'certification_recommended',
        'certification_not_recommended',
    ])
    recommendation!: string;

    @ApiPropertyOptional({
        example: 'Hoàn thành lưu hồ sơ trước khi ra quyết định.',
        description: 'Điều kiện kèm theo khuyến nghị',
    })
    @IsOptional()
    @IsString()
    conditions?: string;

    @ApiPropertyOptional({
        example: 'Không có ý kiến bổ sung.',
        description: 'Nhận xét bổ sung',
    })
    @IsOptional()
    @IsString()
    additional_comment?: string;
}
