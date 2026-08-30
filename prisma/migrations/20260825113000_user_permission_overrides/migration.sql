SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[user_permission_overrides]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[user_permission_overrides] (
            [user_id] UNIQUEIDENTIFIER NOT NULL,
            [permission_id] UNIQUEIDENTIFIER NOT NULL,
            [effect] NVARCHAR(10) NOT NULL,
            [reason] NVARCHAR(500) NULL,
            [changed_by] UNIQUEIDENTIFIER NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_user_permission_overrides_created_at] DEFAULT (SYSDATETIME()),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_user_permission_overrides_updated_at] DEFAULT (SYSDATETIME()),

            CONSTRAINT [PK_user_permission_overrides]
                PRIMARY KEY ([user_id], [permission_id]),

            CONSTRAINT [CK_user_permission_overrides_effect]
                CHECK ([effect] IN (N'ALLOW', N'DENY')),

            CONSTRAINT [FK_user_permission_overrides_user]
                FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]),

            CONSTRAINT [FK_user_permission_overrides_permission]
                FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]),

            CONSTRAINT [FK_user_permission_overrides_changed_by]
                FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id])
        );

        CREATE INDEX [IX_user_permission_overrides_changed_by]
            ON [dbo].[user_permission_overrides]([changed_by]);

        CREATE INDEX [IX_user_permission_overrides_effect]
            ON [dbo].[user_permission_overrides]([effect]);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
