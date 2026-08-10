import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CompleteAuditTeamMemberDto {
    @ApiProperty({
        description: 'UUID thành viên trong quyết định chỉ định đoàn',
        format: 'uuid',
    })
    @IsUUID()
    member_id!: string;

    @ApiProperty({
        example: '2027-06-01',
        description: 'Ngày tham gia thực tế bắt đầu',
        format: 'date',
    })
    @IsDateString()
    actual_start_date!: string;

    @ApiProperty({
        example: '2027-06-02',
        description: 'Ngày tham gia thực tế kết thúc',
        format: 'date',
    })
    @IsDateString()
    actual_end_date!: string;

    @ApiProperty({
        example: 1.5,
        description: 'Ngày công thực tế, nhập theo bước 0,5 MD',
        minimum: 0,
    })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 1 })
    @Min(0)
    actual_mandays!: number;
}

export class CompleteAuditPlanDto {
    @ApiProperty({
        type: [CompleteAuditTeamMemberDto],
        description: 'Phân bổ ngày và man-day thực tế của từng thành viên đoàn',
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CompleteAuditTeamMemberDto)
    member_actuals!: CompleteAuditTeamMemberDto[];

    @ApiPropertyOptional({
        example: 'Khối lượng thực tế thay đổi do bổ sung lấy mẫu tại phân xưởng số 2.',
        description: 'Ghi chú hoàn thành; bắt buộc khi tổng man-day thực tế khác man-day kế hoạch',
    })
    @IsOptional()
    @IsString()
    completion_note?: string;
}
