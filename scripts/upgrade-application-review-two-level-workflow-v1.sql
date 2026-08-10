/*
LEGACY / MANUAL RECOVERY ONLY

- Do not use this script for a new installation.
- Do not use this script for a normal upgrade.
- This script is not part of the commercial deployment pipeline.
- Prisma migrations are the canonical schema source.
- Do not run this script after the current five-migration baseline unless a DBA
  is deliberately performing a reviewed recovery.
- This file contains legacy CTIC-specific RBAC and data-repair statements.

Execution is fail-closed. Before running this file, the DBA must set the
following SESSION_CONTEXT value in the same SQL session:

    Key:   CMP_ALLOW_LEGACY_TWO_LEVEL_WORKFLOW
    Value: I_UNDERSTAND_THIS_IS_LEGACY

This script intentionally does not set that SESSION_CONTEXT value itself.
*/

IF COALESCE(
    CONVERT(NVARCHAR(128), SESSION_CONTEXT(N'CMP_ALLOW_LEGACY_TWO_LEVEL_WORKFLOW')),
    N''
) <> N'I_UNDERSTAND_THIS_IS_LEGACY'
BEGIN
    THROW 51000,
        N'BLOCKED: legacy/manual recovery script. Set CMP_ALLOW_LEGACY_TWO_LEVEL_WORKFLOW=I_UNDERSTAND_THIS_IS_LEGACY in this SQL session only after DBA review.',
        1;
END;
GO

USE [CTIC_Certification];
GO
SET NOCOUNT ON;
GO

IF COL_LENGTH('dbo.application_reviews', 'workflow_status') IS NULL
BEGIN
    ALTER TABLE dbo.application_reviews
    ADD workflow_status NVARCHAR(30) NOT NULL
        CONSTRAINT DF_application_reviews_workflow_status DEFAULT(N'PENDING_CHECK') WITH VALUES;
END;
GO

IF COL_LENGTH('dbo.application_reviews', 'prepared_by_id') IS NULL
    ALTER TABLE dbo.application_reviews ADD prepared_by_id UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('dbo.application_reviews', 'checker_id') IS NULL
    ALTER TABLE dbo.application_reviews ADD checker_id UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('dbo.application_reviews', 'approver_id') IS NULL
    ALTER TABLE dbo.application_reviews ADD approver_id UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('dbo.application_reviews', 'submitted_at') IS NULL
    ALTER TABLE dbo.application_reviews ADD submitted_at DATETIME2 NULL;
IF COL_LENGTH('dbo.application_reviews', 'checked_at') IS NULL
    ALTER TABLE dbo.application_reviews ADD checked_at DATETIME2 NULL;
IF COL_LENGTH('dbo.application_reviews', 'approved_at') IS NULL
    ALTER TABLE dbo.application_reviews ADD approved_at DATETIME2 NULL;
IF COL_LENGTH('dbo.application_reviews', 'returned_at') IS NULL
    ALTER TABLE dbo.application_reviews ADD returned_at DATETIME2 NULL;
IF COL_LENGTH('dbo.application_reviews', 'checker_comment') IS NULL
    ALTER TABLE dbo.application_reviews ADD checker_comment NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.application_reviews', 'approver_comment') IS NULL
    ALTER TABLE dbo.application_reviews ADD approver_comment NVARCHAR(MAX) NULL;
GO

UPDATE r
SET
    workflow_status = CASE
        WHEN LOWER(a.status) IN ('accepted', 'rejected', 'need_more_info') THEN N'APPROVED'
        ELSE COALESCE(NULLIF(r.workflow_status, N''), N'PENDING_CHECK')
    END,
    prepared_by_id = COALESCE(r.prepared_by_id, r.reviewer_id),
    submitted_at = COALESCE(r.submitted_at, r.created_at),
    approved_at = CASE
        WHEN LOWER(a.status) IN ('accepted', 'rejected', 'need_more_info')
        THEN COALESCE(r.approved_at, r.created_at)
        ELSE r.approved_at
    END
FROM dbo.application_reviews r
INNER JOIN dbo.certification_applications a ON a.id = r.application_id;
GO

