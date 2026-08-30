import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewSurveillanceChangeDto {
    @IsIn(['KEEP_CURRENT', 'RECALCULATED'])
    decision!: 'KEEP_CURRENT' | 'RECALCULATED';

    @IsString()
    @MinLength(1)
    @MaxLength(4000)
    review_note!: string;
}
