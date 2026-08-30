# CMP 1.0 — MASTER FULL-SYSTEM UAT PLAN

**Status:** FEATURE FREEZE
**Database:** TEST/UAT only
**Rule:** UAT may create/delete test fixtures, but must never run destructive test tooling against DEV/production.

## Acceptance rule

A scenario is **PASS** only when the user can complete the business action through the intended UI/API, the resulting status/history is correct, and unauthorized roles cannot bypass the workflow. Cosmetic preferences are not release blockers unless they prevent or materially confuse the operation.

## Pre-gate

Run from `ctic-backend`:

```powershell
$env:P09_CREATE_LOCAL_TEST_DATABASE="I_UNDERSTAND_THIS_IS_A_LOCAL_TEST_DATABASE"
npm run uat:master
```

Automated gate must finish with `MASTER UAT AUTOMATED GATE: PASS` before manual UAT is signed off.

---

## UAT-01 — Administration and master configuration

**Role:** ADMIN

1. Login.
2. Open System Administration.
3. Verify users/access overview, audit logs, configuration, notifications/SLA, Import Center and health.
4. Open Master Data and verify active scheme + standard edition + IAF/NACE data.
5. Confirm Product Certification and Validation/Verification remain disabled/out of scope.

**PASS:** no secret/connection string/path leakage; customer/technical-only account cannot open System Administration; master edit does not rewrite historical certificate/document snapshots.

## UAT-02 — Customer onboarding and Portal access

**Roles:** ADMIN/COORDINATOR + CUSTOMER

1. Create or select a test customer.
2. Complete approved Customer Portal access workflow.
3. Login as CUSTOMER.
4. Verify only customer-safe menu/data are visible.
5. Attempt cross-customer URL/UUID access.

**PASS:** active mapping required; cross-customer access is blocked; customer cannot see reviewer, decision, F.04 internal assignment, commercial-internal, admin or audit-log data.

## UAT-03 — Application → Application Review → project creation

**Roles:** CUSTOMER → COORDINATOR/Application Reviewer

1. Customer creates/submits certification application.
2. Upload application evidence/document.
3. Internal user requests missing evidence; customer responds.
4. Review application/CB capability.
5. Confirm standard/scope/site/IAF-NACE and approved mandays.
6. Complete project creation.

**PASS:** draft/submit transitions correct; review is not self-approved by customer; approved technical mandays become technical authority; project carries correct historical/config snapshot.

## UAT-04 — Commercial separation

**Roles:** SALES/ADMIN/COORDINATOR as allowed

1. Create quotation linked to the approved customer/project.
2. Approve/send/accept quotation.
3. Link commercial contract.
4. Create billing milestone and payment metadata.

**PASS:** Decimal/currency correct; quote final is immutable except controlled revision; commercial API cannot change approved technical mandays; unpaid/payment state does not directly suspend/withdraw/refuse certificate.

## UAT-05 — PLAN / F.04 / resource readiness

**Roles:** COORDINATOR + experts

1. Create/select Stage 1/Stage 2 PLAN.
2. Assign a multi-program team if applicable.
3. Verify readiness coverage matrix and manday projection.
4. Test one invalid expert: expired competency / unavailable / OTHER_COMMITMENT / PROHIBITED independence.
5. Correct assignment and issue F.04/PLAN.

**PASS:** draft may show missing readiness according to existing rule; ISSUE hard-blocks real gaps; collective team competence works; Technical Reviewer is not counted as F.04 member; Stage 1 remote soft-warning rule remains unchanged.

## UAT-06 — Audit execution → report → NC/CAP

**Roles:** AUDITOR/LEAD AUDITOR + CUSTOMER

1. Open issued audit plan.
2. Complete audit execution/checklist as applicable.
3. Create findings including at least one NC.
4. Issue/report audit result.
5. Customer opens NC/CAP portal, submits correction/root cause/corrective action/evidence.
6. Auditor reviews/revisions/accepts CAP.

**PASS:** customer sees only own NC/CAP; report date/defaults and CAP due dates follow locked rule; finding deep-link opens exact NC; completed history remains traceable.

## UAT-07 — Technical Review → Decision F.13 → Notification F.12

**Roles:** COORDINATOR → TECHNICAL REVIEWER → DECISION MAKER

1. Assign Technical Reviewer separately from F.04.
2. Complete Technical Review.
3. Decision Maker issues F.13 decision.
4. Send F.12 result notification.

