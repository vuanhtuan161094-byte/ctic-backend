# SQL script safety and classification

## Canonical schema history

Prisma migrations under `prisma/migrations/` are the canonical schema history
for installation and upgrade. Application startup, production runtime, and the
commercial deployment pipeline must not depend on standalone legacy SQL files.

Legacy SQL files are not called by the application or runtime. Their presence
in this directory is not an instruction to run them.

## Script classifications

### Schema migration

A schema migration changes the supported database contract. New installations
and normal upgrades must apply only the reviewed Prisma migration history and
the documented deployment commands.

### Demo/test seed

A demo/test seed creates or updates disposable fixture data for an explicitly
selected development or test database. It is not a schema migration and is not
part of the deployment pipeline.

The following files are manual demo/test fixtures:

- `seed-demo-expert-competencies-patch19.sql`
- `tests/seed-test-iso45001-iaf14.sql`

They may contain CTIC-specific fixture identities. Do not run them as part of
installation, upgrade, application startup, or production deployment.

### Legacy/manual recovery

A legacy/manual recovery script records a historical repair procedure. It is
not a supported installation or normal-upgrade path. It may duplicate schema
changes now represented by Prisma migrations and may also contain deployment-
specific data repair.

`upgrade-application-review-two-level-workflow-v1.sql` is legacy/manual recovery
only. It contains legacy CTIC-specific RBAC, user-assignment, and data-repair
statements. It is not part of the commercial deployment pipeline.

Do not run this legacy SQL on production merely because a role or permission
appears to be missing. Diagnose the current Prisma migration state, seed state,
and database contract first. Missing authorization data must be handled through
the current reviewed provisioning process, not by replaying a historical repair
without analysis.

## Manual recovery requirements

Before any manual recovery:

1. Obtain Technical Lead and DBA approval for the specific database and issue.
2. Create and verify a recoverable database backup.
3. Review every statement in the legacy SQL against the current schema and data.
4. Review the script's `SESSION_CONTEXT` guard and its exact key/value.
5. Set the required context only in the same SQL session used to execute the
   reviewed script.
6. Validate the resulting schema, RBAC assignments, and affected records.

The guard in `upgrade-application-review-two-level-workflow-v1.sql` is
fail-closed. The script does not set its own authorization context. A missing,
incorrect, or differently scoped `SESSION_CONTEXT` value must stop execution
before `USE`, schema changes, RBAC changes, data changes, or user assignments.
