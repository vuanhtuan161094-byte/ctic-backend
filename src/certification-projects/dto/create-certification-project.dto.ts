import {
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

export class CreateCertificationProjectDto {
    @ApiProperty({
        example: '9f362772-f609-4c76-a2dc-0bf4301a1b5b',
        description: 'UUID hồ sơ đăng ký đã được chấp nhận',
        format: 'uuid',
    })
    @IsUUID()
    @IsNotEmpty()
    application_id!: string;

    @ApiPropertyOptional({
        example: '36dc9d7a-1bea-4b37-882a-ef8da82c8d1e',
        description: 'UUID hợp đồng liên quan',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    contract_id?: string;

    @ApiPropertyOptional({
        example: 'cbf05033-9f09-4daa-8b89-859a500685bc',
        description: 'UUID thỏa thuận chứng nhận liên quan',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    agreement_id?: string;

    @ApiProperty({
        example: 'PRJ-2026-0002',
        description: 'Mã dự án chứng nhận duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    project_code!: string;

    @ApiPropertyOptional({
        example: 'ISO 14001:2015',
        description: 'Tiêu chuẩn áp dụng; mặc định lấy từ hồ sơ đăng ký',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    standard_name?: string;
}
