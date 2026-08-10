require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');

function fail(step) {
  console.error(`DATABASE STABILIZATION: FAIL at ${step}`);
  process.exit(1);
}

function runNode(script, args = []) {
  const file = path.join(ROOT, script);
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: process.env,
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
  console.log('DATABASE STABILIZATION 36C.1');
  console.log('===========================================================');

  console.log('\n[1/6] Stable SQL Server preflight...');
  runNode('scripts/database-preflight-patch36c0a.cjs', [
    '--auto-start-local-sql',
  ]);

  console.log('\n[2/6] Safe adoption of existing database baseline...');
  runNode('scripts/adopt-existing-database-patch36c1.cjs');

  console.log('\n[3/6] Prisma migrations with transient-connection retry...');
  runNode('scripts/migrate-with-retry-patch36c1.cjs');

  console.log('\n[4/6] Critical additive safety repair...');
  runNode('scripts/repair-critical-schema-patch36c0.cjs');

  console.log('\n[5/6] Regenerate and verify Prisma Client...');
  runPrisma(['generate']);
  runNode('scripts/verify-prisma-client-patch35a4.cjs');

  console.log('\n[6/6] Full Prisma schema + migration history contract...');
  runNode('scripts/database-schema-contract-patch36c1.cjs');

  console.log('\nDATABASE STABILIZATION: PASS');
}

main();
