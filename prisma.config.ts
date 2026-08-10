import {
    existsSync,
} from 'node:fs';
import {
    resolve,
} from 'node:path';

import {
    config as loadDotEnv,
} from 'dotenv';
import {
    defineConfig,
} from 'prisma/config';

const root = process.cwd();
const runtimeEnvPath = resolve(root, '.env');
const migrationEnvPath = resolve(root, '.env.migration');

if (existsSync(runtimeEnvPath)) {
    loadDotEnv({
        path: runtimeEnvPath,
        override: false,
        quiet: true,
    });
}

// Prisma CLI is a schema-management tool, so when a dedicated migration
// credential exists it should use that credential. NestJS runtime does not
// use this file for its connection; PrismaService continues to use DATABASE_URL.
if (existsSync(migrationEnvPath)) {
    loadDotEnv({
        path: migrationEnvPath,
        override: false,
        quiet: true,
    });
}

const datasourceUrl =
    process.env.MIGRATION_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';

export default defineConfig({
    schema:
        'prisma/schema.prisma',

    migrations: {
        path:
            'prisma/migrations',

        seed:
            'node prisma/seed.js',
    },

    datasource: {
        url:
            datasourceUrl,
    },
});
