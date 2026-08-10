import {
    IsArray,
    IsDateString,
    IsIn,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class SaveTechnicalReviewWorkspaceDto {
    @ApiProperty({
        example: '2026-08-06',
        description: 'Ngày lập/thực hiện thẩm xét kỹ thuật',
        format: 'date',
    })
    @IsDateString()
    review_date!: string;

    @ApiPropertyOptional({
        example: 'Tiếng Việt',
        description: 'Ngôn ngữ đánh giá thể hiện trên F.11-P.09',
    })
    @IsOptional()
    @IsString()
    audit_language?: string;

    @ApiProperty({
        description: 'Kết quả các tiêu chí thẩm xét sơ bộ',
        type: 'array',
    })
    @IsArray()
    preliminary_criteria!: Array<{
        key: string;
        result: 'yes' | 'no' | 'not_applicable' | 'pending';
        comment?: string;
    }>;

    @ApiProperty({
        description: 'Kết quả các tiêu chí thẩm xét kỹ thuật',
        type: 'array',
    })
    @IsArray()
    technical_criteria!: Array<{
        key: string;
        result: 'yes' | 'no' | 'not_applicable' | 'pending';
        comment?: string;
    }>;

    @ApiPropertyOptional({
        description: 'Nhận xét khác tại phần thẩm xét sơ bộ',
    })
    @IsOptional()
    @IsString()
    preliminary_other_comment?: string;

    @ApiPropertyOptional({
        description: 'Nhận xét khác tại phần thẩm xét kỹ thuật',
    })
    @IsOptional()
    @IsString()
    technical_other_comment?: string;

    @ApiProperty({
        enum: [
            'certification_recommended',
            'certification_not_recommended',
        ],
        description: 'Kiến nghị cấp hoặc không cấp chứng nhận',
    })
    @IsIn([
        'certification_recommended',
        'certification_not_recommended',
    ])
    recommendation!: string;

    @ApiPropertyOptional({
        description: 'Nhận xét/đề nghị của bộ phận chứng nhận',
    })
    @IsOptional()
    @IsString()
    recommendation_comment?: string;

    @ApiPropertyOptional({
        description: 'Điều kiện kèm theo kiến nghị (nếu có)',
    })
    @IsOptional()
    @IsString()
    conditions?: string;
}
