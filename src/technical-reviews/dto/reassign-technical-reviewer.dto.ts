import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReassignTechnicalReviewerDto {
    @IsUUID()
    reviewer_id!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(1000)
    reason!: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    due_at?: Date;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    admin_override_reason?: string;
}
