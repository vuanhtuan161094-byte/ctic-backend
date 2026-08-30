SET XACT_ABORT ON;

BEGIN TRANSACTION;

CREATE TABLE [dbo].[work_items] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_work_items_id] DEFAULT newid(),
    [source_key] NVARCHAR(200) NOT NULL,
    [work_type] NVARCHAR(80) NOT NULL,
    [action_code] NVARCHAR(100) NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(max) NULL,
    [entity_type] NVARCHAR(80) NOT NULL,
    [entity_id] NVARCHAR(100) NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [audit_event_id] UNIQUEIDENTIFIER NULL,
    [audit_plan_id] UNIQUEIDENTIFIER NULL,
    [cycle_key] NVARCHAR(80) NULL,
    [assigned_user_id] UNIQUEIDENTIFIER NULL,
    [assigned_role] NVARCHAR(50) NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_work_items_status] DEFAULT 'OPEN',
    [priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_work_items_priority] DEFAULT 'NORMAL',
    [due_at] DATETIME2 NULL,
    [available_at] DATETIME2 NULL,
    [completed_at] DATETIME2 NULL,
    [cancelled_at] DATETIME2 NULL,
    [completed_by] UNIQUEIDENTIFIER NULL,
    [destination_path] NVARCHAR(500) NULL,
    [context_json] NVARCHAR(max) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_work_items_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_work_items_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_work_items] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_work_items_source_key] UNIQUE NONCLUSTERED ([source_key]),
    CONSTRAINT [CK_work_items_status] CHECK ([status] IN ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
    CONSTRAINT [CK_work_items_priority] CHECK ([priority] IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT [CK_work_items_assignment] CHECK ([assigned_user_id] IS NOT NULL OR [assigned_role] IS NOT NULL)
);

CREATE NONCLUSTERED INDEX [IX_work_items_assigned_user_status_due]
ON [dbo].[work_items]([assigned_user_id], [status], [due_at]);

CREATE NONCLUSTERED INDEX [IX_work_items_assigned_role_status_due]
ON [dbo].[work_items]([assigned_role], [status], [due_at]);

CREATE NONCLUSTERED INDEX [IX_work_items_project]
ON [dbo].[work_items]([project_id]);

CREATE NONCLUSTERED INDEX [IX_work_items_action_code]
ON [dbo].[work_items]([action_code]);

CREATE NONCLUSTERED INDEX [IX_work_items_audit_event]
ON [dbo].[work_items]([audit_event_id]);

CREATE NONCLUSTERED INDEX [IX_work_items_audit_plan]
ON [dbo].[work_items]([audit_plan_id]);

ALTER TABLE [dbo].[work_items] ADD CONSTRAINT [FK_work_items_project]
FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[work_items] ADD CONSTRAINT [FK_work_items_audit_event]
FOREIGN KEY ([audit_event_id]) REFERENCES [dbo].[audit_program_events]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[work_items] ADD CONSTRAINT [FK_work_items_audit_plan]
FOREIGN KEY ([audit_plan_id]) REFERENCES [dbo].[audit_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[work_items] ADD CONSTRAINT [FK_work_items_assigned_user]
FOREIGN KEY ([assigned_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[work_items] ADD CONSTRAINT [FK_work_items_completed_by]
FOREIGN KEY ([completed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRANSACTION;
