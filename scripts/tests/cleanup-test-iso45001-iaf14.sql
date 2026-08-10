USE CTIC_Certification;
GO

SET NOCOUNT ON;

DELETE FROM dbo.expert_competencies
WHERE approval_basis = N'TEST-PACK-21'
  AND standard_code = N'ISO 45001:2018'
  AND iaf_code = N'14'
  AND ISNULL(nace_code, N'') = N'22.29';

PRINT N'HOÀN TẤT: Đã xóa dữ liệu năng lực thử TEST-PACK-21.';
GO
