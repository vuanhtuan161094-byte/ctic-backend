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

export class CreateExpertCompetencyDto {
    @ApiProperty({
        example: '2130f4b2-b4e6-4bcb-be7c-809c60b8f341',
        description: 'UUID chuyên gia',
        format: 'uuid',
    })
    @IsUUID()
    expert_id!: string;

    @ApiProperty({
        example: 'EMS',
        enum: [
            'QMS',
            'EMS',
            'OHSMS',
            'ISMS',
            'ENERGY',
        ],
        description: 'Hệ thống quản lý',
    })
    @IsIn([
        'QMS',
        'EMS',
        'OHSMS',
        'ISMS',
        'ENERGY',
    ])
    management_system!: string;

    @ApiProperty({
        example: 'ISO 14001:2015',
        description: 'Tiêu chuẩn được phê duyệt năng lực',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    standard_code!: string;

    @ApiProperty({
        example: 'LEAD_AUDITOR',
        enum: [
            'AUDITOR',
            'LEAD_AUDITOR',
            'TECHNICAL_EXPERT',
            'APPLICATION_REVIEWER',
            'TECHNICAL_REVIEWER',
            'CERTIFICATION_DECISION_MAKER',
            'WITNESS_EVALUATOR',
            'TRAINER',
        ],
        description: 'Vai trò năng lực',
    })
    @IsIn([
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_EXPERT',
        'APPLICATION_REVIEWER',
        'TECHNICAL_REVIEWER',
        'CERTIFICATION_DECISION_MAKER',
        'WITNESS_EVALUATOR',
        'TRAINER',
    ])
    competency_role!: string;

    @ApiProperty({
        example: 'NACE',
        enum: [
            'IAF',
            'NACE',
        ],
        description: 'Cấp độ chi tiết của phạm vi năng lực',
    })
    @IsIn([
        'IAF',
        'NACE',
    ])
    scope_level!: string;

    @ApiProperty({
        example: '14',
        description: 'Mã lĩnh vực IAF',
        maxLength: 20,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    iaf_code!: string;

    @ApiPropertyOptional({
        example: 'NACE_REV_2',
        description: 'Phiên bản danh mục NACE',
        maxLength: 30,
    })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    nace_revision?: string;

    @ApiPropertyOptional({
        example: '22.29',
        description: 'Mã hoạt động NACE',
        maxLength: 30,
    })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    nace_code?: string;

    @ApiPropertyOptional({
        example: 'QUALIFIED',
        enum: [
            'TRAINEE',
            'UNDER_SUPERVISION',
            'QUALIFIED',
            'SENIOR',
            'EXPERT',
        ],
        description: 'Mức năng lực chuyên gia',
    })
    @IsOptional()
    @IsIn([
        'TRAINEE',
        'UNDER_SUPERVISION',
        'QUALIFIED',
        'SENIOR',
        'EXPERT',
    ])
    competency_level?: string;

    @ApiProperty({
        example: '2026-07-28',
        description: 'Ngày bắt đầu hiệu lực năng lực',
        format: 'date',
    })
    @IsDateString()
    effective_date!: string;

    @ApiPropertyOptional({
        example: '2029-07-27',
        description: 'Ngày hết hiệu lực năng lực',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    expiry_date?: string;

    @ApiPropertyOptional({
        example: 'Chỉ thực hiện đánh giá dưới phạm vi đã phê duyệt.',
        description: 'Hạn chế năng lực',
    })
    @IsOptional()
    @IsString()
    restriction?: string;

    @ApiPropertyOptional({
        example: 'Hồ sơ đào tạo, kinh nghiệm và đánh giá chứng kiến.',
        description: 'Cơ sở phê duyệt',
    })
    @IsOptional()
    @IsString()
    approval_basis?: string;

    @ApiPropertyOptional({
        example: 'Đáp ứng yêu cầu chuyên gia đánh giá EMS lĩnh vực IAF 14.',
        description: 'Tóm tắt bằng chứng năng lực',
    })
    @IsOptional()
    @IsString()
    evidence_summary?: string;

    @ApiPropertyOptional({
        example: 'Năng lực tạo để kiểm thử hệ thống.',
        description: 'Ghi chú',
    })
    @IsOptional()
    @IsString()
    notes?: string;
}
