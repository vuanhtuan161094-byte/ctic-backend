import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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
    example: 'Công ty TNHH CTIC Test',
    description: 'Tên đầy đủ của tổ chức',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  company_name!: string;

  @ApiPropertyOptional({
    example: '0101234567',
    description: 'Mã số thuế',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_code?: string;

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
