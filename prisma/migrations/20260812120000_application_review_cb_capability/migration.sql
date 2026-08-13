BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[contracts]
ADD [currency] NVARCHAR(3) NULL;

CREATE TABLE [dbo].[certification_body_capabilities] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_certification_body_capabilities_id] DEFAULT NEWID(),
    [program_code] NVARCHAR(100) NOT NULL,
    [program_name] NVARCHAR(255) NOT NULL,
    [iaf_scope_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_certification_body_capabilities_status] DEFAULT N'ACTIVE',
    [effective_from] DATE NOT NULL,
    [effective_to] DATE NULL,
    [notes] NVARCHAR(MAX) NULL,
    [created_by] UNIQUEIDENTIFIER NULL,
    [updated_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_certification_body_capabilities_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_certification_body_capabilities_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_certification_body_capabilities] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CK_certification_body_capabilities_status] CHECK ([status] IN (N'ACTIVE', N'INACTIVE')),
    CONSTRAINT [CK_certification_body_capabilities_dates] CHECK ([effective_to] IS NULL OR [effective_to] >= [effective_from]),
    CONSTRAINT [FK_certification_body_capabilities_iaf_scope] FOREIGN KEY ([iaf_scope_id]) REFERENCES [dbo].[iaf_scopes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [FK_certification_body_capabilities_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [FK_certification_body_capabilities_updated_by] FOREIGN KEY ([updated_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE NONCLUSTERED INDEX [UQ_certification_body_capability_program_iaf]
ON [dbo].[certification_body_capabilities]([program_code], [iaf_scope_id]);

CREATE NONCLUSTERED INDEX [IX_certification_body_capability_status_dates]
ON [dbo].[certification_body_capabilities]([status], [effective_from], [effective_to]);

CREATE NONCLUSTERED INDEX [IX_certification_body_capability_iaf]
ON [dbo].[certification_body_capabilities]([iaf_scope_id]);

CREATE NONCLUSTERED INDEX [IX_certification_body_capability_created_by]
ON [dbo].[certification_body_capabilities]([created_by]);

CREATE NONCLUSTERED INDEX [IX_certification_body_capability_updated_by]
ON [dbo].[certification_body_capabilities]([updated_by]);

CREATE TABLE [dbo].[application_review_capability_snapshots] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_application_review_capability_snapshots_id] DEFAULT NEWID(),
    [review_id] UNIQUEIDENTIFIER NOT NULL,
    [capability_id] UNIQUEIDENTIFIER NULL,
    [program_code] NVARCHAR(100) NOT NULL,
    [program_name] NVARCHAR(255) NOT NULL,
    [iaf_code] NVARCHAR(20) NOT NULL,
    [result] NVARCHAR(30) NOT NULL,
    [reason] NVARCHAR(1000) NULL,
    [capability_status] NVARCHAR(30) NULL,
    [capability_effective_from] DATE NULL,
    [capability_effective_to] DATE NULL,
    [evaluated_at] DATETIME2 NOT NULL CONSTRAINT [DF_application_review_capability_snapshots_evaluated_at] DEFAULT CURRENT_TIMESTAMP,
    [evaluated_by] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_application_review_capability_snapshots] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CK_application_review_capability_snapshots_result] CHECK ([result] IN (N'CAPABLE', N'REVIEW_REQUIRED', N'NOT_CAPABLE')),
    CONSTRAINT [FK_application_review_capability_snapshots_review] FOREIGN KEY ([review_id]) REFERENCES [dbo].[application_reviews]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [FK_application_review_capability_snapshots_capability] FOREIGN KEY ([capability_id]) REFERENCES [dbo].[certification_body_capabilities]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [FK_application_review_capability_snapshots_evaluator] FOREIGN KEY ([evaluated_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE NONCLUSTERED INDEX [UQ_application_review_capability_snapshot_pair]
ON [dbo].[application_review_capability_snapshots]([review_id], [program_code], [iaf_code]);

CREATE NONCLUSTERED INDEX [IX_application_review_capability_snapshot_review_result]
ON [dbo].[application_review_capability_snapshots]([review_id], [result]);

CREATE NONCLUSTERED INDEX [IX_application_review_capability_snapshot_capability]
ON [dbo].[application_review_capability_snapshots]([capability_id]);

CREATE NONCLUSTERED INDEX [IX_application_review_capability_snapshot_evaluator]
ON [dbo].[application_review_capability_snapshots]([evaluated_by]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;

THROW;

END CATCH;
