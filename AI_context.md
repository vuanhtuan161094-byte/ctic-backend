# CMP — Current Checkpoint and Next Phase Plan

Updated: 2026-09-15

This file is the current handoff/source-of-truth for continuing the CMP project in a new chat. Read this file before proposing or changing scope.

## 1. Product and repository scope

CMP is a commercial-neutral Certification Management Platform for certification bodies. The product must remain white-label and must not hardcode CTIC branding or CTIC-only business wording.

Architecture:

- Backend: NestJS + TypeScript + Prisma 7.8 + SQL Server
- Frontend: React 19 + Vite 8 + Ant Design 6 + TanStack Query
- Deployment model: one installation = one certification body, with its own database/storage/branding
- DEV database: `CTIC_Certification`
- Canonical database migration count: **32/32**
- **No migration 33** in the current design

Repositories:

- Backend: `vuanhtuan161094-byte/ctic-backend`
- Frontend: `vuanhtuan161094-byte/ctic-frontend`
- Active feature branch in both repos: `feature/ux-fix-batch01`
- `main` remains stable and must not be merged yet

## 2. Locked roadmap state

Completed/locked before this checkpoint:

- Step 17.1 — Certification Case UX V2: PASS / LOCKED
- Step 17.2: PASS / LOCKED
- Step 17.3 — Audit Workspace V2: PASS / LOCKED
- Step 17.4 — CAP Workspace V2 / nested route migration: PASS / LOCKED
- Step 17.5–17.7: CLOSED / LOCKED
- Step 18A — Technical Stabilization: PASS / CLOSED / LOCKED
- UX Trial round 1 / real-user walkthrough: completed enough to expose structural problems in Configuration / NACE / IAF / mapping / import flows
- CFG-1A — Numbering Runtime Authority: PASS / LOCKED
- CFG-1B — Taxonomy Runtime Authority: PASS / LOCKED
- CFG-1C — Import Integrity & Operational Lifecycle: PASS / LOCKED
- CFG-1D — Organization Runtime Wiring: PASS / LOCKED

The current accepted code canonical checkpoints remain:

- Backend code canonical: `4714576475f6939d62093068e6321e4c61ec81eb`
- Frontend code canonical: `9d207c39236a052157fddc397b74f9243eff2426`

Important: documentation-only commits after these SHAs do not replace the code canonical unless explicitly declared. UX-I1 is currently a **candidate under review**, not a new accepted frontend canonical.

Current UX-I1 frontend code candidate:

- Tested UX-I1 code candidate: `0fb67d043a8e9d834a0d3403f2359d39e8e2b0c2`
- Frontend documentation commit after the tested code candidate: `c4a6dd219f92f9953dd532074edf2c90494023a8`

## 3. Current verification state

At CFG-1C/1D closure:

- Backend full Jest: **722/722 PASS**
- Frontend full tests: **470/470 PASS**
- Backend build: PASS
- Frontend typecheck: PASS
- Frontend lint `--max-warnings=0`: PASS
- Frontend production build: PASS
- SQL P09 numbering/master configuration: PASS
- SQL P09 import + Application Review: PASS
- Physical DB contract: 94 models/tables, 32/32 migrations, expected indexes/FKs PASS
- Canonical regression: **64/70**, with exactly the same six historical failure signatures; zero new failure signatures

Do not spend CFG-2 effort fixing those six unrelated legacy regression assertions unless a new change genuinely causes one of them to change.

### 3A. UX-I0 / UX-I1 checkpoint — READY FOR USER REVIEW

UX-I0 dependency/compatibility audit:

- status: **COMPLETE FOR REVIEW**;
- `@playwright/test@1.63.0`: GO for UX-I1;
- `@axe-core/playwright@4.13.0`: GO for UX-I1;
- `antd-style@4.1.0`: HOLD until UX-I2 is explicitly approved;
- Storybook `10.6.0` family: HOLD until UX-I3 is explicitly approved;
- stable `@ant-design/pro-components@2.8.10`: NO-GO with AntD 6;
- ProComponents 3.x prerelease remains only a future UX-I5 pilot candidate and must be re-audited before use.

Canonical audit document:

- frontend `docs/ux/UX-I0_DEPENDENCY_COMPATIBILITY.md`.

UX-I1 browser-QA foundation:

