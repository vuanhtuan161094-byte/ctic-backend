require('dotenv/config');

const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function run(command, args, label) {
  console.log(`\n>>> ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    console.error(`COMMERCIAL STABILIZATION: FAIL at ${label}`);
    process.exit(1);
  }
}

function runNode(script, label) {
  run(process.execPath, [path.join(ROOT, script)], label);
}

function runNpm(args, label) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npm, args, label);
}

function portIsOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function main() {
  console.log('===========================================================');
  console.log('PATCH 36C.1 - COMMERCIAL BASELINE & HARDENING');
  console.log('===========================================================');

  const port = Number(process.env.PORT || 3000);
  if (Number.isFinite(port) && port > 0 && (await portIsOpen('127.0.0.1', port))) {
    console.error(
      `COMMERCIAL STABILIZATION: FAIL - port ${port} đang được sử dụng. Dừng backend (Ctrl+C) trước khi migrate.`,
    );
    process.exit(1);
  }

  runNode('scripts/runtime-compatibility-check-patch36c0.cjs', 'Runtime compatibility check');
  runNode('scripts/database-stabilize-patch36c1.cjs', 'Database stabilization');
  runNpm(['run', 'build'], 'Backend full build');
  runNpm(['run', 'test:regression'], 'Full current regression suite');
  runNode('scripts/database-schema-contract-patch36c1.cjs', 'Final database contract');

  console.log('\n===========================================================');
  console.log('COMMERCIAL STABILIZATION: PASS');
  console.log('Database history, physical schema, Prisma Client, build and regressions are aligned.');
  console.log('===========================================================');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
