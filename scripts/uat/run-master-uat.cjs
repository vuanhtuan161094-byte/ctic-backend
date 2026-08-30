const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(backend, '..');
const frontendCandidates = [
  path.join(projectRoot, 'ctic-frontend'),
  path.join(projectRoot, 'frontend'),
  path.join(path.dirname(projectRoot), 'ctic-frontend'),
];
const frontend = frontendCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
const skipP09 = process.argv.includes('--skip-p09');
const startedAt = new Date();
const results = [];

function fail(message) {
  throw new Error(`[MASTER UAT] ${message}`);
}

if (!frontend) fail('Không tìm thấy ctic-frontend cạnh ctic-backend.');
if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
  fail('UAT runner từ chối NODE_ENV=production.');
}

function run(command, args, cwd, env = process.env) {
  const label = `${path.basename(cwd)} :: ${command} ${args.join(' ')}`;
  console.log(`\n===== ${label} =====`);
  const start = Date.now();
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
  const item = { label, status: result.status ?? 1, duration_ms: Date.now() - start };
  results.push(item);
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${label} exited with ${result.status}.`);
}

function runNpm(args, cwd, env = process.env) {
  const npmCli = String(process.env.npm_execpath || '').trim();
  if (npmCli) {
    run(process.execPath, [npmCli, ...args], cwd, env);
    return;
  }
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, env);
}

function writeReport(finalStatus, errorMessage = null) {
  const outputDir = path.join(backend, 'uat-results');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const report = {
    uat_version: 'MASTER-UAT-RC1-GATE-2026-08-25',
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    status: finalStatus,
    feature_freeze: true,
    p09_executed: !skipP09,
    error: errorMessage,
    steps: results,
  };
  const jsonPath = path.join(outputDir, `master-uat-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nUAT machine report: ${jsonPath}`);
}

try {
  console.log('=== CMP MASTER FULL-SYSTEM UAT / RC1 AUTOMATED GATE ===');
  console.log('Feature freeze: ON');
  console.log(`Backend:  ${backend}`);
  console.log(`Frontend: ${frontend}`);

  runNpm(['run', 'test:regression'], backend);
  runNpm(['run', 'build'], backend);
  runNpm(['test', '--', '--runInBand'], backend);
  runNpm(['test'], frontend);
  runNpm(['run', 'lint'], frontend);

  if (!skipP09) {
    const p09Env = {
      ...process.env,
      P09_CREATE_LOCAL_TEST_DATABASE:
        process.env.P09_CREATE_LOCAL_TEST_DATABASE || 'I_UNDERSTAND_THIS_IS_A_LOCAL_TEST_DATABASE',
    };
    runNpm(['run', 'test:e2e:p09'], backend, p09Env);
  }

  writeReport('PASS');
  console.log('\nMASTER UAT AUTOMATED GATE: PASS');
  console.log('Next gate: execute docs/uat/MASTER_UAT_PLAN.md manually and record defects.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeReport('FAIL', message);
  console.error(`\nMASTER UAT AUTOMATED GATE: FAIL\n${message}`);
  process.exitCode = 1;
}
