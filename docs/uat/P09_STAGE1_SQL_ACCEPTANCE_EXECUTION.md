# P.09 Stage 1 — isolated SQL staging acceptance procedure (2026-11-13)

**Status: NOT RUN on Windows SQL.** Owner authorized source-level A → C → D → E → B → F on feature branches. This procedure is a real-runtime evidence contract, **not** a claim that database access has been established.

## Safety prerequisites
- Do not touch `CTIC_Certification` or `CTIC_CMP_DEMO_2026`; Gate A remains historical PASS/locked and is never repeated.
- Use a dedicated local **`CTIC_Certification_P09_test`** database, distinct storage root, fictional entities and independently authorized actors; do not change SQL service/network/ACL.
- Read back `SELECT DB_NAME() AS current_database` and compare evidence; never publish connection strings, secrets, real persons or raw unredacted logs.
- Check both feature HEADs against the browser/API runtime process and verify migration status (READ-ONLY before any approved staging-only operation).
- UAT is not automatically production or an accreditation/legally valid certification; all test certificates must remain fictional.

## Required business sequence
Follow [MASTER_UAT_PLAN.md](MASTER_UAT_PLAN.md) UAT-01 through UAT-16 with exact role and negative cases. For the P.09 certification path, keep one stable fictional case ID through:
1. CUSTOMER application F.01, evidence and submit → internal application review, capable body, technical acceptance, rejection/return tests.
2. Authorized F.02 contract + F.18 agreement record, actual signed or approved-copy evidence, approved mandays; commercial edits must not override technical manday authority.
3. Appointment F.04 with competency + independence; program F.03; plan F.05, customer notice/acceptance, audit-preparation deadline.
4. Stage 1 / Stage 2 (F.06, F.07, F.08 evidence where supported, F.09-01/-02), NC/CAP F.10; customer submits evidence, auditor reviews and closes with history.
5. Technical review F.11, independent F.13 decision, F.12 result notification, versioned certificate F.14/PDF/QR and public verification.
6. Surveillance 1 within **12 months of the GRANT decision date**, surveillance 2, MAINTAIN, no new certificate version; recertification (new decision, issued version, historical immutable snapshot). Include strict violation negative cases.
7. Status changes: SUSPEND → review at 3 months → explicit extension/withdrawal decision or RESTORE; never auto-withdraw from a timer. Evidence of QMR-approved scheduling exception must be a separate authenticated approval, not a client `qmr_approved=true` field.
8. Verify F.16 register and any F.08 original attachments; note unresolved record/form gaps instead of forging a form. P.10/P.11/P.13 and digital signing excluded by owner.

## Evidence per case
For every scenario, record: actor and role, HTTP endpoint/status (redact token), UI screenshot at 1440×900 / 1366×768 / 390×844, SQL persisted ID/status/date/foreign keys, audit log actor/timestamp, saved document version/hash (when applicable) and unauthorized role attempt 403/no data leakage.
- Keep evidence inside protected staging `uat-results/` or private operator archive; no secrets in git.
- Test SQL repeatability **2/2** on isolated test database after the final change. Existing `npm run test:e2e:p09` test runner has hard-coded target-identity protections and must not be run on real DEMO.
- Staging performance must use measured workloads and approved p95 thresholds, including counts verified by SQL, not guesses; run `P09_PERF_CONFIRM=I_CONFIRM_READ_ONLY_ISOLATED_P09_STAGING` with `P09_PERF_BASE_URL`, `P09_PERF_TOKEN`, `P09_PERF_KEYWORD`, then `node scripts/uat/p09-readonly-performance-probe.cjs`. Probe uses **GET only** and rejects a non-staging host.
- Record actual concurrency, dataset sizes (1k/10k/50k where feasible), SQL execution plans/index use, CPU/memory and p50/p95 under load.

## Evidence exit gate (fail closed)
Create a PRIVATE JSON evidence manifest satisfying `CMP-P09-STAGE1-1` and run:
```powershell
node scripts/uat/p09-evidence-gate.cjs path/to/private/staging-uat-manifest.json
```
The gate requires actual staging DB identity, both exact source SHAs, UI/API and SQL/actor/denied-role evidence, 16 scenarios, 2/2 isolated SQL E2E, measured performance under agreed p95, 0 S1/S2 and independent production-readiness evidence. Fake fixtures, owner DEMO or missing data are **BLOCKED**, never PASS. The evidence gate validates a manifest; it does **not** itself execute SQL UAT or cryptographically attest submitted evidence. An independent reviewer must inspect linked proof.

**Current blocker:** The agent's GitHub environment cannot access the protected Windows SQL service/identity or staging browser. UAT remains NOT RUN until authorized local execution exists. No bypass of protections is permitted.
