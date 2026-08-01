import { Type } from 'class-transformer';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

import {
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

export class AuditProgramEventDto {
    @ApiPropertyOptional({
        example: 1,
        minimum: 1,
        description: 'Thứ tự sự kiện trong chương trình',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    sequence_no?: number;

    @ApiProperty({
        example: 'surveillance1',
        description: 'Loại sự kiện đánh giá',
    })
    @IsString()
    @IsNotEmpty()
    event_type!: string;

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
        example: '2027-06-01',
        description: 'Ngày bắt đầu thực tế',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    actual_start_date?: string | null;

    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày kết thúc thực tế',
        format: 'date',
        nullable: true,
    })
    @IsOptional()
    @IsDateString()
    actual_end_date?: string | null;

    @ApiPropertyOptional({
        example: 1.5,
        minimum: 0,
        description: 'Ngày công dự kiến',
        nullable: true,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber({
        maxDecimalPlaces: 2,
    })
    @Min(0)
    planned_mandays?: number | null;

    @ApiPropertyOptional({
        example: 1.5,
        minimum: 0,
        description: 'Ngày công thực tế',
        nullable: true,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber({
        maxDecimalPlaces: 2,
    })
    @Min(0)
    actual_mandays?: number | null;

    @ApiPropertyOptional({
        example: 'planned',
        description: 'Trạng thái sự kiện',
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        example: {
            audit_purpose: 'Đánh giá giám sát lần 1',
            has_certification_changes: false,
        },
        description: 'Dữ liệu biểu mẫu mở rộng của sự kiện',
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    form_data?: Record<string, unknown> | null;
}

export class CreateAuditProgramDto {
    @ApiProperty({
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
        description: 'UUID dự án chứng nhận',
        format: 'uuid',
    })
    @IsUUID()
    project_id!: string;

    @ApiProperty({
        example: 2027,
        minimum: 2000,
        maximum: 2100,
        description: 'Năm của chương trình đánh giá',
    })
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    program_year!: number;

    @ApiPropertyOptional({
        example: 'CUST002',
        description: 'Mã khách hàng; có thể tự lấy từ dự án',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    customer_code?: string | null;

    @ApiPropertyOptional({
        example: 'Công ty TNHH XYZ',
        description: 'Tên tổ chức; có thể tự lấy từ dự án',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    organization_name?: string;

    @ApiPropertyOptional({
        example: 'Hải Phòng, Việt Nam',
        description: 'Địa chỉ tổ chức',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    address?: string | null;

    @ApiPropertyOptional({
        example: 'ISO 14001:2015',
        description: 'Tiêu chuẩn áp dụng',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    standard_name?: string;

    @ApiPropertyOptional({
        example: 'Sản xuất sản phẩm nhựa',
        description: 'Phạm vi chứng nhận',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    certification_scope?: string;

    @ApiPropertyOptional({
        example: 120,
        minimum: 0,
        description: 'Số nhân sự hiệu lực',
        nullable: true,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    effective_personnel?: number | null;

    @ApiPropertyOptional({
        example: 'INITIAL',
        description: 'Loại chứng nhận',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    certification_type?: string;

    @ApiPropertyOptional({
        example: 1,
        minimum: 1,
        description: 'Số chu kỳ chứng nhận',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    cycle_number?: number;

    @ApiPropertyOptional({
        example: 'draft',
        description: 'Trạng thái chương trình',
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        description: 'Dữ liệu biểu mẫu mở rộng của chương trình',
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    form_data?: Record<string, unknown> | null;

    @ApiPropertyOptional({
        type: () => AuditProgramEventDto,
        isArray: true,
        description: 'Danh sách sự kiện đánh giá trong chương trình',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({
        each: true,
    })
    @Type(() => AuditProgramEventDto)
    events?: AuditProgramEventDto[];
}

export class CopyAuditProgramDto {
    @ApiProperty({
        example: 2028,
        minimum: 2000,
        maximum: 2100,
        description: 'Năm của chương trình mới',
    })
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    program_year!: number;

    @ApiPropertyOptional({
        example: 'draft',
        description: 'Trạng thái chương trình mới',
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        description: 'Dữ liệu biểu mẫu bổ sung khi sao chép',
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    form_data?: Record<string, unknown> | null;
}
