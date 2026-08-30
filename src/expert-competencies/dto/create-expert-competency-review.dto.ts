import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpertCompetencyReviewDto {
    @IsIn(['PERIODIC', 'UNSCHEDULED', 'RENEWAL', 'SCOPE_EXTENSION'])
    review_type!: string;

    @IsString()
    @MaxLength(30)
    review_date!: string;

    @IsString()
    @MaxLength(500)
    monitoring_methods!: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    score?: number;

    @IsIn(['SATISFACTORY', 'IMPROVEMENT_REQUIRED', 'UNSATISFACTORY'])
    result!: string;

    @IsOptional()
    @IsString()
    finding?: string;

    @IsOptional()
    @IsString()
    required_action?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    next_review_date?: string;
}
