import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestGs1ExceptionDto {
    @ApiProperty({ format: 'date', example: '2027-12-03' })
    @IsDateString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    proposed_start_date!: string;

    @ApiProperty({ example: 'Lý do khách quan, rủi ro và biện pháp kiểm soát cho lịch giám sát muộn.' })
    @MinLength(20)
    @MaxLength(2000)
    reason!: string;

    @ApiProperty({ format: 'uuid', description: 'UUID QMR được chủ hệ thống chỉ định trong P09_QMR_APPROVER_IDS' })
    @IsUUID()
    qmr_approver_id!: string;
}

export class DecideGs1ExceptionDto {
    @ApiProperty({ enum: ['approved', 'rejected'] })
    @IsIn(['approved', 'rejected'])
    decision!: 'approved' | 'rejected';

    @ApiProperty({ description: 'Nhận xét và căn cứ xem xét độc lập của QMR' })
    @MinLength(20)
    @MaxLength(2000)
    comment!: string;
}
