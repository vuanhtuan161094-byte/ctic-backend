USE [CTIC_Certification];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.application_reviews', 'industry_scopes_json') IS NULL
BEGIN
    ALTER TABLE dbo.application_reviews
        ADD industry_scopes_json NVARCHAR(MAX) NULL;
END;

COMMIT TRANSACTION;
GO

SELECT
    DB_NAME() AS database_name,
    c.name AS column_name,
    t.name AS data_type,
    c.max_length,
    c.is_nullable
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.application_reviews')
  AND c.name = 'industry_scopes_json';

PRINT N'HOÀN TẤT: Đã bổ sung phạm vi nhiều mã ISIC–NACE–IAF cho kết quả xem xét.';
GO
