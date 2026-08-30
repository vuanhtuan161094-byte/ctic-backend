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

export class CreateExpertCompetencyEvidenceDto {
    @IsIn([
        'TRAINING_CERTIFICATE',
        'AUDIT_LOG',
        'WORK_EXPERIENCE',
        'WITNESS_ASSESSMENT',
        'INTERVIEW_TEST',
        'CUSTOMER_FEEDBACK',
        'AUDIT_REPORT_REVIEW',
        'OTHER',
    ])
    evidence_type!: string;

    @IsString()
    @MaxLength(255)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(150)
    reference_no?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    evidence_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    valid_until?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    result?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    score?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    mandays?: number;

    @IsOptional()
    @IsString()
    description?: string;
}
