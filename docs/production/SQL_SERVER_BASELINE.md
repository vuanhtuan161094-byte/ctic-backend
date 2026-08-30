# SQL Server production baseline

Verify administratively before go-live; the application must not mutate these server/database settings automatically.

- Database online and `AUTO_CLOSE OFF`.
- Recovery model selected deliberately with the DBA based on backup/RPO requirements; transaction-log backups are scheduled when FULL recovery is used.
- Runtime login has only required application read/write rights and no `db_owner`/DDL role.
- Migration login is separate and used only for reviewed schema deployment.
- Backup operator/storage permissions are separate from the application runtime.
- Data/log/backup volumes have capacity monitoring and tested retention.
- Network encryption/trust settings match the deployed SQL certificate policy.
- SQL Server collation/time/date assumptions are documented for the installation.
- Connection-pool limits are sized against SQL Server capacity; application defaults are starting values, not universal tuning guarantees.

Useful read-only verification:

```sql
SELECT name, state_desc, recovery_model_desc, is_auto_close_on
FROM sys.databases
WHERE name = DB_NAME();

SELECT ORIGINAL_LOGIN() AS login_name, USER_NAME() AS database_user;
```
