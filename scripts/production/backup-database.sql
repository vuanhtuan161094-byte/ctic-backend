:On Error exit

USE [master];
GO

DECLARE @DatabaseName sysname = N'$(DatabaseName)';
DECLARE @BackupFile nvarchar(4000) = N'$(BackupFile)';

IF @DatabaseName IN (N'', N'CMP_DATABASE_NAME_REQUIRED')
    THROW 51000, 'DatabaseName SQLCMD variable is required.', 1;
IF @BackupFile IN (N'', N'CMP_BACKUP_FILE_REQUIRED')
    THROW 51000, 'BackupFile SQLCMD variable is required.', 1;
IF DB_ID(@DatabaseName) IS NULL
    THROW 51000, 'Target database does not exist.', 1;

DECLARE @EngineEdition int = TRY_CONVERT(int, SERVERPROPERTY('EngineEdition'));
DECLARE @UseCompression bit = CASE WHEN @EngineEdition = 4 THEN 0 ELSE 1 END; -- 4 = Express
DECLARE @sql nvarchar(max);

IF @UseCompression = 0
    PRINT N'INFO: SQL Server Express detected; BACKUP COMPRESSION is disabled for this backup.';
ELSE
    PRINT N'INFO: BACKUP COMPRESSION is enabled for this SQL Server edition.';

BEGIN TRY
    SET @sql =
        N'BACKUP DATABASE ' + QUOTENAME(@DatabaseName) +
        N' TO DISK = N''' + REPLACE(@BackupFile, '''', '''''') +
        N''' WITH COPY_ONLY, INIT, CHECKSUM, STATS = 10' +
        CASE WHEN @UseCompression = 1 THEN N', COMPRESSION' ELSE N'' END + N';';
    EXEC sys.sp_executesql @sql;

    SET @sql =
        N'RESTORE VERIFYONLY FROM DISK = N''' +
        REPLACE(@BackupFile, '''', '''''') +
        N''' WITH CHECKSUM;';
    EXEC sys.sp_executesql @sql;
END TRY
BEGIN CATCH
    THROW;
END CATCH;

SELECT
    @DatabaseName AS database_name,
    @BackupFile AS backup_file,
    @UseCompression AS compression_used,
    SYSUTCDATETIME() AS verified_at_utc;
GO
