USE [CTIC_Certification];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @IsicId UNIQUEIDENTIFIER;
DECLARE @NaceId UNIQUEIDENTIFIER;
DECLARE @IafId UNIQUEIDENTIFIER;
DECLARE @MappingId UNIQUEIDENTIFIER;

SELECT @IsicId = id
FROM dbo.industry_classifications
WHERE classification_type = N'ISIC'
  AND revision = N'ISIC_REV_4'
  AND code = N'2220';

IF @IsicId IS NULL
BEGIN
    SET @IsicId = NEWID();
    INSERT dbo.industry_classifications (
        id, classification_type, revision, code,
        title_en, title_vi, level, is_active,
        created_at, updated_at
    ) VALUES (
        @IsicId, N'ISIC', N'ISIC_REV_4', N'2220',
        N'Manufacture of plastics products',
        N'Sản xuất sản phẩm từ plastic',
        4, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );
END;

SELECT @NaceId = id
FROM dbo.industry_classifications
WHERE classification_type = N'NACE'
  AND revision = N'NACE_REV_2'
  AND code = N'22.29';

IF @NaceId IS NULL
BEGIN
    SET @NaceId = NEWID();
    INSERT dbo.industry_classifications (
        id, classification_type, revision, code,
        title_en, title_vi, level, is_active,
        created_at, updated_at
    ) VALUES (
        @NaceId, N'NACE', N'NACE_REV_2', N'22.29',
        N'Manufacture of other plastic products',
        N'Sản xuất sản phẩm khác từ plastic',
        4, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );
END;

SELECT @IafId = id
FROM dbo.iaf_scopes
WHERE iaf_code = N'14';

IF @IafId IS NULL
BEGIN
    SET @IafId = NEWID();
    INSERT dbo.iaf_scopes (
        id, iaf_code, iaf_name, description,
        is_active, created_at, updated_at
    ) VALUES (
        @IafId, N'14', N'Rubber and plastic products',
        N'Cao su và sản phẩm nhựa',
        1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );
END;

SELECT @MappingId = id
FROM dbo.industry_code_mappings
WHERE source_code_id = @IsicId
  AND target_code_id = @NaceId;

IF @MappingId IS NULL
BEGIN
    INSERT dbo.industry_code_mappings (
        id, source_code_id, target_code_id,
        mapping_type, mapping_status, note,
        created_at, updated_at
    ) VALUES (
        NEWID(), @IsicId, @NaceId,
        N'EXACT', N'APPROVED',
        N'Dữ liệu minh họa để kiểm thử chức năng lựa chọn mã ngành.',
        SYSUTCDATETIME(), SYSUTCDATETIME()
    );
END
ELSE
BEGIN
    UPDATE dbo.industry_code_mappings
    SET mapping_status = N'APPROVED',
        mapping_type = N'EXACT',
        updated_at = SYSUTCDATETIME()
    WHERE id = @MappingId;
END;

DECLARE @Systems TABLE (management_system NVARCHAR(30));
INSERT @Systems VALUES (N'QMS'), (N'EMS'), (N'OHSMS');

INSERT dbo.nace_iaf_mappings (
    id, nace_code_id, iaf_scope_id,
    management_system, mapping_status,
    source_document, note,
    created_at, updated_at
)
SELECT
    NEWID(), @NaceId, @IafId,
    s.management_system, N'APPROVED',
    N'IAF ID1 / dữ liệu minh họa',
    N'Dùng để kiểm thử tra cứu tự động ISIC → NACE → IAF.',
    SYSUTCDATETIME(), SYSUTCDATETIME()
FROM @Systems s
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.nace_iaf_mappings m
    WHERE m.nace_code_id = @NaceId
      AND m.iaf_scope_id = @IafId
      AND m.management_system = s.management_system
);

UPDATE dbo.nace_iaf_mappings
SET mapping_status = N'APPROVED',
    updated_at = SYSUTCDATETIME()
WHERE nace_code_id = @NaceId
  AND iaf_scope_id = @IafId
  AND management_system IN (N'QMS', N'EMS', N'OHSMS');

COMMIT TRANSACTION;
GO

SELECT
    i.code AS isic_code,
    n.code AS nace_code,
    iaf.iaf_code,
    ni.management_system,
    im.mapping_status AS isic_nace_status,
    ni.mapping_status AS nace_iaf_status
FROM dbo.industry_code_mappings im
JOIN dbo.industry_classifications i ON i.id = im.source_code_id
JOIN dbo.industry_classifications n ON n.id = im.target_code_id
JOIN dbo.nace_iaf_mappings ni ON ni.nace_code_id = n.id
JOIN dbo.iaf_scopes iaf ON iaf.id = ni.iaf_scope_id
WHERE i.code = N'2220'
  AND n.code = N'22.29'
  AND iaf.iaf_code = N'14';
GO
