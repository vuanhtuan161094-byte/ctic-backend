# Production environment

Start from `.env.production.example`. Production startup is fail-closed for an invalid `NODE_ENV`, weak/missing JWT secret, missing public URL, test-only P09 variables, a runtime `MIGRATION_DATABASE_URL`, test/CI database targets, disabled security headers, missing/non-absolute storage root, storage placed inside the deploy directory, and missing `APP_VERSION`.

Keep real secrets outside source control. `.env.migration` is used only by the migration CLI and must not be loaded into the backend runtime process.

For same-origin frontend deployment, leave `VITE_API_BASE_URL` and `VITE_PUBLIC_API_BASE_URL` blank. If explicit URLs are used with `VITE_DEPLOYMENT_TARGET=production`, the frontend build rejects localhost targets.
