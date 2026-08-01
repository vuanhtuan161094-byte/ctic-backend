import {
    IsOptional,
    IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CloseAuditFindingDto {
    @ApiPropertyOptional({
        example: 'NC đã được khắc phục và đóng.',
        description: 'Nhận xét khi đóng phát hiện',
    })
    @IsOptional()
    @IsString()
    close_comment?: string;
}
