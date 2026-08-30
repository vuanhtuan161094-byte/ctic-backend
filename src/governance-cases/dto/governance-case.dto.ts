import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class CaseListQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(30)
    status?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @IsOptional()
    @IsUUID()
    customer_id?: string;

    @IsOptional()
    @IsUUID()
    project_id?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}

export class CreateCertificationChangeCaseDto {
    @IsOptional()
    @IsUUID()
    source_request_id?: string;

    @IsUUID()
    customer_id!: string;

    @IsOptional()
    @IsUUID()
    project_id?: string;

    @IsOptional()
    @IsUUID()
    certificate_series_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    source?: string;

    @IsIn([
        'LEGAL_NAME',
        'ADDRESS',
        'SITE',
        'ORGANIZATION_STRUCTURE',
        'CERTIFICATION_SCOPE',
        'STANDARD_PROGRAM',
        'SIGNIFICANT_PROCESS_ACTIVITY',
        'OWNERSHIP_CONTROL',
        'OTHER',
    ])
    change_type!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    description!: string;

    @IsOptional()
    @IsObject()
    before_snapshot?: Record<string, unknown>;

    @IsOptional()
    @IsObject()
    after_snapshot?: Record<string, unknown>;

    @IsOptional()
    @IsDateString()
    effective_date?: string;

    @IsOptional()
    @IsUUID()
    owner_id?: string;
}

export class AssessCertificationChangeDto {
    @IsIn([
        'NO_CERTIFICATION_IMPACT',
        'DOCUMENT_UPDATE_ONLY',
        'TECHNICAL_REVIEW_REQUIRED',
        'SPECIAL_AUDIT_REQUIRED',
        'CERTIFICATE_AMENDMENT_REQUIRED',
        'EXTENSION_REQUIRED',
        'REDUCTION_REQUIRED',
        'SUSPENSION_REVIEW_REQUIRED',
    ])
    outcome!: string;

    @IsBoolean()
    scope_change!: boolean;

    @IsBoolean()
    site_population_change!: boolean;

    @IsBoolean()
    manday_recalculation_required!: boolean;

    @IsBoolean()
    competency_change_required!: boolean;

    @IsBoolean()
    special_audit_required!: boolean;

    @IsBoolean()
    suspension_consideration_required!: boolean;

    @IsBoolean()
    commercial_update_required!: boolean;

    @IsBoolean()
    document_update_required!: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    rationale?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    special_audit_trigger_type?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    special_audit_scope?: string;
}

export class CreateSpecialAuditDto {
    @IsUUID()
    customer_id!: string;

    @IsOptional()
    @IsUUID()
    project_id?: string;

    @IsOptional()
    @IsUUID()
    certificate_series_id?: string;

    @IsString()
    @MinLength(2)
    @MaxLength(60)
    trigger_type!: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    trigger_entity_type?: string;

    @IsOptional()
    @IsUUID()
    trigger_entity_id?: string;

    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    reason!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    audit_scope!: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    purpose?: string;

    @IsOptional()
    @IsDateString()
    planned_date?: string;

    @IsOptional()
    @IsUUID()
    owner_id?: string;
}

export class LinkSpecialAuditPlanDto {
    @IsUUID()
    audit_plan_id!: string;
}

export class RecordSpecialAuditResultDto {
    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    result!: string;

    @IsIn([
        'NONE',
        'MAINTAIN',
        'AMEND',
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
    ])
    follow_up_action!: string;
}

export class CreateComplaintDto {
    @IsOptional()
    @IsUUID()
    customer_id?: string;

    @IsOptional()
    @IsUUID()
    project_id?: string;

    @IsOptional()
    @IsUUID()
    certificate_series_id?: string;

    @IsDateString()
    received_date!: string;

    @IsString()
    @MinLength(2)
    @MaxLength(255)
    complainant_name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    complainant_contact?: string;

    @IsString()
    @MinLength(3)
    @MaxLength(255)
    subject!: string;

    @IsString()
    @MinLength(5)
    @MaxLength(10000)
    description!: string;

    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(40)
    source_channel?: string;

    @IsOptional()
    @IsDateString()
    acknowledgement_due?: string;

    @IsOptional()
    @IsDateString()
    investigation_due?: string;

    @IsOptional()
    @IsDateString()
    response_due?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsUUID(undefined, { each: true })
    involved_user_ids?: string[];
}

export class AssignComplaintDto {
    @IsUUID()
    owner_id!: string;

    @IsUUID()
    investigator_id!: string;

    @IsUUID()
    decision_owner_id!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(4000)
    independence_note!: string;
}

export class ComplaintInvestigationDto {
    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    investigation!: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    findings?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    corrective_actions?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    internal_notes?: string;
}

export class CloseComplaintDto {
    @IsIn(['CLOSED', 'REJECTED', 'OUT_OF_SCOPE'])
    outcome_status!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    final_response!: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    closure_note?: string;
}

export class CreateAppealDto {
    @IsUUID()
    challenged_decision_id!: string;

    @IsString()
    @MinLength(2)
    @MaxLength(255)
    appellant_name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    appellant_contact?: string;

    @IsString()
    @MinLength(5)
    @MaxLength(10000)
    grounds!: string;

    @IsOptional()
    @IsDateString()
    acknowledgement_due?: string;

    @IsOptional()
    @IsDateString()
    review_due?: string;

    @IsOptional()
    @IsDateString()
    response_due?: string;
}

export class AssignAppealDto {
    @IsUUID()
    owner_id!: string;

    @IsUUID()
    reviewer_id!: string;

    @IsUUID()
    decision_owner_id!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(4000)
    independence_note!: string;
}

export class AppealReviewDto {
    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    review_notes!: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    internal_deliberation?: string;
}

export class DecideAppealDto {
    @IsIn(['UPHELD', 'PARTIALLY_UPHELD', 'DISMISSED', 'OUT_OF_SCOPE'])
    outcome!: string;

    @IsOptional()
    @IsIn([
        'NONE',
        'AMEND',
        'EXTEND_SCOPE',
        'REDUCE_SCOPE',
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
        'NEW_CERTIFICATION_DECISION',
    ])
    required_action?: string;

    @IsString()
    @MinLength(3)
    @MaxLength(10000)
    final_response!: string;
}

export class LinkResultingDecisionDto {
    @IsUUID()
    decision_id!: string;
}

export class LinkControlledOutputDto {
    @IsUUID()
    document_id!: string;
}

export class CaseNoteDto {
    @IsOptional()
    @IsString()
    @MaxLength(10000)
    note?: string;
}