- status: **IMPLEMENTED / TECHNICALLY WORKING / NOT YET ACCEPTED OR LOCKED**;
- Playwright + axe are isolated under frontend `e2e/` with a separate `package-lock.json`;
- root production dependency graph and root `package-lock.json` remain unchanged;
- required Chromium projects exist at `1440x900` and `390x844`;
- browser checks cover console/page errors, failed requests/5xx, horizontal overflow, deterministic screenshots and blocking WCAG A/AA axe findings;
- Configuration smoke coverage includes canonical route `/admin/configuration/schemes` and the non-mutating “Thêm chương trình” dialog with accessible form/control-name assertions;
- controlled DEV fixture/showcase evidence is **not** SQL-backed business UAT and must never be described as full E2E.

Final tested UX-I1 code candidate:

- frontend SHA `0fb67d043a8e9d834a0d3403f2359d39e8e2b0c2`;
- frontend quality workflow run `34971270907`: **PASS**;
- production app typecheck, repository TypeScript, lint, build and existing tests: **PASS**;
- browser workflow run `34971271093`: **FAIL because real production baseline debt remains unsuppressed**;
- browser artifact ID `10397840114`, digest `sha256:c60b7649efc6ec8ee68290c4fb7bf3f8911b16835724527a39eefe151cb8a0e8`;
- final artifact inspection found **no remaining harness/selector/fixture failure**.

Current browser baseline findings intentionally left visible:

1. `color-contrast` serious findings across Registry/Case/Audit/Configuration; observed evidence includes normal-text contrast ratios below the applicable 4.5:1 AA threshold.
2. `aria-progressbar-name` serious finding in Case Overview because the Ant Design progress indicator lacks an accessible name.
3. Configuration emits Ant Design deprecation warnings through `console.error`: `Drawer.width` → `size` and `Space.direction` → `orientation`.

No axe rule, selector, console warning or production issue above has been silently suppressed/whitelisted to make CI green. No `Horizontal overflow detected`, uncaught page-error, request-failure or HTTP-5xx signature remained in the final failure set.

Scope-safety verification from frontend canonical `9d207c39236a052157fddc397b74f9243eff2426` to tested UX-I1 code candidate shows QA/docs/workflow/config/script changes only; there are **no `app/**` or `src/**` production UI changes**.

Canonical UX-I1 checkpoint document:

- frontend `docs/ux/UX-I1_BROWSER_BASELINE.md`.

**Hard stop:** wait for user review of UX-I0 + UX-I1. Do not declare the UX-I1 candidate as the new frontend canonical and do not start UX-I2+, CFG-2, CFG-3 or Step18B until explicitly approved.

## 4. Locked configuration behavior

### CFG-1A — Numbering

- Backend owns runtime numbering authority.
- Configurable runtime types remain controlled by backend capability metadata.
- Application/certificate authorities remain separate where already designed.
- No client-provided runtime sequence namespace.
- Existing identifiers must never be rewritten.
- Organization timezone now governs future numbering business-year resolution, with safe fallback.

### CFG-1B — Taxonomy

- Backend taxonomy runtime policy is the single authority for ISIC/NACE/IAF resolution/readiness.
- Frontend must not reimplement NACE→IAF derivation.
- Operational revisions remain centrally governed.
- Runtime mapping statuses and readiness must remain policy-driven.

### CFG-1C — Import lifecycle

Canonical mapping import lifecycle:

`CSV → validate → row review → commit DRAFT mappings → review → publish import job → operational`

Rules:

- Draft mappings are not operational.
- Publish is atomic.
- One invalid row must prevent the whole publication batch from becoming operational.
- Preview/commit/publish share backend validation policy.
- Reference drift must be revalidated at commit/publish.
- Row-level evidence must remain visible in UI.
- Do not emulate publication by row-by-row public HTTP calls.

### CFG-1D — Organization runtime

- Organization readiness is field-level, not `Boolean(profile)`.
- `timezone` is an applied runtime setting for governed future numbering and supported reporting behavior.
- Safe customer-facing branding projection may expose only allowed display fields.
- `logo_reference`, `document_footer`, locale/date-format/language compatibility metadata and retention metadata are not to be presented as fully implemented runtime features.
- No arbitrary filesystem logo path is a public/browser asset URL.
- No retention engine or broad i18n engine exists yet.

## 5. Current route and UX constraints

Canonical internal routes include:

