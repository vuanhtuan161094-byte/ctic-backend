import {
    IsDateString,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCorrectiveActionDto {
    @ApiProperty({
        example: 'Nhân viên chưa cập nhật tài liệu mới tại khu vực sản xuất.',
        description: 'Phân tích nguyên nhân gốc rễ',
    })
    @IsString()
    @IsNotEmpty()
    root_cause!: string;

    @ApiProperty({
        example: 'Đã thu hồi bản cũ và thay bằng tài liệu đúng phiên bản.',
        description: 'Hành động sửa chữa tức thời',
    })
    @IsString()
    @IsNotEmpty()
    correction!: string;

    @ApiProperty({
        example: 'Rà soát tài liệu hiện trường và kiểm tra định kỳ hàng tháng.',
        description: 'Kế hoạch hành động khắc phục',
    })
    @IsString()
    @IsNotEmpty()
    corrective_action_plan!: string;

    @ApiPropertyOptional({
        example: 'Trưởng phòng Chất lượng',
        description: 'Người chịu trách nhiệm',
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    responsible_person?: string;

    @ApiPropertyOptional({
        example: '2027-06-20',
        description: 'Ngày dự kiến hoàn thành',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    target_date?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        example: {
            customer_comment: 'Đã hoàn thành và gửi bằng chứng.',
        },
        description: 'Nội dung bổ sung do khách hàng cung cấp',
    })
    @IsOptional()
    @IsObject()
    custom_content?: Record<string, unknown>;
}
