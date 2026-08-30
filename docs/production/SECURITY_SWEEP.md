# Phase 10 static security sweep

Repository-level review covered production source for dynamic code execution, child-process use, unsafe raw SQL, file serving, CORS, hard-coded secrets and branding identifiers.

Findings:
- No `eval`/`new Function` production path was found.
- The DOCX-to-PDF converter uses `execFile` rather than shell execution. Executable selection is deployment configuration and file paths are passed as arguments; the Windows Word fallback base64-encodes paths before constructing its PowerShell script.
- Production `$queryRawUnsafe/$executeRawUnsafe` occurrences inspected in Prisma/schema-health/system-admin paths use static SQL strings rather than request-derived SQL concatenation.
- File-serving endpoints continue to resolve/download files through the existing resource-authorization and storage-integrity services.
- Credentialed CORS wildcard remains rejected.
- No real JWT/DB/API secret is added by Phase 10. Production examples contain placeholders only.
- Internal `ctic-*` CSS/session identifiers remain implementation keys, not displayed organization branding. User-visible organization identity remains configuration-driven.

The sweep is not a penetration test. External reverse proxy, TLS configuration, host OS, SQL Server hardening and network controls require deployment-environment review.
