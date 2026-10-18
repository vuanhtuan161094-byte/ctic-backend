# CMP demo seed safety boundary

## 2026-10-18 — owner override: real onboarding only

The owner does **not** want synthetic certification dossiers, manufactured approvals, or bulk data presented as real workflow progress. The current execution authority is [frontend CMP V3 packet](https://github.com/vuanhtuan161094-byte/ctic-frontend/blob/feature/ux-fix-batch01/docs/ux/CMP_CODEX_VISUAL_AND_REAL_WORKFLOW_RESET_2026-10-18.md).

- Treat this customer-only Prisma seed utility as a **safety/dry-run prototype**, **not** the new acceptance runner. Do **not** execute `--apply` to circumvent the requested user/service-driven process.
- Start with isolated SQL sandbox identification + snapshot, then admin organization configuration, governed internal accounts and roles, customer creation through the actual UI/API, portal access, then ONE customer application using existing authorized transitions. Never direct-write an application, project, audit plan, finding, approval or certificate to make the interface look populated.
- Browser fixture content (20 customers/40 dossiers over 2024–2026) is read-only **fixture evidence** and does not imply SQL data exists.
- Keep record ID lineage in a protected out-of-repo run manifest, plan a cleanup DRY-RUN, and perform NO cleanup until the owner requests it. Preserve local WIP, backups, existing database contents and any pre-existing customer/user.
- If no sandbox is available, status is **SQL ONBOARDING PENDING**. Do not point normal CMP_ONE_CLICK.cmd at an unverified sandbox or real database.

The command below remains documented for historical behavior and safety testing only. Its presence is NOT authorization to bulk-populate current CMP test data.


`cmp-demo-seed.cjs` creates no database, runs no migration, and changes no workflow state. Its default mode is a connection-free dry run. The current database apply scope is limited to 20 synthetic customer rows with `DEMO-CMP-001..020` codes, `@example.invalid` emails, no tax IDs, and no portal passwords.

The apply command is manual and requires all of these checks:

- An explicit environment file stored outside this repository.
- `CMP_DEMO_SEED=YES` and a non-empty `CMP_DEMO_SNAPSHOT_ID` in that file.
- A loopback SQL Server host and a database named `CTIC_CMP_DEMO_YYYY`.
- A live SQL identity query that confirms the connected database name matches the allowlisted target.
- Existing rows with a demo code must already match the exact synthetic company name and reserved-domain email. Collisions fail closed.

The runner does not create users, portal mappings, applications, reviews, contracts, certification projects, audit plans, findings/CAP, technical reviews, decisions, or certificates. Those records need an available isolated database and valid service-owned workflow prerequisites. No database or workflow seed was applied for this task because the local SQL sandbox could not be verified.

Run the static preview and safety tests with:

```powershell
node scripts/demo/cmp-demo-seed.cjs --dry-run
node --test scripts/demo/cmp-demo-seed.test.cjs
```

The three-year browser dataset lives separately in the frontend controlled fixture. It is marked fixture-only and must not be described as local SQL data.
