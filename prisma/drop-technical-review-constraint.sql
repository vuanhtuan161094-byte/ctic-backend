DECLARE @schema_name SYSNAME;
DECLARE @table_name SYSNAME;
DECLARE @object_id INT;
DECLARE @sql NVARCHAR(MAX);

SELECT TOP 1
    @schema_name = SCHEMA_NAME(schema_id),
    @table_name = name,
    @object_id = object_id
FROM sys.tables
WHERE name = N'technical_reviews';

IF @object_id IS NOT NULL
BEGIN
    SET @sql = N'';

    SELECT
        @sql = @sql
            + N'ALTER TABLE '
            + QUOTENAME(SCHEMA_NAME(t.schema_id))
            + N'.'
            + QUOTENAME(t.name)
            + N' DROP CONSTRAINT '
            + QUOTENAME(fk.name)
            + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.tables t
        ON fk.parent_object_id = t.object_id
    WHERE fk.referenced_object_id = @object_id;

    IF LEN(@sql) > 0
    BEGIN
        EXEC sp_executesql @sql;
    END;

    SET @sql =
        N'DROP TABLE '
        + QUOTENAME(@schema_name)
        + N'.'
        + QUOTENAME(@table_name)
        + N';';

    EXEC sp_executesql @sql;
END;