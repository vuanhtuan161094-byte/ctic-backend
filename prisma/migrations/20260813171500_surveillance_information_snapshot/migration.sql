-- GS1/GS2 information snapshot: preserve historical customer/certification data per surveillance event.
CREATE TABLE [dbo].[surveillance_information_snapshots] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_surveillance_information_id] DEFAULT NEWID(),
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [audit_event_id] UNIQUEIDENTIFIER NOT NULL,
    [version_no] INT NOT NULL CONSTRAINT [DF_surveillance_information_version] DEFAULT 1,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_surveillance_information_status] DEFAULT N'DRAFT',
    [source_snapshot_id] UNIQUEIDENTIFIER NULL,
    [source_type] NVARCHAR(40) NOT NULL,
    [baseline_json] NVARCHAR(MAX) NOT NULL,
    [data_json] NVARCHAR(MAX) NOT NULL,
    [changes_json] NVARCHAR(MAX) NOT NULL,
    [change_impact] NVARCHAR(40) NOT NULL CONSTRAINT [DF_surveillance_information_impact] DEFAULT N'NONE',
    [manday_decision] NVARCHAR(40) NOT NULL CONSTRAINT [DF_surveillance_information_manday_decision] DEFAULT N'KEEP_CURRENT',
    [baseline_mandays] DECIMAL(10,2) NULL,
    [effective_mandays] DECIMAL(10,2) NULL,
    [note] NVARCHAR(MAX) NULL,
    [prepared_by] UNIQUEIDENTIFIER NULL,
    [confirmed_by] UNIQUEIDENTIFIER NULL,
    [confirmed_at] DATETIME2 NULL,
    [effective_from] DATE NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_surveillance_information_created] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_surveillance_information_updated] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_surveillance_information_snapshots] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_surveillance_information_event_version] UNIQUE ([audit_event_id], [version_no]),
    CONSTRAINT [FK_surveillance_information_project] FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]),
    CONSTRAINT [FK_surveillance_information_event] FOREIGN KEY ([audit_event_id]) REFERENCES [dbo].[audit_program_events]([id]),
    CONSTRAINT [FK_surveillance_information_prepared_by] FOREIGN KEY ([prepared_by]) REFERENCES [dbo].[users]([id]),
    CONSTRAINT [FK_surveillance_information_confirmed_by] FOREIGN KEY ([confirmed_by]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [IX_surveillance_information_project_status]
    ON [dbo].[surveillance_information_snapshots]([project_id], [status]);

CREATE INDEX [IX_surveillance_information_event_status]
    ON [dbo].[surveillance_information_snapshots]([audit_event_id], [status]);

CREATE INDEX [IX_surveillance_information_source]
    ON [dbo].[surveillance_information_snapshots]([source_snapshot_id]);

CREATE INDEX [IX_surveillance_information_confirmed_at]
    ON [dbo].[surveillance_information_snapshots]([confirmed_at]);
