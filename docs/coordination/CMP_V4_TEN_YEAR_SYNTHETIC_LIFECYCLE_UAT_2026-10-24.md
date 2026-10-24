# CMP V4 — TEN-YEAR SYNTHETIC CERTIFICATION LIFECYCLE + FULL-SYSTEM UAT
Owner instruction: 2026-10-24 · Prepared for Codex on Windows · Feature branches only

## 0. DIRECT EXECUTION MANDATE

Owner has already created 20 DEMO customers and asks to populate/visualize **multiple hypothetical certification lifecycles over ~10 years** and review **all currently implemented CMP P.09 functions**, not just a mostly empty customer dashboard. Autonomously IMPLEMENT, TEST, FIX and PRODUCE VISUAL EVIDENCE in reviewable checkpoints. Do not stop at making another plan.

**Separate three kinds of evidence:**
- REAL_DEMO = existing isolated SQL DEMO \`CTIC_CMP_DEMO_2026\` with 20 distinct customers / 20 Portal access / 29 users / application APP-2026-0001 per prior Codex read-only report. This data is protected and owner may still change it. *Do not seed, reset or expand without distinct authorization*.
- SYNTHETIC_10Y_FIXTURE = deterministic, fully artificial 2016-10-24 to 2026-10-24 history, consumed only by UI/browser regression in an isolated fixture environment. This is the immediate, independently executable path for wide/dense UI test coverage and must be clearly tagged fixture-only.
- SYNTHETIC_10Y_SANDBOX = optional separate disposable SQL database / isolated environment, only if one can be established without elevated infrastructure changes or compromising any existing DB; use authorized **real application APIs/services** with replayable simulation clock for legitimate transitions. Do not use direct SQL to fake approvals/status, false audit log actors or certificate signatures. If not feasible, do not claim SQL ten-year PASS. Preserve detailed blockers and fixture-only UAT.

A signed/issued/suspended sample certificate in fixture data is a **test representation**, not an actual legal/official certificate; watermark its preview \`DEMO — KHÔNG CÓ GIÁ TRỊ CHỨNG NHẬN\`. Public certificate verification and QR must never publish a fictitious certification as genuine. Use local intercepted API or a strictly isolated mock verifier for certificate UI tests.

## 1. READ CURRENT STATE / NO REPEATED INFRA SETUP

Repositories:
- Backend \`vuanhtuan161094-byte/ctic-backend\`
- Frontend \`vuanhtuan161094-byte/ctic-frontend\`
- both \`feature/ux-fix-batch01\`. At preparation time remote HEAD: backend \`494605903d4f163de2bc9f3660832c74741412c1\`; frontend \`46a6a8393d612fe9442378a19e799b48ebc88a47\`. Fetch actual HEAD before coding and never overwrite newer work.

Read root \`AGENTS.md\` in both repos, this packet, backend \`AI_context.md\`, latest handoffs, \`docs/coordination/CMP_CODEX_CHATGPT_SYNC_2026-10-24.md\` and backend Issue #1 newest comments. Read frontend \`docs/ux/CMP_CODEX_VISUAL_AND_REAL_WORKFLOW_RESET_2026-10-18.md\` (newer intent supersedes unsafe older bulk SQL plan), relevant Playwright specs and existing 3-year fixture. Read actual DTO/controllers/services and Prisma schema for workflows; never invent unsupported state or status transitions.

Preserve all tracked/untracked work, uploads and local credentials; no \`git clean\`, hard reset, blind stash, mass staging, force push or main merge. SQL Gate A already **PASS** 2026-10-23; **never rerun it**. Never touch \`CTIC_Certification\`, restart SQL, change ports/firewall/SQL privileges, change applied migrations, or require Administrator unless owner explicitly approves that specific necessity. Do not run destructive cleanup.

## 2. P0 — FIX KNOWN REGRESSIONS FIRST

### L1. DEMO launcher exact-count bug

Source: backend \`scripts/demo/cmp-demo-launcher.cjs\`, \`verifyDemoData\` currently requires SQL-wide counts \`customers==20\`, \`portal_access==20\`, \`users==29\`, \`applications==1\`, \`work_items==1\`, \`status==submitted\` and \`intake==OPEN\`. This incorrectly treats expected legitimate growth and state progression as corruption. It will reject a valid new application, new work item, review, and a successfully progressed first application.

- Fix by checking exact required original manifest identities and referential membership, not equality against mutable total SQL row counts; disallow loss/replacement of manifested records and wrong database/tenant. Global totals are telemetry, **not** invariants. Manifest can have immutable creation membership but workflow statuses legitimately progress.
- Authenticated and correctly scoped read-only verification only; manifest protected Windows path remains untouched, no secrets in logs.
- Regression cases: initial 20+1 passes; +1/+40 valid applications and work items passes; first application progresses to a valid next state; deletion or mismatched manifest record fails; wrong server/DB fails; foreign tenant mismatch fails; unknown PID/port never adopted; no writes from runtime-only launcher.
- Existing SQL TCP listener may be wildcard on port 1433. The launcher may use localhost for its client but this is **not proof** of SQL network exposure being loopback-only. Track residual security issue separately; no TCP/firewall changes without approval.
- Verify actual CMD double-click behavior on ordinary Windows user, *not* only node unit mocks, without re-seeding or rerunning Gate A. Reuse valid existing processes. Ensure timeout, first-time launch, restart and idempotence behavior. Only report true observed PASS.

### L2. Application review decision/default/capability sequencing

Frontend \`app/components/CertificationProjectsScreen.tsx\`: recent fix removed default \`ACCEPTED\`/YES outcomes (good). But \`checkCertificationBodyCapability()\` currently requires \`validateReviewOutcomes()\` and persists draft \`POST /application-reviews\` before performing a capability query. The user needs capability facts as an input to judgment; clicking "check" should not silently create review records.

- Inspect backend capability evaluation service and existing \`/application-reviews/:id/capability-evaluation\` contract. Implement a safe read-only capability precheck from application/standard/IAF where possible **without implicit review creation** and preserving RBAC. If API has no read-only input route, design a minimal guarded read-only backend endpoint, without unsafe schema/migration work, and add backend focused tests; keep the existing post-review evaluation for genuine persisted reviews.
- Keep YES/NO/NA and ACCEPTED/REJECTED/NEED_MORE_INFO user-selected. Show decision prerequisites transparently and validate server-side.
- Review \`SAVE_DRAFT\` semantics carefully: frontend currently forces every item and overall result before draft; backend CreateApplicationReviewDto and database may require result. Permit useful **partial drafting only when a sound persistence contract exists**. Do not insert a misleading ACCEPTED placeholder. If nullable result would require prohibited migration, provide an honest \`local-only progress\` with explicit volatile status or propose separate non-approval draft storage and label it PENDING approval. Never silently claim incomplete drafts are saved to SQL.
- SUBMIT must enforce complete data + ability checks + independent reviewer + mandays; draft/provisional records must not be approvable or treated as approved.
- Regression: incomplete draft, fully completed draft, save/resume, rejected, needs more information, change after return, reviewer SoD, missing competency, invalid applicant, no mutation on read-only precheck.

### L3. Customer detail loading and nonblocking UI warnings

- Reproduce customer-detail section observed as "loading" in screenshot; allow settle; differentiate slow request from stuck spinner, failed API or missing data. Fix only if reproduced.
- Inventory ~14 Ant Design deprecation console notices; fix high-value touched components surgically, preserve AntD6 design tokens and Vietnamese text.

P0 must have focused regression PASS and at least one actual runtime smoke report before proceeding to full simulation. Avoid endlessly running full CI.

## 3. P1 — TEN-YEAR SYNTHETIC DOMAIN CATALOG (2016-10-24 → 2026-10-24)

Use **20 fictional customers**, preferably reuse the **identity/profile variety** of the existing DEMO 20 only when copied safely into isolated fixture; no actual personal information. Do not create another 20 customers in original SQL DEMO. Stable deterministic seed, stable reference graph, no uncontrolled randomness.

Target for breadth, **adjust to canonical schema and valid workflow** and label counts accurately rather than faking to hit targets:
- 20 customer identities: varying legal names (short/long), countries, sectors, sites, multi-standard vs single-standard, effective headcount, shift work, remote/multi-site, staff sizes and non-sensitive simulated contacts.
- 2016–2026 inclusive, modeled about 10 elapsed years, with **2–4 plausible certification cycles/customer** (target 50–75 cycle/project representations total where supported), 2–3 annual surveillance events per complete cycle where actual scheme config supports them, initial Stage 1/Stage 2, recertification and late/overdue monitoring. Vary start dates; not all customer journeys are identical.
- Cover historical standard edition **only when valid for event date** (do not put a 2018 edition on a 2016 audit). Let canonical standard editions and scheme configuration determine edition-specific behavior. Special-case upgrade/transition and scope changes as separately labeled simulations.
- Include application & intake, application-review and reviewer return/approve, ISIC→NACE→IAF, CB capability insufficient/missing and sufficient, manday with employee size/integration/site discounts, quotations/contracts/agreements, project activation, audit programme/events, resource schedule, assignment conflicts and approved competencies.
- Include audit plans, Stage 1/Stage 2, findings (major/minor and closed/open), client response, CAP evidence/accept/reject/reopen, technical review (independent actor), certification decision (independent actor), simulated certificate issue/history/expiry, suspended/withdrawn/reinstated, transfer or scope change cases where supported.
- Include renewal/recertification, surveillance 1/2, special audit, complaints/appeals, document controls, tasks, notifications, financial/billing projections if currently implemented, reports/exports, audit trail, public certificate verification **only via isolated simulated verifier**.
- Distributions should include: DRAFT / INTAKE / RETURNED / APPROVED / ONGOING / COMPLETE / OVERDUE / CANCELLED / SUSPENDED / EXPIRED / WITHDRAWN **only if canonical mappings support them**; precise server enums override proposed names. Expired/suspended states should be represented by valid state machinery and show correct reason and effective dates.
- Snapshot styles: 0, 1, 20, 100+ objects; calendar day 0/1/6/>10 events; long Vietnamese/English names; 1–5 sites; 1–3 standards; sparse/empty/fully-loaded; many pages; simultaneous team bookings; task overdue vs future; bulk notifications; missing prerequisite.
- Real calendar chronological coherence: initial Stage1 before Stage2; approval before certificate; surveillance not before certificate where rules disallow; no contradictory effective intervals; no same auditor acting as prohibited independent reviewer/decision-maker. Record a deterministic graph and invariant checks.

Coverage matrix must enumerate the **actual currently implemented CMP P.09 modules** from backend routes/frontend navigation and report why some are not testable yet. P.08 personnel functions already implemented may be included for UI and access tests; expansion of separate P.10/P.11/P.13 procedures is NOT authorized by this packet.

## 4. P2 — BUILD TWO SEPARATE TEST TRACKS

### Track A (must run): fixture-powered UI/UX at scale

- Create new 10y generator/fixture in frontend \`e2e/fixtures/\` with stable seed and meaningful relationships. Retain the current 3-year fixture unchanged for existing regression or extend compatibly **without breaking older snapshots**.
- Wire strictly scoped Playwright interception/mock of API reads or isolated fixture build; **never connect synthetic statuses to live SQL**. Clearly label screenshots and reports \`FIXTURE_10Y\`; screenshots should not show fake real credentials.
- Expose selectable reference scenarios in QA tooling: \`empty\`, \`sparse\`, \`dense\`, \`full-10y\`, \`edge-cases\` without affecting production navigation or backend mode.
- Use actual frontend components and routes (not a hand-drawn dashboard) so issues with tables, filters, forms, navigation, localization and responsiveness reproduce faithfully.
- Add scenario coverage with explicit counts, date range, state distribution and derived expectations. Evidence visible at 1366×768 main; 1440×900 and 390×844; tablets if practical.
- Test all relevant role personas and portal A vs B (read-only) via safe fixture tokens; show correct filtering, search, status and chronology; verify no unexpected backend writes.

### Track B (real business engine): guarded API workflow UAT

- Continue on existing DEMO **READ ONLY** until the owner’s import is confirmed complete. The 20 existing customers and current application must remain untouched for synthetic history.
- For an automated stateful 10y test, prefer a separate **ephemeral, isolated sandbox** with no network/shared files/credentials to production, only with verified runtime DB identity, backup/snapshot and authorization. If no safe provision exists without unapproved administrator/TCP operation, mark \`SANDBOX_10Y_BLOCKED\`, complete Track A, and do not turn fixture results into SQL PASS.
- Use official authenticated application API/service for transitions with separate roles and SoD (Admin, Sales, Coordinator, Lead Auditor, Auditor, Expert, Technical Reviewer, Decision Maker, Portal A/B). Enforce permissions and evidence prerequisites rather than directly updating Prisma/SQL workflow statuses.
- Historical timestamps must remain **synthetic test dates** in an isolated simulator with explicit test clock/controlled projection. Do not falsify immutable \`created_at\`, audit-event actor timestamps or real signatures. If the current application cannot replay old transitions safely, treat 10y **history fixture** as the long-horizon UI track and use **present-day real workflow UAT** separately.
- Test repeatability/no duplicate creation, partial fail/resume, transaction rollback, approval-denial/no mutation, tenant isolation, logs and API latency. Run single worker/minimize memory pressure (Windows device may have ~8GB RAM).
- Any sandbox certificate must be test-only and must not appear in actual public verification or external communication. Never send email/SMS to real users, no live portal domains.

## 5. P3 — SCREENS AND FLOWS TO ACCEPT

Review the real frontend nav and backend route inventory, then test EVERY implemented work area and its authorized personas. Minimum evidence matrix:

1. App shell, login/logout/session recovery, white-label branding, configuration, accounts/roles and unauthorized navigation;
2. Customer list + detail, search/sort/filters, 20/100+ display densities, Portal org/access, attachments;
3. Registration/application creation, customer Portal submission, coordinator intake, status+requirements timeline;
4. Application review, capability precheck, ISIC/NACE/IAF, expert competence, man-day calculations/adjustments, quotation + agreement + contract;
5. Project/certification dossier, surveillance cycles, recertification and traceable customer links;
6. Audit programmes, Stage1/Stage2, resource planning/calendar/team composition/schedule collisions, personnel availability, multi-day/multi-month views;
7. Audit documents, evidence upload/list/preview, findings, NC/CAP lifecycle and portal response;
8. Technical review/decision (independent reviewer & decision-maker), simulated certificate lifecycle/versions/expiry/suspension/withdrawal, QR/PDF only in test mode;
9. My tasks, dashboard KPIs, work allocation, notifications, escalations, personal calendar and overdue queues;
10. Special audits, complaints/appeals, controlled templates/document library, governance/change cases if enabled;
11. Reports, export/import guardrails, filters by year/customer/standard/status, trend charts and calendar chronology;
12. Responsive/mobile density, Vietnamese diacritics, accessibility, keyboard, real empty/loading/error/403 state separation.

Test scenarios: initial 2016 period / latest Oct 2026 / 2018 standard transition / 2019-22 surveillance / 2023-26 recert / ten-year aggregated history as synthetic planning examples, **not mandated actual histories**. Verify customer A/B access isolation and permission counts match source of truth.

## 6. P4 — ROOT CAUSE → FIX → FOCUSED REGRESSION

For each observed defect:
- Record \`DEFECT-ID\`, severity P0/P1/P2, persona, URL, viewport, source mode (REAL_DEMO vs FIXTURE_10Y vs TEN_YEAR_SANDBOX), steps/reproducer, expected vs actual, minimal screenshot and API projection if relevant.
- Fix smallest causal layer: API projection vs frontend layout vs workflow validation. No frontend-only fake state to hide backend errors; don't weaken RBAC or SoD for successful screenshots.
- Prioritize blocker/progression and wrong data over cosmetics; batch UX fixes after domain correctness.
- 10-year dataset generator must be deterministic and validators must catch invalid chronology, statuses and cross-tenant references.
- Test no horizontal overflow at 1366×768 and 390×844, calendar one date per cell, labels not cut, table pagination, timeline, large filters, empty/error differentiation, accessibility A/AA serious/critical where applicable.
- Run typecheck/build/lint relevant files; targeted backend tests, Playwright real browser. Never assert frontend static/regex tests alone prove E2E, and do not rerun full suites on every tiny patch.

## 7. DELIVERY / CHECKPOINTS / STOP CONDITIONS

**Sequence for Codex:**
- C0 inventory: current HEADs/WIP, acceptance gaps, actual module/route matrix; do not disturb working processes.
- C1 fix L1/L2/L3 and focused regressions; first real CMD Windows smoke. Post issue checkpoint.
- C2 build synthetic 10-year dataset and invariant report. Deliver scenario catalog with verified counts/relationships and clearly described historical assumptions.
- C3 run 10-year fixture browser UI QA of all reachable modules, take labeled screenshots and fix actual UX/data projection defects.
- C4 perform safe present-day API business workflow tests with isolated test identities, only where properly authorized; record all downstream prerequisites and SoD outcomes. If no separate SQL sandbox available, stop *this track* without blocking fixture UI completion.
- C5 final integrated regression, evidence, risk register, user launch instructions and one-page acceptance sheet.

**Definition of done:**
- Existing 20 customer DEMO preserved and live runtime survives additional legitimate records; no strict SQL total-count lockout.
- Application capability review and SAVE_DRAFT/SUBMIT semantics are coherent; results never silently default to \`ACCEPTED\`.
- Ten-year synthetic catalog covers several plausible certification cycles/customer and dense/sparse snapshots, with deterministic valid dates/status graph; explicit \`FIXTURE_ONLY\` label for fixtures.
- Screen-by-screen, role-by-role acceptance table names all implemented CMP P.09 modules and maps browser/fixture/API/SQL evidence accurately. No bare “all functions PASS” without evidence.
- Real Windows launcher and viewport screenshots validated where available; no leakage of secrets or false historical credentials.
- Backend/front code commits on the *existing authorized feature branches*; no merge, no migration 34 without separately documented approval; tests pass for touched code.
- Publish concise sanitized summary to [backend Issue #1](https://github.com/vuanhtuan161094-byte/ctic-backend/issues/1) per \`docs/coordination/CMP_CODEX_CHATGPT_SYNC_2026-10-24.md\`. No internal PID/host names/SQL identity/passwords, protected paths or auth screenshots in the issue. If issue comment is disallowed, don't evade review; post only permitted summary docs or \`ISSUE_SYNC_BLOCKED\`.
- Owner gets one concise final report: actual HEADs, REAL_DEMO totals, FIXTURE_10Y objects-by-year/by-type, live workflow coverage vs missing, UI screencaps/links, validated repairs, P0/P1/P2 defects, blockers, one CMD to launch. User is asked only for essential Windows permission or final visual acceptance.

### Non-goals and safety

No modifications to the owner's 20 real DEMO customers/portal credentials; no external email/notifications; no fabricated certification/accreditation; no published test QR; no production deployment; no change to unrelated P.10/P.11/P.13 business procedures. Existing data must remain reversible, never auto-cleaned. If test data is stored in a new sandbox, record the database identity, run ID and manifest **locally protected** and use an explicit dry-run cleanup, never automatic deletion.

**Owner's success criterion:** Open CMP, see dense and historically varied realistic DEMO data, exercise all existing P.09 interfaces and permissions, and understand which full-lifecycle actions have actually been run in a real guarded workflow versus only simulated for UI. Stop reporting progress as “20 customers + one application = full demo”.
