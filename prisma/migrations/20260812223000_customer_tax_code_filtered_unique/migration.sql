BEGIN TRY

BEGIN TRAN;

DECLARE @tax_unique_constraint SYSNAME;
DECLARE @drop_tax_unique_sql NVARCHAR(MAX);

SELECT TOP (1)
    @tax_unique_constraint = kc.[name]
FROM sys.key_constraints AS kc
INNER JOIN sys.index_columns AS ic
    ON ic.[object_id] = kc.[parent_object_id]
    AND ic.[index_id] = kc.[unique_index_id]
INNER JOIN sys.columns AS c
    ON c.[object_id] = ic.[object_id]
    AND c.[column_id] = ic.[column_id]
WHERE kc.[parent_object_id] = OBJECT_ID(N'dbo.customers')
  AND kc.[type] = N'UQ'
  AND c.[name] = N'tax_code';

IF @tax_unique_constraint IS NOT NULL
BEGIN
    SET @drop_tax_unique_sql =
        N'ALTER TABLE [dbo].[customers] DROP CONSTRAINT ' +
        QUOTENAME(@tax_unique_constraint) + N';';

    EXEC sys.sp_executesql @drop_tax_unique_sql;
END;

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE [object_id] = OBJECT_ID(N'dbo.customers')
      AND [name] = N'UQ_customers_tax_code_not_null'
)
BEGIN
    DROP INDEX [UQ_customers_tax_code_not_null]
    ON [dbo].[customers];
END;

CREATE UNIQUE NONCLUSTERED INDEX [UQ_customers_tax_code_not_null]
ON [dbo].[customers] ([tax_code])
WHERE [tax_code] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;

THROW;

END CATCH;
