SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.application_reviews', N'U') IS NULL
        THROW 50001, N'Không tìm thấy bảng dbo.application_reviews.', 1;

    IF COL_LENGTH(N'dbo.application_reviews', N'proposed_auditors_json') IS NULL
        ALTER TABLE dbo.application_reviews ADD proposed_auditors_json NVARCHAR(MAX) NULL;

    IF COL_LENGTH(N'dbo.application_reviews', N'ims_integration_criteria_json') IS NULL
        ALTER TABLE dbo.application_reviews ADD ims_integration_criteria_json NVARCHAR(MAX) NULL;

    IF COL_LENGTH(N'dbo.application_reviews', N'ims_integration_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD ims_integration_percent DECIMAL(5,2) NULL;

    IF COL_LENGTH(N'dbo.application_reviews', N'combined_audit_capability_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD combined_audit_capability_percent DECIMAL(5,2) NULL;

    COMMIT TRANSACTION;
    PRINT N'Đã bổ sung dữ liệu đoàn dự kiến và căn cứ tính man-day tích hợp.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
