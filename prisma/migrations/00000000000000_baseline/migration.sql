BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__audit_logs__id__59063A47] DEFAULT newid(),
    [user_id] UNIQUEIDENTIFIER,
    [action] NVARCHAR(100) NOT NULL,
    [entity_type] NVARCHAR(50),
    [entity_id] UNIQUEIDENTIFIER,
    [ip_address] NVARCHAR(50),
    [user_agent] NVARCHAR(255),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__audit_log__creat__5AEE82B9] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__audit_lo__3213E83F7D61AA61] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_plans] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [audit_plans_id_df] DEFAULT newid(),
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [audit_event_id] UNIQUEIDENTIFIER,
    [plan_code] NVARCHAR(50),
    [version_no] INT NOT NULL CONSTRAINT [audit_plans_version_no_df] DEFAULT 1,
    [audit_type] NVARCHAR(30),
    [plan_date] DATE,
    [planned_end_date] DATE,
    [location] NVARCHAR(max),
    [audit_scope] NVARCHAR(max),
    [audit_criteria] NVARCHAR(max),
    [audit_objectives] NVARCHAR(max),
    [status] NVARCHAR(30) CONSTRAINT [audit_plans_status_df] DEFAULT 'draft',
    [form_data] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_plans_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_plans_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_plans_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_plans_plan_code_key] UNIQUE NONCLUSTERED ([plan_code])
);

-- CreateTable
CREATE TABLE [dbo].[certificates] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__certificates__id__1EA48E88] DEFAULT newid(),
    [verification_code] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [certificates_verification_code_df] DEFAULT newid(),
    [technical_review_id] UNIQUEIDENTIFIER NOT NULL,
    [cert_number] NVARCHAR(50) NOT NULL,
    [issue_date] DATE,
    [expire_date] DATE,
    [status] NVARCHAR(20) CONSTRAINT [DF__certifica__statu__208CD6FA] DEFAULT 'active',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__certifica__creat__22751F6C] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF__certifica__updat__236943A5] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__certific__3213E83F937E4BBE] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [certificates_verification_code_key] UNIQUE NONCLUSTERED ([verification_code]),
    CONSTRAINT [UQ__certific__6ED41B569BBE96A3] UNIQUE NONCLUSTERED ([technical_review_id]),
    CONSTRAINT [UQ__certific__B8309B494E412033] UNIQUE NONCLUSTERED ([cert_number])
);

-- CreateTable
CREATE TABLE [dbo].[certificate_status_histories] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [certificate_status_histories_id_df] DEFAULT newid(),
    [certificate_id] UNIQUEIDENTIFIER NOT NULL,
    [from_status] NVARCHAR(20) NOT NULL,
    [to_status] NVARCHAR(20) NOT NULL,
    [reason] NVARCHAR(max) NOT NULL,
    [effective_date] DATE NOT NULL,
    [changed_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [certificate_status_histories_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [certificate_status_histories_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certification_projects] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__certificatio__id__02084FDA] DEFAULT newid(),
    [application_id] UNIQUEIDENTIFIER NOT NULL,
    [contract_id] UNIQUEIDENTIFIER,
    [agreement_id] UNIQUEIDENTIFIER,
    [project_code] NVARCHAR(50) NOT NULL,
    [standard_name] NVARCHAR(100),
    [status] NVARCHAR(50) CONSTRAINT [certification_projects_status_df] DEFAULT 'draft',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__certifica__creat__03F0984C] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF__certifica__updat__04E4BC85] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__certific__3213E83F23548939] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__certific__891B3A6F31225100] UNIQUE NONCLUSTERED ([project_code])
);

-- CreateTable
CREATE TABLE [dbo].[contacts] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__contacts__id__75A278F5] DEFAULT newid(),
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [full_name] NVARCHAR(100) NOT NULL,
    [email] NVARCHAR(255),
    [phone] NVARCHAR(20),
    [position] NVARCHAR(100),
    CONSTRAINT [PK__contacts__3213E83F8A1DD906] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[contracts] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__contracts__id__7A672E12] DEFAULT newid(),
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [contract_number] NVARCHAR(50),
    [sign_date] DATE,
    [start_date] DATE,
    [end_date] DATE,
    [total_value] DECIMAL(18,2),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__contracts__creat__7C4F7684] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF__contracts__updat__7D439ABD] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__contract__3213E83FE3E41EAB] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__contract__1CA37CCEA677F36B] UNIQUE NONCLUSTERED ([contract_number])
);

-- CreateTable
CREATE TABLE [dbo].[certification_agreements] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [certification_agreements_id_df] DEFAULT newid(),
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [contract_id] UNIQUEIDENTIFIER,
    [agreement_number] NVARCHAR(50) NOT NULL,
    [sign_date] DATE NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [certification_agreements_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [certification_agreements_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [certification_agreements_agreement_number_key] UNIQUE NONCLUSTERED ([agreement_number])
);

-- CreateTable
CREATE TABLE [dbo].[customers] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__customers__id__6EF57B66] DEFAULT newid(),
    [customer_code] NVARCHAR(20) NOT NULL,
    [company_name] NVARCHAR(255) NOT NULL,
    [tax_code] NVARCHAR(20),
    [address] NVARCHAR(max),
    [phone] NVARCHAR(20),
    [email] NVARCHAR(255),
    [status] NVARCHAR(20) CONSTRAINT [DF__customers__statu__6FE99F9F] DEFAULT 'active',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__customers__creat__71D1E811] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF__customers__updat__72C60C4A] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__customer__3213E83F9D8A955A] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__customer__6A9E4CB7960D22F9] UNIQUE NONCLUSTERED ([customer_code]),
    CONSTRAINT [UQ__customer__13E39CF6CBF8D193] UNIQUE NONCLUSTERED ([tax_code])
);

