BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.customers', 'country_name') IS NULL
    BEGIN
        ALTER TABLE [dbo].[customers]
            ADD [country_name] NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('dbo.application_reviews', 'ems_complexity') IS NULL
    BEGIN
        ALTER TABLE [dbo].[application_reviews]
            ADD [ems_complexity] NVARCHAR(30) NULL;
    END;

    IF COL_LENGTH('dbo.application_reviews', 'ohsms_complexity') IS NULL
    BEGIN
        ALTER TABLE [dbo].[application_reviews]
            ADD [ohsms_complexity] NVARCHAR(30) NULL;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
