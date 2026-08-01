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

export class CreateAuditPlanDto {
    @ApiProperty({
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
        description: 'UUID dự án chứng nhận',
        format: 'uuid',
    })
    @IsUUID()
    project_id!: string;

    @ApiPropertyOptional({
        example: 'a5305c0d-6c2a-4936-a730-cd1b48daee5b',
        description: 'UUID sự kiện thuộc chương trình đánh giá',
        format: 'uuid',
        nullable: true,
    })
    @IsOptional()
    @IsUUID()
    audit_event_id?: string | null;

    @ApiPropertyOptional({
        example: 'surveillance1',
        description: 'Loại cuộc đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    audit_type?: string | null;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày bắt đầu dự kiến',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    planned_start_date?: string | null;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày kết thúc dự kiến',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    planned_end_date?: string | null;

    @ApiPropertyOptional({
        example: 'Nhà máy Công ty TNHH XYZ',
        description: 'Địa điểm đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    location?: string | null;

    @ApiPropertyOptional({
        example: 'Sản xuất sản phẩm nhựa',
        description: 'Phạm vi cuộc đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    audit_scope?: string | null;

    @ApiPropertyOptional({
        example: 'ISO 14001:2015',
        description: 'Chuẩn mực đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    audit_criteria?: string | null;

    @ApiPropertyOptional({
        example: 'Đánh giá việc duy trì và hiệu lực của hệ thống quản lý.',
        description: 'Mục tiêu cuộc đánh giá',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    audit_objectives?: string | null;

    @ApiPropertyOptional({
        example: 'draft',
        description: 'Trạng thái kế hoạch',
        default: 'draft',
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        description: 'Đoàn đánh giá, lịch chi tiết, phương pháp, hậu cần và dữ liệu biểu mẫu mở rộng',
        example: {
            audit_team: [],
            detailed_schedule: [],
            audit_methods: {
                onsite: true,
                remote: false,
                document_review: true,
            },
        },
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    form_data?: Record<string, unknown> | null;
}
