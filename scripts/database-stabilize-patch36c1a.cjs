require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { migrationChildEnv } = require('./lib/database-credentials-patch36c1a.cjs');

const ROOT = path.resolve(__dirname, '..');
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');

function fail(step) {
  console.error(`DATABASE STABILIZATION: FAIL at ${step}`);
  process.exit(1);
}

function runNode(script, args = [], options = {}) {
  const file = path.join(ROOT, script);
  const env = options.migration ? migrationChildEnv(process.env) : process.env;
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env,
  });
  if (result.error || result.status !== 0) fail(script);
}

function runPrisma(args) {
  if (!fs.existsSync(PRISMA_CLI)) fail('local Prisma CLI missing');
  const result = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: process.env,
  });
  if (result.error || result.status !== 0) fail(`prisma ${args.join(' ')}`);
}

function main() {
  console.log('===========================================================');
  console.log('DATABASE STABILIZATION 36C.1a');
  console.log('Runtime credential and migration credential are separated.');
  console.log('===========================================================');

  console.log('\n[1/7] Stable SQL Server runtime preflight...');
  runNode('scripts/database-preflight-patch36c0a.cjs', ['--auto-start-local-sql']);

  console.log('\n[2/7] Migration credential target + DDL/DML capability...');
  runNode('scripts/migration-credentials-preflight-patch36c1a.cjs');

  console.log('\n[3/7] Safe adoption of existing database baseline...');
  runNode('scripts/adopt-existing-database-patch36c1a.cjs');

  console.log('\n[4/7] Prisma migrations with transient-connection retry...');
  runNode('scripts/migrate-with-retry-patch36c1a.cjs');

  console.log('\n[5/7] Critical additive safety repair using migration credential...');
  runNode('scripts/repair-critical-schema-patch36c0.cjs', [], { migration: true });

  console.log('\n[6/7] Regenerate and verify Prisma Client...');
  runPrisma(['generate']);
  runNode('scripts/verify-prisma-client-patch35a4.cjs');

  console.log('\n[7/7] Full Prisma schema + migration history contract using runtime credential...');
  runNode('scripts/database-schema-contract-patch36c1.cjs');

  console.log('\nDATABASE STABILIZATION: PASS');
}

main();
