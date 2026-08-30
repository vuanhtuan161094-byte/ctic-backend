CREATE TABLE [dbo].[controlled_template_series] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_controlled_template_series_id] DEFAULT newid(),
    [template_code] NVARCHAR(80) NOT NULL,
    [template_name] NVARCHAR(255) NOT NULL,
    [document_type] NVARCHAR(100) NOT NULL,
    [scheme_code] NVARCHAR(100) NULL,
    [language] NVARCHAR(20) NOT NULL CONSTRAINT [DF_controlled_template_series_language] DEFAULT N'vi',
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_controlled_template_series_status] DEFAULT N'ACTIVE',
    [created_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_template_series_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_template_series_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_controlled_template_series] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_controlled_template_series_code] UNIQUE NONCLUSTERED ([template_code]),
    CONSTRAINT [CK_controlled_template_series_status] CHECK ([status] IN (N'ACTIVE', N'WITHDRAWN'))
);

CREATE TABLE [dbo].[controlled_number_sequences] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_controlled_number_sequences_id] DEFAULT newid(),
    [series_key] NVARCHAR(100) NOT NULL,
    [year_no] INT NOT NULL,
    [prefix] NVARCHAR(50) NOT NULL,
    [next_value] INT NOT NULL CONSTRAINT [DF_controlled_number_sequences_next] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_number_sequences_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_number_sequences_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_controlled_number_sequences] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_controlled_number_sequence_series_year] UNIQUE NONCLUSTERED ([series_key], [year_no]),
    CONSTRAINT [CK_controlled_number_sequences_next] CHECK ([next_value] > 0)
);

CREATE TABLE [dbo].[controlled_template_versions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_controlled_template_versions_id] DEFAULT newid(),
    [series_id] UNIQUEIDENTIFIER NOT NULL,
    [revision_no] INT NOT NULL,
    [revision_label] NVARCHAR(40) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_controlled_template_versions_status] DEFAULT N'DRAFT',
    [effective_date] DATE NULL,
    [change_note] NVARCHAR(MAX) NULL,
    [source_file_id] UNIQUEIDENTIFIER NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [reviewed_by] UNIQUEIDENTIFIER NULL,
    [approved_by] UNIQUEIDENTIFIER NULL,
    [reviewed_at] DATETIME2 NULL,
    [approved_at] DATETIME2 NULL,
    [effective_at] DATETIME2 NULL,
    [superseded_at] DATETIME2 NULL,
    [withdrawn_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_template_versions_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_template_versions_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_controlled_template_versions] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_controlled_template_series_revision] UNIQUE NONCLUSTERED ([series_id], [revision_no]),
    CONSTRAINT [CK_controlled_template_version_revision] CHECK ([revision_no] > 0),
    CONSTRAINT [CK_controlled_template_version_status] CHECK ([status] IN (N'DRAFT', N'UNDER_REVIEW', N'REVIEWED', N'APPROVED', N'EFFECTIVE', N'SUPERSEDED', N'WITHDRAWN')),
    CONSTRAINT [FK_controlled_template_version_series] FOREIGN KEY ([series_id]) REFERENCES [dbo].[controlled_template_series]([id]),
    CONSTRAINT [FK_controlled_template_version_source] FOREIGN KEY ([source_file_id]) REFERENCES [dbo].[document_files]([id])
);

CREATE TABLE [dbo].[controlled_documents] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_controlled_documents_id] DEFAULT newid(),
    [document_number] NVARCHAR(100) NOT NULL,
    [document_code] NVARCHAR(80) NOT NULL,
    [document_name] NVARCHAR(255) NOT NULL,
    [document_type] NVARCHAR(100) NOT NULL,
    [entity_type] NVARCHAR(100) NOT NULL,
    [entity_id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [customer_id] UNIQUEIDENTIFIER NULL,
    [owner_id] UNIQUEIDENTIFIER NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_controlled_documents_status] DEFAULT N'DRAFT',
    [current_version_no] INT NOT NULL CONSTRAINT [DF_controlled_documents_current_version] DEFAULT 1,
    [issued_at] DATETIME2 NULL,
    [voided_at] DATETIME2 NULL,
    [void_reason] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_documents_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_documents_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_controlled_documents] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_controlled_documents_number] UNIQUE NONCLUSTERED ([document_number]),
    CONSTRAINT [CK_controlled_documents_current_version] CHECK ([current_version_no] > 0),
    CONSTRAINT [CK_controlled_documents_status] CHECK ([status] IN (N'DRAFT', N'UNDER_REVIEW', N'REVIEWED', N'APPROVED', N'ISSUED', N'VOID'))
);

