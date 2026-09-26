# CMP — Current Checkpoint and Next Phase Plan

Updated: 2026-09-26

This file is the current source-of-truth for continuing the CMP project. Read it before changing scope.

## Current checkpoint — taxonomy and governed competency workflow

This checkpoint supersedes the historical Git/verification baselines below for the authorized Phase A/B work. It is not a main-branch merge or production rollout approval.

- Backend implementation checkpoint: `e121d5ecaf39762e4d74c1e62f3ba9b663c20755` (DB compatibility fix); preceding Phase A/B HEAD: `96af569511cd899d5a4e31519f2d1d07ca9651f2`.
- Frontend unchanged HEAD: `0e3ca7adbdbb54c91fdf5d8d75fca525a796860b`.
- Phase A: canonical one-query taxonomy lookup and unified ISIC -> NACE -> IAF workspace. Taxonomy live sanity and one-query service probe PASS. Retained earlier measurements: 6 logical results, browser ~380.9 ms and service ~247.0 ms (single samples, not a benchmark rerun).
- Phase B: expert/admin competency entry; DRAFT -> PENDING_APPROVAL; RETURNED -> edit/resubmit; independent APPROVE -> APPROVED. Self ownership is enforced through `experts.user_id`; the latest submitter cannot self-approve. Evidence prerequisites remain enforced. Recommendation/assignment retain APPROVED-only competency authority.
- DB compatibility fix: `20260925150000_competency_workflow_audit_actions`; local `CTIC_Certification`, 33/33 applied; database contract PASS (94 models/tables, native types/nullability and critical indexes).
- `CK_expert_competency_action_type` preserves the 10 legacy values BASELINE, CREATE, UPDATE_DRAFT, APPROVE, SUSPEND, REACTIVATE, RENEW, REVIEW_RECORDED, EVIDENCE_ADDED, EVIDENCE_VOIDED and adds UPDATE, SUBMIT, RETURN (13 total). No other schema or production-code changes in this fix.
- Exact migration disk/index SHA-256 matches `_prisma_migrations.checksum`: `0c6085b58b243413d75d806f1c706840fb7a196194f6c2613a4b54f15e177234`. The already-applied migration is byte-locked. Pre/post-migration data fingerprints matched; subsequent UAT transitions and audit records are retained.
- Whitespace gate: EXPECTED EXCEPTION — one pre-existing trailing-whitespace issue in already-applied migration; no other diff-check issues. Exact Git diagnostic: `migration.sql:43: new blank line at EOF.` Explicit user authorization accepts this exception; do not edit the applied migration to remove it.

Live UAT results (real local SQL/runtime, not mocked):

- UAT-02 PASS: submit to PENDING_APPROVAL with SUBMIT actor audit.
- UAT-03 PASS: latest submitter self-approval rejected, no APPROVE audit/state change.
- UAT-04 PASS: independent admin RETURN requires reason; RETURNED and reason/audit verified.
- UAT-05 PASS: edit RETURNED and resubmit; latest submit actor verified.
- UAT-06 PASS: independent admin APPROVE with evidence prerequisite and approval metadata/audit.
- UAT-07 PASS: self create/edit/evidence/submit, foreign-owner list/read/edit/evidence/submit isolation; expert approve/return/suspend/renew return 403 and denied writes leave foreign records unchanged.
- UAT-08 BLOCKED BY TEST DATA / PRECONDITION: no valid local audit plan/project; constructing one requires an unrelated application approval/contract/project workflow. This is a live recommendation coverage gap, not evidence of a production recommendation defect. Automated recommendation/status-filtering regression PASS. Do not bypass business workflow or call recommendation live UAT PASS.
- UAT-09 PASS: APPROVED -> SUSPENDED -> APPROVED with a real local UAT review prerequisite and actor audit.

Verification:

- Backend targeted: 40/40 PASS (4 suites), rerun 2026-09-26.
- Backend full: 762/762 PASS (89 suites), rerun 2026-09-26 after the test-file whitespace cleanup.
- Frontend: previous task's verified 475/475 PASS retained; no new frontend test run or source change in this checkpoint.
- Local UAT records/audit and unrelated untracked artifacts preserved. Credentials and DB/runtime artifacts are not committed.

TECHNICAL IMPLEMENTATION: PASS. LIVE COMPETENCY WORKFLOW: PASS; UAT-08 recommendation live coverage remains pending. READY FOR MERGE: NO — pending UAT-08 live verification. No main merge, new feature, or further schema work is authorized by this checkpoint.

## 1. Product and repository scope

CMP is a commercial-neutral Certification Management Platform for certification bodies.

Architecture:

