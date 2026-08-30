import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReactivateExpertCompetencyDto {
    @IsString()
    @MinLength(3)
    decision_basis!: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    effective_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    expiry_date?: string;

    @IsOptional()
    @IsString()
    note?: string;
}
