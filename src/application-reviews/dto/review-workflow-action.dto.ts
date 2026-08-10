import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckApplicationReviewDto {
    @ApiProperty({ enum: ['CHECKED', 'RETURN'] })
    @IsIn(['CHECKED', 'RETURN'])
    action!: 'CHECKED' | 'RETURN';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    comment?: string;
}

export class ApproveApplicationReviewDto {
    @ApiProperty({ enum: ['APPROVE', 'RETURN', 'REJECT'] })
    @IsIn(['APPROVE', 'RETURN', 'REJECT'])
    action!: 'APPROVE' | 'RETURN' | 'REJECT';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    comment?: string;
}
