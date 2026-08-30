# Release and rollback

Generate and retain the release manifest (`npm run release:manifest`) with application version, build identifier and migration count.

Application rollback is safe only when the previous application is compatible with the already-applied additive schema. Do not assume automatic database downgrade is safe.

If a schema migration causes an unrecoverable problem, stop traffic and choose one reviewed path: forward corrective migration, or restore the verified pre-release SQL+storage backup. Never run `prisma migrate reset` against a real installation.
