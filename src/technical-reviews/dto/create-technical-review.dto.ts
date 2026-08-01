import {
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateTechnicalReviewDto {
    @ApiProperty({
        example: '225a2ae7-4994-42f4-bc15-f64b00e3a7b4',
        description: 'UUID báo cáo đánh giá cần thẩm xét',
        format: 'uuid',
    })
    @IsUUID()
    report_id!: string;

    @ApiProperty({
        example: '9c6f2ad7-1e63-4ae4-a1de-316ee0794613',
        description: 'UUID người thẩm xét kỹ thuật',
        format: 'uuid',
    })
    @IsUUID()
    reviewer_id!: string;

    @ApiPropertyOptional({
        example: 'Hồ sơ được tiếp nhận để thẩm xét kỹ thuật.',
        description: 'Nhận xét chung ban đầu',
    })
    @IsOptional()
    @IsString()
    general_comment?: string;
}
