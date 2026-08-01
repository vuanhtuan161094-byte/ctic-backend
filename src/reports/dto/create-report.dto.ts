import {
    IsDateString,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateReportDto {
    @ApiProperty({
        example: '6db25d8d-71d7-4458-a917-55b02b23fe93',
        description: 'UUID kế hoạch đánh giá',
        format: 'uuid',
    })
    @IsUUID()
    audit_plan_id!: string;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày lập báo cáo',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    report_date?: string | null;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày bắt đầu đánh giá thực tế',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    audit_start_date?: string | null;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày kết thúc đánh giá thực tế',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    audit_end_date?: string | null;

    @ApiPropertyOptional({
        example: 'nonconformities_found',
        description: 'Kết quả cuộc đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    audit_result?: string | null;

    @ApiPropertyOptional({
        example: 'Hệ thống được duy trì; cần hoàn thành hành động khắc phục.',
        description: 'Kết luận của đoàn đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    conclusion?: string | null;

    @ApiPropertyOptional({
        example: 'draft',
        description: 'Trạng thái báo cáo',
        default: 'draft',
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        description: 'Dữ liệu biểu mẫu báo cáo mở rộng',
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    form_data?: Record<string, unknown> | null;
}