- `/certifications/:caseId`
- `/certifications/:caseId/audits/:auditId`
- `/certifications/:caseId/findings/:findingId`
- `/certifications/:caseId/technical-review`
- `/certifications/:caseId/decision`
- `/certifications/:caseId/certificates/:certificateId`

Customer-safe CAP surface:

- `/portal/corrective-actions/:findingId`

Enterprise wording rules:

- Avoid consumer/chatbot language.
- Avoid unnecessary repeated “của tôi”.
- Do not expose internal form codes such as `P.09` as product terminology.
- Prefer product language such as `quy trình chứng nhận`, `vòng đời chứng nhận`, `hồ sơ chứng nhận`, or organization-configured terminology.

## 6. NEXT PHASE — UX Infrastructure before CFG-2

Do **not** jump directly into a broad visual redesign. First create a small, controlled UX infrastructure layer so future redesign batches have browser evidence, a design language and reusable components.

### UX-I0 — Compatibility and dependency audit

Goal: verify exact compatible versions before installing anything.

Current frontend stack to preserve:

- React 19.2.x
- Ant Design 6.5.x
- Vite 8.3.x
- Node 22.12+ / 24.x

Evaluate, but do not blindly install `latest`:

- Playwright
- `@axe-core/playwright`
- `antd-style`
- Storybook React + Vite integration
- Ant Design ProComponents

Required output:

- compatibility matrix
- exact versions to pin
- bundle/dev-only classification
- known React19/AntD6/Vite8/Node24 risks
- go/no-go decision for each dependency

Rules:

- Do not clone external framework repositories into CMP source.
- Penpot/MCP is external design workflow infrastructure, not a production CMP dependency.
- ProComponents is a pilot candidate, not a mandatory migration.

Exit gate:

- dependency audit written and accepted
- no production screen rewritten
- no schema change

### UX-I1 — Playwright + axe browser QA foundation

Goal: create a real browser-level regression harness before redesign.

Add browser QA scripts such as:

- `test:browser`
- `test:browser:configuration`
- `test:browser:headed`

Recommended structure:

```text
e2e/
  configuration-navigation.spec.ts
  registry.spec.ts
  case-overview.spec.ts
  audit-workspace.spec.ts
  cap-workspace.spec.ts
  helpers/
    auth.ts
    fixtures.ts
    accessibility.ts
```

Initial mandatory viewport matrix:

- 1440×900 desktop
- 390×844 mobile

Later optional expansion:

- 1280×800 compact laptop
- 768×1024 tablet

Browser checks must cover:

- page loads without unhandled console errors
- no horizontal overflow at canonical viewports
- critical navigation works
- dialogs/drawers remain usable
- forms have accessible labels/names where applicable
- important pages pass agreed axe rules or produce explicitly reviewed exceptions
- screenshot baselines are deterministic

Important classification:

- Controlled fixture/showcase browser QA is not SQL-backed business UAT.
- Do not claim “full E2E” merely because Playwright passes against controlled fixtures.

Exit gate:

- browser harness runs locally and in a deterministic command
- 1440 + 390 baseline produced for selected existing screens
- axe gate active
- frontend build/typecheck/lint/full tests remain PASS

### UX-I2 — CMP design language / tokens

Goal: keep Ant Design as foundation but make CMP visually consistent and product-specific.

Create governed tokens for:

- brand / neutral palette abstraction
- semantic status colors
- typography scale
- spacing scale
- radius
- shadows/elevation
- table density
- form density
- page/card hierarchy
- responsive breakpoints where needed

Rules:

- no CTIC hardcoding
- no second competing UI framework
- avoid one-off per-screen CSS unless justified
- existing Ant Design theme behavior must remain compatible

Exit gate:

- central token/theme layer exists
- selected existing components consume it
- visual behavior remains stable at 1440 + 390

### UX-I3 — Storybook foundation

Goal: allow isolated review and development of reusable CMP components.

Storybook should be development-only and must not leak into production runtime.

Initial catalog:

```text
Foundations
  Colors
  Typography
  Spacing
  Status semantics

Components
  PageHeader
  SectionHeader
  StatusTag
  ReadinessBadge
  FilterBar
  ResponsiveToolbar
  EmptyState
  DataTableFrame
  FormSection
  DetailSection
  ActionBar
  EvidencePanel
  ActivityTimeline
  StatCard
  InlineNotice
```