-- CreateTable
CREATE TABLE [dbo].[certification_applications] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [certification_applications_id_df] DEFAULT newid(),
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [application_code] NVARCHAR(50) NOT NULL,
    [application_date] DATE NOT NULL,
    [certification_type] NVARCHAR(50),
    [standard_name] NVARCHAR(100) NOT NULL,
    [certification_scope] NVARCHAR(max) NOT NULL,
    [site_count] INT NOT NULL CONSTRAINT [certification_applications_site_count_df] DEFAULT 1,
    [employee_count] INT,
    [shift_count] INT,
    [requested_audit_date] DATE,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [certification_applications_status_df] DEFAULT 'draft',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [certification_applications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [certification_applications_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [certification_applications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [certification_applications_application_code_key] UNIQUE NONCLUSTERED ([application_code])
);

-- CreateTable
CREATE TABLE [dbo].[application_reviews] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [application_reviews_id_df] DEFAULT newid(),
    [application_id] UNIQUEIDENTIFIER NOT NULL,
    [reviewer_id] UNIQUEIDENTIFIER,
    [review_date] DATETIME2,
    [result] NVARCHAR(30) NOT NULL,
    [comment] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [application_reviews_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [application_reviews_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[experts] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__experts__id__08B54D69] DEFAULT newid(),
    [full_name] NVARCHAR(100) NOT NULL,
    [email] NVARCHAR(255),
    [phone] NVARCHAR(20),
    [status] NVARCHAR(20) CONSTRAINT [DF__experts__status__09A971A2] DEFAULT 'active',
    CONSTRAINT [PK__experts__3213E83FBB7B989B] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__experts__AB6E616461F69670] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[manday_calculations] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [manday_calculations_id_df] DEFAULT newid(),
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [calculation_code] NVARCHAR(50) NOT NULL,
    [version_no] INT NOT NULL CONSTRAINT [manday_calculations_version_no_df] DEFAULT 1,
    [audit_type] NVARCHAR(30) NOT NULL,
    [standard_type] NVARCHAR(30) NOT NULL,
    [effective_personnel] INT NOT NULL,
    [total_sites] INT NOT NULL CONSTRAINT [manday_calculations_total_sites_df] DEFAULT 1,
    [sampled_sites] INT NOT NULL CONSTRAINT [manday_calculations_sampled_sites_df] DEFAULT 1,
    [complexity_level] NVARCHAR(30),
    [base_mandays] DECIMAL(10,2) NOT NULL,
    [stage1_mandays] DECIMAL(10,2),
    [stage2_mandays] DECIMAL(10,2),
    [onsite_mandays] DECIMAL(10,2),
    [offsite_mandays] DECIMAL(10,2),
    [increase_percent] DECIMAL(5,2) NOT NULL CONSTRAINT [manday_calculations_increase_percent_df] DEFAULT 0,
    [reduction_percent] DECIMAL(5,2) NOT NULL CONSTRAINT [manday_calculations_reduction_percent_df] DEFAULT 0,
    [ims_integration_percent] DECIMAL(5,2) NOT NULL CONSTRAINT [manday_calculations_ims_integration_percent_df] DEFAULT 0,
    [combined_audit_capability_percent] DECIMAL(5,2) NOT NULL CONSTRAINT [manday_calculations_combined_audit_capability_percent_df] DEFAULT 0,
    [ims_reduction_percent] DECIMAL(5,2) NOT NULL CONSTRAINT [manday_calculations_ims_reduction_percent_df] DEFAULT 0,
    [final_mandays] DECIMAL(10,2) NOT NULL,
    [calculation_basis] NVARCHAR(max),
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [manday_calculations_status_df] DEFAULT 'draft',
    [calculated_by] UNIQUEIDENTIFIER,
    [approved_by] UNIQUEIDENTIFIER,
    [calculated_at] DATETIME2 NOT NULL CONSTRAINT [manday_calculations_calculated_at_df] DEFAULT CURRENT_TIMESTAMP,
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [manday_calculations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [manday_calculations_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [manday_calculations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [manday_calculations_calculation_code_key] UNIQUE NONCLUSTERED ([calculation_code]),
    CONSTRAINT [manday_calculations_project_id_version_no_key] UNIQUE NONCLUSTERED ([project_id],[version_no])
);

-- CreateTable
CREATE TABLE [dbo].[manday_adjustments] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [manday_adjustments_id_df] DEFAULT newid(),
    [calculation_id] UNIQUEIDENTIFIER NOT NULL,
    [adjustment_type] NVARCHAR(30) NOT NULL,
    [factor_code] NVARCHAR(50) NOT NULL,
    [percentage] DECIMAL(5,2) NOT NULL,
    [reason] NVARCHAR(max) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [manday_adjustments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [manday_adjustments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[permissions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__permissions__id__628FA481] DEFAULT newid(),
    [permission_name] NVARCHAR(100) NOT NULL,
    CONSTRAINT [PK__permissi__3213E83FC52946FB] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__permissi__81C0F5A2F5DBCA85] UNIQUE NONCLUSTERED ([permission_name])
);

-- CreateTable
CREATE TABLE [dbo].[audit_programs] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [audit_programs_id_df] DEFAULT newid(),
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [copied_from_program_id] UNIQUEIDENTIFIER,
    [program_code] NVARCHAR(50) NOT NULL,
    [program_year] INT NOT NULL CONSTRAINT [audit_programs_program_year_df] DEFAULT datepart(year,getdate()),
    [version_no] INT NOT NULL CONSTRAINT [audit_programs_version_no_df] DEFAULT 1,
    [customer_code] NVARCHAR(50),
    [organization_name_vi] NVARCHAR(255) NOT NULL,
    [address_vi] NVARCHAR(max),
    [certification_criteria] NVARCHAR(100) NOT NULL,
    [certification_scope] NVARCHAR(max) NOT NULL,
    [effective_personnel] INT,
    [certification_type] NVARCHAR(50) NOT NULL,
    [cycle_number] INT NOT NULL CONSTRAINT [audit_programs_cycle_number_df] DEFAULT 1,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_programs_status_df] DEFAULT 'draft',
    [form_data] NVARCHAR(max),
    [prepared_by] UNIQUEIDENTIFIER,
    [prepared_at] DATETIME2 NOT NULL CONSTRAINT [audit_programs_prepared_at_df] DEFAULT CURRENT_TIMESTAMP,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_programs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_programs_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_programs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_programs_program_code_key] UNIQUE NONCLUSTERED ([program_code]),
    CONSTRAINT [audit_programs_project_id_program_year_version_no_key] UNIQUE NONCLUSTERED ([project_id],[program_year],[version_no])
);

-- CreateTable
CREATE TABLE [dbo].[audit_program_events] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [audit_program_events_id_df] DEFAULT newid(),
    [program_id] UNIQUEIDENTIFIER NOT NULL,
    [sequence_no] INT NOT NULL,
    [event_type] NVARCHAR(30) NOT NULL,
    [planned_start_date] DATE,
    [planned_end_date] DATE,
    [actual_start_date] DATE,
    [actual_end_date] DATE,
    [planned_mandays] DECIMAL(10,2),
    [actual_mandays] DECIMAL(10,2),
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_program_events_status_df] DEFAULT 'planned',
    [form_data] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_program_events_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_program_events_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_program_events_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_program_events_program_id_sequence_no_key] UNIQUE NONCLUSTERED ([program_id],[sequence_no])
);

