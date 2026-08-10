USE CTIC_Certification;
GO

SET NOCOUNT ON;

PRINT N'=== KIỂM TRA NĂNG LỰC CHUYÊN GIA IAF 14 / NACE 22.29 ===';

SELECT
    e.employee_code,
    e.full_name,
    e.email,
    e.profile_status,
    e.status AS expert_status,
    c.management_system,
    c.standard_code,
    c.competency_role,
    c.iaf_code,
    c.nace_code,
    c.approval_status,
    c.effective_date,
    c.expiry_date,
    CASE
        WHEN c.approval_status <> N'APPROVED' THEN N'KHÔNG HIỆU LỰC - chưa phê duyệt'
        WHEN c.expiry_date IS NOT NULL AND c.expiry_date < CAST(GETDATE() AS DATE) THEN N'KHÔNG HIỆU LỰC - đã hết hạn'
        WHEN LOWER(ISNULL(e.status, N'')) <> N'active' THEN N'KHÔNG HIỆU LỰC - chuyên gia không hoạt động'
        WHEN ISNULL(e.profile_status, N'') <> N'APPROVED' THEN N'KHÔNG HIỆU LỰC - hồ sơ chuyên gia chưa duyệt'
        ELSE N'CÓ HIỆU LỰC'
    END AS validity
FROM dbo.experts e
INNER JOIN dbo.expert_competencies c ON c.expert_id = e.id
WHERE c.iaf_code = N'14'
  AND ISNULL(c.nace_code, N'') = N'22.29'
ORDER BY e.employee_code, c.standard_code, c.competency_role;

;WITH ValidCompetencies AS (
    SELECT
        e.id AS expert_id,
        e.full_name,
        e.email,
        UPPER(ISNULL(c.standard_code, N'') + N' ' + ISNULL(c.management_system, N'')) AS competency_text
    FROM dbo.experts e
    INNER JOIN dbo.expert_competencies c ON c.expert_id = e.id
    WHERE c.iaf_code = N'14'
      AND ISNULL(c.nace_code, N'') = N'22.29'
      AND c.approval_status = N'APPROVED'
      AND (c.expiry_date IS NULL OR c.expiry_date >= CAST(GETDATE() AS DATE))
      AND LOWER(ISNULL(e.status, N'')) = N'active'
      AND ISNULL(e.profile_status, N'') = N'APPROVED'
), Matrix AS (
    SELECT
        expert_id,
        MAX(full_name) AS full_name,
        MAX(email) AS email,
        MAX(CASE WHEN competency_text LIKE N'%9001%' OR competency_text LIKE N'%QMS%' THEN 1 ELSE 0 END) AS has_9001,
        MAX(CASE WHEN competency_text LIKE N'%14001%' OR competency_text LIKE N'%EMS%' THEN 1 ELSE 0 END) AS has_14001,
        MAX(CASE WHEN competency_text LIKE N'%45001%' OR competency_text LIKE N'%OHSMS%' OR competency_text LIKE N'%OH&SMS%' THEN 1 ELSE 0 END) AS has_45001
    FROM ValidCompetencies
    GROUP BY expert_id
)
SELECT
    full_name,
    email,
    CASE WHEN has_9001 = 1 THEN N'ĐỦ' ELSE N'—' END AS [ISO 9001],
    CASE WHEN has_14001 = 1 THEN N'ĐỦ' ELSE N'—' END AS [ISO 14001],
    CASE WHEN has_45001 = 1 THEN N'ĐỦ' ELSE N'—' END AS [ISO 45001],
    has_9001 + has_14001 + has_45001 AS number_of_supported_standards
FROM Matrix
ORDER BY full_name;

DECLARE @Has9001 BIT = 0;
DECLARE @Has14001 BIT = 0;
DECLARE @Has45001 BIT = 0;

SELECT
    @Has9001 = MAX(CASE WHEN UPPER(ISNULL(c.standard_code, N'') + N' ' + ISNULL(c.management_system, N'')) LIKE N'%9001%'
                              OR UPPER(ISNULL(c.management_system, N'')) = N'QMS' THEN 1 ELSE 0 END),
    @Has14001 = MAX(CASE WHEN UPPER(ISNULL(c.standard_code, N'') + N' ' + ISNULL(c.management_system, N'')) LIKE N'%14001%'
                               OR UPPER(ISNULL(c.management_system, N'')) = N'EMS' THEN 1 ELSE 0 END),
    @Has45001 = MAX(CASE WHEN UPPER(ISNULL(c.standard_code, N'') + N' ' + ISNULL(c.management_system, N'')) LIKE N'%45001%'
                               OR UPPER(ISNULL(c.management_system, N'')) IN (N'OHSMS', N'OH&SMS') THEN 1 ELSE 0 END)
FROM dbo.experts e
INNER JOIN dbo.expert_competencies c ON c.expert_id = e.id
WHERE c.iaf_code = N'14'
  AND ISNULL(c.nace_code, N'') = N'22.29'
  AND c.approval_status = N'APPROVED'
  AND (c.expiry_date IS NULL OR c.expiry_date >= CAST(GETDATE() AS DATE))
  AND LOWER(ISNULL(e.status, N'')) = N'active'
  AND ISNULL(e.profile_status, N'') = N'APPROVED';

SELECT
    CASE WHEN @Has9001 = 1 THEN N'PASS' ELSE N'MISSING' END AS [ISO 9001 - IAF 14],
    CASE WHEN @Has14001 = 1 THEN N'PASS' ELSE N'MISSING' END AS [ISO 14001 - IAF 14],
    CASE WHEN @Has45001 = 1 THEN N'PASS' ELSE N'MISSING' END AS [ISO 45001 - IAF 14],
    CASE
        WHEN @Has9001 = 1 AND @Has14001 = 1 AND @Has45001 = 1
            THEN N'Đủ nguồn lực tập thể cho 3 tiêu chuẩn. Vẫn phải kiểm tra vai trò, lịch, xung đột lợi ích và năng lực từng người.'
        WHEN @Has45001 = 0
            THEN N'Chưa có chuyên gia ISO 45001 được phê duyệt cho IAF 14 / NACE 22.29.'
        ELSE N'Chưa đủ nguồn lực cho toàn bộ phạm vi.'
    END AS conclusion;
GO
