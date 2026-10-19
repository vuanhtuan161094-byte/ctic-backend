# CMP — DBA SQL sandbox bootstrap gate (2026-10-19)

Status: BLOCKED BY SQL SERVER PERMISSIONS. This is a one-time privileged handoff, NOT evidence that sandbox SQL ran.

Windows evidence: SQL Server CTIC-LP-054\SQLEXPRESS, localhost:1433. Database CTIC_CMP_DEMO_2026 does not exist. Configured thanvu_app and CMP_MIGRATOR_DEV logins lack sysadmin, dbcreator and CREATE ANY DATABASE. Service-account write permission to E:\SQL sever 2025\MSSQL17.SQLEXPRESS\MSSQL\Backup is unverified. Existing database CTIC_Certification is untouched. No migration, backup or API data was created. Source baseline backend 280087c42e82f454b9ad87a90f42f80778f49240 / frontend 48fc64570b9b7799eb572730b92ab8c3f0622547.

## One-time action by a REAL, ALREADY-AUTHORIZED SQL sysadmin

1. Connect via SQL Server Management Studio to CTIC-LP-054\SQLEXPRESS with an existing SQL Server sysadmin. Windows local administrator does not automatically imply SQL sysadmin. Do not reset sa, elevate service logins, change server authentication, or enter single-user recovery.
2. Inspect scripts/demo/sql/01-bootstrap-cmp-demo-2026.sql, verify server/database/login names, and run ONCE via this authorized connection. Fail-closed checks prevent action on wrong server, existing demo DB, missing login, missing sysadmin or missing default backup path.
3. The script creates ONLY CTIC_CMP_DEMO_2026, grants existing CMP_MIGRATOR_DEV db_owner within this sandbox only, and grants existing thanvu_app db_datareader, db_datawriter and EXECUTE within this sandbox only. No server role changes, and no change to CTIC_Certification. Reuse of existing application credentials is a limited DEV convenience, not fully separated security: independently verify live DB identity before every test write. Dedicated test-only logins are preferable if DBA can provision them securely.
4. The SQL Server service (not the user's Windows ACL) writes a uniquely named COPY_ONLY + CHECKSUM backup in SERVERPROPERTY('InstanceDefaultBackupPath'); RESTORE VERIFYONLY checks backup integrity. Only a result labeled BOOTSTRAP_PASS_BACKUP_VERIFIED plus recorded path/instance counts as successful backup evidence. This is not a full disaster recovery restore rehearsal.
5. If backup fails after CREATE DATABASE, a partial DB may remain. STOP: do not rerun blindly or delete the database. DBA must inspect and resolve. Keep result transcript privately; no passwords or connection strings in Git.

## Codex next steps after DBA PASS

- Read backend AI_context.md and current CMP V3 packet; fetch HEAD, preserve local tracked/untracked WIP.
- Read SQL metadata and independently verify DB_NAME, ServerName, roles, backup in msdb. Do not trust a textual .env claim alone.
- Set up a separate sandbox process environment for ALL Nest/Prisma/migration/preflight children using DATABASE_URL pointing only to CTIC_CMP_DEMO_2026. Current database credentials loader uses dotenv override:false; verify the effective runtime DB_NAME. Use separate storage root and ports (3100/5174 only if actually free), leave existing .env, 3000/5173 and normal CMP_ONE_CLICK.cmd untouched.
- After verified backup apply only safe fresh-DB migrations. Do not run adopt-existing, production stabilization, force reset or unsafe migration commands. If schema migration cannot run safely, stop and report blocker.
- scripts/demo/cmp-workflow-runner.cjs is currently PLAN-ONLY and --apply fails closed. Implement service/API workflow with sandbox fingerprint/snapshot and protected external manifest. Create sample organization, distinct role accounts, customers through API in checkpoints 1/5/20, portal access, and one genuine customer application. Validate every ID, roles, RBAC and SoD. Never insert fake decisions, issued certificates or 2024-2026 backdated history.
- Only cleanup DRY-RUN; no data deletion without later owner permission. Browser evidence must be from actual SQL-backed UI, not fixture. No full UAT or main merge.

Gate A remains PENDING until DBA truly returns BOOTSTRAP_PASS_BACKUP_VERIFIED. If there is no authorized SQL sysadmin, no code or model can bypass this safely.