-- CreateTable
CREATE TABLE [dbo].[reports] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__reports__id__114A936A] DEFAULT newid(),
    [audit_plan_id] UNIQUEIDENTIFIER NOT NULL,
    [report_code] NVARCHAR(50),
    [version_no] INT NOT NULL CONSTRAINT [reports_version_no_df] DEFAULT 1,
    [report_date] DATE,
    [audit_start_date] DATE,
    [audit_end_date] DATE,
    [audit_result] NVARCHAR(30),
    [conclusion] NVARCHAR(max),
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [reports_status_df] DEFAULT 'draft',
    [content] NVARCHAR(max),
    [prepared_by] UNIQUEIDENTIFIER,
    [prepared_at] DATETIME2 NOT NULL CONSTRAINT [reports_prepared_at_df] DEFAULT CURRENT_TIMESTAMP,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__reports__created__1332DBDC] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF__reports__updated__14270015] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__reports__3213E83FCE3D7FB9] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [reports_report_code_key] UNIQUE NONCLUSTERED ([report_code]),
    CONSTRAINT [reports_audit_plan_id_version_no_key] UNIQUE NONCLUSTERED ([audit_plan_id],[version_no])
);

-- CreateTable
CREATE TABLE [dbo].[audit_findings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [report_id] UNIQUEIDENTIFIER NOT NULL,
    [finding_code] NVARCHAR(50) NOT NULL,
    [finding_type] NVARCHAR(30) NOT NULL,
    [clause] NVARCHAR(100),
    [requirement] NVARCHAR(max),
    [description] NVARCHAR(max) NOT NULL,
    [objective_evidence] NVARCHAR(max) NOT NULL,
    [detected_date] DATE NOT NULL,
    [due_date] DATE,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_findings_status_df] DEFAULT 'open',
    [created_by] UNIQUEIDENTIFIER,
    [closed_by] UNIQUEIDENTIFIER,
    [closed_at] DATETIME2,
    [close_comment] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_findings_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_findings_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_findings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_findings_finding_code_key] UNIQUE NONCLUSTERED ([finding_code])
);

-- CreateTable
CREATE TABLE [dbo].[corrective_actions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [finding_id] UNIQUEIDENTIFIER NOT NULL,
    [version_no] INT NOT NULL,
    [root_cause] NVARCHAR(max) NOT NULL,
    [correction] NVARCHAR(max) NOT NULL,
    [corrective_action_plan] NVARCHAR(max) NOT NULL,
    [responsible_person] NVARCHAR(255),
    [target_date] DATE,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [corrective_actions_status_df] DEFAULT 'submitted',
    [submitted_by] UNIQUEIDENTIFIER,
    [submitted_at] DATETIME2 NOT NULL CONSTRAINT [corrective_actions_submitted_at_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewed_by] UNIQUEIDENTIFIER,
    [reviewed_at] DATETIME2,
    [review_comment] NVARCHAR(max),
    [content] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [corrective_actions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [corrective_actions_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [corrective_actions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [corrective_actions_finding_id_version_no_key] UNIQUE NONCLUSTERED ([finding_id],[version_no])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [role_id] UNIQUEIDENTIFIER NOT NULL,
    [permission_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK__role_per__C85A5463C37A4B61] PRIMARY KEY CLUSTERED ([role_id],[permission_id])
);

-- CreateTable
CREATE TABLE [dbo].[roles] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__roles__id__5EBF139D] DEFAULT newid(),
    [role_name] NVARCHAR(50) NOT NULL,
    [description] NVARCHAR(255),
    CONSTRAINT [PK__roles__3213E83F59BF27F7] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__roles__783254B1DC60BF76] UNIQUE NONCLUSTERED ([role_name])
);

-- CreateTable
CREATE TABLE [dbo].[sysdiagrams] (
    [name] NVARCHAR(128) NOT NULL,
    [principal_id] INT NOT NULL,
    [diagram_id] INT NOT NULL IDENTITY(1,1),
    [version] INT,
    [definition] VARBINARY(max),
    CONSTRAINT [PK__sysdiagr__C2B05B61FBAB7930] PRIMARY KEY CLUSTERED ([diagram_id]),
    CONSTRAINT [UK_principal_name] UNIQUE NONCLUSTERED ([principal_id],[name])
);

