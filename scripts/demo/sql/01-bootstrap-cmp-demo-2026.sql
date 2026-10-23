/*
 DBA-only. ONE-TIME bootstrap on CTIC-LP-054\SQLEXPRESS as existing sysadmin.
 Creates ONLY CTIC_CMP_DEMO_2026; no production DB changes.
 If a backup fails after creation, STOP; do not automatically delete or rerun.
*/
USE [master];
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @db sysname=N'CTIC_CMP_DEMO_2026';
DECLARE @machine nvarchar(128)=CONVERT(nvarchar(128),SERVERPROPERTY('MachineName'));
DECLARE @instance nvarchar(128)=CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName'));
DECLARE @folder nvarchar(4000)=CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath'));
DECLARE @backup nvarchar(4000);
IF UPPER(COALESCE(@machine,N'')) <> N'CTIC-LP-054'
    OR UPPER(COALESCE(@instance,N'')) <> N'SQLEXPRESS'
    THROW 51001,'BLOCKED: Wrong SQL Server instance.',1;
IF COALESCE(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1
    THROW 51002,'BLOCKED: An existing SQL Server sysadmin must run this.',1;
IF DB_ID(@db) IS NOT NULL
    THROW 51003,'BLOCKED: Sandbox exists. Inspect manually; do not overwrite.',1;
IF SUSER_ID(N'CMP_DEMO_APP') IS NOT NULL OR SUSER_ID(N'CMP_DEMO_MIGRATOR') IS NOT NULL
    THROW 51004,'BLOCKED: A DEMO SQL login already exists; inspect before continuing.',1;
IF LEN(@demoAppPassword)<32 OR LEN(@demoMigratorPassword)<32
    THROW 51007,'BLOCKED: Dedicated DEMO SQL passwords were not provided.',1;
IF NULLIF(LTRIM(RTRIM(COALESCE(@folder,N''))),N'') IS NULL
    THROW 51005,'BLOCKED: Default backup path is missing.',1;
IF RIGHT(@folder,1) NOT IN (N'\',N'/') SET @folder=@folder+N'\';
SET @backup=@folder+N'CTIC_CMP_DEMO_2026_PREWORK_'
    +REPLACE(CONVERT(nvarchar(36),NEWID()),N'-',N'')+N'.bak';
IF LEN(@backup)>240 THROW 51006,'BLOCKED: Backup path too long.',1;
BEGIN TRY
    DECLARE @createAppLogin nvarchar(max)=
      N'CREATE LOGIN [CMP_DEMO_APP] WITH PASSWORD = '
      + QUOTENAME(@demoAppPassword,N'''')
      + N', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;';
    DECLARE @createMigratorLogin nvarchar(max)=
      N'CREATE LOGIN [CMP_DEMO_MIGRATOR] WITH PASSWORD = '
      + QUOTENAME(@demoMigratorPassword,N'''')
      + N', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;';
    EXEC sys.sp_executesql @createAppLogin;
    EXEC sys.sp_executesql @createMigratorLogin;
    EXEC(N'CREATE DATABASE [CTIC_CMP_DEMO_2026];');
    EXEC(N'USE [CTIC_CMP_DEMO_2026];
      CREATE USER [CMP_DEMO_MIGRATOR] FOR LOGIN [CMP_DEMO_MIGRATOR];
      CREATE USER [CMP_DEMO_APP] FOR LOGIN [CMP_DEMO_APP];
      ALTER ROLE [db_owner] ADD MEMBER [CMP_DEMO_MIGRATOR];
      ALTER ROLE [db_datareader] ADD MEMBER [CMP_DEMO_APP];
      ALTER ROLE [db_datawriter] ADD MEMBER [CMP_DEMO_APP];
      GRANT EXECUTE TO [CMP_DEMO_APP];');
    BACKUP DATABASE [CTIC_CMP_DEMO_2026] TO DISK=@backup
      WITH COPY_ONLY,CHECKSUM,INIT,STATS=10;
    RESTORE VERIFYONLY FROM DISK=@backup WITH CHECKSUM;
    SELECT N'BOOTSTRAP_PASS_BACKUP_VERIFIED' AS gate_status,
      @machine AS sql_machine,@instance AS sql_instance,
      @db AS database_name,@backup AS verified_backup_path,
      SYSDATETIMEOFFSET() AS verified_at;
    EXEC(N'USE [CTIC_CMP_DEMO_2026];
      SELECT r.name AS database_role,u.name AS member_name
      FROM sys.database_role_members m
      JOIN sys.database_principals r ON r.principal_id=m.role_principal_id
      JOIN sys.database_principals u ON u.principal_id=m.member_principal_id
      WHERE u.name IN (N''CMP_DEMO_MIGRATOR'',N''CMP_DEMO_APP'')
      ORDER BY u.name,r.name;');
END TRY
BEGIN CATCH
    PRINT N'[CMP] Failed; database might already have been created.';
    PRINT N'[CMP] Do not rerun/drop: DBA must inspect and resolve backup/roles.';
    THROW;
END CATCH;
