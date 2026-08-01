import {
    IsDateString,
    IsInt,
    IsNotEmpty,
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


export class CreateCertificationApplicationDto {

    @ApiProperty({
        example: '38a52535-6770-410d-ab71-d23f933d0935',
        description: 'UUID của khách hàng đăng ký chứng nhận',
        format: 'uuid',
    })
    @IsUUID()
    @IsNotEmpty()
    customer_id!: string;


    @ApiProperty({
        example: 'APP-2026-0003',
        description: 'Mã hồ sơ đăng ký duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    application_code!: string;


    @ApiProperty({
        example: '2026-08-01',
        description: 'Ngày đăng ký chứng nhận',
        format: 'date',
    })
    @IsDateString()
    @IsNotEmpty()
    application_date!: string;


    @ApiPropertyOptional({
        example: 'INITIAL',
        description: 'Loại chứng nhận: lần đầu, giám sát hoặc tái chứng nhận',
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    certification_type?: string;


    @ApiProperty({
        example: 'ISO 14001:2015',
        description: 'Tiêu chuẩn đăng ký chứng nhận',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    standard_name!: string;


    @ApiProperty({
        example: 'Sản xuất sản phẩm nhựa',
        description: 'Phạm vi đăng ký chứng nhận',
    })
    @IsString()
    @IsNotEmpty()
    certification_scope!: string;


    @ApiPropertyOptional({
        example: 1,
        description: 'Số địa điểm thuộc phạm vi chứng nhận',
        minimum: 1,
        default: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    site_count?: number;


    @ApiPropertyOptional({
        example: 120,
        description: 'Số nhân sự hiệu lực',
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    employee_count?: number;


    @ApiPropertyOptional({
        example: 2,
        description: 'Số ca làm việc',
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    shift_count?: number;


    @ApiPropertyOptional({
        example: '2026-08-15',
        description: 'Ngày đánh giá dự kiến do khách hàng đề nghị',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    requested_audit_date?: string;

}
