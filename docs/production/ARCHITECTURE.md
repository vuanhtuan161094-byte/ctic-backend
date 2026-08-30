# CMP production architecture

CMP v1 uses one installation per certification body: one backend, one frontend, one SQL Server database, one persistent file-storage boundary and one organization/branding profile.

Recommended production path:

`Browser -> HTTPS reverse proxy -> frontend/static assets + NestJS backend -> SQL Server + persistent storage`

TLS termination, host firewall, off-site backup repository and external monitoring are infrastructure responsibilities. The NestJS runtime must use a least-privilege DB account; schema migration uses the separate `.env.migration` credential only during an explicit release step.

The application stores structured records in SQL Server and file bytes under `STORAGE_ROOT`. Both are required for a complete recovery.
