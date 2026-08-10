import {
    IsBoolean,
    IsDateString,
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateAuditResultNotificationDto {
    @ApiProperty({
        example: 'f842c677-f9ac-4ec3-972c-58ccf5e3d13e',
        description: 'UUID hồ sơ thẩm xét kỹ thuật đã hoàn thành',
        format: 'uuid',
    })
    @IsUUID()
    technical_review_id!: string;

    @ApiPropertyOptional({
        example: '1f2818f8-fde5-463e-a7f8-828b18ffd7a5',
        description: 'UUID quyết định chứng nhận; không bắt buộc khi giám sát không có thay đổi',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    certification_decision_id?: string;

    @ApiProperty({
        example: '02/TB-CB/2027',
        description: 'Số thông báo kết quả duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    notification_number!: string;

    @ApiProperty({
        example: '2027-06-25',
        description: 'Ngày ban hành thông báo',
        format: 'date',
    })
    @IsDateString()
    notification_date!: string;

    @ApiProperty({
        example: 'surveillance',
        enum: [
            'initial',
            'surveillance',
            'recertification',
            'special',
        ],
        description: 'Loại cuộc đánh giá',
    })
    @IsIn([
        'initial',
        'surveillance',
        'recertification',
        'special',
    ])
    audit_type!: string;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày bắt đầu đánh giá',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    audit_start_date?: string;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày kết thúc đánh giá',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    audit_end_date?: string;

    @ApiProperty({
        example: 'certification_maintained',
        enum: [
            'certification_granted',
            'certification_maintained',
            'certification_not_granted',
            'certification_suspended',
            'certification_withdrawn',
        ],
        description: 'Kết quả được thông báo cho khách hàng',
    })
    @IsIn([
        'certification_granted',
        'certification_maintained',
        'certification_not_granted',
        'certification_suspended',
        'certification_withdrawn',
    ])
    notification_result!: string;

    @ApiPropertyOptional({
        example: false,
        description: 'Có thay đổi thông tin chứng nhận hay không',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    has_certification_changes?: boolean;

    @ApiPropertyOptional({
        example: 'Công ty TNHH XYZ',
        description: 'Tên tổ chức',
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    organization_name?: string;

    @ApiPropertyOptional({
        example: 'Hải Phòng, Việt Nam',
        description: 'Địa chỉ tổ chức',
    })
    @IsOptional()
    @IsString()
    organization_address?: string;

    @ApiPropertyOptional({
        example: 'Công ty TNHH XYZ',
        description: 'Tên người hoặc đơn vị nhận thông báo',
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    recipient_name?: string;

    @ApiPropertyOptional({
        example: 'xyz@example.com',
        description: 'Email nhận thông báo',
        format: 'email',
        maxLength: 255,
    })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    recipient_email?: string;

    @ApiPropertyOptional({
        example: 'EMS',
        description: 'Hệ thống quản lý',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    management_system?: string;

    @ApiPropertyOptional({
        example: 'ISO 14001:2015',
        description: 'Tiêu chuẩn chứng nhận',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    standard_name?: string;

    @ApiPropertyOptional({
        example: 'Sản xuất sản phẩm nhựa',
        description: 'Phạm vi chứng nhận',
    })
    @IsOptional()
    @IsString()
    certification_scope?: string;

    @ApiPropertyOptional({
        example: '2028-06-01',
        description: 'Hạn dự kiến của cuộc đánh giá tiếp theo',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    next_audit_due_date?: string;

    @ApiProperty({
        example: 'HE YONG',
        description: 'Người ký thông báo',
        maxLength: 150,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    signatory_name!: string;

    @ApiProperty({
        example: 'Tổng Giám đốc',
        description: 'Chức danh người ký',
        maxLength: 150,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    signatory_title!: string;

    @ApiPropertyOptional({
        example: 'Duy trì hiệu lực chứng nhận sau đánh giá giám sát.',
        description: 'Ghi chú',
    })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        description: 'Nội dung tùy biến theo mẫu F.12-P.09',
    })
    @IsOptional()
    @IsObject()
    custom_content?: Record<string, unknown>;
}
