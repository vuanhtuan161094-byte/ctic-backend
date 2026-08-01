import {
    IsDateString,
    IsEmail,
    IsOptional,
    MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkNotificationSentDto {
    @ApiPropertyOptional({
        example: '2027-06-25T03:00:00.000Z',
        description: 'Thời điểm gửi; mặc định là thời điểm hiện tại',
        format: 'date-time',
    })
    @IsOptional()
    @IsDateString()
    sent_at?: string;

    @ApiPropertyOptional({
        example: 'customer@example.com',
        description: 'Email người nhận thực tế',
        format: 'email',
        maxLength: 255,
    })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    recipient_email?: string;
}
