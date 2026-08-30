SET XACT_ABORT ON;

BEGIN TRANSACTION;

CREATE TABLE [dbo].[certificate_series] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_certificate_series_id] DEFAULT newid(),
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [series_code] NVARCHAR(50) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_certificate_series_status] DEFAULT 'active',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_certificate_series_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_certificate_series_updated_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_certificate_series] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_certificate_series_code] UNIQUE NONCLUSTERED ([series_code]),
    CONSTRAINT [CK_certificate_series_status] CHECK ([status] IN ('active', 'closed'))
);

ALTER TABLE [dbo].[certification_decisions] ADD
    [decision_type] NVARCHAR(30) NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [certificate_series_id] UNIQUEIDENTIFIER NULL;

ALTER TABLE [dbo].[certificates] ADD
    [certificate_series_id] UNIQUEIDENTIFIER NULL,
    [certification_decision_id] UNIQUEIDENTIFIER NULL,
    [version_no] INT NULL,
    [supersedes_certificate_id] UNIQUEIDENTIFIER NULL,
    [change_reason] NVARCHAR(max) NULL,
    [organization_name] NVARCHAR(255) NULL,
    [organization_address] NVARCHAR(max) NULL,
    [management_system] NVARCHAR(100) NULL,
    [standard_name] NVARCHAR(100) NULL,
    [certification_scope] NVARCHAR(max) NULL,
    [site_snapshot_json] NVARCHAR(max) NULL;

EXEC sys.sp_executesql N'
UPDATE decision_row
SET
    [project_id] = plan_row.[project_id],
    [decision_type] = CASE
        WHEN LOWER(decision_row.[decision_result]) = ''rejected'' THEN ''REFUSE''
        WHEN normalized.[audit_token] IN (''stage2'', ''initialstage2'', ''gd2'') THEN ''GRANT''
        WHEN normalized.[audit_token] LIKE ''surveillance%'' OR normalized.[audit_token] IN (''gs1'', ''gs2'', ''monitoring'') THEN ''MAINTAIN''
        WHEN normalized.[audit_token] IN (''recertification'', ''recertify'', ''reassessment'') THEN ''RECERTIFY''
        ELSE ''GRANT''
    END
FROM [dbo].[certification_decisions] AS decision_row
INNER JOIN [dbo].[technical_reviews] AS review_row
    ON review_row.[id] = decision_row.[technical_review_id]
INNER JOIN [dbo].[reports] AS report_row
    ON report_row.[id] = review_row.[report_id]
INNER JOIN [dbo].[audit_plans] AS plan_row
    ON plan_row.[id] = report_row.[audit_plan_id]
LEFT JOIN [dbo].[audit_program_events] AS event_row
    ON event_row.[id] = plan_row.[audit_event_id]
