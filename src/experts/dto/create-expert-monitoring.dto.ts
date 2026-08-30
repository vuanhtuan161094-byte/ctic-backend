import {
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export class CreateExpertMonitoringDto {
    @IsIn([
        'WITNESS',
        'AUDIT_REPORT_REVIEW',
        'CUSTOMER_FEEDBACK',
        'MARKET_FEEDBACK',
        'INTERVIEW',
        'THEORY_TEST',
        'SITUATION_TEST',
        'OTHER',
    ])
    monitoring_method!: string;

    @IsString()
    @MaxLength(500)
    monitoring_content!: string;

    @IsOptional()
    @IsIn(['SCHEDULED', 'UNSCHEDULED'])
    plan_type?: string;

    @IsString()
    @MaxLength(30)
    planned_date!: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    due_date?: string;

    @IsOptional()
    @IsUUID()
    competency_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    management_system?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    standard_code?: string;

    @IsOptional()
    @IsUUID()
    audit_plan_id?: string;

    @IsOptional()
    @IsUUID()
    assessor_user_id?: string;
}
