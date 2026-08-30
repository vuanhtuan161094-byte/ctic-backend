CREATE TABLE [dbo].[certification_schemes] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_certification_schemes_id] DEFAULT NEWID(),
    [code] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_certification_schemes_status] DEFAULT N'ACTIVE',
    [effective_from] DATE NULL,
    [effective_to] DATE NULL,
    [accreditation_metadata] NVARCHAR(1000) NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [updated_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_certification_schemes_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_certification_schemes_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_certification_schemes] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_certification_schemes_code] UNIQUE ([code]),
    CONSTRAINT [CK_certification_schemes_status] CHECK ([status] IN (N'ACTIVE', N'INACTIVE')),
    CONSTRAINT [CK_certification_schemes_dates] CHECK ([effective_to] IS NULL OR [effective_from] IS NULL OR [effective_to] >= [effective_from])
);
CREATE INDEX [IX_certification_schemes_status_dates] ON [dbo].[certification_schemes]([status], [effective_from], [effective_to]);

ALTER TABLE [dbo].[certification_projects] ADD [scheme_config_snapshot] NVARCHAR(MAX) NULL;

CREATE TABLE [dbo].[standard_editions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_standard_editions_id] DEFAULT NEWID(),
    [scheme_id] UNIQUEIDENTIFIER NOT NULL,
    [standard_code] NVARCHAR(100) NOT NULL,
    [standard_name] NVARCHAR(255) NOT NULL,
    [edition] NVARCHAR(50) NOT NULL,
    [effective_from] DATE NOT NULL,
    [withdrawn_at] DATE NULL,
    [superseded_by_id] UNIQUEIDENTIFIER NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_standard_editions_status] DEFAULT N'ACTIVE',
    [created_by] UNIQUEIDENTIFIER NULL,
    [updated_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_standard_editions_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_standard_editions_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_standard_editions] PRIMARY KEY ([id]),
    CONSTRAINT [FK_standard_editions_scheme] FOREIGN KEY ([scheme_id]) REFERENCES [dbo].[certification_schemes]([id]),
    CONSTRAINT [UQ_standard_editions_code_edition] UNIQUE ([standard_code], [edition]),
    CONSTRAINT [CK_standard_editions_status] CHECK ([status] IN (N'ACTIVE', N'INACTIVE', N'SUPERSEDED', N'WITHDRAWN')),
    CONSTRAINT [CK_standard_editions_dates] CHECK ([withdrawn_at] IS NULL OR [withdrawn_at] >= [effective_from])
);
CREATE INDEX [IX_standard_editions_scheme_status] ON [dbo].[standard_editions]([scheme_id], [status]);
CREATE INDEX [IX_standard_editions_dates] ON [dbo].[standard_editions]([effective_from], [withdrawn_at]);

CREATE TABLE [dbo].[scheme_configuration_versions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_scheme_config_id] DEFAULT NEWID(),
    [scheme_id] UNIQUEIDENTIFIER NOT NULL,
    [version_no] INT NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_scheme_config_status] DEFAULT N'DRAFT',
    [effective_from] DATE NOT NULL,
    [effective_to] DATE NULL,
    [cycle_duration_months] INT NOT NULL,
    [surveillance_frequency_months] INT NOT NULL,
    [stage1_applicable] BIT NOT NULL,
    [validity_duration_months] INT NOT NULL,
    [renewal_window_days] INT NOT NULL,
    [reminder_lead_days] INT NOT NULL,
    [required_audit_types] NVARCHAR(500) NOT NULL,
    [required_decision_types] NVARCHAR(500) NOT NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [approved_by] UNIQUEIDENTIFIER NULL,
    [approved_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_scheme_config_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_scheme_config_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_scheme_configuration_versions] PRIMARY KEY ([id]),
    CONSTRAINT [FK_scheme_configuration_scheme] FOREIGN KEY ([scheme_id]) REFERENCES [dbo].[certification_schemes]([id]),
    CONSTRAINT [UQ_scheme_configuration_scheme_version] UNIQUE ([scheme_id], [version_no]),
    CONSTRAINT [CK_scheme_configuration_status] CHECK ([status] IN (N'DRAFT', N'ACTIVE', N'RETIRED')),
    CONSTRAINT [CK_scheme_configuration_dates] CHECK ([effective_to] IS NULL OR [effective_to] >= [effective_from]),
    CONSTRAINT [CK_scheme_configuration_positive] CHECK ([version_no] > 0 AND [cycle_duration_months] > 0 AND [surveillance_frequency_months] > 0 AND [validity_duration_months] > 0 AND [renewal_window_days] >= 0 AND [reminder_lead_days] >= 0)
);
CREATE INDEX [IX_scheme_configuration_resolution] ON [dbo].[scheme_configuration_versions]([scheme_id], [status], [effective_from], [effective_to]);

