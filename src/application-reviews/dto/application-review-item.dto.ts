import {
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class ApplicationReviewItemDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    item_code!: string;

    @IsString()
    @IsNotEmpty()
    content_vi!: string;

    @IsOptional()
    @IsString()
    content_en?: string;

    @IsIn(['YES', 'NO', 'NA'])
    result!: string;

    @IsOptional()
    @IsString()
    comment?: string;
}
