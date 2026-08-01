import {
    IsIn,
    IsNumber,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MandayAdjustmentDto {
    @ApiProperty({
        example: 'increase',
        enum: [
            'increase',
            'reduction',
            'ims_reduction',
        ],
        description: 'Loại điều chỉnh thời lượng đánh giá',
    })
    @IsIn(['increase', 'reduction', 'ims_reduction'])
    adjustment_type!: string;

    @ApiProperty({
        example: 'MULTI_SITE',
        description: 'Mã yếu tố điều chỉnh',
    })
    @IsString()
    factor_code!: string;

    @ApiProperty({
        example: 10,
        minimum: 0,
        maximum: 100,
        description: 'Tỷ lệ điều chỉnh theo phần trăm',
    })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    percentage!: number;

    @ApiProperty({
        example: 'Tổ chức có nhiều địa điểm thuộc phạm vi chứng nhận.',
        description: 'Căn cứ và lý do điều chỉnh',
    })
    @IsString()
    reason!: string;
}
