import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'CUST004',
    description: 'Mã khách hàng duy nhất',
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  customer_code!: string;

  @ApiProperty({
    example: 'Công ty TNHH ABC',
    description: 'Tên đầy đủ của tổ chức',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  company_name!: string;

  @ApiPropertyOptional({
    example: 'VN',
    description: 'Mã quốc gia 2 chữ cái. Mặc định VN; dùng OT khi chọn Khác và điền country_name.',
    default: 'VN',
    maxLength: 2,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'Mã quốc gia phải gồm đúng 2 chữ cái',
  })
  country_code?: string;

  @ApiPropertyOptional({
    example: 'Lào',
    description: 'Tên quốc gia khi country_code = OT (Khác).',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country_name?: string;

  @ApiPropertyOptional({
    example: '0101234567',
    description: 'Mã số thuế / Tax ID. Việt Nam: 10 hoặc 13 chữ số; quốc gia khác: nhập theo mã địa phương.',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_code?: string;

  @ApiPropertyOptional({
    example: 'Số 123, đường Nguyễn Trãi, Hà Nội',
    description: 'Địa chỉ trụ sở hoặc địa điểm liên hệ',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @ApiPropertyOptional({
    example: 'contact@example.com',
    description: 'Email liên hệ',
    format: 'email',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '0901234567',
    description: 'Số điện thoại liên hệ',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
