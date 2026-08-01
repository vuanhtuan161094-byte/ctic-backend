USE [master];
GO

DECLARE @BackupDirectory NVARCHAR(4000) = N'E:\SQL Backups';
DECLARE @Timestamp NVARCHAR(20) =
    REPLACE(REPLACE(REPLACE(CONVERT(NVARCHAR(19), GETDATE(), 120), N'-', N''), N':', N''), N' ', N'_');
DECLARE @BackupFile NVARCHAR(4000) =
    @BackupDirectory + N'\CTIC_Certification_' + @Timestamp + N'.bak';

BACKUP DATABASE [CTIC_Certification]
TO DISK = @BackupFile
WITH
    COPY_ONLY,
    INIT,
    COMPRESSION,
    CHECKSUM,
    STATS = 10;

RESTORE VERIFYONLY
FROM DISK = @BackupFile
WITH CHECKSUM;

SELECT @BackupFile AS backup_file;
GO
