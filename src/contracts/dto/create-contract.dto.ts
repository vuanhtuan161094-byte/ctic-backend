import {
    IsDateString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateContractDto {
    @ApiProperty({
        example: '38a52535-6770-410d-ab71-d23f933d0935',
        description: 'UUID của khách hàng',
        format: 'uuid',
    })
    @IsUUID()
    @IsNotEmpty()
    customer_id!: string;

    @ApiProperty({
        example: 'CB-2026-0002',
        description: 'Số hợp đồng duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    contract_number!: string;

    @ApiPropertyOptional({
        example: '2026-08-03',
        description: 'Ngày ký hợp đồng',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    sign_date?: string;

    @ApiPropertyOptional({
        example: '2026-08-03',
        description: 'Ngày bắt đầu hiệu lực',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    start_date?: string;

    @ApiPropertyOptional({
        example: '2029-08-02',
        description: 'Ngày kết thúc; không được trước ngày bắt đầu',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    end_date?: string;

    @ApiPropertyOptional({
        example: 50000000,
        description: 'Tổng giá trị hợp đồng',
        minimum: 0,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    total_value?: number;

    @ApiPropertyOptional({ example: 'VND', description: 'Mã tiền tệ ISO 4217', maxLength: 3 })
    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string;
}
