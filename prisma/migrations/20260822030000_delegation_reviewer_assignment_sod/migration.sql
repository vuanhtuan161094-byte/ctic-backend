SET XACT_ABORT ON;

BEGIN TRANSACTION;

CREATE TABLE [dbo].[technical_review_assignments] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_technical_review_assignments_id] DEFAULT newid(),
    [technical_review_id] UNIQUEIDENTIFIER NOT NULL,
    [reviewer_id] UNIQUEIDENTIFIER NOT NULL,
    [assigned_by] UNIQUEIDENTIFIER NOT NULL,
    [assigned_at] DATETIME2 NOT NULL CONSTRAINT [DF_technical_review_assignments_assigned_at] DEFAULT SYSUTCDATETIME(),
    [due_at] DATETIME2 NULL,
    [note] NVARCHAR(max) NULL,
    [reason] NVARCHAR(1000) NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_technical_review_assignments_status] DEFAULT 'CURRENT',
    [ended_at] DATETIME2 NULL,
    CONSTRAINT [PK_technical_review_assignments] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CK_technical_review_assignments_status] CHECK ([status] IN ('CURRENT', 'REASSIGNED', 'COMPLETED'))
);

CREATE UNIQUE NONCLUSTERED INDEX [UQ_technical_review_assignments_current]
ON [dbo].[technical_review_assignments]([technical_review_id]) WHERE [status] = 'CURRENT';
CREATE NONCLUSTERED INDEX [IX_technical_review_assignments_reviewer]
ON [dbo].[technical_review_assignments]([reviewer_id], [status], [due_at]);

ALTER TABLE [dbo].[technical_review_assignments] ADD CONSTRAINT [FK_technical_review_assignments_review]
FOREIGN KEY ([technical_review_id]) REFERENCES [dbo].[technical_reviews]([id]);
ALTER TABLE [dbo].[technical_review_assignments] ADD CONSTRAINT [FK_technical_review_assignments_reviewer]
FOREIGN KEY ([reviewer_id]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[technical_review_assignments] ADD CONSTRAINT [FK_technical_review_assignments_actor]
FOREIGN KEY ([assigned_by]) REFERENCES [dbo].[users]([id]);

INSERT INTO [dbo].[technical_review_assignments]
    ([technical_review_id], [reviewer_id], [assigned_by], [assigned_at], [status], [ended_at], [note])
SELECT [review].[id], [review].[reviewer_id], [review].[reviewer_id], [review].[created_at],
       CASE WHEN LOWER([review].[status]) IN ('completed', 'accepted') THEN 'COMPLETED' ELSE 'CURRENT' END,
       CASE WHEN LOWER([review].[status]) IN ('completed', 'accepted') THEN COALESCE([review].[completed_at], [review].[updated_at]) ELSE NULL END,
       N'Legacy assignment preserved during Phase 2.4 migration'
FROM [dbo].[technical_reviews] AS [review]
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[technical_review_assignments] AS [assignment]
    WHERE [assignment].[technical_review_id] = [review].[id]
);

CREATE TABLE [dbo].[delegations] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_delegations_id] DEFAULT newid(),
    [delegator_user_id] UNIQUEIDENTIFIER NOT NULL,
    [delegate_user_id] UNIQUEIDENTIFIER NOT NULL,
    [effective_from] DATETIME2 NOT NULL,
    [effective_to] DATETIME2 NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_delegations_status] DEFAULT 'SCHEDULED',
    [scope_type] NVARCHAR(30) NOT NULL,
    [action_codes_json] NVARCHAR(max) NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [reason] NVARCHAR(1000) NOT NULL,
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_delegations_created_at] DEFAULT SYSUTCDATETIME(),
    [revoked_by] UNIQUEIDENTIFIER NULL,
    [revoked_at] DATETIME2 NULL,
    CONSTRAINT [PK_delegations] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CK_delegations_users] CHECK ([delegator_user_id] <> [delegate_user_id]),
    CONSTRAINT [CK_delegations_period] CHECK ([effective_to] > [effective_from]),
    CONSTRAINT [CK_delegations_status] CHECK ([status] IN ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')),
    CONSTRAINT [CK_delegations_scope_type] CHECK ([scope_type] IN ('ACTION', 'PROJECT_ACTION'))
);

