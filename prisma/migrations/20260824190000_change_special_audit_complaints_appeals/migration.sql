CREATE TABLE [dbo].[certification_change_cases] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_change_cases_id] DEFAULT newid(),
    [case_number] NVARCHAR(100) NOT NULL,
    [source] NVARCHAR(50) NOT NULL,
    [source_request_id] UNIQUEIDENTIFIER NULL,
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [certificate_series_id] UNIQUEIDENTIFIER NULL,
    [change_type] NVARCHAR(60) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [before_snapshot] NVARCHAR(MAX) NULL,
    [after_snapshot] NVARCHAR(MAX) NULL,
    [effective_date] DATE NULL,
    [submitted_by] UNIQUEIDENTIFIER NOT NULL,
    [owner_id] UNIQUEIDENTIFIER NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_change_cases_status] DEFAULT N'SUBMITTED',
    [assessment_outcome] NVARCHAR(60) NULL,
    [assessment_json] NVARCHAR(MAX) NULL,
    [special_audit_required] BIT NOT NULL CONSTRAINT [DF_change_cases_special_audit] DEFAULT 0,
    [resulting_decision_id] UNIQUEIDENTIFIER NULL,
    [output_document_id] UNIQUEIDENTIFIER NULL,
    [closure_note] NVARCHAR(MAX) NULL,
    [completed_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_change_cases_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_change_cases_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_certification_change_cases] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_change_cases_number] UNIQUE NONCLUSTERED ([case_number]),
    CONSTRAINT [CK_change_cases_status] CHECK ([status] IN (N'DRAFT', N'SUBMITTED', N'UNDER_REVIEW', N'IMPACT_ASSESSED', N'ACTION_REQUIRED', N'COMPLETED', N'REJECTED', N'CANCELLED')),
    CONSTRAINT [FK_change_case_source_request] FOREIGN KEY ([source_request_id]) REFERENCES [dbo].[customer_organization_change_requests]([id]),
    CONSTRAINT [FK_change_case_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]),
    CONSTRAINT [FK_change_case_project] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]),
    CONSTRAINT [FK_change_case_certificate_series] FOREIGN KEY ([certificate_series_id]) REFERENCES [dbo].[certificate_series]([id]),
    CONSTRAINT [FK_change_case_submitter] FOREIGN KEY ([submitted_by]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_change_case_owner] FOREIGN KEY ([owner_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_change_case_resulting_decision] FOREIGN KEY ([resulting_decision_id]) REFERENCES [dbo].[certification_decisions]([id]),
    CONSTRAINT [FK_change_case_output_document] FOREIGN KEY ([output_document_id]) REFERENCES [dbo].[controlled_documents]([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [UQ_change_case_source_request] ON [dbo].[certification_change_cases]([source_request_id]) WHERE [source_request_id] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_change_cases_customer_status_created] ON [dbo].[certification_change_cases]([customer_id], [status], [created_at]);
CREATE NONCLUSTERED INDEX [IX_change_cases_project_status] ON [dbo].[certification_change_cases]([project_id], [status]);
CREATE NONCLUSTERED INDEX [IX_change_cases_owner_status] ON [dbo].[certification_change_cases]([owner_id], [status]);

CREATE TABLE [dbo].[special_audit_cases] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_special_audit_cases_id] DEFAULT newid(),
    [case_number] NVARCHAR(100) NOT NULL,
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [certificate_series_id] UNIQUEIDENTIFIER NULL,
    [trigger_type] NVARCHAR(60) NOT NULL,
    [trigger_entity_type] NVARCHAR(80) NULL,
    [trigger_entity_id] UNIQUEIDENTIFIER NULL,
    [reason] NVARCHAR(MAX) NOT NULL,
    [audit_scope] NVARCHAR(MAX) NOT NULL,
    [purpose] NVARCHAR(MAX) NULL,
    [planned_date] DATE NULL,
    [audit_plan_id] UNIQUEIDENTIFIER NULL,
    [owner_id] UNIQUEIDENTIFIER NULL,
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_special_audit_cases_status] DEFAULT N'OPEN',
    [result] NVARCHAR(MAX) NULL,
    [follow_up_action] NVARCHAR(40) NULL,
    [resulting_decision_id] UNIQUEIDENTIFIER NULL,
    [output_document_id] UNIQUEIDENTIFIER NULL,
    [closed_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_special_audit_cases_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_special_audit_cases_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_special_audit_cases] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_special_audit_cases_number] UNIQUE NONCLUSTERED ([case_number]),
    CONSTRAINT [CK_special_audit_cases_status] CHECK ([status] IN (N'OPEN', N'PLANNING', N'PLANNED', N'IN_PROGRESS', N'RESULT_RECORDED', N'CLOSED', N'CANCELLED')),
    CONSTRAINT [FK_special_audit_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]),
    CONSTRAINT [FK_special_audit_project] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]),
    CONSTRAINT [FK_special_audit_certificate_series] FOREIGN KEY ([certificate_series_id]) REFERENCES [dbo].[certificate_series]([id]),
    CONSTRAINT [FK_special_audit_plan] FOREIGN KEY ([audit_plan_id]) REFERENCES [dbo].[audit_plans]([id]),
    CONSTRAINT [FK_special_audit_owner] FOREIGN KEY ([owner_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_special_audit_creator] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_special_audit_resulting_decision] FOREIGN KEY ([resulting_decision_id]) REFERENCES [dbo].[certification_decisions]([id]),
    CONSTRAINT [FK_special_audit_output_document] FOREIGN KEY ([output_document_id]) REFERENCES [dbo].[controlled_documents]([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [UQ_special_audit_plan] ON [dbo].[special_audit_cases]([audit_plan_id]) WHERE [audit_plan_id] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_special_audits_customer_status_created] ON [dbo].[special_audit_cases]([customer_id], [status], [created_at]);
CREATE NONCLUSTERED INDEX [IX_special_audits_project_status] ON [dbo].[special_audit_cases]([project_id], [status]);
CREATE NONCLUSTERED INDEX [IX_special_audits_owner_status] ON [dbo].[special_audit_cases]([owner_id], [status]);
CREATE NONCLUSTERED INDEX [IX_special_audits_trigger] ON [dbo].[special_audit_cases]([trigger_entity_type], [trigger_entity_id]);

CREATE TABLE [dbo].[complaint_cases] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_complaint_cases_id] DEFAULT newid(),
    [complaint_number] NVARCHAR(100) NOT NULL,
    [received_date] DATE NOT NULL,
    [customer_id] UNIQUEIDENTIFIER NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [certificate_series_id] UNIQUEIDENTIFIER NULL,
    [complainant_name] NVARCHAR(255) NOT NULL,
    [complainant_contact] NVARCHAR(255) NULL,
    [subject] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [source_channel] NVARCHAR(40) NOT NULL,
    [submitted_by] UNIQUEIDENTIFIER NOT NULL,
    [owner_id] UNIQUEIDENTIFIER NULL,
    [investigator_id] UNIQUEIDENTIFIER NULL,
    [decision_owner_id] UNIQUEIDENTIFIER NULL,
    [involved_user_ids_json] NVARCHAR(MAX) NULL,
    [independence_checked_at] DATETIME2 NULL,
    [independence_note] NVARCHAR(MAX) NULL,
    [acknowledgement_date] DATETIME2 NULL,
    [acknowledgement_due] DATETIME2 NULL,
    [investigation_due] DATETIME2 NULL,
    [response_due] DATETIME2 NULL,
    [investigation] NVARCHAR(MAX) NULL,
    [findings] NVARCHAR(MAX) NULL,
    [corrective_actions] NVARCHAR(MAX) NULL,
    [internal_notes] NVARCHAR(MAX) NULL,
    [final_response] NVARCHAR(MAX) NULL,
    [response_document_id] UNIQUEIDENTIFIER NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_complaint_cases_status] DEFAULT N'RECEIVED',
    [closure_note] NVARCHAR(MAX) NULL,
    [closed_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_complaint_cases_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_complaint_cases_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_complaint_cases] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_complaint_cases_number] UNIQUE NONCLUSTERED ([complaint_number]),
    CONSTRAINT [CK_complaint_cases_status] CHECK ([status] IN (N'RECEIVED', N'ACKNOWLEDGED', N'UNDER_REVIEW', N'INVESTIGATING', N'ACTION_REQUIRED', N'RESPONSE_PENDING', N'CLOSED', N'REJECTED', N'OUT_OF_SCOPE')),
    CONSTRAINT [FK_complaint_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]),
    CONSTRAINT [FK_complaint_project] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]),
    CONSTRAINT [FK_complaint_certificate_series] FOREIGN KEY ([certificate_series_id]) REFERENCES [dbo].[certificate_series]([id]),
    CONSTRAINT [FK_complaint_submitter] FOREIGN KEY ([submitted_by]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_complaint_owner] FOREIGN KEY ([owner_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_complaint_investigator] FOREIGN KEY ([investigator_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_complaint_decision_owner] FOREIGN KEY ([decision_owner_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_complaint_response_document] FOREIGN KEY ([response_document_id]) REFERENCES [dbo].[controlled_documents]([id])
);

CREATE NONCLUSTERED INDEX [IX_complaints_customer_status_created] ON [dbo].[complaint_cases]([customer_id], [status], [created_at]);
CREATE NONCLUSTERED INDEX [IX_complaints_owner_status] ON [dbo].[complaint_cases]([owner_id], [status]);
CREATE NONCLUSTERED INDEX [IX_complaints_investigator_status] ON [dbo].[complaint_cases]([investigator_id], [status]);
CREATE NONCLUSTERED INDEX [IX_complaints_response_due_status] ON [dbo].[complaint_cases]([response_due], [status]);

CREATE TABLE [dbo].[appeal_cases] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_appeal_cases_id] DEFAULT newid(),
    [appeal_number] NVARCHAR(100) NOT NULL,
    [challenged_decision_id] UNIQUEIDENTIFIER NOT NULL,
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [certificate_series_id] UNIQUEIDENTIFIER NULL,
    [appellant_name] NVARCHAR(255) NOT NULL,
    [appellant_contact] NVARCHAR(255) NULL,
    [grounds] NVARCHAR(MAX) NOT NULL,
    [submitted_by] UNIQUEIDENTIFIER NOT NULL,
    [owner_id] UNIQUEIDENTIFIER NULL,
    [reviewer_id] UNIQUEIDENTIFIER NULL,
    [decision_owner_id] UNIQUEIDENTIFIER NULL,
    [independence_checked_at] DATETIME2 NULL,
    [independence_note] NVARCHAR(MAX) NULL,
    [acknowledgement_due] DATETIME2 NULL,
    [review_due] DATETIME2 NULL,
    [response_due] DATETIME2 NULL,
    [review_notes] NVARCHAR(MAX) NULL,
    [internal_deliberation] NVARCHAR(MAX) NULL,
    [outcome] NVARCHAR(40) NULL,
    [required_action] NVARCHAR(40) NULL,
    [final_response] NVARCHAR(MAX) NULL,
    [resulting_decision_id] UNIQUEIDENTIFIER NULL,
    [outcome_document_id] UNIQUEIDENTIFIER NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_appeal_cases_status] DEFAULT N'SUBMITTED',
    [closed_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_appeal_cases_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_appeal_cases_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_appeal_cases] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_appeal_cases_number] UNIQUE NONCLUSTERED ([appeal_number]),
    CONSTRAINT [CK_appeal_cases_status] CHECK ([status] IN (N'SUBMITTED', N'ACKNOWLEDGED', N'UNDER_REVIEW', N'INVESTIGATING', N'DECISION_PENDING', N'CLOSED', N'REJECTED', N'OUT_OF_SCOPE')),
    CONSTRAINT [FK_appeal_challenged_decision] FOREIGN KEY ([challenged_decision_id]) REFERENCES [dbo].[certification_decisions]([id]),
    CONSTRAINT [FK_appeal_resulting_decision] FOREIGN KEY ([resulting_decision_id]) REFERENCES [dbo].[certification_decisions]([id]),
    CONSTRAINT [FK_appeal_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]),
    CONSTRAINT [FK_appeal_project] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]),
    CONSTRAINT [FK_appeal_certificate_series] FOREIGN KEY ([certificate_series_id]) REFERENCES [dbo].[certificate_series]([id]),
    CONSTRAINT [FK_appeal_submitter] FOREIGN KEY ([submitted_by]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_appeal_owner] FOREIGN KEY ([owner_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_appeal_reviewer] FOREIGN KEY ([reviewer_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_appeal_decision_owner] FOREIGN KEY ([decision_owner_id]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_appeal_outcome_document] FOREIGN KEY ([outcome_document_id]) REFERENCES [dbo].[controlled_documents]([id])
);

CREATE NONCLUSTERED INDEX [IX_appeals_customer_status_created] ON [dbo].[appeal_cases]([customer_id], [status], [created_at]);
CREATE NONCLUSTERED INDEX [IX_appeals_challenged_decision_status] ON [dbo].[appeal_cases]([challenged_decision_id], [status]);
CREATE NONCLUSTERED INDEX [IX_appeals_owner_status] ON [dbo].[appeal_cases]([owner_id], [status]);
CREATE NONCLUSTERED INDEX [IX_appeals_reviewer_status] ON [dbo].[appeal_cases]([reviewer_id], [status]);
CREATE NONCLUSTERED INDEX [IX_appeals_response_due_status] ON [dbo].[appeal_cases]([response_due], [status]);
