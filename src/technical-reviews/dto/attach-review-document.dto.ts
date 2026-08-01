import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AttachReviewDocumentDto {
    @ApiProperty({
        example: '57ff2ca1-5774-41ce-a311-08844664912c',
        description: 'UUID phiên bản tệp gắn vào hạng mục thẩm xét',
        format: 'uuid',
    })
    @IsUUID()
    document_file_id!: string;
}
