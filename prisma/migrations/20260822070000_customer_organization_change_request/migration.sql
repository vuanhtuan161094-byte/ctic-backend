SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[customer_organization_change_requests]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[customer_organization_change_requests] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_customer_org_change_id] DEFAULT NEWID(),
            [request_code] NVARCHAR(50) NOT NULL,
            [customer_id] UNIQUEIDENTIFIER NOT NULL,
            [requested_by] UNIQUEIDENTIFIER NOT NULL,
            [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_customer_org_change_status] DEFAULT N'SUBMITTED',
            [reason] NVARCHAR(MAX) NOT NULL,
            [before_snapshot] NVARCHAR(MAX) NOT NULL,
            [after_snapshot] NVARCHAR(MAX) NOT NULL,
            [reviewed_by] UNIQUEIDENTIFIER NULL,
            [review_comment] NVARCHAR(MAX) NULL,
            [submitted_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_org_change_submitted_at] DEFAULT SYSUTCDATETIME(),
            [reviewed_at] DATETIME2 NULL,
            [applied_at] DATETIME2 NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_org_change_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_org_change_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_customer_organization_change_requests] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [UQ_customer_organization_change_requests_code] UNIQUE ([request_code]),
            CONSTRAINT [CK_customer_organization_change_requests_status] CHECK ([status] IN (N'SUBMITTED', N'UNDER_REVIEW', N'APPROVED', N'REJECTED', N'CANCELLED')),
            CONSTRAINT [FK_customer_org_change_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_org_change_requested_by] FOREIGN KEY ([requested_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_org_change_reviewed_by] FOREIGN KEY ([reviewed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_customer_org_change_customer_status_created]
            ON [dbo].[customer_organization_change_requests]([customer_id], [status], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_org_change_requested_by]
            ON [dbo].[customer_organization_change_requests]([requested_by], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_org_change_reviewed_by]
            ON [dbo].[customer_organization_change_requests]([reviewed_by], [reviewed_at]);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM [dbo].[permissions] WHERE [permission_name] = N'customer_changes.review'
    )
    BEGIN
        INSERT INTO [dbo].[permissions] ([id], [permission_name])
        VALUES (NEWID(), N'customer_changes.review');
    END;

    DECLARE @customer_change_permission UNIQUEIDENTIFIER = (
        SELECT TOP 1 [id] FROM [dbo].[permissions] WHERE [permission_name] = N'customer_changes.review'
    );

    IF @customer_change_permission IS NOT NULL
    BEGIN
        INSERT INTO [dbo].[role_permissions] ([role_id], [permission_id])
        SELECT r.[id], @customer_change_permission
        FROM [dbo].[roles] r
        WHERE UPPER(r.[role_name]) IN (N'ADMIN', N'COORDINATOR')
          AND NOT EXISTS (
              SELECT 1
              FROM [dbo].[role_permissions] rp
              WHERE rp.[role_id] = r.[id]
                AND rp.[permission_id] = @customer_change_permission
          );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
