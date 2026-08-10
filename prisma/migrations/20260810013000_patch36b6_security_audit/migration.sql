IF COL_LENGTH('dbo.audit_logs', 'request_id') IS NULL
BEGIN
    ALTER TABLE dbo.audit_logs ADD request_id NVARCHAR(100) NULL;
END;

IF COL_LENGTH('dbo.audit_logs', 'outcome') IS NULL
BEGIN
    ALTER TABLE dbo.audit_logs ADD outcome NVARCHAR(20) NULL;
END;

IF COL_LENGTH('dbo.audit_logs', 'status_code') IS NULL
BEGIN
    ALTER TABLE dbo.audit_logs ADD status_code INT NULL;
END;

IF COL_LENGTH('dbo.audit_logs', 'duration_ms') IS NULL
BEGIN
    ALTER TABLE dbo.audit_logs ADD duration_ms INT NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_audit_logs_request_id'
      AND object_id = OBJECT_ID('dbo.audit_logs')
)
BEGIN
    CREATE INDEX IX_audit_logs_request_id
        ON dbo.audit_logs(request_id);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_audit_logs_outcome_created'
      AND object_id = OBJECT_ID('dbo.audit_logs')
)
BEGIN
    CREATE INDEX IX_audit_logs_outcome_created
        ON dbo.audit_logs(outcome, created_at DESC);
END;
