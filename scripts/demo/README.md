# CMP demo seed safety boundary

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
