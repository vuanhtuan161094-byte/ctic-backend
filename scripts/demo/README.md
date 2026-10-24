# CMP DEMO workflow

The DEMO runner uses the real role-protected API. It never inserts business records through SQL or Prisma, never makes approval/certificate history, and never deletes data. API passwords and the ID manifest stay under `%LOCALAPPDATA%\CMP\DEMO` with a Windows ACL; logs stay in `CMP\artifacts\demo`.

## SQL Gate A

`sql/01-bootstrap-cmp-demo-2026.sql` is a one-time DBA script for the exact `CTIC-LP-054\SQLEXPRESS` instance. It creates only `CTIC_CMP_DEMO_2026`, two dedicated SQL logins, limited runtime permissions, a copy-only checksum backup, and runs `RESTORE VERIFYONLY`. The helper refuses an existing database and logs no passwords. Double-click `sql/RUN_CMP_DEMO_GATE_A.cmd` from the signed-in desktop session; Windows will request Administrator credentials if needed. Do not run the SQL script by hand or rerun it after a partial failure.

## One-click DEMO

`CMP_DEMO_ONE_CLICK.cmd` is the separate, **runtime-only** DEMO launcher. It selects the newest Gate A process start, requires that exact process to report a verified backup, connects to the existing `SQLEXPRESS` through the local client endpoint `127.0.0.1:1433`, and checks the protected manifest and SQL data with read-only queries. It never runs Gate A, migrations, seed scripts or the API workflow. It does not change SQL TCP settings or restart the service. It starts the API and frontend on loopback-only ports, reuses services started by this launcher, and refuses to duplicate an unknown process already using either port. The normal `CMP_ONE_CLICK.cmd` and existing `.env` files are left unchanged.

The one-time workflow has already created one administrator, QMS configuration for [ISO 9001:2026](https://www.iso.org/standard/9001) (published 16 September 2026), role-specific internal accounts, 20 fictional customers and their Portal accounts, and submitted one application using the active standard returned by the live Portal API. The scheme is explicitly tagged DEMO and makes no accreditation claim. The runtime launcher checks that existing records still match the complete manifest; it does not repeat this workflow. Later review/approval work remains pending unless actual workflow requirements are satisfied.

## Local checks

```powershell
node scripts/demo/cmp-workflow-runner.cjs --dry-run
node scripts/demo/cmp-workflow-runner.cjs --cleanup-dry-run "$env:LOCALAPPDATA\CMP\DEMO\manifest.json"
node --test scripts/demo/cmp-demo-seed.test.cjs scripts/demo/cmp-demo-launcher.test.cjs scripts/demo/sql-bootstrap-contract.test.cjs
```

Cleanup is dry-run only. No customer or application is removed by these commands.
