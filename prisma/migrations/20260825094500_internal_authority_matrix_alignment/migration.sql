SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /*
     * Internal authority matrix alignment.
     * - Keeps role definitions code-governed.
     * - Repairs grants for roles that were already declared on guarded endpoints.
     * - Restores TECHNICAL_EXPERT as a first-class internal account role because
     *   workspace/work-item/resource-scope code already treats it as an internal persona.
     * - Removes stale grants that do not correspond to any executable permission path.
     */

    DECLARE @permissions TABLE ([permission_name] NVARCHAR(100) NOT NULL PRIMARY KEY);

    INSERT INTO @permissions ([permission_name])
    VALUES
        (N'applications.manage'),
        (N'applications.read'),
        (N'audit_plans.read'),
        (N'certificates.read'),
        (N'customer_documents.manage'),
        (N'customer_user_requests.review'),
        (N'documents.read'),
        (N'findings.manage'),
        (N'notifications.read'),
        (N'projects.read');

    INSERT INTO [dbo].[permissions] ([id], [permission_name])
    SELECT NEWID(), required.[permission_name]
    FROM @permissions AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM [dbo].[permissions] AS existing
        WHERE existing.[permission_name] = required.[permission_name]
    );

    IF NOT EXISTS (
        SELECT 1
        FROM [dbo].[roles]
        WHERE UPPER(LTRIM(RTRIM([role_name]))) = N'TECHNICAL_EXPERT'
    )
    BEGIN
        INSERT INTO [dbo].[roles] ([id], [role_name], [description])
        VALUES (NEWID(), N'technical_expert', N'Chuyên gia kỹ thuật hỗ trợ đoàn đánh giá');
    END;

    UPDATE [dbo].[roles]
    SET [description] = N'Chuyên gia kỹ thuật hỗ trợ đoàn đánh giá'
    WHERE UPPER(LTRIM(RTRIM([role_name]))) = N'TECHNICAL_EXPERT';

    DECLARE @grants TABLE (
        [role_name] NVARCHAR(100) NOT NULL,
        [permission_name] NVARCHAR(100) NOT NULL,
        PRIMARY KEY ([role_name], [permission_name])
    );

    INSERT INTO @grants ([role_name], [permission_name])
    VALUES
        /* Coordinator endpoints already declare these authorities. */
        (N'COORDINATOR', N'applications.manage'),
        (N'COORDINATOR', N'certificates.read'),
        (N'COORDINATOR', N'findings.manage'),
        (N'COORDINATOR', N'customer_documents.manage'),

        /* Staff may enter CAP received by email/paper on behalf of the customer. */
        (N'STAFF', N'findings.manage'),

        /* Application reviewer roles require read context before performing review. */
        (N'AUDITOR', N'applications.read'),
        (N'LEAD_AUDITOR', N'applications.read'),

        /* Decision maker may preview controlled audit documents before decision. */
        (N'DECISION_MAKER', N'audit_plans.read'),

        /* Customer-access governance remains Admin-only. */
        (N'ADMIN', N'customer_user_requests.review'),

        /* Technical expert: least-privilege read access, still resource-scoped by assignment. */
        (N'TECHNICAL_EXPERT', N'audit_plans.read'),
        (N'TECHNICAL_EXPERT', N'documents.read'),
        (N'TECHNICAL_EXPERT', N'notifications.read'),
        (N'TECHNICAL_EXPERT', N'projects.read');

    INSERT INTO [dbo].[role_permissions] ([role_id], [permission_id])
    SELECT role.[id], permission.[id]
    FROM @grants AS grant_row
    INNER JOIN [dbo].[roles] AS role
        ON UPPER(LTRIM(RTRIM(role.[role_name]))) = grant_row.[role_name]
    INNER JOIN [dbo].[permissions] AS permission
        ON permission.[permission_name] = grant_row.[permission_name]
    WHERE NOT EXISTS (
        SELECT 1
        FROM [dbo].[role_permissions] AS existing
        WHERE existing.[role_id] = role.[id]
          AND existing.[permission_id] = permission.[id]
    );

    /* `findings.read` has no runtime @Permissions consumer; retaining the catalog row is
       harmless for history, but it must not be advertised as an effective role grant. */
    DELETE role_permission
    FROM [dbo].[role_permissions] AS role_permission
    INNER JOIN [dbo].[permissions] AS permission
        ON permission.[id] = role_permission.[permission_id]
    WHERE permission.[permission_name] = N'findings.read';

    /* STAFF previously advertised reports.manage although every write endpoint is restricted
       to AUDITOR/LEAD_AUDITOR. Remove the misleading, unreachable grant. */
    DELETE role_permission
    FROM [dbo].[role_permissions] AS role_permission
    INNER JOIN [dbo].[roles] AS role
        ON role.[id] = role_permission.[role_id]
    INNER JOIN [dbo].[permissions] AS permission
        ON permission.[id] = role_permission.[permission_id]
    WHERE UPPER(LTRIM(RTRIM(role.[role_name]))) = N'STAFF'
      AND permission.[permission_name] = N'reports.manage';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
