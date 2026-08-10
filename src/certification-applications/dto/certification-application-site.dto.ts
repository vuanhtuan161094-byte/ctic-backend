import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

export class CertificationApplicationSiteDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    site_no!: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    site_name?: string;

    @IsString()
    @IsNotEmpty()
    address!: string;

    @IsOptional()
    @IsString()
    activities?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    employee_count?: number;

    @IsOptional()
    @IsBoolean()
    is_headquarters?: boolean;
}
