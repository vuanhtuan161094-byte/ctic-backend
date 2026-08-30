import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class ExpertWitnessAssessmentItemDto {
    @IsString()
    @MaxLength(60)
    criterion_code!: string;

    @IsString()
    @MaxLength(500)
    criterion_label!: string;

    @IsIn(['4', '3', '2', '1', 'N'])
    rating!: string;

    @IsOptional()
    @IsString()
    comment?: string;
}

export class CompleteExpertMonitoringDto {
    @IsString()
    @MaxLength(30)
    performed_date!: string;

    @IsIn(['SATISFACTORY', 'IMPROVEMENT_REQUIRED', 'UNSATISFACTORY'])
    result!: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    score?: number;

    @IsOptional()
    @IsString()
    summary?: string;

    @IsOptional()
    @IsString()
    finding?: string;

    @IsOptional()
    @IsString()
    required_action?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    next_monitoring_date?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExpertWitnessAssessmentItemDto)
    witness_items?: ExpertWitnessAssessmentItemDto[];
}
