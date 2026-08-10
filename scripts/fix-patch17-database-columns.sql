USE [CTIC_Certification];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.application_reviews', N'U') IS NULL
        THROW 50001, N'Không tìm thấy bảng dbo.application_reviews trong CTIC_Certification.', 1;

    IF COL_LENGTH(N'dbo.application_reviews', N'proposed_auditors_json') IS NULL
        ALTER TABLE dbo.application_reviews
        ADD proposed_auditors_json NVARCHAR(MAX) NULL;

    IF COL_LENGTH(N'dbo.application_reviews', N'ims_integration_criteria_json') IS NULL
        ALTER TABLE dbo.application_reviews
        ADD ims_integration_criteria_json NVARCHAR(MAX) NULL;

    IF COL_LENGTH(N'dbo.application_reviews', N'ims_integration_percent') IS NULL
        ALTER TABLE dbo.application_reviews
        ADD ims_integration_percent DECIMAL(5,2) NULL;

    IF COL_LENGTH(N'dbo.application_reviews', N'combined_audit_capability_percent') IS NULL
        ALTER TABLE dbo.application_reviews
        ADD combined_audit_capability_percent DECIMAL(5,2) NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT
    DB_NAME() AS database_name,
    c.name AS column_name,
    TYPE_NAME(c.user_type_id) AS data_type,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.application_reviews')
  AND c.name IN (
      N'proposed_auditors_json',
      N'ims_integration_criteria_json',
      N'ims_integration_percent',
      N'combined_audit_capability_percent'
  )
ORDER BY c.name;
GO

PRINT N'HOÀN TẤT: Đã đồng bộ 4 cột Patch 17 trong dbo.application_reviews.';
GO