- Backend: NestJS + TypeScript + Prisma 7.8 + SQL Server
- Frontend: React 19 + Vite 8 + Ant Design 6 + TanStack Query
- Deployment model: one installation = one certification body, with its own database/storage/branding
- DEV database: `CTIC_Certification`
- Canonical database migration count: **33/33** (migration 33 explicitly authorized and applied)
- **No migration 34** unless explicitly approved

Repositories:

- Backend: `vuanhtuan161094-byte/ctic-backend`
- Frontend: `vuanhtuan161094-byte/ctic-frontend`
- Active branch in both repos: `feature/ux-fix-batch01`
- `main` remains stable and must not be merged yet

White-label rule:

- no hardcoded CTIC branding;
- no CTIC-only business wording;
- organization branding stays runtime/configuration driven.

## 2. Git discipline

Do not:

- force-push;
- rebase shared history;
- amend published checkpoints;
- use `git clean` on user worktrees;
- use `git add .` when unrelated user artifacts exist;
- delete untracked reports/logs/UAT evidence/backups.

Distinguish:

- production code canonical;
- documentation/checkpoint HEAD;
- temporary verification commits.

## 3. Locked roadmap state

PASS / LOCKED or CLOSED / LOCKED:

- Step 17.1 — Certification Case UX V2
- Step 17.2
- Step 17.3 — Audit Workspace V2
- Step 17.4 — CAP Workspace V2 / nested route migration
- Step 17.5–17.7
- Step 18A — Technical Stabilization
- CFG-1A — Numbering Runtime Authority
- CFG-1B — Taxonomy Runtime Authority
- CFG-1C — Import Integrity & Operational Lifecycle
- CFG-1D — Organization Runtime Wiring
- UX-I0 — Dependency / compatibility audit
- UX-I1 — Playwright + axe browser QA foundation
- UX-I2 — CMP Design Language / Governed Tokens
- UX-I3 — Storybook Foundation
- UX-V1 Fix 1 — Mobile ISO standard edition clipping

UX-V1 strategy: **CURRENT UI + SURGICAL POLISH**.

Not started:

- Fix 2

- UX-I4 — canonical reusable components
- UX-I5 — ProComponents pilot/re-audit
- UX-I6 — visual baseline package
- CFG-2 — Configuration UX redesign
- CFG-3 — deferred unless explicitly approved
- Step18B

## 4. Historical checkpoints before the current Phase A/B checkpoint

Backend production code canonical:

`4714576475f6939d62093068e6321e4c61ec81eb`

Frontend accepted checkpoint after UX-V1 Fix 1:

`bb67e7a45fee088025c5428ae23225d185349e48`

Fix 1 implementation: `80d33ae8511f7784db30ffb0d4ca0310b603f8bb`; browser regression guard: `bb67e7a45fee088025c5428ae23225d185349e48`.

Previous frontend production canonical after UX-I3 acceptance:

`dac0bc3e6d50a36dee7fa3fa34dae6d3085c50b1`

Previous frontend UX-I2 canonical:

`24039ac5f7dd0c3aa67e73bbc72c0e12c87de6db`

Historical frontend documentation HEAD after UX-I3 lock + visual-direction setup:

`33c2c4ec47141e0eb6bbc0b58ede841d022c7065`

The Phase A/B implementation and DB compatibility fix in the current checkpoint above supersede this historical baseline; they are not documentation-only changes.

## 5. Verification baseline

Historical locked baseline before UX-I3:

- Backend full Jest: **722/722 PASS**
- Frontend full tests: **470/470 PASS**
- Backend build: PASS
- Frontend build/typecheck/lint: PASS
- SQL numbering/master configuration: PASS
- SQL mapping import + Application Review: PASS
- Physical DB contract: 94 models/tables, 32/32 migrations, expected indexes/FKs PASS
- canonical backend regression: **64/70** with exactly six known historical failure signatures and zero new signatures

Do not spend unrelated UX work fixing those six historical regression assertions unless a new change genuinely alters their signatures.

## 6. UX-I0 — Dependency compatibility — PASS / LOCKED

Approved/used:

- Playwright `1.63.0`
- `@axe-core/playwright@4.13.0`
- Storybook React/Vite `10.6.0` family for UX-I3

Not required:

- `antd-style`; UX-I2 deliberately avoided it

ProComponents:

- stable `@ant-design/pro-components@2.8.10` is NO-GO with AntD6
- any ProComponents 3.x use requires a future explicit UX-I5 re-audit and pilot

Canonical document:

- frontend `docs/ux/UX-I0_DEPENDENCY_COMPATIBILITY.md`

## 7. UX-I1 — Browser QA — PASS / LOCKED

