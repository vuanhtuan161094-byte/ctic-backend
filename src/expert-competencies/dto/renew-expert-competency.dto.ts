import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RenewExpertCompetencyDto {
    @IsString()
    @MaxLength(30)
    effective_date!: string;

    @IsString()
    @MaxLength(30)
    expiry_date!: string;

    @IsString()
    @MinLength(3)
    decision_basis!: string;

    @IsOptional()
    @IsString()
    note?: string;
}
