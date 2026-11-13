# CMP P.09 — Deep source-to-procedure audit / 2026-11-13

**Status: OPEN / NOT ACCEPTED.** Source review and controlled CI verification are **not** evidence of completion against a persisted staging SQL lifecycle. No Windows SQL service, credentials, migrations, Gate A, approval records or certificates were touched in this audit.

## Audit basis and scope

- Owner-supplied archive: `P.09. Management System Certification Procedure.rar`, P.09 v1.3, effective **2025-11-11**, **25 pages**. This private archive is the authoritative process reference; do not upload/distribute original forms or personal names in the public repository.
- Technical baseline: backend `1b49a0f72df4ef7365bd2b758335079293ca3f88`; frontend pre-F.04 correction `1f7697e0a8ca54788b59068ede13bfc5c7e64dba`, F.04 changes `96083a40117136cb3c849efb57f07d6e617e7222` and `39ca116156aa18afcdaee5f31709ea7fd7ecbd49` (latest visual/browser outcome must be checked independently).
- Current scope: **P.09 management-system certification** and the personnel/manday/commercial/document dependencies necessary for P.09. P.10/P.11/P.13 and digital-signature integration explicitly deferred.
- P.09 interpretation: distinguish an electronic register, an original template, a document attachment, and an enforced workflow gate. One does **not** prove the others.

## Evidence map (implementation exists does not equal operational acceptance)

| P.09 stage / source | Observed implementation | Required exact-SQL acceptance |
| --- | --- | --- |
| Intake F.01 and scope/conditional supporting documents (pp. 6–8) | `src/certification-applications`, Portal, customer mapping, review modules | CUSTOMER -> COORDINATOR, missing evidence/return/resubmit, cross-customer denial, ISO 9001/14001/45001 attachments |
| Application review and accept/refuse written rationale (p. 8) | `src/application-reviews` and capability checks | Saved reason/actor, no rejected request promoted into project |
| F.02 contract + F.18 agreement/authorized acceptance (p. 8) | `src/contracts`, `src/certification-agreements`; latter create stores customer/contract, agreement number/sign date | Exact agreement PDF or scanned signature, authorized acceptance, contract linkage and version history before formal certification activity; **gate not established in inspected program-create path** |
| R.01 mandays, program F.03, annual surveillance (pp. 8–9) | Manday calculations; `audit-programs` generates stage1/stage2, GS1/GS2, recertification sequence | Approved manday source and multi-site/shift logic; first GS1 within 12 months of initial decision; audit-frequency exception records QMR approval |
| F.04 team/competency/independence (pp. 9–11) | Team appointment and readiness checks, F.04 generator, roles/SoD | Issue-block invalid member, competence and scheduling; reproduce desktop modal initial-load failure and rerun after lazy fallback |
| F.05 plan and client acknowledgment (pp. 11–13) | `audit-plans` and generated templates | Confirm plan sent to client and accepted, including 3-working-day pre-audit requirement (p. 13) and exceptional cases |
| Stage 1 / Stage 2 and F.06/F.07/F.09 (pp. 11–20) | `audit-documents`, `reports`, audit execution | Stage 1 result prerequisite before Stage 2; original report version and evidence snapshots; recorded meetings and report delivery |
| F.08 audit field notes and F.15 audit log (pp. 16, 20, 25) | F.15 supported by document generator; F.08 **not** in `ALLOWED_DOCUMENT_TYPES` or inspected `src/reports/templates` | Determine whether an existing generic note/attachment provides legally sufficient traceability; if not, add controlled F.08 evidence workflow |
| NC/CAP F.10, root cause/effectiveness (pp. 16–21) | `audit-findings`, customer CAP, review process | MAJOR/MINOR NC gates; evidence owner/response, root cause, acceptance and repeatability; negative attempts |
| Technical review F.11, decision F.13, notice F.12, certificate F.14 (pp. 21–22) | Technical review, decision SoD, notification, certificates and public verification | Independent reviewer/decision-maker, no premature notice/issuance, exact PDF/QR/revision, no accidental duplicate version |
| Surveillance/recertification / 3-year validity (pp. 9, 22–23) | Explicit GS1/GS2/recert cycle and `GRANT/MAINTAIN/RECERTIFY` status/version behavior | Persisted GS1/GS2, correct chronology, first GS1 not later than decision+12 months, traceable recertification and next 3-year cycle |
| F.16 recognized certification-body register (pp. 9, 25) | No F.16 entry in inspected audit-document template generator | Decide whether managed as controlled external register; verify transfer/reduction decisions and evidence before marking complete |
| Suspension/restore/withdraw/reduce (pp. 23–24) | `certificates/certificate-lifecycle.ts` transitions and F.13 decisions; `certificates.scheduler.ts` **only expires due certificates** | Test 3-month suspension review + potential 3-month extension + withdrawal decision, alert/evidence/actor, no auto-withdraw without lawful controlled decision |

## Verified engineering evidence

