# CMP 1.0 RC1 — RELEASE GATE

## Feature freeze

No new feature is permitted after Phase 10. Allowed changes: defect fixes, test coverage, performance/security corrections, documentation/runbook corrections.

## Mandatory automated evidence

- Backend regression: PASS
- Backend build: PASS
- Backend Jest: PASS
- Frontend production build/tests: PASS
- Frontend lint: PASS
- P09 real SQL E2E: repeatability 2/2 PASS
- Production readiness regression: PASS
- Backup DB + VERIFYONLY: PASS
- Storage immutable snapshot: PASS
- Isolated DB/storage restore drill: PASS

## Manual acceptance evidence

Complete `MASTER_UAT_PLAN.md` and retain the execution log/defect log.

## Defect severity

- **S1 Blocker:** data loss/corruption, security boundary bypass, wrong certificate authority/decision, production unavailable, restore impossible.
- **S2 Major:** core certification journey cannot complete or produces materially wrong controlled output/status.
- **S3 Minor:** workaround exists; no incorrect authority/data integrity impact.
- **S4 Cosmetic:** presentation/wording only.

RC1 requires S1=0 and S2=0.
