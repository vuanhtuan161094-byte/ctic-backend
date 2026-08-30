import { Type } from 'class-transformer';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

export class EvaluateExpertTrainingDto {
    @IsIn(['PRESENTATION', 'INTERVIEW', 'TEST', 'OBSERVATION', 'OTHER'])
    method!: string;

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
    comment?: string;
}
