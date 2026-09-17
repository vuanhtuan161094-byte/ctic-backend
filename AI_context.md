# CMP — Current Checkpoint and Next Phase Plan

Updated: 2026-09-17

This file is the current source-of-truth for continuing the CMP project. Read it before changing scope.

## 1. Product and repository scope

CMP is a commercial-neutral Certification Management Platform for certification bodies.

Architecture:

- Backend: NestJS + TypeScript + Prisma 7.8 + SQL Server
- Frontend: React 19 + Vite 8 + Ant Design 6 + TanStack Query
- Deployment model: one installation = one certification body, with its own database/storage/branding
- DEV database: `CTIC_Certification`
- Canonical database migration count: **32/32**
- **No migration 33** unless explicitly approved

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

Not started:

- UX-I4 — canonical reusable components
- UX-I5 — ProComponents pilot/re-audit
- UX-I6 — visual baseline package
- CFG-2 — Configuration UX redesign
- CFG-3 — deferred unless explicitly approved
- Step18B

## 4. Current canonical checkpoints

Backend production code canonical:

`4714576475f6939d62093068e6321e4c61ec81eb`

Frontend production canonical after UX-I3 acceptance:

`dac0bc3e6d50a36dee7fa3fa34dae6d3085c50b1`

Previous frontend UX-I2 canonical:

`24039ac5f7dd0c3aa67e73bbc72c0e12c87de6db`

Frontend documentation HEAD after UX-I3 lock + visual-direction setup:

`33c2c4ec47141e0eb6bbc0b58ede841d022c7065`

Backend commits after the backend code canonical are checkpoint/documentation only unless a later section explicitly states otherwise.

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

Accepted frontend production canonical:

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

## 10. Visual Direction Gate — ACTIVE, before UX-I4

A dedicated visual-direction gate is inserted between UX-I3 and UX-I4.

Primary high-fidelity reference screen:

**Configuration — Chương trình & tiêu chuẩn**

Reason: this screen is sufficiently complex to establish the future CMP visual language across page hierarchy, master-data navigation, status/readiness, rules, standards/versions, actions, forms and responsive behavior.

The visual direction must preserve existing business authority and capabilities; this is a presentation/information-architecture exercise only.

Reference proposal:

- modern neutral B2B SaaS character;
- restrained brand-blue use;
- strong information hierarchy;
- compact summary strip, not oversized dashboard cards;
- desktop split workspace: program navigator on the left, selected-program detail on the right;
- selected program detail contains compact certification-rule summary + grouped standards/editions;
- readiness uses concise contextual blockers rather than full-card orange/green decoration;
- destructive actions stay secondary/overflow;
- mobile stacks program selector + details, no horizontal overflow;
- no CTIC-specific visual identity.

Canonical visual-direction document:

- frontend `docs/ux/UX-V1_CONFIGURATION_VISUAL_DIRECTION.md`

Current status:

**READY FOR PRODUCT OWNER VISUAL REVIEW**

After Product Owner visual approval:

1. sanity-check the same visual language against Case Overview;
2. then start UX-I4 and extract reusable components from the approved reference;
3. later use those components in CFG-2 production Configuration redesign.

Do not start UX-I4 before visual direction is approved.

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

**PRODUCT OWNER REVIEW OF THE CONFIGURATION HIGH-FIDELITY VISUAL DIRECTION.**

Do not start UX-I4, CFG-2, CFG-3 or Step18B until the visual-direction gate is resolved.
