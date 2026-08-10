SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    CREATE TABLE [dbo].[customer_user_access] (
        [id] UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT [DF_customer_user_access_id] DEFAULT NEWID(),
        [customer_id] UNIQUEIDENTIFIER NOT NULL,
        [user_id] UNIQUEIDENTIFIER NOT NULL,
        [status] NVARCHAR(20) NOT NULL
            CONSTRAINT [DF_customer_user_access_status] DEFAULT N'active',
        [created_by] UNIQUEIDENTIFIER NULL,
        [created_at] DATETIME2 NOT NULL
            CONSTRAINT [DF_customer_user_access_created_at] DEFAULT CURRENT_TIMESTAMP,
        [updated_at] DATETIME2 NOT NULL
            CONSTRAINT [DF_customer_user_access_updated_at] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [PK_customer_user_access] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_customer_user_access_customer_user]
        ON [dbo].[customer_user_access]([customer_id], [user_id]);

    CREATE NONCLUSTERED INDEX [IX_customer_user_access_user_status]
        ON [dbo].[customer_user_access]([user_id], [status]);

    CREATE NONCLUSTERED INDEX [IX_customer_user_access_customer_status]
        ON [dbo].[customer_user_access]([customer_id], [status]);

    ALTER TABLE [dbo].[customer_user_access]
        ADD CONSTRAINT [FK_customer_user_access_customer]
        FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION;

    ALTER TABLE [dbo].[customer_user_access]
        ADD CONSTRAINT [FK_customer_user_access_user]
        FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION;

    ALTER TABLE [dbo].[customer_user_access]
        ADD CONSTRAINT [FK_customer_user_access_created_by]
        FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