-- CreateTable
CREATE TABLE [dbo].[technical_reviews] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [report_id] UNIQUEIDENTIFIER NOT NULL,
    [reviewer_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(50) NOT NULL CONSTRAINT [technical_reviews_status_df] DEFAULT 'pending',
    [general_comment] NVARCHAR(max),
    [content] NVARCHAR(max),
    [completed_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [technical_reviews_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [technical_reviews_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[certification_decisions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [technical_review_id] UNIQUEIDENTIFIER NOT NULL,
    [decision_number] NVARCHAR(50) NOT NULL,
    [decision_date] DATE NOT NULL,
    [decision_result] NVARCHAR(30) NOT NULL,
    [organization_name] NVARCHAR(255) NOT NULL,
    [organization_address] NVARCHAR(max),
    [management_system] NVARCHAR(100),
    [standard_name] NVARCHAR(100) NOT NULL,
    [certification_scope] NVARCHAR(max) NOT NULL,
    [effective_date] DATE,
    [expiry_date] DATE,
    [surveillance_interval_months] INT NOT NULL CONSTRAINT [certification_decisions_surveillance_interval_months_df] DEFAULT 12,
    [signatory_name] NVARCHAR(150) NOT NULL,
    [signatory_title] NVARCHAR(150) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [certification_decisions_status_df] DEFAULT 'issued',
    [note] NVARCHAR(max),
    [content] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [certification_decisions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [certification_decisions_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [certification_decisions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [certification_decisions_technical_review_id_key] UNIQUE NONCLUSTERED ([technical_review_id]),
    CONSTRAINT [certification_decisions_decision_number_key] UNIQUE NONCLUSTERED ([decision_number])
);

-- CreateTable
CREATE TABLE [dbo].[audit_result_notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [technical_review_id] UNIQUEIDENTIFIER NOT NULL,
    [certification_decision_id] UNIQUEIDENTIFIER,
    [notification_number] NVARCHAR(50) NOT NULL,
    [notification_date] DATE NOT NULL,
    [audit_type] NVARCHAR(30) NOT NULL,
    [audit_start_date] DATE,
    [audit_end_date] DATE,
    [notification_result] NVARCHAR(50) NOT NULL,
    [has_certification_changes] BIT NOT NULL CONSTRAINT [audit_result_notifications_has_certification_changes_df] DEFAULT 0,
    [organization_name] NVARCHAR(255) NOT NULL,
    [organization_address] NVARCHAR(max),
    [recipient_name] NVARCHAR(255),
    [recipient_email] NVARCHAR(255),
    [management_system] NVARCHAR(100),
    [standard_name] NVARCHAR(100) NOT NULL,
    [certification_scope] NVARCHAR(max) NOT NULL,
    [next_audit_due_date] DATE,
    [signatory_name] NVARCHAR(150) NOT NULL,
    [signatory_title] NVARCHAR(150) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_result_notifications_status_df] DEFAULT 'issued',
    [sent_at] DATETIME2,
    [note] NVARCHAR(max),
    [content] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_result_notifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_result_notifications_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_result_notifications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_result_notifications_technical_review_id_key] UNIQUE NONCLUSTERED ([technical_review_id]),
    CONSTRAINT [audit_result_notifications_certification_decision_id_key] UNIQUE NONCLUSTERED ([certification_decision_id]),
    CONSTRAINT [audit_result_notifications_notification_number_key] UNIQUE NONCLUSTERED ([notification_number])
);

-- CreateTable
CREATE TABLE [dbo].[user_roles] (
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [role_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK__user_rol__6EDEA153197A151C] PRIMARY KEY CLUSTERED ([user_id],[role_id])
);

-- CreateTable
CREATE TABLE [dbo].[user_sessions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__user_session__id__534D60F1] DEFAULT newid(),
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [refresh_token_hash] NVARCHAR(255) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [revoked] BIT CONSTRAINT [DF__user_sess__revok__5535A963] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__user_sess__creat__5629CD9C] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__user_ses__3213E83F73F3D137] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__users__id__4CA06362] DEFAULT newid(),
    [username] NVARCHAR(50) NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [password_hash] NVARCHAR(255) NOT NULL,
    [full_name] NVARCHAR(100),
    [status] NVARCHAR(20) CONSTRAINT [DF__users__status__4D94879B] DEFAULT 'active',
    [failed_login_count] INT CONSTRAINT [DF__users__failed_lo__4F7CD00D] DEFAULT 0,
    [locked_until] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF__users__created_a__5070F446] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK__users__3213E83F8D4CA29E] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ__users__F3DBC5724174C9D2] UNIQUE NONCLUSTERED ([username]),
    CONSTRAINT [UQ__users__AB6E6164C6D53E65] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [source_key] NVARCHAR(255) NOT NULL,
    [notification_type] NVARCHAR(50) NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [message] NVARCHAR(max) NOT NULL,
    [severity] NVARCHAR(20) NOT NULL CONSTRAINT [notifications_severity_df] DEFAULT 'info',
    [entity_type] NVARCHAR(50),
    [entity_id] UNIQUEIDENTIFIER,
    [due_date] DATETIME2,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [notifications_status_df] DEFAULT 'unread',
    [read_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [notifications_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [notifications_source_key_key] UNIQUE NONCLUSTERED ([source_key])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_approvals] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__workflow_app__id__2739D489] DEFAULT newid(),
    [entity_type] NVARCHAR(50) NOT NULL,
    [entity_id] UNIQUEIDENTIFIER NOT NULL,
    [step_no] INT NOT NULL,
    [approver_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(20) CONSTRAINT [DF__workflow___statu__29221CFB] DEFAULT 'pending',
    [approved_at] DATETIME2,
    [comment] NVARCHAR(max),
    CONSTRAINT [PK__workflow__3213E83FF3AD032C] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[document_files] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [entity_type] NVARCHAR(100) NOT NULL,
    [entity_id] UNIQUEIDENTIFIER NOT NULL,
    [document_type] NVARCHAR(100) NOT NULL,
    [file_kind] NVARCHAR(50) NOT NULL,
    [original_name] NVARCHAR(255) NOT NULL,
    [stored_name] NVARCHAR(255) NOT NULL,
    [file_url] NVARCHAR(1000) NOT NULL,
    [mime_type] NVARCHAR(150) NOT NULL,
    [file_size] INT NOT NULL,
    [version_no] INT NOT NULL CONSTRAINT [document_files_version_no_df] DEFAULT 1,
    [is_current] BIT NOT NULL CONSTRAINT [document_files_is_current_df] DEFAULT 1,
    [note] NVARCHAR(1000),
    [uploaded_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [document_files_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [document_files_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_document_files_version] UNIQUE NONCLUSTERED ([entity_type],[entity_id],[document_type],[file_kind],[version_no])
);

-- CreateTable
CREATE TABLE [dbo].[audit_team_appointments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [audit_plan_id] UNIQUEIDENTIFIER NOT NULL,
    [appointment_number] NVARCHAR(50) NOT NULL,
    [appointment_date] DATE NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_team_appointments_status_df] DEFAULT 'draft',
    [note] NVARCHAR(max),
    [prepared_by] UNIQUEIDENTIFIER NOT NULL,
    [approved_by] UNIQUEIDENTIFIER,
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_team_appointments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_team_appointments_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_team_appointments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_team_appointments_audit_plan_id_key] UNIQUE NONCLUSTERED ([audit_plan_id]),
    CONSTRAINT [audit_team_appointments_appointment_number_key] UNIQUE NONCLUSTERED ([appointment_number])
);

