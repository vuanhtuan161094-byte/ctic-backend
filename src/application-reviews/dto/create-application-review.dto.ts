import {
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';


export class CreateApplicationReviewDto {

    @ApiProperty({
        example: '9f362772-f609-4c76-a2dc-0bf4301a1b5b',
        description: 'UUID của hồ sơ đăng ký cần xem xét',
        format: 'uuid',
    })
    @IsUUID()
    @IsNotEmpty()
    application_id!: string;


    @ApiPropertyOptional({
        example: '9c6f2ad7-1e63-4ae4-a1de-316ee0794613',
        description: 'UUID người thực hiện xem xét',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    reviewer_id?: string;


    @ApiPropertyOptional({
        example: '2026-08-02',
        description: 'Ngày xem xét; mặc định là thời điểm hiện tại',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    review_date?: string;


    @ApiProperty({
        example: 'ACCEPTED',
        description: 'Kết quả xem xét hồ sơ',
        enum: [
            'ACCEPTED',
            'REJECTED',
            'NEED_MORE_INFO',
        ],
        maxLength: 30,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    result!: string;


    @ApiPropertyOptional({
        example: 'Hồ sơ đáp ứng yêu cầu để triển khai chứng nhận.',
        description: 'Nhận xét của người xem xét',
    })
    @IsOptional()
    @IsString()
    comment?: string;

}