CREATE TABLE [dbo].[controlled_document_versions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_controlled_document_versions_id] DEFAULT newid(),
    [document_id] UNIQUEIDENTIFIER NOT NULL,
    [version_no] INT NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_controlled_document_versions_status] DEFAULT N'DRAFT',
    [template_version_id] UNIQUEIDENTIFIER NULL,
    [template_code] NVARCHAR(80) NULL,
    [template_revision] NVARCHAR(40) NULL,
    [working_file_id] UNIQUEIDENTIFIER NULL,
    [official_file_id] UNIQUEIDENTIFIER NULL,
    [previous_version_id] UNIQUEIDENTIFIER NULL,
    [change_note] NVARCHAR(MAX) NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [reviewed_by] UNIQUEIDENTIFIER NULL,
    [approved_by] UNIQUEIDENTIFIER NULL,
    [issued_by] UNIQUEIDENTIFIER NULL,
    [reviewed_at] DATETIME2 NULL,
    [approved_at] DATETIME2 NULL,
    [issued_at] DATETIME2 NULL,
    [signature_method] NVARCHAR(40) NULL,
    [signed_by] UNIQUEIDENTIFIER NULL,
    [signed_at] DATETIME2 NULL,
    [signed_sha256] NVARCHAR(64) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_document_versions_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_document_versions_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_controlled_document_versions] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_controlled_document_version] UNIQUE NONCLUSTERED ([document_id], [version_no]),
    CONSTRAINT [CK_controlled_document_version_number] CHECK ([version_no] > 0),
    CONSTRAINT [CK_controlled_document_version_status] CHECK ([status] IN (N'DRAFT', N'UNDER_REVIEW', N'REVIEWED', N'APPROVED', N'ISSUED', N'VOID')),
    CONSTRAINT [CK_controlled_document_signature_method] CHECK ([signature_method] IS NULL OR [signature_method] IN (N'AUTHENTICATED_APPROVAL', N'SIGNATURE_IMAGE', N'SIGNED_SCAN', N'CRYPTOGRAPHIC_SIGNATURE')),
    CONSTRAINT [FK_controlled_document_version_document] FOREIGN KEY ([document_id]) REFERENCES [dbo].[controlled_documents]([id]),
    CONSTRAINT [FK_controlled_document_version_template] FOREIGN KEY ([template_version_id]) REFERENCES [dbo].[controlled_template_versions]([id]),
    CONSTRAINT [FK_controlled_document_version_working_file] FOREIGN KEY ([working_file_id]) REFERENCES [dbo].[document_files]([id]),
    CONSTRAINT [FK_controlled_document_version_official_file] FOREIGN KEY ([official_file_id]) REFERENCES [dbo].[document_files]([id]),
    CONSTRAINT [FK_controlled_document_version_previous] FOREIGN KEY ([previous_version_id]) REFERENCES [dbo].[controlled_document_versions]([id])
);

CREATE TABLE [dbo].[controlled_document_actions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_controlled_document_actions_id] DEFAULT newid(),
    [version_id] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(40) NOT NULL,
    [from_status] NVARCHAR(30) NULL,
    [to_status] NVARCHAR(30) NOT NULL,
    [actor_id] UNIQUEIDENTIFIER NULL,
    [note] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_controlled_document_actions_created_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_controlled_document_actions] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_controlled_document_action_version] FOREIGN KEY ([version_id]) REFERENCES [dbo].[controlled_document_versions]([id])
);

CREATE NONCLUSTERED INDEX [IX_controlled_template_series_type_status] ON [dbo].[controlled_template_series]([document_type], [status]);
CREATE NONCLUSTERED INDEX [IX_controlled_template_version_series_status] ON [dbo].[controlled_template_versions]([series_id], [status]);
CREATE NONCLUSTERED INDEX [IX_controlled_template_version_effective_date] ON [dbo].[controlled_template_versions]([effective_date]);
CREATE UNIQUE NONCLUSTERED INDEX [UQ_controlled_template_version_source] ON [dbo].[controlled_template_versions]([source_file_id]) WHERE [source_file_id] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_controlled_documents_entity] ON [dbo].[controlled_documents]([entity_type], [entity_id]);
CREATE NONCLUSTERED INDEX [IX_controlled_documents_project_status] ON [dbo].[controlled_documents]([project_id], [status]);
CREATE NONCLUSTERED INDEX [IX_controlled_documents_customer_status] ON [dbo].[controlled_documents]([customer_id], [status]);
CREATE NONCLUSTERED INDEX [IX_controlled_documents_type_status] ON [dbo].[controlled_documents]([document_type], [status]);
CREATE NONCLUSTERED INDEX [IX_controlled_document_version_status] ON [dbo].[controlled_document_versions]([document_id], [status]);
CREATE NONCLUSTERED INDEX [IX_controlled_document_version_template] ON [dbo].[controlled_document_versions]([template_version_id]);
CREATE NONCLUSTERED INDEX [IX_controlled_document_version_previous] ON [dbo].[controlled_document_versions]([previous_version_id]);
CREATE UNIQUE NONCLUSTERED INDEX [UQ_controlled_document_working_file] ON [dbo].[controlled_document_versions]([working_file_id]) WHERE [working_file_id] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [UQ_controlled_document_official_file] ON [dbo].[controlled_document_versions]([official_file_id]) WHERE [official_file_id] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_controlled_document_action_version_created] ON [dbo].[controlled_document_actions]([version_id], [created_at]);
CREATE NONCLUSTERED INDEX [IX_controlled_document_action_actor_created] ON [dbo].[controlled_document_actions]([actor_id], [created_at]);
