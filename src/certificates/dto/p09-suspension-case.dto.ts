import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID, IsString, MinLength, MaxLength } from 'class-validator';

export class RequestP09SuspensionReviewDto {
    @ApiProperty({ enum: ['EXTEND_3_MONTHS', 'RECOMMEND_RESTORE',
        'RECOMMEND_WITHDRAW', 'RECOMMEND_REDUCE_SCOPE'] })
    @IsIn(['EXTEND_3_MONTHS', 'RECOMMEND_RESTORE', 'RECOMMEND_WITHDRAW', 'RECOMMEND_REDUCE_SCOPE'])
    action!: 'EXTEND_3_MONTHS' | 'RECOMMEND_RESTORE' | 'RECOMMEND_WITHDRAW' | 'RECOMMEND_REDUCE_SCOPE';

    @ApiProperty({ format: 'uuid', description: 'F.11 thẩm xét hoàn tất của cùng hồ sơ chứng nhận' })
    @IsUUID()
    technical_review_id!: string;

    @ApiProperty({ format: 'uuid', description: 'Người ra quyết định độc lập được chỉ định' })
    @IsUUID()
    decision_maker_id!: string;

    @ApiProperty({ description: 'Lý do xem xét và căn cứ xử lý' })
    @IsString() @MinLength(20) @MaxLength(2000)
    reason!: string;

    @ApiProperty({ description: 'Mã/đường dẫn hồ sơ chứng cứ khắc phục hoặc giải trình' })
    @IsString() @MinLength(8) @MaxLength(1000)
    corrective_evidence!: string;
}

export class DecideP09SuspensionReviewDto {
    @ApiProperty({ enum: ['approved', 'rejected'] })
    @IsIn(['approved', 'rejected'])
    decision!: 'approved' | 'rejected';

    @ApiProperty({ description: 'Nhận xét thẩm xét độc lập và căn cứ bằng chứng' })
    @IsString() @MinLength(20) @MaxLength(2000)
    comment!: string;
}
