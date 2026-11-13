# P.09 release acceptance / 2026-11-13

## Current classification
**NOT PRODUCTION READY.** Backend CI, frontend CI and intercepted Playwright UI fixture PASS are necessary but not sufficient. Real SQL staging repeatability, full role-driven UAT, performance under expected load, recovery, infrastructure and security remain independently required.

## Mandatory gates
- G-A: P.09 scope/rules complete (F.01 through F.18 records/evidence as applicable, 12-month GS1, approved exceptions, suspension 3+3 months) with negative authorization tests.
- G-C: Global search customers/applications/projects/certificates/work with per-category exact counts and per-record RBAC; audit collation-dependent Vietnamese accent search on actual MSSQL collation, no unverified CI assertion.
- G-D: SQL candidate filtering/paging indexes, realistic sampled dataset size + SQL actual plans, 1k/10k/50k where feasible, concurrency, p50/p95, timeout/memory; performance smoke that only hits `/health` does NOT qualify.
- G-E: Browser three viewports 1440x900, 1366x768 and 390x844, keyboard search, F.04 and P.09 core journey, no serious accessibility or role regression.
- G-B: Real isolated staging `CTIC_Certification_P09_test`; UAT-01..16 with role-negative cases, full three-year certification cycle and 2/2 SQL repeatability; never touch DEMO or source production.
- G-F: Release env validation, strong secrets, trusted same-origin proxy/TLS, SQL least privilege and migration separation, immutable storage and backup, checksum/verify+isolated restore, scheduler and monitoring, verified rollback, dependency scan, release manifest, no S1/S2.

## Rollback and verification
No merge/deploy authorization implied. Before a real release, retain both exact source HEADs and DB migration checksums, tested backup/storage restore, audit trail integrity, and rollback ownership. An additive migration may require forward recovery; never assume a safe automatic SQL schema downgrade. Do not treat a `performance-smoke.cjs` health PASS as proof of API response times.

## Current source-only improvements
- 36-month certificate validity cap, F.13-issued expiry equality.
- GS1 12-month schedule guard; formal QMR exception approval remains PENDING, without unsafe client-side override.
- Scoped `/me/global-search`; category pagination; work paging DB prefilter for project access (scoped <=1000 projects), otherwise conservative ACL fallback.
- Browser search UI and F.04 loading modal, with exact-SHA CI to be tracked.

**Current B/F acceptance:** PENDING isolated Windows/SQL and infrastructure evidence. No production/data changes made.
