CREATE TABLE [document_library_series] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_document_library_series_id] DEFAULT NEWID(),
    [library_kind] NVARCHAR(20) NOT NULL,
    [document_code] NVARCHAR(100) NOT NULL,
    [title] NVARCHAR(500) NOT NULL,
    [category] NVARCHAR(100) NULL,
    [issuing_body] NVARCHAR(255) NULL,
    [access_scope] NVARCHAR(30) NOT NULL CONSTRAINT [DF_document_library_series_access_scope] DEFAULT N'INTERNAL',
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_document_library_series_status] DEFAULT N'ACTIVE',
    [note] NVARCHAR(MAX) NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_document_library_series_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_document_library_series_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_document_library_series] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_document_library_series_code] UNIQUE ([document_code]),
    CONSTRAINT [CK_document_library_series_kind] CHECK ([library_kind] IN (N'INTERNAL', N'EXTERNAL')),
    CONSTRAINT [CK_document_library_series_access_scope] CHECK ([access_scope] IN (N'INTERNAL', N'RESTRICTED'))
);

CREATE INDEX [IX_document_library_series_kind_status] ON [document_library_series]([library_kind], [status]);
CREATE INDEX [IX_document_library_series_category_status] ON [document_library_series]([category], [status]);

CREATE TABLE [document_library_versions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_document_library_versions_id] DEFAULT NEWID(),
    [series_id] UNIQUEIDENTIFIER NOT NULL,
    [revision_no] INT NOT NULL,
    [revision_label] NVARCHAR(80) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_document_library_versions_status] DEFAULT N'DRAFT',
    [issue_date] DATE NULL,
    [effective_date] DATE NULL,
    [expiry_date] DATE NULL,
    [source_reference] NVARCHAR(1000) NULL,
    [file_id] UNIQUEIDENTIFIER NULL,
    [change_note] NVARCHAR(MAX) NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [reviewed_by] UNIQUEIDENTIFIER NULL,
    [approved_by] UNIQUEIDENTIFIER NULL,
    [reviewed_at] DATETIME2 NULL,
    [approved_at] DATETIME2 NULL,
    [effective_at] DATETIME2 NULL,
    [superseded_at] DATETIME2 NULL,
    [withdrawn_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_document_library_versions_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_document_library_versions_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_document_library_versions] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_document_library_series_revision] UNIQUE ([series_id], [revision_no]),
    CONSTRAINT [UQ_document_library_versions_file] UNIQUE ([file_id]),
    CONSTRAINT [FK_document_library_version_series] FOREIGN KEY ([series_id]) REFERENCES [document_library_series]([id]),
    CONSTRAINT [FK_document_library_version_file] FOREIGN KEY ([file_id]) REFERENCES [document_files]([id]),
    CONSTRAINT [CK_document_library_version_status] CHECK ([status] IN (N'DRAFT', N'UNDER_REVIEW', N'REVIEWED', N'APPROVED', N'EFFECTIVE', N'SUPERSEDED', N'WITHDRAWN'))
);

CREATE INDEX [IX_document_library_version_series_status] ON [document_library_versions]([series_id], [status]);
CREATE INDEX [IX_document_library_version_effective_date] ON [document_library_versions]([effective_date]);

ALTER TABLE [controlled_template_versions] ADD
    [token_snapshot_json] NVARCHAR(MAX) NULL,
    [validation_json] NVARCHAR(MAX) NULL,
    [validated_at] DATETIME2 NULL;

ALTER TABLE [controlled_document_versions] ADD
    [source_snapshot_json] NVARCHAR(MAX) NULL,
    [generation_context_json] NVARCHAR(MAX) NULL;