Do not attempt to catalog the entire application.

Exit gate:

- Storybook boots cleanly
- representative stories render
- a11y check works where practical
- production build is unaffected

### UX-I4 — Canonical component pass

Goal: build roughly 10–15 reusable enterprise components/patterns, not a giant design system.

Priority patterns:

- page heading + breadcrumbs + actions
- search/filter toolbar
- registry table shell
- dense detail cards
- status/readiness semantics
- form sections
- evidence/history panel
- empty/error/loading states
- responsive action toolbar

Each canonical component must have:

- intended usage
- anti-pattern notes
- responsive behavior
- Storybook story
- browser screenshot where visually meaningful

Exit gate:

- 10–15 components are stable enough to reuse in CFG-2
- no broad production rewrite yet

### UX-I5 — ProComponents pilot only

Goal: test whether ProComponents reduces complexity without fighting current CMP architecture.

Pilot options:

- one isolated Storybook pattern, or
- one low-risk configuration/reference-data table after compatibility is proven

Evaluate:

- React 19 / AntD 6 compatibility
- TypeScript ergonomics
- table/form behavior
- styling integration with CMP tokens
- bundle impact
- accessibility
- whether it materially reduces custom code

Decision:

- PASS → allow selected use in future screens
- FAIL / too costly → reject without migrating the application

Do not rewrite all existing AntD tables/forms.

### UX-I6 — Visual baseline package

Capture current and redesigned baselines for the most important surfaces:

1. Dashboard/App Shell
2. Registry
3. Certification Case Overview
4. Audit Workspace
5. Finding/CAP Workspace
6. Configuration
7. Industry Classification / IAF reference data

Mandatory widths initially:

- 1440 desktop
- 390 mobile

The baseline must detect:

- overflow
- toolbar collapse
- modal/drawer clipping
- density drift
- accidental spacing/typography changes
- responsive regressions

### UX-I7 — Penpot/MCP workflow spike

This is an external design workflow experiment, not an app dependency and not a blocker for CFG-2.

Target workflow:

`CMP requirement → design concept/prototype → approved pattern → Storybook component → production implementation → Playwright visual QA`

If Penpot/MCP adds friction or cannot reliably preserve enterprise structure, skip it and continue with source-driven UX specs + Storybook + Playwright.

## 7. CFG-2 — Configuration / Reference Data UX redesign

Start only after UX-I0 through at least UX-I4 are stable. UX-I5/I7 may remain optional if they fail their pilot.

CFG-2 is UX/IA/performance closure for the configuration area. It must not silently become CFG-3 schema governance.

### CFG-2A — Navigation and information architecture

Target top-level organization:

```text
Cấu hình chứng nhận
  Chương trình & tiêu chuẩn
  Phạm vi năng lực
  Quy tắc đánh số
  Tổ chức & nhận diện

Dữ liệu tham chiếu
  Phân loại ngành & IAF
```

Inside `Phân loại ngành & IAF`, prefer one coherent workspace with clearly separated operational tabs/sections such as:

- Tổng quan
- Danh mục
- Quy đổi
- Nguồn & phiên bản
- Chất lượng dữ liệu
- Nhập dữ liệu

Do not expose developer loaders, `.cmd`, repository patch commands or internal maintenance instructions in product UI.

Exit gate:

- navigation is understandable without backend vocabulary
- no duplicate/conflicting paths to the same concept
- deep links/back navigation remain stable

### CFG-2B — Programs & Standards UX

Preserve locked lifecycle rules:

- Program status: `Đang sử dụng` / `Ngừng sử dụng`
- Readiness is separate from lifecycle status
- Standard family has no independent fake lifecycle
- Edition lifecycle supports `Chưa áp dụng`, `Đang áp dụng`, `Ngừng áp dụng`, plus derived future-effective state
- used historical editions cannot be hard-deleted
- stopped editions need a real restore path

UX goal:

- clear hierarchy `Program → Standard → Edition`
- no status overload
- actions appear only where meaningful
- history is visible without crowding the primary workflow

### CFG-2C — Classification / NACE / IAF workspace

Backend taxonomy authority from CFG-1B remains untouched.

UX goals:

- user understands what dataset is active
- current revision/system is visible
- mapping quality/readiness is visible
- direct vs derived resolution is understandable without exposing implementation noise
- unresolved/multiple/outside-table cases have clear next actions
- frontend never reconstructs mapping authority locally

