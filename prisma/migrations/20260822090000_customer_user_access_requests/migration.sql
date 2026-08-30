SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[customer_user_access_requests]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[customer_user_access_requests] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_customer_user_access_request_id] DEFAULT NEWID(),
            [request_code] NVARCHAR(50) NOT NULL,
            [customer_id] UNIQUEIDENTIFIER NOT NULL,
            [requested_by] UNIQUEIDENTIFIER NOT NULL,
            [request_type] NVARCHAR(30) NOT NULL,
            [target_user_id] UNIQUEIDENTIFIER NULL,
            [requested_email] NVARCHAR(255) NULL,
            [requested_full_name] NVARCHAR(100) NULL,
            [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_customer_user_access_request_status] DEFAULT N'SUBMITTED',
            [reason] NVARCHAR(MAX) NOT NULL,
            [reviewed_by] UNIQUEIDENTIFIER NULL,
            [review_comment] NVARCHAR(MAX) NULL,
            [resolved_user_id] UNIQUEIDENTIFIER NULL,
            [submitted_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_user_access_request_submitted_at] DEFAULT SYSUTCDATETIME(),
            [reviewed_at] DATETIME2 NULL,
            [applied_at] DATETIME2 NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_user_access_request_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_user_access_request_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_customer_user_access_requests] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [UQ_customer_user_access_requests_code] UNIQUE ([request_code]),
            CONSTRAINT [CK_customer_user_access_requests_type] CHECK ([request_type] IN (N'ADD_USER', N'REVOKE_ACCESS', N'REACTIVATE_ACCESS')),
            CONSTRAINT [CK_customer_user_access_requests_status] CHECK ([status] IN (N'SUBMITTED', N'APPROVED', N'REJECTED', N'CANCELLED')),
            CONSTRAINT [FK_customer_user_access_request_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_request_requested_by] FOREIGN KEY ([requested_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_request_reviewed_by] FOREIGN KEY ([reviewed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_request_target_user] FOREIGN KEY ([target_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_request_resolved_user] FOREIGN KEY ([resolved_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_customer_user_access_request_customer_status_created]
            ON [dbo].[customer_user_access_requests]([customer_id], [status], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_user_access_request_requested_by]
            ON [dbo].[customer_user_access_requests]([requested_by], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_user_access_request_target_status]
            ON [dbo].[customer_user_access_requests]([target_user_id], [status]);
        CREATE NONCLUSTERED INDEX [IX_customer_user_access_request_reviewed_by]
            ON [dbo].[customer_user_access_requests]([reviewed_by], [reviewed_at]);
    END;

    IF OBJECT_ID(N'[dbo].[customer_user_access_history]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[customer_user_access_history] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_customer_user_access_history_id] DEFAULT NEWID(),
            [customer_user_access_id] UNIQUEIDENTIFIER NOT NULL,
            [customer_id] UNIQUEIDENTIFIER NOT NULL,
            [user_id] UNIQUEIDENTIFIER NOT NULL,
            [action] NVARCHAR(30) NOT NULL,
            [source_type] NVARCHAR(30) NOT NULL,
            [source_request_id] UNIQUEIDENTIFIER NULL,
            [changed_by] UNIQUEIDENTIFIER NULL,
            [note] NVARCHAR(MAX) NULL,
            [changed_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_user_access_history_changed_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_customer_user_access_history] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_customer_user_access_history_action] CHECK ([action] IN (N'ASSIGNED', N'REACTIVATED', N'REVOKED')),
            CONSTRAINT [CK_customer_user_access_history_source] CHECK ([source_type] IN (N'ADMIN_DIRECT', N'CUSTOMER_REQUEST', N'MIGRATION_BASELINE')),
            CONSTRAINT [FK_customer_user_access_history_access] FOREIGN KEY ([customer_user_access_id]) REFERENCES [dbo].[customer_user_access]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_history_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_history_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_history_changed_by] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_user_access_history_source_request] FOREIGN KEY ([source_request_id]) REFERENCES [dbo].[customer_user_access_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_customer_user_access_history_customer_changed]
            ON [dbo].[customer_user_access_history]([customer_id], [changed_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_user_access_history_user_changed]
            ON [dbo].[customer_user_access_history]([user_id], [changed_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_user_access_history_source_request]
            ON [dbo].[customer_user_access_history]([source_request_id]);

        INSERT INTO [dbo].[customer_user_access_history] (
            [id], [customer_user_access_id], [customer_id], [user_id], [action], [source_type], [source_request_id], [changed_by], [note], [changed_at]
        )
        SELECT
            NEWID(),
            cua.[id],
            cua.[customer_id],
            cua.[user_id],
            CASE WHEN LOWER(LTRIM(RTRIM(cua.[status]))) = N'active' THEN N'ASSIGNED' ELSE N'REVOKED' END,
            N'MIGRATION_BASELINE',
            NULL,
            cua.[created_by],
            N'Baseline imported from existing customer_user_access mapping',
            cua.[updated_at]
        FROM [dbo].[customer_user_access] cua
        WHERE NOT EXISTS (
            SELECT 1
            FROM [dbo].[customer_user_access_history] h
            WHERE h.[customer_user_access_id] = cua.[id]
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM [dbo].[permissions] WHERE [permission_name] = N'customer_user_requests.review'
    )
    BEGIN
        INSERT INTO [dbo].[permissions] ([id], [permission_name])
        VALUES (NEWID(), N'customer_user_requests.review');
    END;

    DECLARE @customer_user_review_permission UNIQUEIDENTIFIER = (
        SELECT TOP 1 [id]
        FROM [dbo].[permissions]
        WHERE [permission_name] = N'customer_user_requests.review'
    );

    IF @customer_user_review_permission IS NOT NULL
    BEGIN
        INSERT INTO [dbo].[role_permissions] ([role_id], [permission_id])
        SELECT r.[id], @customer_user_review_permission
        FROM [dbo].[roles] r
        WHERE UPPER(r.[role_name]) = N'ADMIN'
          AND NOT EXISTS (
              SELECT 1
              FROM [dbo].[role_permissions] rp
              WHERE rp.[role_id] = r.[id]
                AND rp.[permission_id] = @customer_user_review_permission
          );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
