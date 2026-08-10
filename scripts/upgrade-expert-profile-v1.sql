USE [CTIC_Certification];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.experts', 'user_id') IS NULL
    ALTER TABLE dbo.experts ADD user_id UNIQUEIDENTIFIER NULL;

IF COL_LENGTH('dbo.experts', 'employee_code') IS NULL
    ALTER TABLE dbo.experts ADD employee_code NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.experts', 'date_of_birth') IS NULL
    ALTER TABLE dbo.experts ADD date_of_birth DATE NULL;

IF COL_LENGTH('dbo.experts', 'gender') IS NULL
    ALTER TABLE dbo.experts ADD gender NVARCHAR(20) NULL;

IF COL_LENGTH('dbo.experts', 'address') IS NULL
    ALTER TABLE dbo.experts ADD address NVARCHAR(500) NULL;

IF COL_LENGTH('dbo.experts', 'employment_type') IS NULL
    ALTER TABLE dbo.experts ADD employment_type NVARCHAR(30) NULL;

IF COL_LENGTH('dbo.experts', 'organization') IS NULL
    ALTER TABLE dbo.experts ADD organization NVARCHAR(255) NULL;

IF COL_LENGTH('dbo.experts', 'job_title') IS NULL
    ALTER TABLE dbo.experts ADD job_title NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.experts', 'education_level') IS NULL
    ALTER TABLE dbo.experts ADD education_level NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.experts', 'specialization') IS NULL
    ALTER TABLE dbo.experts ADD specialization NVARCHAR(255) NULL;

IF COL_LENGTH('dbo.experts', 'education_summary') IS NULL
    ALTER TABLE dbo.experts ADD education_summary NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.experts', 'experience_summary') IS NULL
    ALTER TABLE dbo.experts ADD experience_summary NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.experts', 'profile_status') IS NULL
    ALTER TABLE dbo.experts ADD profile_status NVARCHAR(30) NOT NULL
        CONSTRAINT DF_experts_profile_status DEFAULT('DRAFT');

IF COL_LENGTH('dbo.experts', 'approved_by') IS NULL
    ALTER TABLE dbo.experts ADD approved_by UNIQUEIDENTIFIER NULL;

IF COL_LENGTH('dbo.experts', 'approved_at') IS NULL
    ALTER TABLE dbo.experts ADD approved_at DATETIME2 NULL;

IF COL_LENGTH('dbo.experts', 'suspension_reason') IS NULL
    ALTER TABLE dbo.experts ADD suspension_reason NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.experts', 'created_at') IS NULL
    ALTER TABLE dbo.experts ADD created_at DATETIME2 NOT NULL
        CONSTRAINT DF_experts_created_at DEFAULT(SYSUTCDATETIME());

IF COL_LENGTH('dbo.experts', 'updated_at') IS NULL
    ALTER TABLE dbo.experts ADD updated_at DATETIME2 NOT NULL
        CONSTRAINT DF_experts_updated_at DEFAULT(SYSUTCDATETIME());

IF COL_LENGTH('dbo.expert_competencies', 'scope_description') IS NULL
    ALTER TABLE dbo.expert_competencies ADD scope_description NVARCHAR(MAX) NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_experts_user_account'
)
    ALTER TABLE dbo.experts ADD CONSTRAINT FK_experts_user_account
        FOREIGN KEY (user_id) REFERENCES dbo.users(id);

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_experts_approved_by'
)
    ALTER TABLE dbo.experts ADD CONSTRAINT FK_experts_approved_by
        FOREIGN KEY (approved_by) REFERENCES dbo.users(id);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.experts') AND name = 'UX_experts_user_id'
)
    CREATE UNIQUE INDEX UX_experts_user_id
        ON dbo.experts(user_id)
        WHERE user_id IS NOT NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.experts') AND name = 'UX_experts_employee_code'
)
    CREATE UNIQUE INDEX UX_experts_employee_code
        ON dbo.experts(employee_code)
        WHERE employee_code IS NOT NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.experts') AND name = 'IX_experts_profile_status'
)
    CREATE INDEX IX_experts_profile_status ON dbo.experts(profile_status);

IF OBJECT_ID('dbo.expert_work_experiences', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.expert_work_experiences (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_expert_work_experiences PRIMARY KEY
            CONSTRAINT DF_expert_work_experiences_id DEFAULT(NEWID()),
        expert_id UNIQUEIDENTIFIER NOT NULL,
        organization NVARCHAR(255) NOT NULL,
        position NVARCHAR(150) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        industry_codes NVARCHAR(500) NULL,
        responsibility NVARCHAR(MAX) NULL,
        achievement_note NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_expert_work_experiences_created_at DEFAULT(SYSUTCDATETIME()),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_expert_work_experiences_updated_at DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_expert_work_experiences_expert
            FOREIGN KEY (expert_id) REFERENCES dbo.experts(id)
    );

    CREATE INDEX IX_expert_work_experiences_expert_id
        ON dbo.expert_work_experiences(expert_id);
    CREATE INDEX IX_expert_work_experiences_start_date
        ON dbo.expert_work_experiences(start_date);
END;

IF OBJECT_ID('dbo.expert_certificates', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.expert_certificates (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_expert_certificates PRIMARY KEY
            CONSTRAINT DF_expert_certificates_id DEFAULT(NEWID()),
        expert_id UNIQUEIDENTIFIER NOT NULL,
        certificate_type NVARCHAR(50) NOT NULL,
        certificate_name NVARCHAR(255) NOT NULL,
        certificate_number NVARCHAR(100) NULL,
        issuing_organization NVARCHAR(255) NULL,
        standard_code NVARCHAR(100) NULL,
        issue_date DATE NULL,
        expiry_date DATE NULL,
        credential_url NVARCHAR(1000) NULL,
        note NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_expert_certificates_created_at DEFAULT(SYSUTCDATETIME()),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_expert_certificates_updated_at DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_expert_certificates_expert
            FOREIGN KEY (expert_id) REFERENCES dbo.experts(id)
    );

    CREATE INDEX IX_expert_certificates_expert_id
        ON dbo.expert_certificates(expert_id);
    CREATE INDEX IX_expert_certificates_expiry_date
        ON dbo.expert_certificates(expiry_date);
    CREATE INDEX IX_expert_certificates_type
        ON dbo.expert_certificates(certificate_type);
END;

/* Tự động liên kết hồ sơ cũ với tài khoản có cùng email. */
UPDATE e
SET e.user_id = u.id,
    e.full_name = COALESCE(NULLIF(LTRIM(RTRIM(u.full_name)), ''), u.username),
    e.email = u.email
FROM dbo.experts e
INNER JOIN dbo.users u
    ON LOWER(LTRIM(RTRIM(e.email))) = LOWER(LTRIM(RTRIM(u.email)))
WHERE e.user_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.experts other
      WHERE other.user_id = u.id
  );

/* Giữ dữ liệu kiểm thử hiện tại hoạt động sau khi nâng cấp. */
UPDATE dbo.experts
SET profile_status = 'APPROVED',
    approved_at = COALESCE(approved_at, SYSUTCDATETIME())
WHERE status = 'active'
  AND user_id IS NOT NULL
  AND profile_status = 'DRAFT';

COMMIT TRANSACTION;
GO

SELECT
    id,
    employee_code,
    full_name,
    email,
    user_id,
    profile_status,
    status
FROM dbo.experts
ORDER BY full_name;
GO