### CFG-2D — Import Center UX

Preserve CFG-1C lifecycle exactly.

The UI must clearly differentiate:

- validated input
- drafts stored
- ready for publication
- operational/published
- failed publication

Keep:

- row-level evidence
- errors/warnings/duplicates/valid filters
- error CSV
- filename/source hash where available
- reopen job
- server-owned action capability

Never present committed drafts as operational.

### CFG-2E — Organization / Numbering UX

Organization screen:

- active runtime settings shown as active
- compatibility-only fields hidden or clearly marked as not applied
- raw logo path editor remains absent
- no false retention/i18n claims
- readiness reasons are actionable

Numbering screen:

- backend capability metadata drives available types/actions
- user can understand active rule, future-effective rule, scheduled end/cancel and runtime namespace without exposing internal implementation jargon
- existing issued numbers remain immutable

### CFG-2F — Query/loading/error/performance closure

Address remaining structural UX debt such as:

- eager data fetching when a tab/section is not active
- one failing query blanking an unrelated section
- repeated refetches caused by coupled invalidation
- loading states that cause layout shift
- oversized table rendering where server paging/lazy loading already exists or can be used without schema change

Do not perform speculative backend architecture rewrites merely for perceived UI speed.

### CFG-2G — Responsive and visual closure

For every changed configuration/reference-data screen:

- 1440 desktop browser review
- 390 mobile browser review
- keyboard/basic accessibility review
- screenshot baseline update only after explicit visual acceptance
- no horizontal page overflow
- no inaccessible hidden primary actions

## 8. UX Trial Round 2

After CFG-2 closure, the real user should use the web application again without being coached through implementation details.

Trial focus:

- Can the user find where to configure programs/standards?
- Can the user distinguish lifecycle vs readiness?
- Can the user understand NACE/IAF mapping and data quality?
- Can the user import, inspect drafts and publish data without confusing stored vs operational state?
- Can the user understand numbering rules and organization settings?
- Does mobile/compact layout remain usable?

Capture findings as UX issues, not immediate ad-hoc code edits. Batch them and close them under explicit checkpoints.

## 9. What comes after CFG-2

Do not skip the locked release sequence.

Expected sequence:

`UX Infrastructure → CFG-2 → UX Trial Round 2 → targeted UX fixes → Step 18B Legacy Closure → Full SQL-backed Manual UAT / business E2E → Release Hardening → RC → V1.0`

CFG-3 remains deferred unless explicitly approved after CFG-2. Potential CFG-3 scope includes governed dataset release/package/version governance and any schema-backed organization asset model. CFG-3 must not start automatically.

## 10. Git and safety rules

Mandatory:

- no force push
- no rebase
- no amend
- no `git add .`
- no `git clean`
- preserve untracked reports/logs/UAT evidence/backups
- remain on `feature/ux-fix-batch01`
- do not merge `main`
- no migration 33 unless an explicit future schema decision is approved
- never modify/drop/recreate DEV database for a test convenience
- isolated P09 test DB operations must remain guarded and explicit

For UX infrastructure dependency work:

- pin exact versions after compatibility review
- keep Storybook/Playwright tooling out of production runtime where possible
- do not replace Ant Design with shadcn/Radix/Refine
- do not introduce a second design foundation
- do not globally add Tailwind-based patterns merely for appearance

## 11. Immediate next action

**STOP FOR USER REVIEW OF UX-I0 + UX-I1.**

Before any further implementation:

1. refresh both repositories and verify branch/head;
2. read this `AI_context.md` first;
3. review frontend `docs/ux/UX-I0_DEPENDENCY_COMPATIBILITY.md`;
4. review frontend `docs/ux/UX-I1_BROWSER_BASELINE.md` and the unsuppressed browser findings;
5. keep accepted frontend canonical at `9d207c39236a052157fddc397b74f9243eff2426` until the user explicitly accepts/promotes the UX-I1 candidate;
6. do not repair production UI merely to make UX-I1 CI green unless the user explicitly authorizes that scope;
7. do not start UX-I2+, CFG-2, CFG-3 or Step18B until the user explicitly approves the next checkpoint.

The correct next conversational action is to report this checkpoint and obtain the user's review/decision, not to continue automatically.