-- CreateTable
CREATE TABLE [dbo].[audit_team_members] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [appointment_id] UNIQUEIDENTIFIER NOT NULL,
    [expert_id] UNIQUEIDENTIFIER NOT NULL,
    [team_role] NVARCHAR(40) NOT NULL,
    [planned_start_date] DATE NOT NULL,
    [planned_end_date] DATE NOT NULL,
    [planned_mandays] DECIMAL(10,2),
    [actual_start_date] DATE,
    [actual_end_date] DATE,
    [actual_mandays] DECIMAL(10,2),
    [assignment_status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_team_members_assignment_status_df] DEFAULT 'assigned',
    [competency_status] NVARCHAR(30) NOT NULL CONSTRAINT [audit_team_members_competency_status_df] DEFAULT 'not_checked',
    [competency_note] NVARCHAR(max),
    [confirmed_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_team_members_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_team_members_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_team_members_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_team_members_appointment_id_expert_id_key] UNIQUE NONCLUSTERED ([appointment_id],[expert_id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_team_member_scopes] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [member_id] UNIQUEIDENTIFIER NOT NULL,
    [iaf_code] NVARCHAR(20),
    [nace_code] NVARCHAR(30),
    [activity_description] NVARCHAR(max),
    [coverage_type] NVARCHAR(40) NOT NULL CONSTRAINT [audit_team_member_scopes_coverage_type_df] DEFAULT 'full',
    [planned_mandays] DECIMAL(10,2),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_team_member_scopes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [audit_team_member_scopes_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    [project_scope_id] UNIQUEIDENTIFIER,
    CONSTRAINT [audit_team_member_scopes_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[expert_competencies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [expert_id] UNIQUEIDENTIFIER NOT NULL,
    [management_system] NVARCHAR(30) NOT NULL,
    [standard_code] NVARCHAR(100) NOT NULL,
    [competency_role] NVARCHAR(50) NOT NULL,
    [scope_level] NVARCHAR(20) NOT NULL CONSTRAINT [expert_competencies_scope_level_df] DEFAULT 'IAF',
    [iaf_code] NVARCHAR(20) NOT NULL,
    [nace_revision] NVARCHAR(30),
    [nace_code] NVARCHAR(30),
    [competency_level] NVARCHAR(30) NOT NULL CONSTRAINT [expert_competencies_competency_level_df] DEFAULT 'QUALIFIED',
    [approval_status] NVARCHAR(30) NOT NULL CONSTRAINT [expert_competencies_approval_status_df] DEFAULT 'DRAFT',
    [effective_date] DATE NOT NULL,
    [expiry_date] DATE,
    [restriction] NVARCHAR(max),
    [approval_basis] NVARCHAR(max),
    [evidence_summary] NVARCHAR(max),
    [notes] NVARCHAR(max),
    [approved_by] UNIQUEIDENTIFIER,
    [approved_at] DATETIME2,
    [suspended_at] DATETIME2,
    [suspension_reason] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [expert_competencies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [expert_competencies_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [expert_competencies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [expert_competencies_expert_id_management_system_standard_code_competency_role_iaf_code_nace_code_key] UNIQUE NONCLUSTERED ([expert_id],[management_system],[standard_code],[competency_role],[iaf_code],[nace_code])
);

-- CreateTable
CREATE TABLE [dbo].[industry_classifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [classification_type] NVARCHAR(20) NOT NULL,
    [revision] NVARCHAR(30) NOT NULL,
    [code] NVARCHAR(30) NOT NULL,
    [title_en] NVARCHAR(500) NOT NULL,
    [title_vi] NVARCHAR(500),
    [parent_code] NVARCHAR(30),
    [level] INT NOT NULL,
    [valid_from] DATE,
    [valid_to] DATE,
    [is_active] BIT NOT NULL CONSTRAINT [industry_classifications_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [industry_classifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [industry_classifications_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [industry_classifications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [industry_classifications_classification_type_revision_code_key] UNIQUE NONCLUSTERED ([classification_type],[revision],[code])
);

-- CreateTable
CREATE TABLE [dbo].[industry_code_mappings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [source_code_id] UNIQUEIDENTIFIER NOT NULL,
    [target_code_id] UNIQUEIDENTIFIER NOT NULL,
    [mapping_type] NVARCHAR(30) NOT NULL,
    [mapping_status] NVARCHAR(30) NOT NULL CONSTRAINT [industry_code_mappings_mapping_status_df] DEFAULT 'DRAFT',
    [note] NVARCHAR(max),
    [valid_from] DATE,
    [valid_to] DATE,
    [approved_by] UNIQUEIDENTIFIER,
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [industry_code_mappings_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [industry_code_mappings_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [industry_code_mappings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [industry_code_mappings_source_code_id_target_code_id_key] UNIQUE NONCLUSTERED ([source_code_id],[target_code_id])
);

-- CreateTable
CREATE TABLE [dbo].[iaf_scopes] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [iaf_code] NVARCHAR(20) NOT NULL,
    [iaf_name] NVARCHAR(500) NOT NULL,
    [description] NVARCHAR(max),
    [is_active] BIT NOT NULL CONSTRAINT [iaf_scopes_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [iaf_scopes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [iaf_scopes_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [iaf_scopes_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [iaf_scopes_iaf_code_key] UNIQUE NONCLUSTERED ([iaf_code])
);

-- CreateTable
CREATE TABLE [dbo].[nace_iaf_mappings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [nace_code_id] UNIQUEIDENTIFIER NOT NULL,
    [iaf_scope_id] UNIQUEIDENTIFIER NOT NULL,
    [management_system] NVARCHAR(30) NOT NULL,
    [mapping_status] NVARCHAR(30) NOT NULL CONSTRAINT [nace_iaf_mappings_mapping_status_df] DEFAULT 'DRAFT',
    [source_document] NVARCHAR(500),
    [note] NVARCHAR(max),
    [valid_from] DATE,
    [valid_to] DATE,
    [approved_by] UNIQUEIDENTIFIER,
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [nace_iaf_mappings_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [nace_iaf_mappings_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [nace_iaf_mappings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [nace_iaf_mappings_nace_code_id_iaf_scope_id_management_system_key] UNIQUE NONCLUSTERED ([nace_code_id],[iaf_scope_id],[management_system])
);

-- CreateTable
CREATE TABLE [dbo].[certification_project_scopes] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [isic_nace_mapping_id] UNIQUEIDENTIFIER NOT NULL,
    [nace_iaf_mapping_id] UNIQUEIDENTIFIER NOT NULL,
    [management_system] NVARCHAR(30) NOT NULL,
    [standard_code] NVARCHAR(100) NOT NULL,
    [scope_description] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [certification_project_scopes_status_df] DEFAULT 'DRAFT',
    [notes] NVARCHAR(max),
    [selected_by] UNIQUEIDENTIFIER NOT NULL,
    [selected_at] DATETIME2 NOT NULL CONSTRAINT [certification_project_scopes_selected_at_df] DEFAULT CURRENT_TIMESTAMP,
    [approved_by] UNIQUEIDENTIFIER,
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [certification_project_scopes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [certification_project_scopes_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [certification_project_scopes_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [certification_project_scopes_project_id_isic_nace_mapping_id_nace_iaf_mapping_id_key] UNIQUE NONCLUSTERED ([project_id],[isic_nace_mapping_id],[nace_iaf_mapping_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_audit_logs_created] ON [dbo].[audit_logs]([created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_audit_logs_user] ON [dbo].[audit_logs]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_plans_project_id_idx] ON [dbo].[audit_plans]([project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_plans_audit_event_id_idx] ON [dbo].[audit_plans]([audit_event_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_plans_audit_type_idx] ON [dbo].[audit_plans]([audit_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_plans_status_idx] ON [dbo].[audit_plans]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_plans_plan_date_idx] ON [dbo].[audit_plans]([plan_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_certificate_status_histories_certificate] ON [dbo].[certificate_status_histories]([certificate_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_projects_application_id_idx] ON [dbo].[certification_projects]([application_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_projects_contract_id_idx] ON [dbo].[certification_projects]([contract_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_projects_agreement_id_idx] ON [dbo].[certification_projects]([agreement_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_agreements_customer_id_idx] ON [dbo].[certification_agreements]([customer_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_agreements_contract_id_idx] ON [dbo].[certification_agreements]([contract_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_applications_customer_id_idx] ON [dbo].[certification_applications]([customer_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_applications_status_idx] ON [dbo].[certification_applications]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [application_reviews_application_id_idx] ON [dbo].[application_reviews]([application_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [application_reviews_reviewer_id_idx] ON [dbo].[application_reviews]([reviewer_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [manday_calculations_project_id_idx] ON [dbo].[manday_calculations]([project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [manday_calculations_status_idx] ON [dbo].[manday_calculations]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [manday_calculations_calculated_by_idx] ON [dbo].[manday_calculations]([calculated_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [manday_calculations_approved_by_idx] ON [dbo].[manday_calculations]([approved_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [manday_adjustments_calculation_id_idx] ON [dbo].[manday_adjustments]([calculation_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [manday_adjustments_adjustment_type_idx] ON [dbo].[manday_adjustments]([adjustment_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_programs_project_id_idx] ON [dbo].[audit_programs]([project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_programs_program_year_idx] ON [dbo].[audit_programs]([program_year]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_programs_status_idx] ON [dbo].[audit_programs]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_programs_prepared_by_idx] ON [dbo].[audit_programs]([prepared_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_programs_copied_from_program_id_idx] ON [dbo].[audit_programs]([copied_from_program_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_program_events_program_id_idx] ON [dbo].[audit_program_events]([program_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_program_events_event_type_idx] ON [dbo].[audit_program_events]([event_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_program_events_status_idx] ON [dbo].[audit_program_events]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_program_events_planned_start_date_idx] ON [dbo].[audit_program_events]([planned_start_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [reports_audit_plan_id_idx] ON [dbo].[reports]([audit_plan_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [reports_status_idx] ON [dbo].[reports]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [reports_report_date_idx] ON [dbo].[reports]([report_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [reports_prepared_by_idx] ON [dbo].[reports]([prepared_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_findings_report_id_idx] ON [dbo].[audit_findings]([report_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_findings_finding_type_idx] ON [dbo].[audit_findings]([finding_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_findings_status_idx] ON [dbo].[audit_findings]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_findings_due_date_idx] ON [dbo].[audit_findings]([due_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [corrective_actions_finding_id_idx] ON [dbo].[corrective_actions]([finding_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [corrective_actions_status_idx] ON [dbo].[corrective_actions]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [technical_reviews_report_id_idx] ON [dbo].[technical_reviews]([report_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [technical_reviews_reviewer_id_idx] ON [dbo].[technical_reviews]([reviewer_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_decisions_decision_date_idx] ON [dbo].[certification_decisions]([decision_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_decisions_decision_result_idx] ON [dbo].[certification_decisions]([decision_result]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_decisions_status_idx] ON [dbo].[certification_decisions]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_result_notifications_notification_date_idx] ON [dbo].[audit_result_notifications]([notification_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_result_notifications_notification_result_idx] ON [dbo].[audit_result_notifications]([notification_result]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_result_notifications_audit_type_idx] ON [dbo].[audit_result_notifications]([audit_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_result_notifications_status_idx] ON [dbo].[audit_result_notifications]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_user_sessions_user] ON [dbo].[user_sessions]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_user_id_idx] ON [dbo].[notifications]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_status_idx] ON [dbo].[notifications]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_severity_idx] ON [dbo].[notifications]([severity]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_due_date_idx] ON [dbo].[notifications]([due_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_entity_type_entity_id_idx] ON [dbo].[notifications]([entity_type], [entity_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_document_files_entity] ON [dbo].[document_files]([entity_type], [entity_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_document_files_current] ON [dbo].[document_files]([document_type], [file_kind], [is_current]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_appointments_appointment_date_idx] ON [dbo].[audit_team_appointments]([appointment_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_appointments_status_idx] ON [dbo].[audit_team_appointments]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_appointments_prepared_by_idx] ON [dbo].[audit_team_appointments]([prepared_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_appointments_approved_by_idx] ON [dbo].[audit_team_appointments]([approved_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_members_expert_id_idx] ON [dbo].[audit_team_members]([expert_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_members_planned_start_date_planned_end_date_idx] ON [dbo].[audit_team_members]([planned_start_date], [planned_end_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_members_assignment_status_idx] ON [dbo].[audit_team_members]([assignment_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_members_team_role_idx] ON [dbo].[audit_team_members]([team_role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_member_scopes_member_id_idx] ON [dbo].[audit_team_member_scopes]([member_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_member_scopes_iaf_code_idx] ON [dbo].[audit_team_member_scopes]([iaf_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_member_scopes_nace_code_idx] ON [dbo].[audit_team_member_scopes]([nace_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_team_member_scopes_project_scope_id_idx] ON [dbo].[audit_team_member_scopes]([project_scope_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_expert_id_idx] ON [dbo].[expert_competencies]([expert_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_management_system_idx] ON [dbo].[expert_competencies]([management_system]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_standard_code_idx] ON [dbo].[expert_competencies]([standard_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_competency_role_idx] ON [dbo].[expert_competencies]([competency_role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_iaf_code_idx] ON [dbo].[expert_competencies]([iaf_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_nace_code_idx] ON [dbo].[expert_competencies]([nace_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_approval_status_idx] ON [dbo].[expert_competencies]([approval_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [expert_competencies_expiry_date_idx] ON [dbo].[expert_competencies]([expiry_date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_classifications_classification_type_idx] ON [dbo].[industry_classifications]([classification_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_classifications_revision_idx] ON [dbo].[industry_classifications]([revision]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_classifications_code_idx] ON [dbo].[industry_classifications]([code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_classifications_parent_code_idx] ON [dbo].[industry_classifications]([parent_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_classifications_is_active_idx] ON [dbo].[industry_classifications]([is_active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_code_mappings_source_code_id_idx] ON [dbo].[industry_code_mappings]([source_code_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_code_mappings_target_code_id_idx] ON [dbo].[industry_code_mappings]([target_code_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [industry_code_mappings_mapping_status_idx] ON [dbo].[industry_code_mappings]([mapping_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [iaf_scopes_is_active_idx] ON [dbo].[iaf_scopes]([is_active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [nace_iaf_mappings_nace_code_id_idx] ON [dbo].[nace_iaf_mappings]([nace_code_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [nace_iaf_mappings_iaf_scope_id_idx] ON [dbo].[nace_iaf_mappings]([iaf_scope_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [nace_iaf_mappings_management_system_idx] ON [dbo].[nace_iaf_mappings]([management_system]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [nace_iaf_mappings_mapping_status_idx] ON [dbo].[nace_iaf_mappings]([mapping_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_project_id_idx] ON [dbo].[certification_project_scopes]([project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_isic_nace_mapping_id_idx] ON [dbo].[certification_project_scopes]([isic_nace_mapping_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_nace_iaf_mapping_id_idx] ON [dbo].[certification_project_scopes]([nace_iaf_mapping_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_management_system_idx] ON [dbo].[certification_project_scopes]([management_system]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_standard_code_idx] ON [dbo].[certification_project_scopes]([standard_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_status_idx] ON [dbo].[certification_project_scopes]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_selected_by_idx] ON [dbo].[certification_project_scopes]([selected_by]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [certification_project_scopes_approved_by_idx] ON [dbo].[certification_project_scopes]([approved_by]);

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [FK__audit_log__user___59FA5E80] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_plans] ADD CONSTRAINT [audit_plans_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_plans] ADD CONSTRAINT [audit_plans_audit_event_id_fkey] FOREIGN KEY ([audit_event_id]) REFERENCES [dbo].[audit_program_events]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificates] ADD CONSTRAINT [FK__certifica__techn__1F98B2C1] FOREIGN KEY ([technical_review_id]) REFERENCES [dbo].[technical_reviews]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_status_histories] ADD CONSTRAINT [certificate_status_histories_certificate_id_fkey] FOREIGN KEY ([certificate_id]) REFERENCES [dbo].[certificates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certificate_status_histories] ADD CONSTRAINT [certificate_status_histories_changed_by_fkey] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_projects] ADD CONSTRAINT [certification_projects_application_id_fkey] FOREIGN KEY ([application_id]) REFERENCES [dbo].[certification_applications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_projects] ADD CONSTRAINT [certification_projects_contract_id_fkey] FOREIGN KEY ([contract_id]) REFERENCES [dbo].[contracts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_projects] ADD CONSTRAINT [certification_projects_agreement_id_fkey] FOREIGN KEY ([agreement_id]) REFERENCES [dbo].[certification_agreements]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[contacts] ADD CONSTRAINT [FK__contacts__custom__76969D2E] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [FK__contracts__custo__7B5B524B] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_agreements] ADD CONSTRAINT [certification_agreements_customer_id_fkey] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_agreements] ADD CONSTRAINT [certification_agreements_contract_id_fkey] FOREIGN KEY ([contract_id]) REFERENCES [dbo].[contracts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_applications] ADD CONSTRAINT [certification_applications_customer_id_fkey] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[application_reviews] ADD CONSTRAINT [application_reviews_application_id_fkey] FOREIGN KEY ([application_id]) REFERENCES [dbo].[certification_applications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[application_reviews] ADD CONSTRAINT [application_reviews_reviewer_id_fkey] FOREIGN KEY ([reviewer_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[manday_calculations] ADD CONSTRAINT [manday_calculations_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[manday_calculations] ADD CONSTRAINT [manday_calculations_calculated_by_fkey] FOREIGN KEY ([calculated_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[manday_calculations] ADD CONSTRAINT [manday_calculations_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[manday_adjustments] ADD CONSTRAINT [manday_adjustments_calculation_id_fkey] FOREIGN KEY ([calculation_id]) REFERENCES [dbo].[manday_calculations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_programs] ADD CONSTRAINT [audit_programs_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_programs] ADD CONSTRAINT [audit_programs_prepared_by_fkey] FOREIGN KEY ([prepared_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_programs] ADD CONSTRAINT [audit_programs_copied_from_program_id_fkey] FOREIGN KEY ([copied_from_program_id]) REFERENCES [dbo].[audit_programs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_program_events] ADD CONSTRAINT [audit_program_events_program_id_fkey] FOREIGN KEY ([program_id]) REFERENCES [dbo].[audit_programs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reports] ADD CONSTRAINT [FK__reports__audit_p__123EB7A3] FOREIGN KEY ([audit_plan_id]) REFERENCES [dbo].[audit_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reports] ADD CONSTRAINT [reports_prepared_by_fkey] FOREIGN KEY ([prepared_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_findings] ADD CONSTRAINT [audit_findings_report_id_fkey] FOREIGN KEY ([report_id]) REFERENCES [dbo].[reports]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[corrective_actions] ADD CONSTRAINT [corrective_actions_finding_id_fkey] FOREIGN KEY ([finding_id]) REFERENCES [dbo].[audit_findings]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [FK__role_perm__permi__66603565] FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [FK__role_perm__role___656C112C] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[technical_reviews] ADD CONSTRAINT [technical_reviews_report_id_fkey] FOREIGN KEY ([report_id]) REFERENCES [dbo].[reports]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[technical_reviews] ADD CONSTRAINT [technical_reviews_reviewer_id_fkey] FOREIGN KEY ([reviewer_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_decisions] ADD CONSTRAINT [certification_decisions_technical_review_id_fkey] FOREIGN KEY ([technical_review_id]) REFERENCES [dbo].[technical_reviews]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_result_notifications] ADD CONSTRAINT [audit_result_notifications_technical_review_id_fkey] FOREIGN KEY ([technical_review_id]) REFERENCES [dbo].[technical_reviews]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_result_notifications] ADD CONSTRAINT [audit_result_notifications_certification_decision_id_fkey] FOREIGN KEY ([certification_decision_id]) REFERENCES [dbo].[certification_decisions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [FK__user_role__role___6A30C649] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [FK__user_role__user___693CA210] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_sessions] ADD CONSTRAINT [FK__user_sess__user___5441852A] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[workflow_approvals] ADD CONSTRAINT [FK__workflow___appro__282DF8C2] FOREIGN KEY ([approver_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_appointments] ADD CONSTRAINT [audit_team_appointments_audit_plan_id_fkey] FOREIGN KEY ([audit_plan_id]) REFERENCES [dbo].[audit_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_appointments] ADD CONSTRAINT [audit_team_appointments_prepared_by_fkey] FOREIGN KEY ([prepared_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_appointments] ADD CONSTRAINT [audit_team_appointments_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_members] ADD CONSTRAINT [audit_team_members_appointment_id_fkey] FOREIGN KEY ([appointment_id]) REFERENCES [dbo].[audit_team_appointments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_members] ADD CONSTRAINT [audit_team_members_expert_id_fkey] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_member_scopes] ADD CONSTRAINT [audit_team_member_scopes_member_id_fkey] FOREIGN KEY ([member_id]) REFERENCES [dbo].[audit_team_members]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_team_member_scopes] ADD CONSTRAINT [audit_team_member_scopes_project_scope_id_fkey] FOREIGN KEY ([project_scope_id]) REFERENCES [dbo].[certification_project_scopes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[expert_competencies] ADD CONSTRAINT [expert_competencies_expert_id_fkey] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[expert_competencies] ADD CONSTRAINT [expert_competencies_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[industry_code_mappings] ADD CONSTRAINT [industry_code_mappings_source_code_id_fkey] FOREIGN KEY ([source_code_id]) REFERENCES [dbo].[industry_classifications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[industry_code_mappings] ADD CONSTRAINT [industry_code_mappings_target_code_id_fkey] FOREIGN KEY ([target_code_id]) REFERENCES [dbo].[industry_classifications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[industry_code_mappings] ADD CONSTRAINT [industry_code_mappings_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[nace_iaf_mappings] ADD CONSTRAINT [nace_iaf_mappings_nace_code_id_fkey] FOREIGN KEY ([nace_code_id]) REFERENCES [dbo].[industry_classifications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[nace_iaf_mappings] ADD CONSTRAINT [nace_iaf_mappings_iaf_scope_id_fkey] FOREIGN KEY ([iaf_scope_id]) REFERENCES [dbo].[iaf_scopes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[nace_iaf_mappings] ADD CONSTRAINT [nace_iaf_mappings_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_project_scopes] ADD CONSTRAINT [certification_project_scopes_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_project_scopes] ADD CONSTRAINT [certification_project_scopes_isic_nace_mapping_id_fkey] FOREIGN KEY ([isic_nace_mapping_id]) REFERENCES [dbo].[industry_code_mappings]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_project_scopes] ADD CONSTRAINT [certification_project_scopes_nace_iaf_mapping_id_fkey] FOREIGN KEY ([nace_iaf_mapping_id]) REFERENCES [dbo].[nace_iaf_mappings]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_project_scopes] ADD CONSTRAINT [certification_project_scopes_selected_by_fkey] FOREIGN KEY ([selected_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[certification_project_scopes] ADD CONSTRAINT [certification_project_scopes_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
