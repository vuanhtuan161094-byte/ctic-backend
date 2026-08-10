import {
    IsDateString,
    IsOptional,
    IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartAuditPlanDto {
    @ApiPropertyOptional({
        example: '2027-06-01',
        description: 'Ngày bắt đầu đánh giá thực tế. Nếu bỏ trống, hệ thống dùng ngày bắt đầu dự kiến.',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    actual_start_date?: string;

    @ApiPropertyOptional({
        example: 'Đoàn đánh giá đã họp khai mạc và bắt đầu thực hiện kế hoạch.',
        description: 'Ghi chú khi bắt đầu cuộc đánh giá',
    })
    @IsOptional()
    @IsString()
    start_note?: string;
}
