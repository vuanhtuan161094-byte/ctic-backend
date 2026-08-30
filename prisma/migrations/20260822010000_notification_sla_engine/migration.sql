-- Phase 2.3: durable in-app notification delivery, SLA context and preferences.
-- Existing notification rows are preserved and receive safe delivery defaults.

ALTER TABLE [dbo].[notifications] ADD
    [category] NVARCHAR(50) NOT NULL CONSTRAINT [notifications_category_df] DEFAULT 'WORKFLOW_UPDATE',
    [work_item_id] UNIQUEIDENTIFIER,
    [project_id] UNIQUEIDENTIFIER,
    [audit_event_id] UNIQUEIDENTIFIER,
    [destination_path] NVARCHAR(500),
    [context_json] NVARCHAR(max),
    [channel] NVARCHAR(20) NOT NULL CONSTRAINT [notifications_channel_df] DEFAULT 'IN_APP',
    [delivery_status] NVARCHAR(20) NOT NULL CONSTRAINT [notifications_delivery_status_df] DEFAULT 'DELIVERED';

UPDATE [dbo].[notifications]
SET [severity] = UPPER([severity]);

ALTER TABLE [dbo].[notifications]
DROP CONSTRAINT [notifications_source_key_key];

ALTER TABLE [dbo].[notifications]
ADD CONSTRAINT [UQ_notifications_recipient_source_channel]
UNIQUE NONCLUSTERED ([user_id], [source_key], [channel]);

CREATE INDEX [IX_notifications_user_status_created]
ON [dbo].[notifications]([user_id], [status], [created_at]);

CREATE INDEX [IX_notifications_category]
ON [dbo].[notifications]([category]);

CREATE INDEX [IX_notifications_work_item]
ON [dbo].[notifications]([work_item_id]);

CREATE INDEX [IX_notifications_project]
ON [dbo].[notifications]([project_id]);

CREATE INDEX [IX_notifications_audit_event]
ON [dbo].[notifications]([audit_event_id]);

ALTER TABLE [dbo].[notifications]
ADD CONSTRAINT [FK_notifications_work_item]
FOREIGN KEY ([work_item_id]) REFERENCES [dbo].[work_items]([id]);

ALTER TABLE [dbo].[notifications]
ADD CONSTRAINT [FK_notifications_project]
FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]);

ALTER TABLE [dbo].[notifications]
ADD CONSTRAINT [FK_notifications_audit_event]
FOREIGN KEY ([audit_event_id]) REFERENCES [dbo].[audit_program_events]([id]);

CREATE TABLE [dbo].[notification_preferences] (
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [category] NVARCHAR(50) NOT NULL,
    [channel] NVARCHAR(20) NOT NULL CONSTRAINT [notification_preferences_channel_df] DEFAULT 'IN_APP',
    [enabled] BIT NOT NULL CONSTRAINT [notification_preferences_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notification_preferences_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [notification_preferences_updated_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_notification_preferences] PRIMARY KEY CLUSTERED ([user_id], [category], [channel]),
    CONSTRAINT [FK_notification_preferences_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [IX_notification_preferences_user]
ON [dbo].[notification_preferences]([user_id]);