CROSS APPLY (
    SELECT LOWER(
        REPLACE(
            REPLACE(
                REPLACE(
                    COALESCE(plan_row.[audit_type], event_row.[event_type], ''''),
                    '' '',
                    ''''
                ),
                ''_'',
                ''''
            ),
            ''-'',
            ''''
        )
    ) AS [audit_token]
) AS normalized;
';

EXEC sys.sp_executesql N'
IF EXISTS (
    SELECT 1
    FROM [dbo].[certification_decisions]
    WHERE [project_id] IS NULL OR [decision_type] IS NULL
)
BEGIN
    ;THROW 51001, ''Certificate lifecycle migration cannot map every legacy decision to a project and decision type.'', 1;
END;
';

-- More than one live legacy certificate in a project is ambiguous: it could be
-- multiple families, which the old model could not represent safely.
IF EXISTS (
    SELECT plan_row.[project_id]
    FROM [dbo].[certificates] AS certificate_row
    INNER JOIN [dbo].[technical_reviews] AS review_row
        ON review_row.[id] = certificate_row.[technical_review_id]
    INNER JOIN [dbo].[reports] AS report_row
        ON report_row.[id] = review_row.[report_id]
    INNER JOIN [dbo].[audit_plans] AS plan_row
        ON plan_row.[id] = report_row.[audit_plan_id]
    WHERE LOWER(COALESCE(certificate_row.[status], 'active')) IN ('active', 'suspended')
    GROUP BY plan_row.[project_id]
    HAVING COUNT(*) > 1
)
BEGIN
    ;THROW 51002, 'Certificate lifecycle migration found multiple live legacy certificates in one project; family lineage is ambiguous.', 1;
END;

INSERT INTO [dbo].[certificate_series] (
    [id],
    [project_id],
    [series_code],
    [status],
    [created_at],
    [updated_at]
)
SELECT
    NEWID(),
    project_row.[id],
    CONCAT(
        'LEG-',
        LEFT(project_row.[project_code], 33),
        '-',
        LEFT(REPLACE(CONVERT(NVARCHAR(36), project_row.[id]), '-', ''), 12)
    ),
    'active',
    MIN(certificate_row.[created_at]),
    SYSUTCDATETIME()
FROM [dbo].[certificates] AS certificate_row
INNER JOIN [dbo].[technical_reviews] AS review_row
    ON review_row.[id] = certificate_row.[technical_review_id]
INNER JOIN [dbo].[reports] AS report_row
    ON report_row.[id] = review_row.[report_id]
INNER JOIN [dbo].[audit_plans] AS plan_row
    ON plan_row.[id] = report_row.[audit_plan_id]
INNER JOIN [dbo].[certification_projects] AS project_row
    ON project_row.[id] = plan_row.[project_id]
GROUP BY project_row.[id], project_row.[project_code];

EXEC sys.sp_executesql N'
;WITH legacy_versions AS (
    SELECT
        certificate_row.[id] AS [certificate_id],
        decision_row.[id] AS [decision_id],
        plan_row.[project_id],
        decision_row.[organization_name],
        decision_row.[organization_address],
        decision_row.[management_system],
        decision_row.[standard_name],
        decision_row.[certification_scope],
        NULLIF((
            SELECT
                site_row.[site_no],
                site_row.[site_name],
                site_row.[address],
                site_row.[activities],
                site_row.[employee_count],
                site_row.[is_headquarters]
            FROM [dbo].[certification_application_sites] AS site_row
            INNER JOIN [dbo].[certification_projects] AS site_project
                ON site_project.[application_id] = site_row.[application_id]
            WHERE site_project.[id] = plan_row.[project_id]
            ORDER BY site_row.[site_no]
            FOR JSON PATH
        ), ''[]'') AS [site_snapshot_json],
        ROW_NUMBER() OVER (
            PARTITION BY plan_row.[project_id]
            ORDER BY
                COALESCE(certificate_row.[issue_date], CONVERT(DATE, certificate_row.[created_at])),
                certificate_row.[created_at],
                certificate_row.[id]
        ) AS [version_no],
        LAG(certificate_row.[id]) OVER (
            PARTITION BY plan_row.[project_id]
            ORDER BY
                COALESCE(certificate_row.[issue_date], CONVERT(DATE, certificate_row.[created_at])),
                certificate_row.[created_at],
                certificate_row.[id]
        ) AS [supersedes_certificate_id]
    FROM [dbo].[certificates] AS certificate_row
    INNER JOIN [dbo].[technical_reviews] AS review_row
        ON review_row.[id] = certificate_row.[technical_review_id]
    INNER JOIN [dbo].[reports] AS report_row
        ON report_row.[id] = review_row.[report_id]
    INNER JOIN [dbo].[audit_plans] AS plan_row
        ON plan_row.[id] = report_row.[audit_plan_id]
    LEFT JOIN [dbo].[certification_decisions] AS decision_row
        ON decision_row.[technical_review_id] = certificate_row.[technical_review_id]
)
UPDATE certificate_row
SET
    [certificate_series_id] = series_row.[id],
    [certification_decision_id] = legacy_versions.[decision_id],
    [version_no] = legacy_versions.[version_no],
    [supersedes_certificate_id] = legacy_versions.[supersedes_certificate_id],
    [change_reason] = CASE
        WHEN legacy_versions.[version_no] = 1 THEN ''Legacy certificate migrated as initial series version.''
        ELSE ''Legacy certificate migrated in deterministic chronological order.''
    END,
    [organization_name] = legacy_versions.[organization_name],
    [organization_address] = legacy_versions.[organization_address],
    [management_system] = legacy_versions.[management_system],
    [standard_name] = legacy_versions.[standard_name],
    [certification_scope] = legacy_versions.[certification_scope],
    [site_snapshot_json] = legacy_versions.[site_snapshot_json]
FROM [dbo].[certificates] AS certificate_row
INNER JOIN legacy_versions
    ON legacy_versions.[certificate_id] = certificate_row.[id]
INNER JOIN [dbo].[certificate_series] AS series_row
    ON series_row.[project_id] = legacy_versions.[project_id];
';

EXEC sys.sp_executesql N'
IF EXISTS (
    SELECT 1
    FROM [dbo].[certificates]
    WHERE
        [certificate_series_id] IS NULL OR
        [certification_decision_id] IS NULL OR
        [version_no] IS NULL OR
        [organization_name] IS NULL OR
        [standard_name] IS NULL OR
        [certification_scope] IS NULL
)
BEGIN
    ;THROW 51003, ''Certificate lifecycle migration cannot safely backfill every legacy certificate invariant.'', 1;
END;
';

EXEC sys.sp_executesql N'
UPDATE decision_row
SET [certificate_series_id] = certificate_row.[certificate_series_id]
FROM [dbo].[certification_decisions] AS decision_row
INNER JOIN [dbo].[certificates] AS certificate_row
    ON certificate_row.[certification_decision_id] = decision_row.[id];
';

EXEC sys.sp_executesql N'
ALTER TABLE [dbo].[certification_decisions] ALTER COLUMN [decision_type] NVARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[certification_decisions] ALTER COLUMN [project_id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[certificates] ALTER COLUMN [certificate_series_id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[certificates] ALTER COLUMN [version_no] INT NOT NULL;
ALTER TABLE [dbo].[certificates] ALTER COLUMN [organization_name] NVARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[certificates] ALTER COLUMN [standard_name] NVARCHAR(100) NOT NULL;
ALTER TABLE [dbo].[certificates] ALTER COLUMN [certification_scope] NVARCHAR(max) NOT NULL;
';

DECLARE @cert_number_unique_constraint SYSNAME;

SELECT TOP (1)
    @cert_number_unique_constraint = constraint_row.[name]
FROM sys.key_constraints AS constraint_row
INNER JOIN sys.index_columns AS index_column
    ON index_column.[object_id] = constraint_row.[parent_object_id]
    AND index_column.[index_id] = constraint_row.[unique_index_id]
INNER JOIN sys.columns AS column_row
    ON column_row.[object_id] = index_column.[object_id]
    AND column_row.[column_id] = index_column.[column_id]
WHERE
    constraint_row.[parent_object_id] = OBJECT_ID(N'[dbo].[certificates]') AND
    constraint_row.[type] = 'UQ'
GROUP BY constraint_row.[name]
HAVING COUNT(*) = 1 AND MAX(column_row.[name]) = 'cert_number';

IF @cert_number_unique_constraint IS NULL
BEGIN
    ;THROW 51004, 'Expected legacy single-column certificate number uniqueness constraint was not found.', 1;
END;

DECLARE @drop_cert_number_constraint_sql NVARCHAR(max);
SET @drop_cert_number_constraint_sql =
    N'ALTER TABLE [dbo].[certificates] DROP CONSTRAINT [' +
    REPLACE(@cert_number_unique_constraint, ']', ']]') + N']';
EXEC sys.sp_executesql @drop_cert_number_constraint_sql;

EXEC sys.sp_executesql N'
ALTER TABLE [dbo].[certification_decisions]
    ADD CONSTRAINT [CK_certification_decisions_decision_type]
    CHECK ([decision_type] IN (
        ''GRANT'',
        ''MAINTAIN'',
        ''RECERTIFY'',
        ''AMEND'',
        ''EXTEND_SCOPE'',
        ''REDUCE_SCOPE'',
        ''SUSPEND'',
        ''RESTORE'',
        ''WITHDRAW'',
        ''REFUSE''
    ));

ALTER TABLE [dbo].[certificate_series]
    ADD CONSTRAINT [FK_certificate_series_project]
    FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[certification_decisions]
    ADD CONSTRAINT [FK_certification_decisions_project]
    FOREIGN KEY ([project_id]) REFERENCES [dbo].[certification_projects]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[certification_decisions]
    ADD CONSTRAINT [FK_certification_decisions_certificate_series]
    FOREIGN KEY ([certificate_series_id]) REFERENCES [dbo].[certificate_series]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[certificates]
    ADD CONSTRAINT [FK_certificates_certificate_series]
    FOREIGN KEY ([certificate_series_id]) REFERENCES [dbo].[certificate_series]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[certificates]
    ADD CONSTRAINT [FK_certificates_certification_decision]
    FOREIGN KEY ([certification_decision_id]) REFERENCES [dbo].[certification_decisions]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[certificates]
    ADD CONSTRAINT [FK_certificates_supersedes]
    FOREIGN KEY ([supersedes_certificate_id]) REFERENCES [dbo].[certificates]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE NONCLUSTERED INDEX [IX_certificate_series_project]
    ON [dbo].[certificate_series]([project_id]);
CREATE NONCLUSTERED INDEX [IX_certificate_series_project_status]
    ON [dbo].[certificate_series]([project_id], [status]);
CREATE NONCLUSTERED INDEX [certification_decisions_decision_type_idx]
    ON [dbo].[certification_decisions]([decision_type]);
CREATE NONCLUSTERED INDEX [certification_decisions_project_id_idx]
    ON [dbo].[certification_decisions]([project_id]);
CREATE NONCLUSTERED INDEX [certification_decisions_certificate_series_id_idx]
    ON [dbo].[certification_decisions]([certificate_series_id]);
CREATE UNIQUE NONCLUSTERED INDEX [UQ_certificates_series_version]
    ON [dbo].[certificates]([certificate_series_id], [version_no]);
CREATE NONCLUSTERED INDEX [IX_certificates_decision]
    ON [dbo].[certificates]([certification_decision_id]);
CREATE NONCLUSTERED INDEX [IX_certificates_cert_number]
    ON [dbo].[certificates]([cert_number]);
CREATE NONCLUSTERED INDEX [IX_certificates_supersedes]
    ON [dbo].[certificates]([supersedes_certificate_id]);
';

COMMIT TRANSACTION;