CREATE NONCLUSTERED INDEX [IX_delegations_delegate_validity]
ON [dbo].[delegations]([delegate_user_id], [status], [effective_from], [effective_to]);
CREATE NONCLUSTERED INDEX [IX_delegations_delegator_validity]
ON [dbo].[delegations]([delegator_user_id], [status], [effective_from], [effective_to]);
CREATE NONCLUSTERED INDEX [IX_delegations_project] ON [dbo].[delegations]([project_id]);

ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [FK_delegations_delegator]
FOREIGN KEY ([delegator_user_id]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [FK_delegations_delegate]
FOREIGN KEY ([delegate_user_id]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [FK_delegations_created_by]
FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [FK_delegations_revoked_by]
FOREIGN KEY ([revoked_by]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [FK_delegations_project]
FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]);

CREATE TABLE [dbo].[delegated_action_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_delegated_action_logs_id] DEFAULT newid(),
    [delegation_id] UNIQUEIDENTIFIER NOT NULL,
    [actor_user_id] UNIQUEIDENTIFIER NOT NULL,
    [delegated_for_user_id] UNIQUEIDENTIFIER NOT NULL,
    [action_code] NVARCHAR(100) NOT NULL,
    [entity_type] NVARCHAR(80) NOT NULL,
    [entity_id] NVARCHAR(100) NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [technical_review_id] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_delegated_action_logs_created_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_delegated_action_logs] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [IX_delegated_action_logs_delegation]
ON [dbo].[delegated_action_logs]([delegation_id], [created_at]);
CREATE NONCLUSTERED INDEX [IX_delegated_action_logs_actor]
ON [dbo].[delegated_action_logs]([actor_user_id], [created_at]);

ALTER TABLE [dbo].[delegated_action_logs] ADD CONSTRAINT [FK_delegated_action_logs_delegation]
FOREIGN KEY ([delegation_id]) REFERENCES [dbo].[delegations]([id]);
ALTER TABLE [dbo].[delegated_action_logs] ADD CONSTRAINT [FK_delegated_action_logs_actor]
FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[delegated_action_logs] ADD CONSTRAINT [FK_delegated_action_logs_for]
FOREIGN KEY ([delegated_for_user_id]) REFERENCES [dbo].[users]([id]);
ALTER TABLE [dbo].[delegated_action_logs] ADD CONSTRAINT [FK_delegated_action_logs_project]
FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id]);
ALTER TABLE [dbo].[delegated_action_logs] ADD CONSTRAINT [FK_delegated_action_logs_review]
FOREIGN KEY ([technical_review_id]) REFERENCES [dbo].[technical_reviews]([id]);

IF NOT EXISTS (SELECT 1 FROM [dbo].[permissions] WHERE [permission_name] = 'technical_review.assign')
BEGIN
    INSERT INTO [dbo].[permissions] ([permission_name]) VALUES ('technical_review.assign');
END;

INSERT INTO [dbo].[role_permissions] ([role_id], [permission_id])
SELECT [role].[id], [permission].[id]
FROM [dbo].[roles] AS [role]
CROSS JOIN [dbo].[permissions] AS [permission]
WHERE LOWER([role].[role_name]) IN ('admin', 'coordinator')
  AND [permission].[permission_name] = 'technical_review.assign'
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[role_permissions] AS [existing]
      WHERE [existing].[role_id] = [role].[id]
        AND [existing].[permission_id] = [permission].[id]
  );

INSERT INTO [dbo].[role_permissions] ([role_id], [permission_id])
SELECT [role].[id], [permission].[id]
FROM [dbo].[roles] AS [role]
CROSS JOIN [dbo].[permissions] AS [permission]
WHERE LOWER([role].[role_name]) = 'coordinator'
  AND [permission].[permission_name] = 'technical_reviews.read'
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[role_permissions] AS [existing]
      WHERE [existing].[role_id] = [role].[id]
        AND [existing].[permission_id] = [permission].[id]
  );

COMMIT TRANSACTION;
