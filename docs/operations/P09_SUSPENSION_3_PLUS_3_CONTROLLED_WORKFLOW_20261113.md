# P.09 — 3+3 month suspension: controlled decision workflow

**As implemented 13/11/2026 | source QA only, isolated SQL staging NOT RUN.**

## Authority and procedural basis

Owner-supplied **P.09 Management System Certification Procedure, v1.3, effective 11/11/2025, §4.6.4 (pp.23–24)** requires:
- An F.13 status decision to suspend for up to 3 calendar months to obtain suitable corrective actions.
- A further **one** three-month suspension interval if suitable corrective action has not been received.
- If unresolved after the additional period, withdraw or reduce scope by approved certification procedure. No timer may impersonate an authorized issuer.
- Suspending and withdrawing are reviewed on F.11 and reflected in public certificate status. Once a justified correction is accepted, a separate F.13 decision may restore before the six-month limit.

**Distinction:** A suspension *review approval* is an internal signed-off recommendation/extension. **It never changes a certificate status**. The existing F.13 decision and applicable certification issuance routes remain the only legal transition authority.

## Existing foundation retained

- `src/certificates/suspension-review.ts`: calendar-month due-date projection at +3 and +6 months, end-of-month clamping.
- `certification_decisions.create`: requires completed F.11, independent decision-maker, compatible decision type and source certificate status.
- `certificate_status_histories`: immutable link to F.13 decision, previous/current status, effective date, actor.
- Direct `PATCH /certificates/:id/status`: remains restricted to `expired` only; cannot suspend/restore/withdraw.
- Earlier F.04, F.11, F.13, F.14, public QR lineage and historical version semantics remain unchanged.

## Implemented API and roles

| HTTP endpoint | Required role / permission | Semantics |
| --- | --- | --- |
| `GET /certificates/:id/suspension-case` | ADMIN, STAFF, COORDINATOR, DECISION_MAKER / certificates.read | Read-only active case, official F.13 suspension date and 3/6 month deadlines, pending/approved review and extension |
| `GET /certificates/suspension-review/reviewers` | same roles / certificates.read | Active users with DECISION_MAKER role, no accounts invented |
| `POST /certificates/:id/suspension-case/request` | ADMIN or COORDINATOR / audit_programs.manage | Request `EXTEND_3_MONTHS`, `RECOMMEND_RESTORE`, `RECOMMEND_WITHDRAW`, or `RECOMMEND_REDUCE_SCOPE`; bind existing completed F.11, reason, corrective evidence, named independent maker |
| `POST /certificates/:id/suspension-case/:action/decide` | DECISION_MAKER / certification_decisions.issue | Independent approval or rejection with a substantive written reason; never changes `certificates.status` |
| Existing F.13 `POST /certification-decisions` | DECISION_MAKER + preexisting action-authorization | For suspended RESTORE/WITHDRAW, require latest approved matching P.09 review, same suspension history, certificate series, project and **exact same F.11**; RESTORE after six months rejected |
| Existing F.13 + issuance for REDUCE_SCOPE | Current F.13/issuance authority | **Only** an independently reviewed REDUCE_SCOPE from suspended may replace that version, preserving old version, certificate ID lineage, QR history and snapshot |

No schema migration: records stored via existing `workflow_approvals` with `entity_type=P09_SUSPENSION_EXTENSION` or `P09_SUSPENSION_REVIEW`, immutable increasing per-event step number; details in structured JSON inside `comment`, action/audit actor in `audit_logs`. Both request and decision are serializable transactions locking the current certificate row. Unauthorized/self F.11 review, inactive decision maker, contradictory status, second approved extension, requests after six months and changed suspension history fail closed.

The frontend in `CertificateSuspensionCasePanel.tsx` is rendered only on a real, suspended certificate (not 10-year fixture preview). The panel provides exact dates, F.11 reference input, corrective evidence and role-limited decision actions, and a visible link back to the canonical case F.11/F.13. It never offers direct certificate status writes.

## SQL staging UAT — NOT RUN

**Dedicated database only:** `CTIC_Certification_P09_test` on user-authorized isolated staging. Do not touch `CTIC_Certification`, `CTIC_CMP_DEMO_2026`, Gate A or other existing records. No SQL migration, credential change, service restart or elevated environment was executed through GitHub.

Create fictional profiles in isolated SQL staging:
- CUSTOMER submits correction evidence and cannot read internal review/decision endpoints.
- COORDINATOR files suspension case with eligible independent DECISION_MAKER, not self.
- Completed F.11 reviewer differs from requestor/decision actor; independent decision actor is **not** a member of the referenced F.04 audit team.
- Test active DECISION_MAKER and then remove role / deactivate before review; previous request cannot self-approve or silently complete.
- Test suspension F.13 `active → suspended`; verify initial 3mo due, 6mo ceiling, January31→April30/July31 and leap-year.
- Test missing F.13 suspension status history: reject case creation; no guessed time source.
- Test request + approval of **one** extension; reject second even if a newer denied request supersedes latest row. Verify subsequent GET still shows approved extension for same suspension history.
- Test correction accepted before 6mo → F.11 → P.09 recommendation approved → F.13 RESTORE `suspended → active` and exact version preserved.
- Test no correction by end of second interval: both RESTORE and any second EXTEND rejected; approved F.11 review → independent F.13 WITHDRAW `suspended → withdrawn`, or REDUCE_SCOPE → controlled replacement version.
- Test a forged F.11 ID, another customer/certificate/series, a prior suspension, wrong review action, pending/rejected recommendation, concurrent duplicate reviews, F.13 attempt without approved review, malicious direct status API, and 403 for unauthorized roles.
- For each approved business action, inspect `workflow_approvals`, `audit_logs`, `certification_decisions`, `certificate_status_histories`, version lineage, and public verification response. Verify no unauthorized auto-status or PDF rewrite.
- Repeat isolated SQL UAT at exact final SHA **2/2**; preserve screenshots/logs in protected private staging evidence, not public git.

**Current evidence:** Backend code/tests in `src/certificates/p09-suspension-case.spec.ts`, `src/certification-decisions/certification-decisions-status-lifecycle.spec.ts`, and `src/certificates/certificates-versioning.spec.ts`; frontend source/build/unit and dedicated `e2e/specs/certificate-suspension-case-layout.spec.mjs` under CI. A passing Jest/Playwright fixture is NOT real database acceptance. Do not label P.09 FULL PASS, accreditation approval or production ready without physical SQL/actor UAT and infrastructure recovery tests.

## Remaining external acceptance

1. Independent operator confirmation that mapping an existing DECISION_MAKER to the P.09 suspension-review authority is appropriate.
2. Complete real F.11 narrative fields/CAP linkage and actual signed/approved supporting documents as applicable; a string reference alone is not the underlying record attestation.
3. Exact-SHA full Playwright, isolated SQL 2/2, role-negative checks, p95 workload, backup/restore and release owner sign-off. F.08/F.16/F.18 remain separate P.09 work packages.
4. P.10, P.11, P.13 and digital signature remain deferred by owner.
