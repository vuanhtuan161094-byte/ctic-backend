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

export class CreateNotificationDto {
    @ApiProperty({
        format: 'uuid',
        example: '9c6f2ad7-1e63-4ae4-a1de-316ee0794613',
    })
    @IsUUID()
    user_id!: string;

    @ApiProperty({ example: 'upcoming_audit' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    notification_type!: string;

    @ApiPropertyOptional({
        enum: [
            'WORKFLOW_UPDATE',
            'CERTIFICATE_STATUS_CHANGED',
        ],
        default: 'WORKFLOW_UPDATE',
    })
    @IsOptional()
    @IsIn([
        'WORK_ASSIGNED',
        'WORK_DUE_SOON',
        'WORK_OVERDUE',
        'WORK_ESCALATED',
        'WORKFLOW_UPDATE',
        'CAP_DUE',
        'TECHNICAL_REVIEW_READY',
        'CERTIFICATION_DECISION_READY',
        'CERTIFICATE_ISSUE_READY',
        'CERTIFICATE_EXPIRING',
        'CERTIFICATE_STATUS_CHANGED',
    ])
    category?: string;

    @ApiProperty({ example: 'Lịch đánh giá sắp tới' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    title!: string;

    @ApiProperty({ example: 'Kế hoạch đánh giá PLAN-2028-0002 sắp đến hạn.' })
    @IsString()
    @IsNotEmpty()
    message!: string;

    @ApiPropertyOptional({
        enum: ['INFO', 'NORMAL', 'WARNING', 'CRITICAL'],
        default: 'INFO',
        example: 'WARNING',
    })
    @IsOptional()
    @IsIn([
        'INFO',
        'NORMAL',
        'WARNING',
        'CRITICAL',
        'info',
        'normal',
        'warning',
        'critical',
    ])
    severity?: string;

    @ApiPropertyOptional({ example: 'audit_plan' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    entity_type?: string;

    @ApiPropertyOptional({
        format: 'uuid',
        example: '93a52fa4-e260-4cdc-9956-5c5f40380a3c',
    })
    @IsOptional()
    @IsUUID()
    entity_id?: string;

    @ApiPropertyOptional({ example: '2028-06-01' })
    @IsOptional()
    @IsDateString()
    due_date?: string;
}
