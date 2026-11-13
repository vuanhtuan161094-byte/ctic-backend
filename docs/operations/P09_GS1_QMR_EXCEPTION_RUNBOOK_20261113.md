# CMP P.09 — GS1 QMR exception (12-month rule): implementation and safe acceptance

**Checkpoint:** 2026-11-13. **Source-level implemented, SQL staging NOT RUN, production NOT ACCEPTED.**

## Authority model and deliberate limits

The first surveillance audit (GS1) must begin no later than 12 calendar months from the latest issued, approved `GRANT` or `RECERTIFY` decision. A missed deadline is a controlled **exception**, not a new default cycle. The authority source is the server's certificate decision date/UUID — never the frontend's claim, a task label or a boolean `qmr_approved` in flexible `form_data`.

For current P.09 code, QMR must simultaneously be:
1. explicitly nominated by the organization's operator via **`P09_QMR_APPROVER_IDS`**, a comma-separated allowlist of canonical UUIDs; and
2. an active user with the existing `ADMIN` role (the role guard also applies at decision time).

**Fail-closed default:** no configured ID means no QMR approvals can be requested or issued. This is an interim role mapping using the existing role model; production rollout needs business owner sign-off on QMR authority and separation of responsibilities. Never assign ADMIN for convenience without an access review. No credentials, user IDs, or production details belong in this source file.

## Operational workflow

1. Authorized ADMIN/COORDINATOR creates the P.09 program with an existing GS1 event. If a first-surveillance date is late, leave it *unscheduled* until approval is obtained; inserting a late date before approval is correctly rejected.
2. In **Chương trình đánh giá → Ngoại lệ QMR**, enter the exact proposed GS1 start date, a 20–2000-character reason/mitigation, and choose the active, designated QMR. A requester cannot designate themselves.
3. Backend POST `/audit-programs/:programId/events/:eventId/gs1-exception/request` validates project/event/last certification decision, strictly late proposed date, QMR identity, requester/approver separation, then persists a `workflow_approvals` row with `entity_type=P09_GS1_EXCEPTION`, unique per-event increasing `step_no`, `status=pending`, evidence snapshot JSON, and a corresponding `audit_logs` entry. A serializable transaction and event row lock prevent duplicate concurrent pending requests.
4. Only the nominated QMR with active ADMIN may POST `/audit-programs/:programId/events/:eventId/gs1-exception/decide` with `approved` or `rejected` and a substantive review comment. Backend re-reads the current certification decision. If the decision UUID/date changed, the request cannot be approved. An audit log is written with actor and outcome.
5. Both the F.03 program update and direct F.05 audit-plan create/update check the **latest** decision from `workflow_approvals` for this exact event. Only a latest `approved` record with matching project, program, granted decision UUID/date and approved proposed date is recognized; new pending/rejected requests supersede older approvals.
6. After approval, the operator must explicitly apply the approved GS1 date to the event. The UI preserves that exact day when later editing the monthly program forecast. Existing F.05 plans must be checked/adjusted independently — the backend does not silently edit them.
7. The GET `/audit-programs/:programId/events/:eventId/gs1-exception` returns the latest status and evidence to authorized internal users. GET `/audit-programs/gs1-exception/approvers` returns only active ADMIN users on the designated allowlist.

**Not an authorized bypass:** editing flexible `form_data`, changing a plan's `audit_type` away from GS1, claiming reviewer approval in request payload, stale approvals after a new decision, or changing the approved date.

## Security and audit acceptance on isolated SQL staging

Before enabling this feature, verify the database identity is **`CTIC_Certification_P09_test`** and has no connection to production `CTIC_Certification` or locked `CTIC_CMP_DEMO_2026`. Never rerun Gate A, restart SQL Server or change Windows ACL/network just to execute QA.

1. Configure two separate fictional accounts: COORDINATOR requester and an independent, explicitly allowlisted ADMIN/QMR. Test wrong ADMIN, unrelated AUDITOR, CUSTOMER, inactive or disabled reviewer, and requester=self.
2. Test GS1 +12-month anniversary allowed without exception, +1 calendar day refused; 29-Feb anniversary is clamped to 28-Feb as appropriate.
3. Test request/approval; read back `workflow_approvals` and `audit_logs` actor, date, `entity_id`, `step_no`, decision UUID, reviewer comment; verify HTTP denies unauthorized actors. Do not export unredacted reason, email or account IDs to public GitHub artifacts.
4. Test both F.03 GS1 event update and direct F.05 creation/update on the exact QMR-approved date. Try another date, a changed grant decision, a newer pending/rejected request, an incorrectly retyped GS1 plan, and two concurrent requests.
5. Repeat end-to-end SQL staging run **2/2**, with real saved records and screenshots in 1440×900, 1366×768, 390×844. Attach evidence to the private UAT manifest and validate with `node scripts/uat/p09-evidence-gate.cjs PRIVATE_MANIFEST.json`.

**Remaining deployment controls:** confirm named QMR authority model in the organization's P.09; production migration/configuration approval (none executed here); actual SQL staging E2E, RBAC and negative tests beyond Jest mocks; error monitoring, audit log retention and rollback procedures. Do not label this rollout FULL PASS from fixture-based CI alone.

Owner-scope exclusions remain P.10, P.11, P.13 and digital signature.
