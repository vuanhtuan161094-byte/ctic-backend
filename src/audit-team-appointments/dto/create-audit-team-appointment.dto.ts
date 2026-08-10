import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

import {
    Type,
} from 'class-transformer';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class AuditTeamMemberScopeDto {
    @ApiPropertyOptional({
        example: '14',
        description: 'Mã lĩnh vực IAF',
        maxLength: 20,
    })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    iaf_code?: string;

    @ApiPropertyOptional({
        example: '1c419dfb-2505-4c70-8fa1-b7cb8ab93afc',
        description: 'UUID phạm vi đã phê duyệt của dự án',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    project_scope_id?: string;

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
        example: 'Sản xuất sản phẩm nhựa',
        description: 'Mô tả hoạt động được phân công',
    })
    @IsOptional()
    @IsString()
    activity_description?: string;

    @ApiPropertyOptional({
        example: 'full',
        enum: [
            'full',
            'partial',
            'observed',
            'supported_by_technical_expert',
        ],
        description: 'Mức độ bao phủ phạm vi của thành viên',
    })
    @IsOptional()
    @IsIn([
        'full',
        'partial',
        'observed',
        'supported_by_technical_expert',
    ])
    coverage_type?: string;

    @ApiPropertyOptional({
        example: 1,
        minimum: 0,
        description: 'Ngày công dự kiến cho phạm vi này',
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber({
        maxDecimalPlaces: 2,
    })
    @Min(0)
    planned_mandays?: number;
}

export class AuditTeamMemberDto {
    @ApiProperty({
        example: '2130f4b2-b4e6-4bcb-be7c-809c60b8f341',
        description: 'UUID chuyên gia',
        format: 'uuid',
    })
    @IsUUID()
    expert_id!: string;

    @ApiProperty({
        example: 'TEAM_LEADER',
        enum: [
            'TEAM_LEADER',
            'AUDITOR',
            'TECHNICAL_EXPERT',
            'TRAINEE',
            'OBSERVER',
            'WITNESS_EVALUATOR',
        ],
        description: 'Vai trò trong đoàn đánh giá',
    })
    @IsIn([
        'TEAM_LEADER',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TRAINEE',
        'OBSERVER',
        'WITNESS_EVALUATOR',
    ])
    team_role!: string;

    @ApiPropertyOptional({
        example: '2028-06-01',
        description: 'Ngày bắt đầu tham gia đợt đánh giá. Không bắt buộc đối với chỉ định đoàn cấp hồ sơ.',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    planned_start_date?: string;

    @ApiPropertyOptional({
        example: '2028-06-01',
        description: 'Ngày kết thúc tham gia đợt đánh giá. Không bắt buộc đối với chỉ định đoàn cấp hồ sơ.',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    planned_end_date?: string;

    @ApiPropertyOptional({
        example: 1,
        minimum: 0,
        description: 'Ngày công dự kiến của thành viên',
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber({
        maxDecimalPlaces: 1,
    })
    @Min(0)
    planned_mandays?: number;

    @ApiPropertyOptional({
        type: () => AuditTeamMemberScopeDto,
        isArray: true,
        description: 'Các phạm vi chuyên môn được phân công',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({
        each: true,
    })
    @Type(
        () =>
            AuditTeamMemberScopeDto,
    )
    scopes?: AuditTeamMemberScopeDto[];
}

export class CreateAuditTeamAppointmentDto {
    @ApiProperty({
        example: '93a52fa4-e260-4cdc-9956-5c5f40380a3c',
        description: 'UUID kế hoạch đánh giá',
        format: 'uuid',
    })
    @IsUUID()
    audit_plan_id!: string;

    @ApiProperty({
        example: 'F04-20260801100000',
        description: 'Số chỉ định đoàn đánh giá',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    appointment_number!: string;

    @ApiProperty({
        example: '2026-08-01',
        description: 'Ngày lập chỉ định đoàn',
        format: 'date',
    })
    @IsDateString()
    appointment_date!: string;

    @ApiPropertyOptional({
        example: 'Đoàn đánh giá giám sát lần 2.',
        description: 'Ghi chú',
    })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiProperty({
        type: () => AuditTeamMemberDto,
        isArray: true,
        minItems: 1,
        description: 'Danh sách thành viên đoàn đánh giá',
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({
        each: true,
    })
    @Type(
        () =>
            AuditTeamMemberDto,
    )
    members!: AuditTeamMemberDto[];
}
