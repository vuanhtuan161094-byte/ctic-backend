# Deployment runbook

## Precheck
1. Confirm an independently verified SQL backup and file-storage backup exist.
2. Confirm the restore drill procedure is understood and the rollback owner is identified.
3. Prepare `.env` and `.env.migration`; never copy test flags into production.
4. Run backend build and `npm run prod:env:check` with the production runtime environment.
5. Run `npm run db:migration-permissions`, `npm run db:preflight` and review pending migrations.
6. Generate `npm run release:manifest` and retain it with the release record.

## Deploy
1. Quiesce traffic or use a controlled low-activity release window when schema/storage consistency requires it.
2. Apply migrations explicitly with the migration credential: `npm run db:migrate:deploy`.
3. Deploy backend and frontend artifacts.
4. Start backend with `npm run start:prod`; production prestart checks schema and runtime DB permissions.
5. Start/serve the frontend behind the configured reverse proxy.

## Smoke
1. Check `/health/live` and `/health`.
2. Run `npm run prod:http-smoke` against the public backend URL.
3. Login as an internal user and open customer/project, My Work, Documents and Management Cockpit.
4. Download one authorized document and verify one public certificate lookup.
5. Confirm scheduler health in System Administration.

Monitor after release and record the release/build identifier.