Browser QA remains isolated under frontend `e2e/`.

Required viewports:

- desktop `1440×900`
- mobile `390×844`

Checks include:

- console/page errors;
- failed requests / HTTP 5xx;
- horizontal overflow;
- deterministic screenshots/evidence;
- axe WCAG A/AA serious/critical findings;
- dialogs/forms/accessibility labels on covered surfaces.

UX-I1 production closure canonical:

`9b50401661844188e3ea8c796c5bd680038af38c`

Locked verification evidence:

- Frontend Quality `35018522587`: PASS
- Browser Quality `35018522697`: PASS
- artifact `10416588179`
- digest `sha256:34073899dff69b19ee2a580ee0f5505ffca1d2b5c8f3dea73679bf3b7df92d30`

No axe rule or console warning was suppressed to achieve closure.

Canonical document:

- frontend `docs/ux/UX-I1_BROWSER_BASELINE.md`

## 8. UX-I2 — Design Language / Governed Tokens — PASS / LOCKED

Accepted code canonical at that phase:

`24039ac5f7dd0c3aa67e73bbc72c0e12c87de6db`

Core decisions:

- Ant Design 6 remains the sole UI foundation.
- `app/components/design-system/theme.ts` is the typed AntD theme bridge.
- `app/components/design-system/tokens.css` is the governed token contract.
- `runtime-overrides.css` contains governed runtime overrides.
- `UiRuntime.tsx` consumes `createCmpAntdTheme(...)`.
- new shared UI uses `--cmp-*` tokens; legacy `--ctic-*` aliases remain compatibility-only.
- density/control-height references are opt-in, not globally applied.

Evidence:

- Frontend Quality `35020032804`: PASS
- Browser Quality `35020032766`: PASS
- artifact `10417486176`
- digest `sha256:988160936ebf99f349900e655b73f686ace7a3bec11eba45bba353823a1e1b50`

Canonical document:

- frontend `docs/ux/UX-I2_DESIGN_LANGUAGE.md`

## 9. UX-I3 — Storybook Foundation — PASS / LOCKED

Product Owner accepted UX-I3 on 2026-09-17 using deterministic local gates because GitHub Actions are unavailable for this project due account billing/spending-limit restrictions and will not be funded.

Accepted frontend production canonical at UX-I3 closure:

`dac0bc3e6d50a36dee7fa3fa34dae6d3085c50b1`

Pinned Storybook dev tooling:

- `storybook@10.6.0`
- `@storybook/react-vite@10.6.0`
- `@storybook/addon-a11y@10.6.0`

Host stack remains:

- React / React DOM `19.2.6`
- Ant Design `6.5.3`
- Vite `8.3.0`
- `@vitejs/plugin-react@6.0.2`

Final architecture:

- isolated `.storybook/vite.config.ts` supplies React/Vite integration without loading installation-specific env values;
- `.storybook/main.ts` points Storybook builder to that config;
- `.storybook/preview.tsx` reuses existing UiRuntime/theme/tokens;
- 29 stories cover foundations and representative shared components;
- 58 desktop/mobile Storybook cases are browser tested;
- Storybook does not create a second component or theme system.

Runtime blocker closure:

- original raw React default-export error was caused by missing compatible React/Vite integration in Storybook runtime;
- isolated Vite config fixed it;
- no manual React `optimizeDeps.include`, alias, shim, vendor patch or version downgrade was required.

Accessibility closure:

- inactive status foreground changed from `#737b87` to `var(--cmp-neutral-700)` = `#5f6b7a`;
- measured contrast on inactive background `#f0f1f2`: **4.79:1**;
- no axe suppression;
- only production visual impact is slightly darker inactive text.

Browser determinism closure:

- local multi-worker execution caused dev-server/module-transform contention;
- four bounded one-worker diagnostics passed 10/10;
- normal browser harness is now deterministic with `workers: 1`;
- assertion timeouts, axe rules, coverage and viewports were not weakened.

Final clean local gates for `dac0bc3...`:

- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm run typecheck:all`: PASS
- `npm run typecheck:storybook`: PASS
- lint zero warnings: PASS
- production build + frontend tests: **470/470 PASS**
- `npm run build-storybook`: PASS
- Storybook browser catalog: **58/58 PASS**
- Storybook addon a11y: PASS
- Browser Quality: **10/10 PASS**
- covered production axe/runtime/network/overflow checks: PASS
- dependency drift: none

GitHub Actions note:

- Frontend Quality run `35170575862` and Browser Quality run `35170575850` failed before execution with zero steps/no runner due account billing/spending-limit restriction.
- These are infrastructure-unavailable results, not product failures.
- Per Product Owner decision, GitHub Actions are no longer a mandatory gate for this project and should not be repeatedly retriggered merely for unavailable cloud evidence.
- Mandatory frontend verification going forward is clean deterministic local verification; cloud CI is supplementary when available without spending.

Canonical document:

- frontend `docs/ux/UX-I3_STORYBOOK_FOUNDATION.md`

## 10. UX-V1 — CURRENT UI + SURGICAL POLISH

The full Configuration-screen redesign has been rejected. The **current production UI is the canonical visual baseline**. Prior redesign mockups and the earlier split-workspace proposal are not canonical targets. No system-wide redesign or automatic transition to UX-I4 / CFG-2 is authorized.

Every future polish must be small, explicitly scoped, evidence-driven and browser-verified on desktop and mobile. Require before/after or clear browser evidence. Preserve existing business structure, authority, capabilities, workflows, semantic status/readiness and white-label branding; do not expand a fix opportunistically.

### Fix 1 — Mobile ISO standard edition clipping — PASS / LOCKED

- Implementation: `80d33ae8511f7784db30ffb0d4ca0310b603f8bb`.
- Browser guard / accepted checkpoint: `bb67e7a45fee088025c5428ae23225d185349e48`.
- Desktop `1440x900`: **PASS**.
- Mobile `390x844`: **PASS**.
- Browser gate: **4/4 PASS**.
- Mobile visual review: **PASS**.
- Confirmed fully visible: `2015`, `ISO 9001:2015`, badge `Đang áp dụng`, and `Áp dụng từ 15/09/2015`; the overflow (`...`) button does not overlap content.

These are the accepted results supplied for the documentation checkpoint, not newly executed tests.

UX-I3 remains **PASS / LOCKED**. Fix 2: **NOT STARTED**. UX-I4: **NOT STARTED**. CFG-2, CFG-3 and Step18B remain unstarted. No backend production code or DB/migration changes are included.

Canonical direction document:

- frontend `docs/ux/UX-V1_CONFIGURATION_VISUAL_DIRECTION.md`

## 11. Locked configuration behavior

### CFG-1A — Numbering

- backend owns runtime numbering authority;
- configurable runtime types are governed by backend capability metadata;
- application/certificate authorities remain separate where designed;
- no client-provided runtime sequence namespace;
- existing identifiers are never rewritten;
- organization timezone governs future numbering business-year resolution with safe fallback.

### CFG-1B — Taxonomy

- backend taxonomy runtime policy is authoritative for ISIC/NACE/IAF resolution/readiness;
- frontend must not reimplement NACE→IAF derivation;
- operational revisions remain centrally governed.

### CFG-1C — Import lifecycle

Canonical mapping lifecycle:

`CSV → validate → row review → commit DRAFT mappings → review → publish import job → operational`

Rules:

- draft mappings are not operational;
- publish is atomic;
- any invalid row blocks the publication batch;
- preview/commit/publish share backend validation policy;
- reference drift is revalidated at commit/publish;
- row-level evidence stays visible;
- do not emulate publication with row-by-row public HTTP calls.

### CFG-1D — Organization runtime

- readiness is field-level, not `Boolean(profile)`;
- timezone is an applied runtime setting for governed behavior;
- customer-facing branding exposes only safe display fields;
- `logo_reference`, `document_footer`, locale/date-format/language compatibility metadata and retention metadata must not be presented as fully implemented runtime engines;
- no arbitrary filesystem logo path is a public browser asset URL;
- no retention engine or broad i18n engine exists yet.

## 12. Canonical routes and product wording

Internal routes include:

- `/certifications/:caseId`
- `/certifications/:caseId/audits/:auditId`
- `/certifications/:caseId/findings/:findingId`
- `/certifications/:caseId/technical-review`
- `/certifications/:caseId/decision`
- `/certifications/:caseId/certificates/:certificateId`

Customer-safe CAP:

- `/portal/corrective-actions/:findingId`

Enterprise wording:

- avoid consumer/chatbot wording;
- avoid unnecessary repeated “của tôi”;
- do not expose internal form codes such as `P.09` as product terminology;
- prefer `quy trình chứng nhận`, `vòng đời chứng nhận`, `hồ sơ chứng nhận` or organization-configured terminology.

## 13. Immediate next action

Current action:

**STOP — competency DB compatibility checkpoint complete; UAT-08 live recommendation verification remains pending. READY FOR MERGE: NO. Await separate authorization.**

UX-V1 follows CURRENT UI + SURGICAL POLISH. Do not start Fix 2, UX-I4, CFG-2, CFG-3 or Step18B. The rejected redesign proposal is not an implementation target.
