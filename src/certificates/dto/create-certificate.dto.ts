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

export class CreateCertificateDto {
    @ApiProperty({
        example: '5389468f-a200-40fd-a2d2-4ca8c0db14a3',
        description: 'UUID hồ sơ thẩm xét kỹ thuật',
        format: 'uuid',
    })
    @IsUUID()
    technical_review_id!: string;

    @ApiProperty({
        example: 'CB-ISO14001-2026-0001',
        description: 'Số chứng chỉ duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    cert_number!: string;

    @ApiPropertyOptional({
        example: '2026-07-27',
        description: 'Ngày cấp chứng chỉ',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @ApiPropertyOptional({
        example: '2029-07-26',
        description: 'Ngày hết hạn chứng chỉ',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    expire_date?: string;
}
