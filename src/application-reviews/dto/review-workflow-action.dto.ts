import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewApplicationReviewDto {
    @ApiProperty({ enum: ['APPROVE', 'RETURN'] })
    @IsIn(['APPROVE', 'RETURN'])
    action!: 'APPROVE' | 'RETURN';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    comment?: string;
}
