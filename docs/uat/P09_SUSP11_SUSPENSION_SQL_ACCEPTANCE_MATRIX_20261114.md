# CMP P.09 — SUSP11 exact-SHA QA closure and isolated SQL UAT evidence matrix
**Checkpoint:** 2026-11-14. **Classification:** CI accepted with a known unrelated mobile-search flake; suspension SQL staging **BLOCKED / NOT RUN**. This file documents evidence, not independent SQL sign-off.

## Frozen source baseline (before this documentation commit)
- Backend `fcc3fb8afb6ebecc6b8a3aef9145f376da17ad3d`; [quality run 43392005964](https://github.com/vuanhtuan161094-byte/ctic-backend/actions/runs/43392005964): success; job log **101/101 suites, 875/875 tests**, Prisma validation and build completed.
- Frontend `2730617370035aeb1ea5ffaf1cbc91b4f0b05d5f`; [quality run 43399052906](https://github.com/vuanhtuan161094-byte/ctic-frontend/actions/runs/43399052906): success; [browser run 43399053316](https://github.com/vuanhtuan161094-byte/ctic-frontend/actions/runs/43399053316): conclusion success; **158 passed, 9 skipped, 1 flaky**; zero final failed after one retry.
- Browser artifact `cmp-browser-quality-1`, ID **14025585286**, expiry 2026-11-27; sha256 digest reported by GitHub: `159ffe860b4d6a6537ce40f69949c311d420ef3fcbc70bd57b017465e4a9c607`.
- **Known flake:** mobile 390×844 `e2e/specs/personal-workspace-calendar-layout.spec.mjs:252`, global search: `categoryOption.click()` timed out at line 289 waiting on visible category popup, passed on retry #1. Do not describe as 159 clean first-attempt passes. Trace, video, screenshot in artifact. This is a reliability follow-up, not evidence of a failed suspension scenario. **Follow up:** inspect trace and test popup hit target/overlay; rerun exact-SHA no-retry mobile before marking flake closed.
- CI uses controlled fixtures; neither CI result nor this manifest implies real SQL, genuine F.11 documents, F.13 legal issuance, or human authority acceptance.

## Isolated SQL suspension UAT, to be executed by authorized staging operator
**Environment invariant:** `SELECT DB_NAME() AS current_database` must equal **`CTIC_Certification_P09_test`**. Also attest isolated file storage and fictional records. Never run on `CTIC_Certification`, `CTIC_CMP_DEMO_2026`, production or owner Gate A. Log both runtime SHAs, real role IDs (redacted), request IDs, timestamps and SQL readback IDs. An independent reviewer must inspect evidence. Run **two distinct 2/2 passes**, idempotent records, after the last application change. Never upload identities, tokens or private evidence to public GitHub.

| ID | Scenario with expected decision | Mandatory evidence | Actual |
|---|---|---|---|
| SUS-01 | Signed-off F.13 SUSPEND creates suspended status and exact status_history; cannot assume missing history | Decision ID, history ID, SQL + UI/API | NOT RUN |
| SUS-02 | +3 and +6 calendar month deadlines, Jan 31 month clamp and leap-year boundary | Clock/date evidence, SQL readback | NOT RUN |
| SUS-03 | COORDINATOR request with completed F.11, corrective evidence and independently appointed active DECISION_MAKER | POST/API, workflow_approvals row, audit_logs actor | NOT RUN |
| SUS-04 | Prohibit CUSTOMER/AUDITOR, self-approval, F.11 reviewer as approver, audit-team decision conflict, deactivated/removed-role reviewer | HTTP denial + no DB mutation + no data leakage | NOT RUN |
| SUS-05 | Pending request cannot decide twice; reject tampered F.11, different certificate/project/series or outdated suspension history | 403/409, workflow snapshot and no status mutation | NOT RUN |
| SUS-06 | Explicit first EXTEND_3_MONTHS approved; status remains suspended, extension marks 6-month ceiling; no automatic F.13 transition | Approval row, audit log, certificate unchanged | NOT RUN |
| SUS-07 | Reject second approved extension even after subsequent rejected request; preserve previous valid approved extension in GET | Sequential actions, SQL history, GET readback | NOT RUN |
| SUS-08 | Reject extension/restore after six months, with no time-triggered auto-withdrawal; withdrawal/reduction requires separate F.13 | Boundary date, negative API, SQL state | NOT RUN |
| SUS-09 | Approved RECOMMEND_RESTORE with same F.11 permits independent F.13 RESTORE before six months only | Recommendation, F.13 ID, history, PDF/version lineage | NOT RUN |
| SUS-10 | Approved RECOMMEND_WITHDRAW permits independent F.13 WITHDRAW; rejected/pending/wrong-action recommendation must not authorize | Negative tests, F.13, public status | NOT RUN |
| SUS-11 | REDUCE_SCOPE creates controlled replacement certificate version; previous version and QR/public verification remain immutable | Both version IDs, SQL immutable readback, public URL | NOT RUN |
| SUS-12 | Two competing requests/decisions do not double-approve; serializable row locking and audit events withstand concurrency | Parallel request trace, unique decision, SQL/audit rows | NOT RUN |
| SUS-13 | Desktop and mobile real-staging UI support read, request, review, denial and error recovery, no console error | Redacted screenshots 1440×900, 1366×768, 390×844, trace | NOT RUN |
| SUS-14 | Verify independent responsible authority has accepted DECISION_MAKER mapping and actual F.11 / CAP attachments (not just typed references) | Dated owner approval + hashed controlled files | NOT RUN |

## Required database readback fields
Capture (redacted) `certificates.id,status,certificate_series_id`, `certificate_status_histories.id,effective_date,certification_decision_id`, `workflow_approvals.entity_type,entity_id,step_no,status,approver_id,approved_at`, `audit_logs.user_id,action,entity_id,outcome`, `technical_reviews.id,reviewer_id,status`, and the applicable F.13/certificate version relations. Avoid assuming an approval exists from a UI badge. Check persisted state **before and after every denied action**. Record corresponding API request ID, timestamp and negative test assertions. SQL statements must use operator-approved read-only queries for verification, with isolated UAT business writes only through supported APIs.

## Closure decision (fail closed)
- **E / Browser source gate:** COMPLETE WITH OBSERVATION — GitHub success, 158 passed, 9 skipped, 1 recovered mobile-search flake. The flake remains OPEN until no-retry revalidation.
- **Suspension implementation / source gate:** PASS under the backend 875/875 CI result, subject to actual runtime acceptance.
- **Suspension B / SQL staging gate:** **BLOCKED** — SQL identity/runtime not available to this GitHub-only agent; SUS-01…14 all NOT RUN; neither 2/2 persistence nor actor/SoD sign-off supplied.
- **Production gate:** **BLOCKED**; no production changes authorized. The separate overall `CMP-P09-STAGE1-1` gate still requires UAT-01…16, performance and recovery/approval under `docs/uat/P09_STAGE1_SQL_ACCEPTANCE_EXECUTION.md` and `scripts/uat/p09-evidence-gate.cjs`. Do not manufacture a PASS manifest.
- **Next action:** Obtain isolated staging operator evidence for SUS-01…14 and full P.09 UAT 2/2; resolve mobile search flake on FE separately if reproducible. F.08/F.16/F.18 continue as a distinct work package after this gate.
