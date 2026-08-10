import {
    IsDateString,
    IsIn,
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

export class CreateAuditFindingDto {
    @ApiProperty({
        example: '225a2ae7-4994-42f4-bc15-f64b00e3a7b4',
        description: 'UUID báo cáo đánh giá',
        format: 'uuid',
    })
    @IsUUID()
    report_id!: string;

    @ApiProperty({
        example: 'minor_nc',
        enum: [
            'conformity',
            'observation',
            'ofi',
            'minor_nc',
            'major_nc',
        ],
        description: 'Loại phát hiện đánh giá',
    })
    @IsIn([
        'conformity',
        'observation',
        'ofi',
        'minor_nc',
        'major_nc',
    ])
    finding_type!: string;

    @ApiPropertyOptional({
        example: '7.5',
        description: 'Điều khoản tiêu chuẩn liên quan',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    clause?: string;

    @ApiPropertyOptional({
        example: 'Tổ chức phải kiểm soát thông tin dạng văn bản.',
        description: 'Yêu cầu của tiêu chuẩn',
    })
    @IsOptional()
    @IsString()
    requirement?: string;

    @ApiProperty({
        example: 'Một tài liệu tại bộ phận sản xuất chưa được kiểm soát phiên bản.',
        description: 'Mô tả điểm không phù hợp hoặc cơ hội cải tiến',
    })
    @IsString()
    @IsNotEmpty()
    description!: string;

    @ApiProperty({
        example: 'Hướng dẫn công việc tại máy số 01 không có số phiên bản.',
        description: 'Bằng chứng khách quan',
    })
    @IsString()
    @IsNotEmpty()
    objective_evidence!: string;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày phát hiện',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    detected_date?: string;

    @ApiPropertyOptional({
        example: '2027-06-30',
        description: 'Hạn hoàn thành hành động khắc phục',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    due_date?: string;
}
