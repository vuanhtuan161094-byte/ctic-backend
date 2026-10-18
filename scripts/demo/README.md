# CMP demo workflow safety

## Current execution status

The V3 task requires organization setup, role-specific accounts, customer creation and one real application through the existing UI/API workflow. It forbids direct SQL or Prisma inserts, synthetic certification records, backdated workflow history, and cleanup during this run.

The inspected local backend configuration points to `CTIC_Certification`, not an allowlisted demo database. No verified sandbox snapshot ID is available. Therefore this run has **zero database writes** and no API onboarding. The external local manifest records `blocked_before_write`.

## Dry-run and cleanup report

`cmp-workflow-runner.cjs` describes the authorized sequence and API routes without opening a network or database connection. `--apply` fails closed until the sandbox, snapshot, dedicated API instance, and external manifest are verified. The cleanup report only reads a manifest; it never deletes records.

```powershell
node scripts/demo/cmp-workflow-runner.cjs --dry-run
node scripts/demo/cmp-workflow-runner.cjs --cleanup-dry-run <external-manifest.json>
node --test scripts/demo/cmp-demo-seed.test.cjs
```

`cmp-demo-seed.cjs` remains as a compatibility command, but its former direct-Prisma `--apply` path is disabled. Do not put credentials, tokens, passwords, organization values, or real customer data in Git. Any future onboarding must use the real role-protected endpoints and save returned record IDs, timestamps, and dependencies to a protected local manifest. The 2024–2026 browser data remains fixture-only and is not SQL evidence.
