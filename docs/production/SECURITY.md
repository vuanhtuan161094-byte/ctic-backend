# Production security baseline

- TLS is terminated by a trusted reverse proxy/load balancer; configure `TRUST_PROXY` deliberately.
- Production security headers must remain enabled; wildcard credentialed CORS is rejected.
- Swagger is off by default in production and should only be enabled behind appropriate network/access controls.
- Public registration is off by default.
- Runtime DB credentials must not have `db_owner`/DDL authority; migration credentials are separate.
- JWT, DB credentials, SMTP/API credentials and private keys remain external secrets and are never stored in normal configuration tables or logs.
- File upload/download continues to use authorization, magic-byte/OOXML/PDF validation, zip-bomb protection, traversal protection and SHA-256 integrity controls.
- `npm audit --omit=dev --audit-level=high` is a release review input; do not use `npm audit fix --force` without regression review.

The Phase 10 sweep is application/static hardening, not a penetration test or external infrastructure audit.
