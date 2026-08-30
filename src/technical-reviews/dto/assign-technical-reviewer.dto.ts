import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignTechnicalReviewerDto {
    @IsUUID()
    reviewer_id!: string;

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
