-- P.09 F.16 versioned recognized-certification-body register.
-- SCHEMA ONLY: this migration is NOT executed on production, DEMO or SQL staging by this commit.
CREATE TABLE [dbo].[p09_recognized_certification_bodies] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_p09_f16_id] DEFAULT NEWID(),
    [revision_no] INT NOT NULL,
    [organizations_json] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_p09_f16_status] DEFAULT N'draft',
    [prepared_by] UNIQUEIDENTIFIER NOT NULL,
    [approved_by] UNIQUEIDENTIFIER NULL,
    [approved_at] DATETIME2 NULL,
    [note] NVARCHAR(4000) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_p09_f16_created_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_p09_f16] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_p09_f16_revision] UNIQUE ([revision_no]),
    CONSTRAINT [CK_p09_f16_status] CHECK ([status] IN (N'draft', N'approved'))
);
CREATE INDEX [IX_p09_f16_status_revision] ON [dbo].[p09_recognized_certification_bodies] ([status], [revision_no]);
