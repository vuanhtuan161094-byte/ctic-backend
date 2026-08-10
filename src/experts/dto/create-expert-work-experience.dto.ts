import {
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateExpertWorkExperienceDto {
    @ApiProperty({ example: 'Công ty ABC' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    organization!: string;

    @ApiProperty({ example: 'Trưởng phòng QA/QC' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    position!: string;

    @ApiProperty({ example: '2018-01-01', format: 'date' })
    @IsDateString()
    start_date!: string;

    @ApiPropertyOptional({ example: '2024-12-31', format: 'date' })
    @IsOptional()
    @IsDateString()
    end_date?: string;

    @ApiPropertyOptional({ example: 'IAF 17; NACE 25.11' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    industry_codes?: string;

    @ApiPropertyOptional({ description: 'Nhiệm vụ và phạm vi công việc' })
    @IsOptional()
    @IsString()
    responsibility?: string;

    @ApiPropertyOptional({ description: 'Thành tích hoặc ghi chú kinh nghiệm' })
    @IsOptional()
    @IsString()
    achievement_note?: string;
}
