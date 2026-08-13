import { Type } from 'class-transformer';
import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class NewProjectContractDto {
    @ApiProperty({
        example: 'PRJ-2026-0003',
        description: 'Số hợp đồng duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    contract_number!: string;

    @ApiPropertyOptional({
        example: '2026-08-04',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    sign_date?: string;

    @ApiPropertyOptional({
        example: '2026-08-04',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    start_date?: string;

    @ApiPropertyOptional({
        example: '2029-08-03',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    end_date?: string;

    @ApiPropertyOptional({
        example: 50000000,
        minimum: 0,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    total_value?: number;

    @ApiPropertyOptional({ example: 'VND', maxLength: 3 })
    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string;
}

export class NewProjectAgreementDto {
    @ApiProperty({
        example: 'AGR-2026-0002',
        description: 'Số thỏa thuận chứng nhận duy nhất',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    agreement_number!: string;

    @ApiProperty({
        example: '2026-08-04',
        format: 'date',
    })
    @IsDateString()
    sign_date!: string;
}

export class CreateCompleteCertificationProjectDto {
    @ApiProperty({
        format: 'uuid',
        description: 'Đơn đăng ký đã được chấp nhận',
    })
    @IsUUID()
    application_id!: string;

    @ApiProperty({
        example: 'PRJ-2026-0003',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    project_code!: string;

    @ApiPropertyOptional({
        example: 'ISO 9001:2015',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    standard_name?: string;

    @ApiPropertyOptional({
        example: 'Số 8 VSIP II-A, đường số 15, khu công nghiệp Việt Nam - Singapore II-A',
        description: 'Địa chỉ dùng để sửa dữ liệu cũ khi đơn đã duyệt chưa đồng bộ địa chỉ địa điểm 01',
        maxLength: 2000,
    })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    headquarters_address?: string;

    @ApiProperty({
        enum: ['new', 'existing', 'none'],
        example: 'new',
    })
    @IsIn(['new', 'existing', 'none'])
    contract_mode!: 'new' | 'existing' | 'none';

    @ApiPropertyOptional({
        format: 'uuid',
        description: 'Hợp đồng đã có',
    })
    @ValidateIf((value: CreateCompleteCertificationProjectDto) =>
        value.contract_mode === 'existing',
    )
    @IsUUID()
    contract_id?: string;

    @ApiPropertyOptional({
        type: () => NewProjectContractDto,
        description: 'Thông tin hợp đồng mới',
    })
    @ValidateIf((value: CreateCompleteCertificationProjectDto) =>
        value.contract_mode === 'new',
    )
    @ValidateNested()
    @Type(() => NewProjectContractDto)
    contract?: NewProjectContractDto;

    @ApiProperty({
        enum: ['new', 'existing', 'none'],
        example: 'new',
    })
    @IsIn(['new', 'existing', 'none'])
    agreement_mode!: 'new' | 'existing' | 'none';

    @ApiPropertyOptional({
        format: 'uuid',
        description: 'Thỏa thuận chứng nhận đã có',
    })
    @ValidateIf((value: CreateCompleteCertificationProjectDto) =>
        value.agreement_mode === 'existing',
    )
    @IsUUID()
    agreement_id?: string;

    @ApiPropertyOptional({
        type: () => NewProjectAgreementDto,
        description: 'Thông tin thỏa thuận mới',
    })
    @ValidateIf((value: CreateCompleteCertificationProjectDto) =>
        value.agreement_mode === 'new',
    )
    @ValidateNested()
    @Type(() => NewProjectAgreementDto)
    agreement?: NewProjectAgreementDto;
}
