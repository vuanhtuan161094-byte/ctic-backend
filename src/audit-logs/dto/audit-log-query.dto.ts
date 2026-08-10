import {
    Type,
} from 'class-transformer';

import {
    IsDateString,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
} from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogQueryDto {
    @ApiPropertyOptional({
        format: 'uuid',
        example: '9c6f2ad7-1e63-4ae4-a1de-316ee0794613',
    })
    @IsOptional()
    @IsUUID()
    user_id?: string;

    @ApiPropertyOptional({ example: 'UPDATE' })
    @IsOptional()
    @IsString()
    action?: string;

    @ApiPropertyOptional({ example: 'certificate' })
    @IsOptional()
    @IsString()
    entity_type?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID()
    entity_id?: string;

    @ApiPropertyOptional({
        enum: [
            'success',
            'failure',
            'blocked',
        ],
    })
    @IsOptional()
    @IsIn([
        'success',
        'failure',
        'blocked',
    ])
    outcome?: string;

    @ApiPropertyOptional({
        example: 403,
        minimum: 100,
        maximum: 599,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(100)
    @Max(599)
    status_code?: number;

    @ApiPropertyOptional({
        example: '6ea4e8a6-0f10-41f1-b9c3-1b10eb9f65b6',
        description: 'Correlation/request ID trả về trong header X-Request-Id',
    })
    @IsOptional()
    @IsString()
    request_id?: string;

    @ApiPropertyOptional({ example: '2026-07-01' })
    @IsOptional()
    @IsDateString()
    date_from?: string;

    @ApiPropertyOptional({ example: '2026-08-01' })
    @IsOptional()
    @IsDateString()
    date_to?: string;

    @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50, example: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 50;
}
