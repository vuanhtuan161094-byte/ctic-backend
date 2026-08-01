import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';
import {
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export class CreateCertificationAgreementDto {
    @ApiProperty({
        example: '38a52535-6770-410d-ab71-d23f933d0935',
        description: 'UUID của khách hàng',
        format: 'uuid',
    })
    @IsUUID()
    @IsNotEmpty()
    customer_id!: string;

    @ApiPropertyOptional({
        example: '36dc9d7a-1bea-4b37-882a-ef8da82c8d1e',
        description: 'UUID hợp đồng liên quan, nếu có',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    contract_id?: string;

    @ApiProperty({
        example: '02/TTCN/C002',
        description: 'Số thỏa thuận chứng nhận duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    agreement_number!: string;

    @ApiProperty({
        example: '2026-08-03',
        description: 'Ngày ký thỏa thuận chứng nhận',
        format: 'date',
    })
    @IsDateString()
    @IsNotEmpty()
    sign_date!: string;
}