**PASS:** reviewer cannot self-claim if prohibited; decision SoD holds; F.12 cannot precede F.13; REFUSE result behavior is correct; customer receives only customer-safe result.

## UAT-08 — Certificate lifecycle and public verification

**Role:** DECISION MAKER / CUSTOMER / public

1. For GRANT/RECERTIFY/AMEND as appropriate, issue exact certificate version.
2. Open official PDF and public QR/verification.
3. Test MAINTAIN without new version.
4. Verify SUSPEND/RESTORE/WITHDRAW behavior without accidental new version.
5. Open historical certificate version.

**PASS:** exact-version lineage preserved; historical version read-only; public verification resolves exact version/status; official PDF cannot be silently overwritten.

## UAT-09 — Surveillance / recertification cycle

**Role:** COORDINATOR

1. Open an active certificate/project cycle.
2. Create/inspect surveillance cycle and information snapshot.
3. Verify surveillance mandays/schedule and readiness.
4. Complete MAINTAIN path.
5. Create recertification path and verify new certificate version only on RECERTIFY.

**PASS:** historical application/project data are not rewritten; surveillance/recertification rules and mandays remain consistent.

## UAT-10 — Change request → Special Audit

**Roles:** CUSTOMER → COORDINATOR

1. Customer submits organization/certification-relevant change.
2. Internal user performs impact assessment.
3. Set outcome requiring Special Audit.
4. Link an existing PLAN and complete special-audit follow-up.

**PASS:** raw request does not directly mutate certificate authority; special audit reuses Phase 4 assignment/readiness; resulting certificate action uses Phase 1 lifecycle.

## UAT-11 — Complaint

**Roles:** CUSTOMER/COORDINATOR/INVESTIGATOR/DECISION OWNER

1. Submit complaint and evidence.
2. Assign owner/investigator/independent decision owner.
3. Acknowledge/investigate/respond/close.
4. Attempt to edit after closure.

**PASS:** SoD enforced; internal notes hidden from customer; closed history immutable; Work Items do not duplicate.

## UAT-12 — Appeal

**Roles:** CUSTOMER/REVIEWER/independent DECISION OWNER

1. Appeal an exact certification decision.
2. Attempt to assign original decision maker as sole appeal authority.
3. Complete independent review/outcome.

**PASS:** self-review blocked; original decision remains immutable; successful appeal creates subsequent controlled action rather than overwriting original decision.

## UAT-13 — Expert governance

**Role:** ADMIN/COORDINATOR

1. Open expert profile.
2. Verify competency evidence/review/action history.
3. Verify training/witness/monitoring.
4. Verify availability/independence/resource overview.

**PASS:** expired/suspended competency is not assignable; monitoring does not auto-suspend competency; evidence/history remain traceable; sensitive conflict details are role-minimized.

## UAT-14 — Document Control

**Role:** ADMIN/internal authorized roles

1. Create/use controlled template revision.
2. Generate/create document instance.
3. Review/approve/attach official PDF/issue.
4. Create correction/new version.
5. Open old issued version.

**PASS:** effective template/issued document immutable; exact template revision retained; official PDF SHA-256 binds exact version; old version stays read-only.

## UAT-15 — Management cockpit and reporting

**Role:** ADMIN/management/commercial-authorized

1. Open cockpit.
2. Filter date range and scheme.
3. Inspect operations, commercial, resources and governance KPIs.
4. Export CSV.

**PASS:** mixed currencies are not summed; overdue agrees with Work Item authority; unauthorized technical/customer role cannot see sensitive financial data; export uses same filters/authorization.

## UAT-16 — Security / production smoke

1. Verify disabled user token is rejected.
2. Verify role removal takes effect on protected request.
3. Verify public `/health` is minimal.
4. Verify ADMIN detailed health contains no secret/path/connection string.
5. Verify secure file download ownership/integrity.
6. Verify backup/restore drill evidence remains available.

**PASS:** no security boundary is frontend-only; no production secret leaks; restored DB/storage can be inspected without touching source DB/storage.

---

# Exit criteria

Release candidate may be created only when:

- automated Master UAT gate PASS;
- all UAT-01…UAT-16 are PASS or formally accepted non-blocking observations;
- no open Severity 1 / Severity 2 defect;
- every bugfix has regression coverage where practical;
- P09 remains repeatable 2/2 after final bugfix;
- backup/restore drill remains PASS;
- no feature was added during freeze without reopening design review.
