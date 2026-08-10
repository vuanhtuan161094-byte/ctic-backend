import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

export class AuditDocumentScheduleRowDto {
    @IsString()
    @MaxLength(100)
    time!: string;

    @IsString()
    @MaxLength(4000)
    content!: string;

    @IsString()
    @MaxLength(500)
    auditor!: string;

    @IsString()
    @MaxLength(500)
    auditee!: string;
}

export class AuditAttendanceRowDto {
    @IsString()
    @MaxLength(255)
    full_name!: string;

    @IsString()
    @MaxLength(255)
    department_title!: string;

    @IsBoolean()
    opening_attended!: boolean;

    @IsBoolean()
    closing_attended!: boolean;
}

export class AuditChecklistRowDto {
    @IsString()
    @MaxLength(100)
    row_id!: string;

    @IsString()
    @MaxLength(50)
    clause!: string;

    @IsString()
    @MaxLength(8000)
    content!: string;

    @IsBoolean()
    is_section!: boolean;

    @IsString()
    @IsIn([
        'NOT_EVALUATED',
        'CONFORMITY',
        'OFI',
        'MINOR_NC',
        'MAJOR_NC',
    ])
    result!: string;

    @IsString()
    @MaxLength(8000)
    description!: string;
}

export class AuditChecklistProgramDto {
    @IsString()
    @MaxLength(100)
    program_key!: string;

    @IsString()
    @MaxLength(100)
    program_code!: string;

    @IsString()
    @MaxLength(30)
    management_system!: string;

    @IsString()
    @MaxLength(1000)
    auditor_name!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuditChecklistRowDto)
    rows!: AuditChecklistRowDto[];
}

export class SaveAuditDocumentDataDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    audit_language?: string;

    @IsOptional()
    @IsDateString()
    issue_date?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuditDocumentScheduleRowDto)
    schedule_rows?: AuditDocumentScheduleRowDto[];

    @IsOptional()
    @IsDateString()
    opening_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    opening_time?: string;

    @IsOptional()
    @IsDateString()
    closing_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    closing_time?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuditAttendanceRowDto)
    attendance_rows?: AuditAttendanceRowDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuditChecklistProgramDto)
    checklists?: AuditChecklistProgramDto[];
}
