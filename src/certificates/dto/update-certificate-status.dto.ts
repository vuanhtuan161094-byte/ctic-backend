import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateCertificateStatusDto {
    @ApiProperty({
        example: 'expired',
        enum: [
            'expired',
        ],
        description: 'Chỉ dành cho xác nhận hết hạn quản trị; các lifecycle status phải đi qua quyết định.',
    })
    @IsIn([
        'expired',
    ])
    status!: string;

    @ApiProperty({
        example: 'Tạm đình chỉ do chưa đáp ứng yêu cầu duy trì chứng nhận.',
        description: 'Lý do thay đổi trạng thái',
    })
    @IsString()
    @IsNotEmpty()
    reason!: string;

    @ApiPropertyOptional({
        example: '2029-08-01',
        description: 'Ngày hiệu lực của thay đổi trạng thái',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    effective_date?: string;
}
