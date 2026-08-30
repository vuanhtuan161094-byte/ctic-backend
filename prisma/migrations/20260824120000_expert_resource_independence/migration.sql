SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[expert_availability_periods]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_availability_periods] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_availability_id] DEFAULT NEWID(),
            [expert_id] UNIQUEIDENTIFIER NOT NULL,
            [start_datetime] DATETIME2 NOT NULL,
            [end_datetime] DATETIME2 NOT NULL,
            [availability_type] NVARCHAR(40) NOT NULL,
            [reason] NVARCHAR(500) NULL,
            [note] NVARCHAR(MAX) NULL,
            [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_expert_availability_status] DEFAULT N'ACTIVE',
            [created_by] UNIQUEIDENTIFIER NOT NULL,
            [cancelled_by] UNIQUEIDENTIFIER NULL,
            [cancelled_at] DATETIME2 NULL,
            [cancellation_reason] NVARCHAR(MAX) NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_availability_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_availability_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_availability_periods] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_availability_type] CHECK ([availability_type] IN (
                N'AVAILABLE', N'UNAVAILABLE', N'LEAVE', N'OTHER_COMMITMENT'
            )),
            CONSTRAINT [CK_expert_availability_status] CHECK ([status] IN (N'ACTIVE', N'CANCELLED')),
            CONSTRAINT [CK_expert_availability_dates] CHECK ([end_datetime] >= [start_datetime]),
            CONSTRAINT [FK_expert_availability_expert] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_availability_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_availability_cancelled_by] FOREIGN KEY ([cancelled_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_availability_overlap]
            ON [dbo].[expert_availability_periods]([expert_id], [status], [start_datetime], [end_datetime]);
        CREATE NONCLUSTERED INDEX [IX_expert_availability_type_status]
            ON [dbo].[expert_availability_periods]([availability_type], [status]);
        CREATE NONCLUSTERED INDEX [IX_expert_availability_created_by]
            ON [dbo].[expert_availability_periods]([created_by]);
    END;

    IF OBJECT_ID(N'[dbo].[expert_customer_conflicts]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_customer_conflicts] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_customer_conflict_id] DEFAULT NEWID(),
            [expert_id] UNIQUEIDENTIFIER NOT NULL,
            [customer_id] UNIQUEIDENTIFIER NOT NULL,
            [conflict_type] NVARCHAR(50) NOT NULL,
            [description] NVARCHAR(MAX) NOT NULL,
            [risk_level] NVARCHAR(20) NULL,
            [valid_from] DATE NOT NULL,
            [valid_to] DATE NULL,
            [declaration_status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_expert_customer_conflict_declaration] DEFAULT N'ACTIVE',
            [independence_status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_expert_customer_conflict_decision] DEFAULT N'OPEN',
            [declared_by] UNIQUEIDENTIFIER NOT NULL,
            [declared_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_customer_conflict_declared_at] DEFAULT SYSUTCDATETIME(),
            [reviewed_by] UNIQUEIDENTIFIER NULL,
            [reviewed_at] DATETIME2 NULL,
            [review_note] NVARCHAR(MAX) NULL,
            [mitigation_justification] NVARCHAR(MAX) NULL,
            [cancelled_by] UNIQUEIDENTIFIER NULL,
            [cancelled_at] DATETIME2 NULL,
            [cancellation_reason] NVARCHAR(MAX) NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_customer_conflict_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_customer_conflict_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_customer_conflicts] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_customer_conflict_type] CHECK ([conflict_type] IN (
                N'EMPLOYMENT', N'CONSULTANCY', N'FINANCIAL_INTEREST', N'CLOSE_RELATIONSHIP',
                N'PRIOR_INVOLVEMENT', N'SELF_REVIEW_RISK', N'OTHER'
            )),
            CONSTRAINT [CK_expert_customer_conflict_risk] CHECK ([risk_level] IS NULL OR [risk_level] IN (N'LOW', N'MEDIUM', N'HIGH', N'CRITICAL')),
            CONSTRAINT [CK_expert_customer_conflict_declaration] CHECK ([declaration_status] IN (N'ACTIVE', N'CANCELLED')),
            CONSTRAINT [CK_expert_customer_conflict_decision] CHECK ([independence_status] IN (N'OPEN', N'CLEARED', N'RESTRICTED', N'PROHIBITED')),
            CONSTRAINT [CK_expert_customer_conflict_dates] CHECK ([valid_to] IS NULL OR [valid_to] >= [valid_from]),
            CONSTRAINT [FK_expert_customer_conflict_expert] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_customer_conflict_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_customer_conflict_declared_by] FOREIGN KEY ([declared_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_customer_conflict_reviewed_by] FOREIGN KEY ([reviewed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_customer_conflict_cancelled_by] FOREIGN KEY ([cancelled_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_customer_conflict_effective]
            ON [dbo].[expert_customer_conflicts]([expert_id], [customer_id], [declaration_status], [valid_from], [valid_to]);
        CREATE NONCLUSTERED INDEX [IX_expert_customer_conflict_customer_decision]
            ON [dbo].[expert_customer_conflicts]([customer_id], [independence_status]);
        CREATE NONCLUSTERED INDEX [IX_expert_customer_conflict_declared_by]
            ON [dbo].[expert_customer_conflicts]([declared_by]);
        CREATE NONCLUSTERED INDEX [IX_expert_customer_conflict_reviewed_by]
            ON [dbo].[expert_customer_conflicts]([reviewed_by]);
    END;

    IF OBJECT_ID(N'[dbo].[expert_resource_actions]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_resource_actions] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_resource_action_id] DEFAULT NEWID(),
            [expert_id] UNIQUEIDENTIFIER NOT NULL,
            [entity_type] NVARCHAR(50) NOT NULL,
            [entity_id] UNIQUEIDENTIFIER NOT NULL,
            [action_type] NVARCHAR(50) NOT NULL,
            [reason] NVARCHAR(MAX) NULL,
            [snapshot_json] NVARCHAR(MAX) NULL,
            [actor_id] UNIQUEIDENTIFIER NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_resource_action_created_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_resource_actions] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_resource_action_type] CHECK ([action_type] IN (
                N'AVAILABILITY_CREATED', N'AVAILABILITY_CANCELLED', N'CONFLICT_DECLARED',
                N'CONFLICT_REVIEWED', N'CONFLICT_CANCELLED', N'ASSIGNMENT_BLOCKED'
            )),
            CONSTRAINT [FK_expert_resource_action_expert] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_resource_action_actor] FOREIGN KEY ([actor_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_resource_action_expert_created]
            ON [dbo].[expert_resource_actions]([expert_id], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_expert_resource_action_entity_created]
            ON [dbo].[expert_resource_actions]([entity_type], [entity_id], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_expert_resource_action_type_created]
            ON [dbo].[expert_resource_actions]([action_type], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_expert_resource_action_actor]
            ON [dbo].[expert_resource_actions]([actor_id]);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
