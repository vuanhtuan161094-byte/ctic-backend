import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateExpertCertificateDto {
    @ApiProperty({
        example: 'LEAD_AUDITOR',
        enum: ['AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL', 'TRAINING', 'EDUCATION', 'OTHER'],
    })
    @IsIn(['AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL', 'TRAINING', 'EDUCATION', 'OTHER'])
    certificate_type!: string;

    @ApiProperty({ example: 'ISO 14001 Lead Auditor' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    certificate_name!: string;

    @ApiPropertyOptional({ example: 'LA-14001-2026-001' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    certificate_number?: string;

    @ApiPropertyOptional({ example: 'CQI and IRCA' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    issuing_organization?: string;

    @ApiPropertyOptional({ example: 'ISO 14001:2015' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    standard_code?: string;

    @ApiPropertyOptional({ example: '2026-01-15', format: 'date' })
    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @ApiPropertyOptional({ example: '2029-01-14', format: 'date' })
    @IsOptional()
    @IsDateString()
    expiry_date?: string;

    @ApiPropertyOptional({ example: 'https://example.com/credential' })
    @IsOptional()
    @IsUrl({ require_tld: false })
    @MaxLength(1000)
    credential_url?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    note?: string;
}
