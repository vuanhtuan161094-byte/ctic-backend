import { Type } from 'class-transformer';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateExpertTrainingDto {
    @IsIn([
        'INTERNAL',
        'EXTERNAL',
        'AUDITOR_COURSE',
        'SPECIALIZED',
        'WITNESS_PRACTICE',
        'OTHER',
    ])
    training_type!: string;

    @IsString()
    @MaxLength(255)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    provider?: string;

    @IsOptional()
    @IsIn(['IN_PERSON', 'ONLINE', 'HYBRID', 'OJT', 'OTHER'])
    delivery_mode?: string;

    @IsOptional()
    @IsUUID()
    competency_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    management_system?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    standard_code?: string;

    @IsString()
    @MaxLength(30)
    start_date!: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    end_date?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(10000)
    duration_hours?: number;

    @IsOptional()
    @IsIn(['PLANNED', 'COMPLETED'])
    status?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    completion_result?: string;

    @IsOptional()
    @IsString()
    @MaxLength(150)
    certificate_number?: string;

    @IsOptional()
    @IsString()
    note?: string;
}