- Backend Quality at `1b49a0f72df4ef7365bd2b758335079293ca3f88`: [run 43357564483](https://github.com/vuanhtuan161094-byte/ctic-backend/actions/runs/43357564483) **94/94 suites, 819/819 tests PASS**, Nest build.
- Frontend Quality at `1f7697e0a8ca54788b59068ede13bfc5c7e64dba`: [run 43357254299](https://github.com/vuanhtuan161094-byte/ctic-frontend/actions/runs/43357254299) **505/505 PASS**, types/lint/build.
- Controlled Browser QA at same old frontend SHA: [run 43357254115](https://github.com/vuanhtuan161094-byte/ctic-frontend/actions/runs/43357254115) succeeded with **154 passed, 9 skipped, 1 flaky** (desktop F.04 first attempt failed to display modal within 15 seconds, retry passed). My Work page-2 and search-outside-page-1 tests passed on desktop/mobile. **Not a staging SQL test**.
- F.04 audit fix: `CertificationProjectDetailScreen` previously rendered lazy Schedule editor with `Suspense fallback={null}`; a real visible modal with skeleton was added while loading its chunk. Final exact-SHA browser and focused CI remain independent gates.
- Backend Jest and frontend browser fixtures do **not** execute `test/certificate-full-lifecycle.e2e-spec.ts` against real SQL in these quality workflows. That suite itself constructs test records using Prisma and is useful but does not cover full GUI-API staging UAT.

## Risks and audit findings

**A01 — P0 / evidence gap.** No observed end-to-end, persisted staging lifecycle verified at current HEAD, including source DB identity, source documents, actual business actor/SoD and version lineage. `docs/uat/MASTER_UAT_PLAN.md` explicitly requires UAT-01..16 and repeatability 2/2. **Status: OPEN**.

**A02 — P0 / schedule policy gap requiring test.** P.09 p. 9 requires first surveillance within 12 months from initial certification decision and QMR authorization for deviations. `AuditProgramsService.validateEvents` currently checks duplicate sequence and start <= end, but **no <=12 month gate was found in inspected create/update methods**. Investigate scheduler/other services before classifying system-wide; add independent tests for month-boundaries, leap years and approved exception. **Status: SUSPECTED GAP / TEST REQUIRED**.

**A03 — P1 / suspension policy gap requiring design decision.** P.09 p. 24 mentions 3+3-month suspension reviews. Certificate state machine supports SUSPEND/RESTORE/WITHDRAW; scheduled task auto-expires only. Add alert/review dates and explicit accountable decision; do not auto-withdraw certification merely because a timer fired without an authorized review. **Status: OPEN**.

**A04 — P1 / forms and evidence.** F.08 and F.16 are not built-in generators in the inspected `AuditDocumentsService.ALLOWED_DOCUMENT_TYPES` or `src/reports/templates`; verify whether general Document Control or upload is adequate and whether the required fields/audit trail are covered. F.18 has an agreement record but the inspected create method doesn't enforce PDF/signed evidence or CEO/client acceptance. Avoid asserting absence elsewhere without UAT. **Status: OPEN**.

**A05 — P1 / actual customer acknowledgement.** P.09 pp. 11–13 includes plan dispatch and customer acknowledgment; p. 13 references 3 working days pre-audit. Verify the true sent_at, acknowledged_at, actor and exception evidence, not just plan text. **Status: OPEN**.

**A06 — P1 / My Work scale.** Newly added `/my-work?page=...` guarantees scoped result totals but currently fetches all candidate work rows in 250-row batches before resource-ACL filtering, search and pagination. It is correct on tested 1050-row mocks, not optimized for large SQL and may be memory/latency expensive. Need a measured SQL workload and authorized DB filter/index strategy, without moving ACL to UI. **Status: OPEN**.

**A07 — P1 / global search.** `DashboardShell.tsx` search is explicitly scoped to recent work/case data, not server-wide. My Work server search is implemented but customers/certification cases/certificates are not yet joined in an authorized global-search API. **Status: OPEN**.

**A08 — P1 / UI flaky.** F.04 desktop initially fails at editor mount (15s) in old SHA; source fix adds visible lazy fallback, but must verify focused and full browser at new SHA and investigate on repeat if still flaky. **Status: FIX IMPLEMENTED, ACCEPTANCE PENDING**.

**A09 — P1 / performance operations.** `scripts/production/performance-smoke.cjs` defaults only to `/health/live,/health`; an informational health PASS cannot prove multi-user P.09 API latency, queue throughput, backup recovery or search/page p95. Production checklist remains uncompleted. **Status: OPEN**.

## Execution gates to close P.09 Stage 1

1. **G1**: verify exact backend/frontend branch SHA and stage SQL identity, isolated safe DB/storage and test actor accounts; non-destructive readback; do not re-run Gate A.
2. **G2**: execute mandatory UAT-01..16, in sequence where dependencies matter, using *actual* API/UI and persisted UAT SQL records, authorizations and negative tests. Preserve official DEMO records.
3. **G3**: run isolated P.09 SQL E2E 2/2 and full browser roles at 1440x900, 1366x768, 390x844; retain redacted screenshots/logs and no real legal certificate claim.
4. **G4**: test 12-month surveillance, QMR exception, F.18 signed evidence, plan acknowledgment, F.08/F.16 record paths, suspension review deadlines, NC closure and recertification; assign a documented outcome for each.
5. **G5**: performance test work-items/global search with realistic 1k/10k/50k (isolated synthetic) data sets, compare p50/p95 + SQL plan + memory, fix measured bottlenecks.
6. **G6**: complete backup/storage isolated restore, monitoring, credentials/TLS/health checks, release manifest and approved rollback runbook.

**Exit rule:** no claim of “P.09 complete” or “staging PASS” until all mandatory UAT evidence exists; no release if S1/S2 unresolved. P.10/P.11/P.13 and digital signing remain deferred by owner.
