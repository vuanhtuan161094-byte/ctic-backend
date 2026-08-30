# Backup and restore

A complete CMP backup contains both SQL Server and `STORAGE_ROOT`.

## Database backup
Use a dedicated SQL/backup operator credential, not the backend runtime account.

Preferred PowerShell wrapper using SQL authentication:

```powershell
.\scripts\production\backup-database.ps1 `
  -ServerInstance "localhost,1433" `
  -DatabaseName "CTIC_Certification_P09_test" `
  -BackupFile "E:\CMP_DR\database\CTIC_Certification_P09_test.bak" `
  -SqlUsername "sa" `
  -TrustServerCertificate
```

The wrapper prompts once for the SQL password and temporarily exposes it to `sqlcmd` only through `SQLCMDPASSWORD`; it is not placed on the command line or written to the repository.

If `-SqlUsername` is omitted, the wrapper uses Windows Integrated Authentication.

`-TrustServerCertificate` is intended only for local/self-signed SQL Server drills. Production should use a trusted SQL Server certificate.

The SQL script uses `COPY_ONLY`, `CHECKSUM` and `RESTORE VERIFYONLY`. Backup compression is enabled on editions that support it and automatically disabled on SQL Server Express.

SQL Server itself writes the backup file, so the SQL Server service account must have access to the selected backup directory.

## Storage backup
Back up persistent storage with `scripts/production/backup-storage.ps1` to a NEW/EMPTY snapshot directory. The storage snapshot is immutable and does not use mirror/delete semantics.

Keep database and storage backups from the same controlled/low-activity window. Record UTC start/end times and release version. Store at least one copy outside the application/server failure domain according to the organization's retention policy.

## Restore drill
Restore into isolated targets only. The supplied `restore-drill.ps1` refuses a database name unless it ends in `_restore_test` or `_dr_test` and requires an empty storage restore directory.

Example with SQL authentication:

```powershell
.\scripts\production\restore-drill.ps1 `
  -ServerInstance "localhost,1433" `
  -BackupFile "E:\CMP_DR\database\CTIC_Certification_P09_test.bak" `
  -RestoreDatabaseName "CTIC_Certification_P09_restore_test" `
  -StorageBackupRoot "E:\CMP_DR\storage_snapshot" `
  -StorageRestoreRoot "E:\CMP_DR\restore_storage" `
  -SqlUsername "sa" `
  -TrustServerCertificate
```

If `-DataDirectory` is omitted, the drill uses SQL Server's `InstanceDefaultDataPath`, avoiding accidental restore into an application-managed directory. The drill refuses to overwrite an existing restore-test database.

After restore, point a temporary CMP instance at the restored DB/storage and verify login, record counts, document download/integrity, certificate exact version, migration count and health.

Never overwrite production during a drill. Delete the isolated drill DB/storage only after evidence of successful verification is retained.
