import {
    ArrayMinSize,
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class ProgramMandayWeightDto {
    @ApiProperty({ example: 'QMS::ISO90012015' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    program_key!: string;

    @ApiPropertyOptional({ example: 7, minimum: 0 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    pre_ims_mandays!: number;
}

export class AutoMandayAllocationDto {
    @ApiPropertyOptional({
        type: () => ProgramMandayWeightDto,
        isArray: true,
        description: 'MD của từng chương trình trước giảm IMS. Nếu bỏ trống hoặc tổng bằng 0, hệ thống chia đều.',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProgramMandayWeightDto)
    program_weights?: ProgramMandayWeightDto[];
}

export class ManualProgramMandayCellDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    member_id!: string;

    @ApiProperty({ example: 'QMS::ISO90012015' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    program_key!: string;

    @ApiProperty({ example: 1.5, minimum: 0 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 1 })
    @Min(0)
    mandays!: number;
}

export class ManualMandayAllocationDto {
    @ApiProperty({
        type: () => ManualProgramMandayCellDto,
        isArray: true,
        minItems: 1,
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ManualProgramMandayCellDto)
    allocations!: ManualProgramMandayCellDto[];

    @ApiProperty({
        example: 'Điều chỉnh 0,5 MD ISO 9001 từ trưởng đoàn sang đánh giá viên để phù hợp lịch thực tế.',
    })
    @IsString()
    @IsNotEmpty()
    change_reason!: string;
}
