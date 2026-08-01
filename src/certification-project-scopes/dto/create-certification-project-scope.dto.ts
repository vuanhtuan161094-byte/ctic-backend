import {
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCertificationProjectScopeDto {
    @ApiProperty({
        format: 'uuid',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @IsUUID()
    project_id!: string;

    @ApiProperty({
        format: 'uuid',
        description: 'ID ánh xạ ISIC–NACE đã được phê duyệt',
        example: '1fed6693-d70d-4daa-8e90-6132661d4bda',
    })
    @IsUUID()
    isic_nace_mapping_id!: string;

    @ApiProperty({
        format: 'uuid',
        description: 'ID ánh xạ NACE–IAF đã được phê duyệt',
        example: 'f1a0defa-710d-4ddd-87cf-d85dd96b75db',
    })
    @IsUUID()
    nace_iaf_mapping_id!: string;

    @ApiPropertyOptional({ example: 'Sản xuất sản phẩm nhựa' })
    @IsOptional()
    @IsString()
    scope_description?: string;

    @ApiPropertyOptional({ example: 'Phạm vi chính của dự án chứng nhận' })
    @IsOptional()
    @IsString()
    notes?: string;
}