IF OBJECT_ID('dbo.application_review_actions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.application_review_actions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_application_review_actions PRIMARY KEY
            CONSTRAINT DF_application_review_actions_id DEFAULT NEWID(),
        review_id UNIQUEIDENTIFIER NOT NULL,
        action NVARCHAR(40) NOT NULL,
        from_status NVARCHAR(30) NULL,
        to_status NVARCHAR(30) NOT NULL,
        actor_id UNIQUEIDENTIFIER NOT NULL,
        comment NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_application_review_actions_created_at DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_application_reviews_prepared_by')
    ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_prepared_by
        FOREIGN KEY (prepared_by_id) REFERENCES dbo.users(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_application_reviews_checker')
    ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_checker
        FOREIGN KEY (checker_id) REFERENCES dbo.users(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_application_reviews_approver')
    ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_approver
        FOREIGN KEY (approver_id) REFERENCES dbo.users(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_application_review_actions_review')
    ALTER TABLE dbo.application_review_actions ADD CONSTRAINT FK_application_review_actions_review
        FOREIGN KEY (review_id) REFERENCES dbo.application_reviews(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_application_review_actions_actor')
    ALTER TABLE dbo.application_review_actions ADD CONSTRAINT FK_application_review_actions_actor
        FOREIGN KEY (actor_id) REFERENCES dbo.users(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_application_reviews_workflow_status' AND object_id = OBJECT_ID('dbo.application_reviews'))
    CREATE INDEX IX_application_reviews_workflow_status ON dbo.application_reviews(workflow_status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_application_reviews_checker_id' AND object_id = OBJECT_ID('dbo.application_reviews'))
    CREATE INDEX IX_application_reviews_checker_id ON dbo.application_reviews(checker_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_application_reviews_approver_id' AND object_id = OBJECT_ID('dbo.application_reviews'))
    CREATE INDEX IX_application_reviews_approver_id ON dbo.application_reviews(approver_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_application_review_actions_review_created' AND object_id = OBJECT_ID('dbo.application_review_actions'))
    CREATE INDEX IX_application_review_actions_review_created ON dbo.application_review_actions(review_id, created_at DESC);
GO

-- Bảo đảm các vai trò và quyền dùng cho quy trình hai cấp đã tồn tại.
DECLARE @RoleSeed TABLE (role_name NVARCHAR(50), description NVARCHAR(255));
INSERT INTO @RoleSeed(role_name, description) VALUES
(N'COORDINATOR', N'Điều phối viên lập hồ sơ xem xét'),
(N'AUDITOR', N'Đánh giá viên thực hiện kiểm tra kỹ thuật'),
(N'LEAD_AUDITOR', N'Trưởng đoàn đánh giá thực hiện kiểm tra kỹ thuật'),
(N'TECHNICAL_REVIEWER', N'Người thẩm xét kỹ thuật'),
(N'APPROVER', N'Người phê duyệt xem xét đăng ký'),
(N'CERTIFICATION_MANAGER', N'Người quản lý/phê duyệt hoạt động chứng nhận');

INSERT INTO dbo.roles(role_name, description)
SELECT s.role_name, s.description
FROM @RoleSeed s
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.roles r WHERE UPPER(r.role_name) = UPPER(s.role_name)
);

IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE permission_name = N'applications.read')
    INSERT INTO dbo.permissions(permission_name) VALUES (N'applications.read');
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE permission_name = N'applications.review')
    INSERT INTO dbo.permissions(permission_name) VALUES (N'applications.review');

INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE UPPER(r.role_name) IN (N'COORDINATOR', N'AUDITOR', N'LEAD_AUDITOR', N'TECHNICAL_REVIEWER', N'APPROVER', N'CERTIFICATION_MANAGER', N'ADMIN')
  AND p.permission_name IN (N'applications.read', N'applications.review')
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- Tài khoản đã liên kết với hồ sơ chuyên gia được gán vai trò AUDITOR để có thể nhận bước kiểm tra.
DECLARE @AuditorRoleId UNIQUEIDENTIFIER = (
    SELECT TOP 1 id FROM dbo.roles WHERE UPPER(role_name) = N'AUDITOR'
);
IF @AuditorRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.user_roles(user_id, role_id)
    SELECT e.user_id, @AuditorRoleId
    FROM dbo.experts e
    WHERE e.user_id IS NOT NULL
      AND e.status = N'active'
      AND e.profile_status = N'APPROVED'
      AND NOT EXISTS (
          SELECT 1 FROM dbo.user_roles ur
          WHERE ur.user_id = e.user_id AND ur.role_id = @AuditorRoleId
      );
END;
GO

-- Sửa dữ liệu mẫu bị lỗi mã hóa đã biết.
UPDATE dbo.users
SET full_name = N'Nguyễn Văn Trưởng đoàn'
WHERE email = N'lead.20260728153342@ctic.vn';
UPDATE dbo.experts
SET full_name = N'Nguyễn Văn Trưởng đoàn', updated_at = SYSUTCDATETIME()
WHERE email = N'lead.20260728153342@ctic.vn';

UPDATE dbo.users
SET full_name = N'Trần Văn Chuyên gia'
WHERE email = N'auditor.20260728153342@ctic.vn';
UPDATE dbo.experts
SET full_name = N'Trần Văn Chuyên gia', updated_at = SYSUTCDATETIME()
WHERE email = N'auditor.20260728153342@ctic.vn';
GO

SELECT
    workflow_status,
    COUNT(*) AS review_count
FROM dbo.application_reviews
GROUP BY workflow_status
ORDER BY workflow_status;

PRINT N'HOÀN TẤT: Đã nâng cấp quy trình xem xét đăng ký 2 cấp và sửa dữ liệu tên mẫu.';
GO
