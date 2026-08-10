USE CTIC_Certification;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @LeadExpertId UNIQUEIDENTIFIER = (
        SELECT TOP (1) id
        FROM dbo.experts
        WHERE email = N'lead.20260728153342@ctic.vn'
    );

    DECLARE @AuditorExpertId UNIQUEIDENTIFIER = (
        SELECT TOP (1) id
        FROM dbo.experts
        WHERE email = N'auditor.20260728153342@ctic.vn'
    );

    IF @LeadExpertId IS NULL OR @AuditorExpertId IS NULL
    BEGIN
        THROW 51000, N'Không tìm thấy 02 hồ sơ chuyên gia mẫu theo email đã cấu hình. Hãy kiểm tra dữ liệu dbo.experts.', 1;
    END;

    UPDATE dbo.experts
    SET profile_status = N'APPROVED',
        status = N'active',
        employee_code = COALESCE(employee_code, N'EXP-0001'),
        approved_at = COALESCE(approved_at, SYSUTCDATETIME()),
        updated_at = SYSUTCDATETIME()
    WHERE id = @LeadExpertId;

    UPDATE dbo.experts
    SET profile_status = N'APPROVED',
        status = N'active',
        employee_code = COALESCE(employee_code, N'EXP-0002'),
        approved_at = COALESCE(approved_at, SYSUTCDATETIME()),
        updated_at = SYSUTCDATETIME()
    WHERE id = @AuditorExpertId;

    -- Trưởng đoàn: có năng lực ISO 9001 và ISO 14001, IAF 14 / NACE 22.29.
    IF NOT EXISTS (
        SELECT 1 FROM dbo.expert_competencies
        WHERE expert_id = @LeadExpertId
          AND standard_code = N'ISO 9001:2015'
          AND competency_role = N'LEAD_AUDITOR'
          AND iaf_code = N'14'
          AND ISNULL(nace_code, N'') = N'22.29'
    )
    BEGIN
        INSERT INTO dbo.expert_competencies (
            id, expert_id, management_system, standard_code, competency_role,
            scope_level, iaf_code, nace_revision, nace_code,
            competency_level, approval_status, effective_date, expiry_date,
            scope_description, approval_basis, evidence_summary, notes,
            approved_by, approved_at, suspended_at, suspension_reason,
            created_at, updated_at
        ) VALUES (
            NEWID(), @LeadExpertId, N'QMS', N'ISO 9001:2015', N'LEAD_AUDITOR',
            N'NACE', N'14', N'NACE Rev.2', N'22.29',
            N'QUALIFIED', N'APPROVED', CAST(GETDATE() AS DATE), NULL,
            N'Sản xuất sản phẩm bằng cao su và plastic',
            N'Dữ liệu thử Patch 19 để kiểm tra luồng xem xét và IAF MD11',
            N'Năng lực mẫu cho ISO 9001:2015, IAF 14, NACE 22.29',
            N'Có thể xóa sau khi hoàn tất kiểm thử',
            NULL, SYSUTCDATETIME(), NULL, NULL,
            SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.expert_competencies
        WHERE expert_id = @LeadExpertId
          AND standard_code = N'ISO 14001:2015'
          AND competency_role = N'LEAD_AUDITOR'
          AND iaf_code = N'14'
          AND ISNULL(nace_code, N'') = N'22.29'
    )
    BEGIN
        INSERT INTO dbo.expert_competencies (
            id, expert_id, management_system, standard_code, competency_role,
            scope_level, iaf_code, nace_revision, nace_code,
            competency_level, approval_status, effective_date, expiry_date,
            scope_description, approval_basis, evidence_summary, notes,
            approved_by, approved_at, suspended_at, suspension_reason,
            created_at, updated_at
        ) VALUES (
            NEWID(), @LeadExpertId, N'EMS', N'ISO 14001:2015', N'LEAD_AUDITOR',
            N'NACE', N'14', N'NACE Rev.2', N'22.29',
            N'QUALIFIED', N'APPROVED', CAST(GETDATE() AS DATE), NULL,
            N'Sản xuất sản phẩm bằng cao su và plastic',
            N'Dữ liệu thử Patch 19 để kiểm tra luồng xem xét và IAF MD11',
            N'Năng lực mẫu cho ISO 14001:2015, IAF 14, NACE 22.29',
            N'Có thể xóa sau khi hoàn tất kiểm thử',
            NULL, SYSUTCDATETIME(), NULL, NULL,
            SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END;

    -- Chuyên gia thứ hai chỉ có ISO 9001. Với đoàn 02 người/02 tiêu chuẩn,
    -- dữ liệu này giúp kiểm thử khả năng đánh giá kết hợp ở mức 50%.
    IF NOT EXISTS (
        SELECT 1 FROM dbo.expert_competencies
        WHERE expert_id = @AuditorExpertId
          AND standard_code = N'ISO 9001:2015'
          AND competency_role = N'AUDITOR'
          AND iaf_code = N'14'
          AND ISNULL(nace_code, N'') = N'22.29'
    )
    BEGIN
        INSERT INTO dbo.expert_competencies (
            id, expert_id, management_system, standard_code, competency_role,
            scope_level, iaf_code, nace_revision, nace_code,
            competency_level, approval_status, effective_date, expiry_date,
            scope_description, approval_basis, evidence_summary, notes,
            approved_by, approved_at, suspended_at, suspension_reason,
            created_at, updated_at
        ) VALUES (
            NEWID(), @AuditorExpertId, N'QMS', N'ISO 9001:2015', N'AUDITOR',
            N'NACE', N'14', N'NACE Rev.2', N'22.29',
            N'QUALIFIED', N'APPROVED', CAST(GETDATE() AS DATE), NULL,
            N'Sản xuất sản phẩm bằng cao su và plastic',
            N'Dữ liệu thử Patch 19 để kiểm tra luồng xem xét và IAF MD11',
            N'Năng lực mẫu cho ISO 9001:2015, IAF 14, NACE 22.29',
            N'Có thể xóa sau khi hoàn tất kiểm thử',
            NULL, SYSUTCDATETIME(), NULL, NULL,
            SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END;

    COMMIT TRANSACTION;

    SELECT
        e.employee_code,
        e.full_name,
        e.email,
        e.profile_status,
        c.management_system,
        c.standard_code,
        c.competency_role,
        c.iaf_code,
        c.nace_code,
        c.approval_status
    FROM dbo.experts e
    INNER JOIN dbo.expert_competencies c ON c.expert_id = e.id
    WHERE e.id IN (@LeadExpertId, @AuditorExpertId)
      AND c.iaf_code = N'14'
      AND c.nace_code = N'22.29'
    ORDER BY e.employee_code, c.standard_code;

    PRINT N'HOÀN TẤT: Đã tạo dữ liệu chuyên gia thử cho IAF 14 / NACE 22.29.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
