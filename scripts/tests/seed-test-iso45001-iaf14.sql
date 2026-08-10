USE CTIC_Certification;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ExpertId UNIQUEIDENTIFIER = (
        SELECT TOP (1) id
        FROM dbo.experts
        WHERE email = N'lead.20260728153342@ctic.vn'
        ORDER BY created_at
    );

    IF @ExpertId IS NULL
    BEGIN
        THROW 51000, N'Không tìm thấy chuyên gia thử lead.20260728153342@ctic.vn.', 1;
    END;

    UPDATE dbo.experts
    SET profile_status = N'APPROVED',
        status = N'active',
        updated_at = SYSUTCDATETIME()
    WHERE id = @ExpertId;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.expert_competencies
        WHERE expert_id = @ExpertId
          AND standard_code = N'ISO 45001:2018'
          AND competency_role = N'LEAD_AUDITOR'
          AND iaf_code = N'14'
          AND ISNULL(nace_code, N'') = N'22.29'
          AND approval_status = N'APPROVED'
    )
    BEGIN
        INSERT INTO dbo.expert_competencies (
            id,
            expert_id,
            management_system,
            standard_code,
            competency_role,
            scope_level,
            iaf_code,
            nace_revision,
            nace_code,
            competency_level,
            approval_status,
            effective_date,
            expiry_date,
            scope_description,
            approval_basis,
            evidence_summary,
            notes,
            approved_by,
            approved_at,
            suspended_at,
            suspension_reason,
            created_at,
            updated_at
        ) VALUES (
            NEWID(),
            @ExpertId,
            N'OHSMS',
            N'ISO 45001:2018',
            N'LEAD_AUDITOR',
            N'NACE',
            N'14',
            N'NACE Rev.2',
            N'22.29',
            N'QUALIFIED',
            N'APPROVED',
            CAST(GETDATE() AS DATE),
            NULL,
            N'Sản xuất sản phẩm bằng cao su và plastic',
            N'TEST-PACK-21',
            N'Dữ liệu kiểm thử ISO 45001 / IAF 14 / NACE 22.29',
            N'Chỉ dùng để kiểm thử. Có thể xóa bằng cleanup-test-iso45001-iaf14.sql.',
            NULL,
            SYSUTCDATETIME(),
            NULL,
            NULL,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
        );
    END;

    COMMIT TRANSACTION;

    PRINT N'HOÀN TẤT: Đã bảo đảm có năng lực thử ISO 45001 / IAF 14 / NACE 22.29.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
