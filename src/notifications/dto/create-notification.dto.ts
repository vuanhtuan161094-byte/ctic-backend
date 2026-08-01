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
        enum: ['info', 'warning', 'critical'],
        default: 'info',
        example: 'warning',
    })
    @IsOptional()
    @IsIn([
        'info',
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
