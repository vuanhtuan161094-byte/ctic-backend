-- Existing installations may already have CUSTOMER users without the
-- notifications.read permission because Phase 2.3 is the first customer-safe
-- personal notification projection. The insert is additive and idempotent.

UPDATE [dbo].[notifications]
SET [severity] = 'INFO'
WHERE UPPER([severity]) NOT IN (
    'INFO',
    'NORMAL',
    'WARNING',
    'CRITICAL'
);

INSERT INTO [dbo].[role_permissions] (
    [role_id],
    [permission_id]
)
SELECT
    [role].[id],
    [permission].[id]
FROM [dbo].[roles] AS [role]
CROSS JOIN [dbo].[permissions] AS [permission]
WHERE LOWER([role].[role_name]) = 'customer'
  AND [permission].[permission_name] = 'notifications.read'
  AND NOT EXISTS (
      SELECT 1
      FROM [dbo].[role_permissions] AS [existing]
      WHERE [existing].[role_id] = [role].[id]
        AND [existing].[permission_id] = [permission].[id]
  );
