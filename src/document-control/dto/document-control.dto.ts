import { Type } from 'class-transformer';
import {
    IsDateString,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateControlledTemplateDto {
    @IsString()
    @Length(1, 80)
    template_code!: string;

    @IsString()
    @Length(1, 255)
    template_name!: string;

    @IsString()
    @Length(1, 100)
    document_type!: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    scheme_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    language?: string;

    @IsOptional()
    @IsString()
    @MaxLength(40)
    revision_label?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    change_note?: string;
}

export class CreateTemplateRevisionDto {
    @IsOptional()
    @IsString()
    @MaxLength(40)
    revision_label?: string;

    @IsString()
    @Length(1, 4000)
    change_note!: string;
}

export class AttachControlledFileDto {
    @IsUUID('4')
    file_id!: string;
}

export class EffectiveTemplateDto {
    @IsDateString()
    effective_date!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;
}

export class WorkflowNoteDto {
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;
}

export class ControlledVoidDto {
    @IsString()
    @Length(1, 4000)
    reason!: string;
}

export class CreateControlledDocumentDto {
    @IsString()
    @Length(1, 80)
    document_code!: string;

    @IsString()
    @Length(1, 255)
    document_name!: string;

    @IsString()
    @Length(1, 100)
    document_type!: string;

    @IsString()
    @Length(1, 100)
    entity_type!: string;

    @IsUUID('4')
    entity_id!: string;

    @IsOptional()
    @IsUUID('4')
    project_id?: string;

    @IsOptional()
    @IsUUID('4')
    customer_id?: string;

    @IsOptional()
    @IsUUID('4')
    template_version_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    series_key?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    number_prefix?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    number_year?: number;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    change_note?: string;
}

export class CreateControlledDocumentRevisionDto {
    @IsString()
    @Length(1, 4000)
    change_note!: string;

    @IsOptional()
    @IsUUID('4')
    template_version_id?: string;
}

export class AttachOfficialFileDto extends AttachControlledFileDto {
    @IsIn([
        'AUTHENTICATED_APPROVAL',
        'SIGNATURE_IMAGE',
        'SIGNED_SCAN',
        'CRYPTOGRAPHIC_SIGNATURE',
    ])
    signature_method!: string;
}


export class CreateDocumentLibrarySeriesDto {
    @IsIn(['INTERNAL', 'EXTERNAL'])
    library_kind!: 'INTERNAL' | 'EXTERNAL';

    @IsString()
    @Length(1, 100)
    document_code!: string;

    @IsString()
    @Length(1, 500)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    category?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    issuing_body?: string;

    @IsOptional()
    @IsIn(['INTERNAL', 'RESTRICTED'])
    access_scope?: 'INTERNAL' | 'RESTRICTED';

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    revision_label?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsDateString()
    effective_date?: string;

    @IsOptional()
    @IsDateString()
    expiry_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    source_reference?: string;
}

export class CreateDocumentLibraryRevisionDto {
    @IsOptional()
    @IsString()
    @MaxLength(80)
    revision_label?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsDateString()
    effective_date?: string;

    @IsOptional()
    @IsDateString()
    expiry_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    source_reference?: string;

    @IsString()
    @Length(1, 4000)
    change_note!: string;
}

export class EffectiveDocumentLibraryVersionDto {
    @IsOptional()
    @IsDateString()
    effective_date?: string;

    @IsOptional()
    @IsDateString()
    expiry_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;
}

export class RenderControlledTemplateDto {
    @IsIn(['CUSTOMER', 'APPLICATION', 'PROJECT', 'AUDIT_PLAN', 'CERTIFICATE'])
    context_type!: 'CUSTOMER' | 'APPLICATION' | 'PROJECT' | 'AUDIT_PLAN' | 'CERTIFICATE';

    @IsUUID('4')
    entity_id!: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    document_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    document_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    number_prefix?: string;

    @IsOptional()
    @IsObject()
    data_overrides?: Record<string, unknown>;
}
