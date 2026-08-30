import { Type } from 'class-transformer';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

import {
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateCertificationDecisionDto {
    @ApiProperty({
        example: '5389468f-a200-40fd-a2d2-4ca8c0db14a3',
        description: 'UUID hồ sơ thẩm xét kỹ thuật đã hoàn thành',
        format: 'uuid',
    })
    @IsUUID()
    technical_review_id!: string;

    @ApiProperty({
        example: '01/QD-CB/2026',
        description: 'Số quyết định chứng nhận duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    decision_number!: string;

    @ApiProperty({
        example: '2026-07-27',
        description: 'Ngày ban hành quyết định',
        format: 'date',
    })
    @IsDateString()
    decision_date!: string;

    @ApiPropertyOptional({
        example: 'GRANT',
        enum: [
            'GRANT',
            'MAINTAIN',
            'RECERTIFY',
            'AMEND',
            'EXTEND_SCOPE',
            'REDUCE_SCOPE',
            'SUSPEND',
            'RESTORE',
            'WITHDRAW',
            'REFUSE',
        ],
        description:
            'Loại quyết định lifecycle. Tạm thời có thể bỏ trống cho client Phase 0; backend sẽ suy luận theo loại cuộc đánh giá.',
    })
    @IsOptional()
    @IsString()
    @IsIn([
        'GRANT',
        'MAINTAIN',
        'RECERTIFY',
        'AMEND',
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
        'REFUSE',
    ])
    decision_type?: string;

    @ApiPropertyOptional({
        example: '8bc21d25-e60a-4b9d-b6a1-d95f54ef2697',
        description:
            'Certificate Series áp dụng cho quyết định duy trì, tái chứng nhận, sửa đổi hoặc trạng thái. Có thể bỏ trống khi project chỉ có một series phù hợp.',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    certificate_series_id?: string;

    @ApiProperty({
        example: 'approved',
        enum: [
            'approved',
            'rejected',
            'deferred',
        ],
        description: 'Kết quả quyết định chứng nhận',
    })
    @IsIn([
        'approved',
        'rejected',
        'deferred',
    ])
    decision_result!: string;

    @ApiPropertyOptional({
        example: 'Công ty TNHH XYZ',
        description: 'Tên tổ chức trên quyết định',
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
        example: 'Căn cứ kết quả đánh giá và quyết định của người có thẩm quyền.',
        description:
            'Lý do thay đổi bắt buộc khi chấp thuận AMEND, EXTEND_SCOPE hoặc REDUCE_SCOPE; luôn bắt buộc với SUSPEND, RESTORE và WITHDRAW.',
        maxLength: 1000,
    })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    change_reason?: string;

    @ApiPropertyOptional({
        example: '2026-07-27',
        description: 'Ngày bắt đầu hiệu lực',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    effective_date?: string;

    @ApiPropertyOptional({
        example: '2029-07-26',
        description: 'Ngày hết hiệu lực',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    expiry_date?: string;

    @ApiPropertyOptional({
        example: 12,
        minimum: 1,
        maximum: 36,
        description: 'Chu kỳ giám sát tính theo tháng',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(36)
    surveillance_interval_months?: number;

    @ApiProperty({
        example: 'HE YONG',
        description: 'Người ký quyết định',
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
        example: 'Quyết định chứng nhận lần đầu.',
        description: 'Ghi chú',
    })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        description: 'Nội dung tùy biến theo mẫu F.13-P.09',
    })
    @IsOptional()
    @IsObject()
    custom_content?: Record<string, unknown>;
}
