import { IsString, MinLength } from 'class-validator';

export class VoidExpertCompetencyEvidenceDto {
    @IsString()
    @MinLength(3)
    reason!: string;
}
