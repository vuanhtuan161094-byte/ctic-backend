import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateExpertAvailabilityDto {
    @ApiProperty({
        enum: ['AVAILABLE', 'UNAVAILABLE', 'LEAVE', 'OTHER_COMMITMENT'],
    })
    @IsIn(['AVAILABLE', 'UNAVAILABLE', 'LEAVE', 'OTHER_COMMITMENT'])
    availability_type!: string;

    @ApiProperty({ example: '2026-09-01' })
    @IsDateString()
    start_datetime!: string;

    @ApiProperty({ example: '2026-09-03' })
    @IsDateString()
    end_datetime!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    note?: string;
}

export class CancelExpertResourceRecordDto {
    @ApiProperty({ minLength: 3 })
    @IsString()
    @MinLength(3)
    reason!: string;
}

export class CreateExpertCustomerConflictDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    customer_id!: string;

    @ApiProperty({
        enum: [
            'EMPLOYMENT',
            'CONSULTANCY',
            'FINANCIAL_INTEREST',
            'CLOSE_RELATIONSHIP',
            'PRIOR_INVOLVEMENT',
            'SELF_REVIEW_RISK',
            'OTHER',
        ],
    })
    @IsIn([
        'EMPLOYMENT',
        'CONSULTANCY',
        'FINANCIAL_INTEREST',
        'CLOSE_RELATIONSHIP',
        'PRIOR_INVOLVEMENT',
        'SELF_REVIEW_RISK',
        'OTHER',
    ])
    conflict_type!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    description!: string;

    @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
    @IsOptional()
    @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    risk_level?: string;

    @ApiProperty({ example: '2026-09-01' })
    @IsDateString()
    valid_from!: string;

    @ApiPropertyOptional({ example: '2027-08-31', nullable: true })
    @IsOptional()
    @IsDateString()
    valid_to?: string;
}

export class ReviewExpertCustomerConflictDto {
    @ApiProperty({ enum: ['CLEARED', 'RESTRICTED', 'PROHIBITED'] })
    @IsIn(['CLEARED', 'RESTRICTED', 'PROHIBITED'])
    independence_status!: string;

    @ApiProperty({ minLength: 3 })
    @IsString()
    @MinLength(3)
    review_note!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    mitigation_justification?: string;
}
