SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'CTIC_Certification'
BEGIN
    THROW 51000, N'Hãy chọn database CTIC_Certification trước khi chạy script.', 1;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.certification_applications', 'other_certification_type') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD other_certification_type NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'company_name_en') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD company_name_en NVARCHAR(255) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'headquarters_address') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD headquarters_address NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'representative_name') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD representative_name NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'representative_position') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD representative_position NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'representative_phone') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD representative_phone NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'representative_fax') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD representative_fax NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'representative_email') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD representative_email NVARCHAR(255) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'contact_name') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD contact_name NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'contact_position') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD contact_position NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'contact_phone') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD contact_phone NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'contact_fax') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD contact_fax NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'contact_email') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD contact_email NVARCHAR(255) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'total_employee_count') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD total_employee_count INT NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'shift1_count') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD shift1_count INT NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'shift2_count') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD shift2_count INT NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'shift3_count') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD shift3_count INT NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'excluded_clauses') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD excluded_clauses NVARCHAR(500) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'external_provider_used') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD external_provider_used BIT NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'outsourced_processes') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD outsourced_processes NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'stage1_requested_date') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD stage1_requested_date DATE NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'stage2_requested_date') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD stage2_requested_date DATE NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'other_management_systems') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD other_management_systems BIT NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'management_system_details') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD management_system_details NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'associated_documents') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD associated_documents NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'consultant_organization') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD consultant_organization NVARCHAR(255) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'consultant_name') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD consultant_name NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'certificate_languages') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD certificate_languages NVARCHAR(255) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'other_requests') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD other_requests NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.certification_applications', 'declaration_accepted') IS NULL
        EXEC(N'ALTER TABLE dbo.certification_applications ADD declaration_accepted BIT NOT NULL CONSTRAINT DF_certification_applications_declaration_accepted DEFAULT (0);');

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.certification_applications')
          AND name = N'standard_name'
          AND max_length < 1000
    )
        EXEC(N'ALTER TABLE dbo.certification_applications ALTER COLUMN standard_name NVARCHAR(500) NOT NULL;');

    IF OBJECT_ID(N'dbo.certification_application_sites', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.certification_application_sites (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_certification_application_sites PRIMARY KEY DEFAULT NEWID(),
            application_id UNIQUEIDENTIFIER NOT NULL,
            site_no INT NOT NULL,
            site_name NVARCHAR(255) NULL,
            address NVARCHAR(MAX) NOT NULL,
            activities NVARCHAR(MAX) NULL,
            employee_count INT NULL,
            is_headquarters BIT NOT NULL CONSTRAINT DF_certification_application_sites_is_headquarters DEFAULT (0),
            created_at DATETIME2 NOT NULL CONSTRAINT DF_certification_application_sites_created_at DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_certification_application_sites_application_site UNIQUE (application_id, site_no),
            CONSTRAINT FK_certification_application_sites_application FOREIGN KEY (application_id)
                REFERENCES dbo.certification_applications(id)
        );
        CREATE INDEX IX_certification_application_sites_application_id
            ON dbo.certification_application_sites(application_id);
    END;

    IF COL_LENGTH('dbo.application_reviews', 'review_items_json') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD review_items_json NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'audit_field') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD audit_field NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'iaf_code') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD iaf_code NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'isic_code') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD isic_code NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'proposed_auditor_id') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD proposed_auditor_id UNIQUEIDENTIFIER NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'effective_personnel') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD effective_personnel INT NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'risk_level') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD risk_level NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'manday_method') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD manday_method NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'base_mandays') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD base_mandays DECIMAL(10,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'increase_factors') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD increase_factors NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'increase_percent') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD increase_percent DECIMAL(5,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'reduction_factors') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD reduction_factors NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'reduction_percent') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD reduction_percent DECIMAL(5,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'integration_reduction_percent') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD integration_reduction_percent DECIMAL(5,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'final_mandays') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD final_mandays DECIMAL(10,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'stage1_mandays') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD stage1_mandays DECIMAL(10,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'stage2_mandays') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD stage2_mandays DECIMAL(10,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'surveillance_mandays') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD surveillance_mandays DECIMAL(10,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'recertification_mandays') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD recertification_mandays DECIMAL(10,2) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'stage1_proposed_date') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD stage1_proposed_date DATE NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'stage2_proposed_date') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD stage2_proposed_date DATE NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'surveillance1_date') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD surveillance1_date DATE NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'surveillance2_date') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD surveillance2_date DATE NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'recertification_date') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD recertification_date DATE NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'conclusion') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD conclusion NVARCHAR(MAX) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'client_code') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD client_code NVARCHAR(30) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'checked_by_name') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD checked_by_name NVARCHAR(100) NULL;');
    IF COL_LENGTH('dbo.application_reviews', 'approved_by_name') IS NULL
        EXEC(N'ALTER TABLE dbo.application_reviews ADD approved_by_name NVARCHAR(100) NULL;');

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_application_reviews_proposed_auditor'
    )
        ALTER TABLE dbo.application_reviews
        ADD CONSTRAINT FK_application_reviews_proposed_auditor
            FOREIGN KEY (proposed_auditor_id) REFERENCES dbo.experts(id);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.application_reviews')
          AND name = N'IX_application_reviews_proposed_auditor_id'
    )
        CREATE INDEX IX_application_reviews_proposed_auditor_id
            ON dbo.application_reviews(proposed_auditor_id);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT N'Đã nâng cấp biểu mẫu đăng ký và xem xét chứng nhận thành công.' AS result;