CREATE TABLE [dbo].[organization_profiles] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_organization_profiles_id] DEFAULT NEWID(),
    [profile_key] NVARCHAR(50) NOT NULL CONSTRAINT [DF_organization_profiles_key] DEFAULT N'PRIMARY',
    [legal_name] NVARCHAR(255) NOT NULL,
    [display_name] NVARCHAR(255) NOT NULL,
    [short_name] NVARCHAR(50) NOT NULL,
    [logo_reference] NVARCHAR(500) NULL,
    [address] NVARCHAR(1000) NULL,
    [email] NVARCHAR(255) NULL,
    [phone] NVARCHAR(50) NULL,
    [website] NVARCHAR(255) NULL,
    [document_footer] NVARCHAR(1000) NULL,
    [portal_title] NVARCHAR(255) NOT NULL CONSTRAINT [DF_organization_profiles_portal_title] DEFAULT N'Certification Management Platform',
    [timezone] NVARCHAR(100) NOT NULL CONSTRAINT [DF_organization_profiles_timezone] DEFAULT N'Asia/Ho_Chi_Minh',
    [locale] NVARCHAR(20) NOT NULL CONSTRAINT [DF_organization_profiles_locale] DEFAULT N'vi-VN',
    [date_format] NVARCHAR(30) NOT NULL CONSTRAINT [DF_organization_profiles_date_format] DEFAULT N'DD/MM/YYYY',
    [default_language] NVARCHAR(10) NOT NULL CONSTRAINT [DF_organization_profiles_language] DEFAULT N'vi',
    [certificate_reminder_days] INT NOT NULL CONSTRAINT [DF_organization_profiles_reminder] DEFAULT 90,
    [file_retention_days] INT NULL,
    [updated_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_organization_profiles_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_organization_profiles_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_organization_profiles] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_organization_profiles_key] UNIQUE ([profile_key]),
    CONSTRAINT [CK_organization_profiles_days] CHECK ([certificate_reminder_days] >= 0 AND ([file_retention_days] IS NULL OR [file_retention_days] >= 0))
);

CREATE TABLE [dbo].[numbering_series_configs] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_numbering_series_configs_id] DEFAULT NEWID(),
    [series_key] NVARCHAR(100) NOT NULL,
    [entity_type] NVARCHAR(50) NOT NULL,
    [prefix] NVARCHAR(50) NOT NULL,
    [padding] INT NOT NULL CONSTRAINT [DF_numbering_series_configs_padding] DEFAULT 4,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_numbering_series_configs_status] DEFAULT N'ACTIVE',
    [effective_from] DATE NOT NULL,
    [effective_to] DATE NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_numbering_series_configs_created] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_numbering_series_configs] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_numbering_series_revision] UNIQUE ([series_key], [effective_from]),
    CONSTRAINT [CK_numbering_series_status] CHECK ([status] IN (N'ACTIVE', N'INACTIVE')),
    CONSTRAINT [CK_numbering_series_padding] CHECK ([padding] BETWEEN 3 AND 12),
    CONSTRAINT [CK_numbering_series_dates] CHECK ([effective_to] IS NULL OR [effective_to] >= [effective_from])
);
CREATE INDEX [IX_numbering_series_resolution] ON [dbo].[numbering_series_configs]([entity_type], [status], [effective_from], [effective_to]);

CREATE TABLE [dbo].[import_jobs] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_import_jobs_id] DEFAULT NEWID(),
    [entity_type] NVARCHAR(50) NOT NULL,
    [import_mode] NVARCHAR(30) NOT NULL CONSTRAINT [DF_import_jobs_mode] DEFAULT N'CREATE_ONLY',
    [source_file_name] NVARCHAR(255) NOT NULL,
    [source_sha256] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_import_jobs_status] DEFAULT N'VALIDATED',
    [total_rows] INT NOT NULL CONSTRAINT [DF_import_jobs_total] DEFAULT 0,
    [valid_rows] INT NOT NULL CONSTRAINT [DF_import_jobs_valid] DEFAULT 0,
    [invalid_rows] INT NOT NULL CONSTRAINT [DF_import_jobs_invalid] DEFAULT 0,
    [duplicate_rows] INT NOT NULL CONSTRAINT [DF_import_jobs_duplicate] DEFAULT 0,
    [warning_rows] INT NOT NULL CONSTRAINT [DF_import_jobs_warning] DEFAULT 0,
    [committed_rows] INT NOT NULL CONSTRAINT [DF_import_jobs_committed] DEFAULT 0,
    [imported_by] UNIQUEIDENTIFIER NOT NULL,
    [committed_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_import_jobs_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_import_jobs_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_import_jobs] PRIMARY KEY ([id]),
    CONSTRAINT [CK_import_jobs_mode] CHECK ([import_mode] IN (N'CREATE_ONLY')),
    CONSTRAINT [CK_import_jobs_status] CHECK ([status] IN (N'VALIDATED', N'COMMITTED', N'FAILED', N'CANCELLED'))
);
CREATE INDEX [IX_import_jobs_importer_created] ON [dbo].[import_jobs]([imported_by], [created_at]);
CREATE INDEX [IX_import_jobs_status_entity] ON [dbo].[import_jobs]([status], [entity_type]);

CREATE TABLE [dbo].[import_job_rows] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_import_job_rows_id] DEFAULT NEWID(),
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [row_number] INT NOT NULL,
    [raw_data] NVARCHAR(MAX) NOT NULL,
    [normalized_data] NVARCHAR(MAX) NULL,
    [validation_status] NVARCHAR(30) NOT NULL,
    [errors] NVARCHAR(MAX) NULL,
    [warnings] NVARCHAR(MAX) NULL,
    [committed_entity_id] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_import_job_rows_created] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_import_job_rows] PRIMARY KEY ([id]),
    CONSTRAINT [FK_import_job_rows_job] FOREIGN KEY ([job_id]) REFERENCES [dbo].[import_jobs]([id]),
    CONSTRAINT [UQ_import_job_rows_job_row] UNIQUE ([job_id], [row_number]),
    CONSTRAINT [CK_import_job_rows_status] CHECK ([validation_status] IN (N'VALID', N'INVALID', N'DUPLICATE'))
);
CREATE INDEX [IX_import_job_rows_status] ON [dbo].[import_job_rows]([job_id], [validation_status]);
