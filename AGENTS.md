# CMP Codex Working Instructions

This is the CMP backend repository. These instructions apply to work performed in this checkout by Codex or other code agents. They are **coordination safeguards**, not authorization to write database records or change the user's Windows configuration.

## Authoritative handoff

1. Read the latest owner request, current worktree state, `AI_context.md`, relevant `docs/handoffs/` and `README.md`.
2. Read `docs/coordination/CMP_CODEX_CHATGPT_SYNC_2026-10-24.md` for the current **GitHub checkpoint relay** contract.
3. Read [backend Issue #1](https://github.com/vuanhtuan161094-byte/ctic-backend/issues/1) and its newest verified checkpoint comments. Never treat older blocked Gate A comments as superseding the verified 2026-10-23 PASS.
4. Check the related frontend repo `vuanhtuan161094-byte/ctic-frontend` and local diff when changing cross-repo behavior.

## Source control

- Work only on the owner-designated `feature/ux-fix-batch01` for current CMP tasks. Confirm local and remote HEADs first.
- Preserve all tracked/untracked local WIP. Never `git clean`, `git reset --hard`, blindly stash, force push/rebase, mass stage or merge main.
- Commit only reviewed task-scoped files; keep secrets and protected Windows logs out of git.

## Database and runtime

- **Gate A PASS and locked. Do not rerun.** The demo DB is `CTIC_CMP_DEMO_2026` on `CTIC-LP-054\SQLEXPRESS`.
- Do not alter `CTIC_Certification`, restart SQL, reconfigure TCP/firewall, attempt elevation or apply migrations to the wrong DB. Request explicit owner approval for a privileged action.
- Validate local runtime URL/port and actual SQL identity non-destructively; do not trust a hardcoded port or a stale launcher.
- Never duplicate demo customers/accounts/applications; prefer evidence-readback and idempotent checks.
- No fabricated approvals, accreditation statuses, signed certificates, or real-world history.

## GitHub relay checkpoint

After each meaningful implemented/tested checkpoint, **attempt** to post a concise redacted status comment to [Issue #1](https://github.com/vuanhtuan161094-byte/ctic-backend/issues/1), using existing authenticated GitHub access. Include real backend/frontend HEADs, test and browser evidence, PASS/PENDING/FAIL and the next step. Also commit a sanitized durable report when useful. Follow the issue-comment template and redaction rules in the coordination document.

If GitHub issue writes are unavailable, do not request passwords or silently claim sync success: publish a sanitized report to the feature branch if permitted, otherwise state `ISSUE_SYNC_BLOCKED` and why. GitHub sync is **only active during agent execution**, not a background listener.

Prioritize real browser screenshots/role acceptance and launcher verification on Windows over new SQL setup. Never mark runtime UI PASS without actual screenshot proof.
