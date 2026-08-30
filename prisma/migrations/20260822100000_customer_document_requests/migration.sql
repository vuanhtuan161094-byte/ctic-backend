SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[customer_document_requests]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[customer_document_requests] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_customer_document_request_id] DEFAULT NEWID(),
            [request_code] NVARCHAR(50) NOT NULL,
            [customer_id] UNIQUEIDENTIFIER NOT NULL,
            [application_id] UNIQUEIDENTIFIER NOT NULL,
            [requested_by] UNIQUEIDENTIFIER NOT NULL,
            [category] NVARCHAR(40) NOT NULL,
            [title] NVARCHAR(255) NOT NULL,
            [description] NVARCHAR(MAX) NULL,
            [due_date] DATE NULL,
            [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_customer_document_request_status] DEFAULT N'REQUESTED',
            [response_note] NVARCHAR(MAX) NULL,
            [responded_by] UNIQUEIDENTIFIER NULL,
            [submitted_at] DATETIME2 NULL,
            [reviewed_by] UNIQUEIDENTIFIER NULL,
            [review_comment] NVARCHAR(MAX) NULL,
            [reviewed_at] DATETIME2 NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_document_request_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_customer_document_request_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_customer_document_requests] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [UQ_customer_document_requests_code] UNIQUE ([request_code]),
            CONSTRAINT [CK_customer_document_requests_category] CHECK ([category] IN (N'LEGAL', N'MANAGEMENT_SYSTEM', N'SCOPE_SITE', N'EMPLOYEE', N'OTHER')),
            CONSTRAINT [CK_customer_document_requests_status] CHECK ([status] IN (N'REQUESTED', N'SUBMITTED', N'REVISION_REQUIRED', N'ACCEPTED', N'CANCELLED')),
            CONSTRAINT [FK_customer_document_request_customer] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_document_request_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[certification_applications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_document_request_requested_by] FOREIGN KEY ([requested_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_document_request_responded_by] FOREIGN KEY ([responded_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_customer_document_request_reviewed_by] FOREIGN KEY ([reviewed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_customer_document_request_customer_status_created]
            ON [dbo].[customer_document_requests]([customer_id], [status], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_document_request_application_status_created]
            ON [dbo].[customer_document_requests]([application_id], [status], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_document_request_requested_by]
            ON [dbo].[customer_document_requests]([requested_by], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_customer_document_request_due_status]
            ON [dbo].[customer_document_requests]([due_date], [status]);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM [dbo].[permissions] WHERE [permission_name] = N'customer_documents.manage'
    )
    BEGIN
        INSERT INTO [dbo].[permissions] ([id], [permission_name])
        VALUES (NEWID(), N'customer_documents.manage');
    END;

    DECLARE @customer_documents_permission UNIQUEIDENTIFIER = (
        SELECT TOP 1 [id]
        FROM [dbo].[permissions]
        WHERE [permission_name] = N'customer_documents.manage'
    );

    IF @customer_documents_permission IS NOT NULL
    BEGIN
        INSERT INTO [dbo].[role_permissions] ([role_id], [permission_id])
        SELECT r.[id], @customer_documents_permission
        FROM [dbo].[roles] r
        WHERE UPPER(r.[role_name]) IN (N'ADMIN', N'COORDINATOR')
          AND NOT EXISTS (
              SELECT 1
              FROM [dbo].[role_permissions] rp
              WHERE rp.[role_id] = r.[id]
                AND rp.[permission_id] = @customer_documents_permission
          );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
