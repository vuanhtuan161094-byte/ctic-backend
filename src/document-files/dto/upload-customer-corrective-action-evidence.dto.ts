import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadCustomerCorrectiveActionEvidenceDto {
  @ApiPropertyOptional({
    example: 'Bằng chứng thực hiện hành động khắc phục.',
    description: 'Ghi chú về tệp bằng chứng CAP',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
