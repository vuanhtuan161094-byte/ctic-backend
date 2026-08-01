import {
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class UploadDocumentFileDto {
    @ApiProperty({
        example: 'technical_review',
        description: 'Loại đối tượng được gắn tệp',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    entity_type!: string;

    @ApiProperty({
        example: 'f842c677-f9ac-4ec3-972c-58ccf5e3d13e',
        description: 'UUID đối tượng được gắn tệp',
        format: 'uuid',
    })
    @IsUUID()
    entity_id!: string;

    @ApiProperty({
        example: 'audit_checklist',
        description: 'Loại tài liệu nghiệp vụ',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    document_type!: string;

    @ApiProperty({
        example: 'attachment',
        enum: [
            'generated_docx',
            'generated_pdf',
            'signed_scan',
            'attachment',
        ],
        description: 'Phân loại tệp',
    })
    @IsIn([
        'generated_docx',
        'generated_pdf',
        'signed_scan',
        'attachment',
    ])
    file_kind!: string;

    @ApiPropertyOptional({
        example: 'Checklist đánh giá phiên bản mới nhất.',
        description: 'Ghi chú về tài liệu',
        maxLength: 1000,
    })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;
}
