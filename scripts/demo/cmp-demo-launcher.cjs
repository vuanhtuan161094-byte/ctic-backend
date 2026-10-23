#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const CMP_ROOT = path.resolve(BACKEND_ROOT, '..');
const FRONTEND_ROOT = path.join(CMP_ROOT, 'frontend');
const DEFAULT_RUN_ID = 'CMP-DEMO-20261023-A';
const SQL_HOST = '127.0.0.1';
const SQL_PORT = 14331;
const API_HOST = '127.0.0.1';
const API_PORT = 3100;
const FRONTEND_HOST = '127.0.0.1';
const FRONTEND_PORT = 5174;
const DATABASE = 'CTIC_CMP_DEMO_2026';
const SERVER = 'CTIC-LP-054';
const INSTANCE = 'SQLEXPRESS';

function dataRoot(env = process.env) {
  return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'CMP', 'DEMO');
}

function parseGateAProof(logText) {
  const lines = String(logText).split(/\r?\n/);
  const line = lines.find((entry) => entry.includes('RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED') && entry.includes(`database=${DATABASE}`));
  if (!line || !line.includes('backup_path=')) return null;
  return { line, verified: true, database: DATABASE };
}

function findGateAProof(logDirectory) {
  if (!fs.existsSync(logDirectory)) throw new Error('Gate A log folder is missing; SQL bootstrap has not been evidenced.');
  const logs = fs.readdirSync(logDirectory)
    .filter((name) => /^CMP_GATE_A_.*\.log$/i.test(name))
    .map((name) => ({ path: path.join(logDirectory, name), modifiedAt: fs.statSync(path.join(logDirectory, name)).mtimeMs }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  const latest = logs[0];
  if (!latest) throw new Error('Gate A log folder is empty; SQL bootstrap has not been evidenced.');
  const proof = parseGateAProof(fs.readFileSync(latest.path, 'utf8'));
  if (!proof) throw new Error('The latest Gate A run did not finish with a verified backup for CTIC_CMP_DEMO_2026.');
  return { ...proof, logPath: latest.path };
}

function buildDemoDatabaseUrl({ host = SQL_HOST, port = SQL_PORT, database = DATABASE, login, password }) {
  if (host !== SQL_HOST || Number(port) !== SQL_PORT || database !== DATABASE) throw new Error('Only the loopback CMP DEMO SQL target is allowed.');
  if (!['CMP_DEMO_APP', 'CMP_DEMO_MIGRATOR'].includes(login)) throw new Error('Unexpected SQL login for the CMP DEMO environment.');
  if (typeof password !== 'string' || password.length < 32 || /[;{}\r\n]/.test(password)) throw new Error('The external SQL credential file is invalid.');
  return `sqlserver://${host}:${port};database=${database};user=${login};password=${password};encrypt=true;trustServerCertificate=true;connectionTimeout=15000;requestTimeout=120000`;
}

function loadSqlCredentials(filePath) {
  const resolvedPath = path.resolve(filePath);
  const repo = path.resolve(BACKEND_ROOT);
  const relative = path.relative(repo, resolvedPath);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
    throw new Error('SQL credentials must remain outside the Git repository.');
  }
  const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (credentials.schema !== 'cmp-demo-sql-credentials/v1' || credentials.appLogin !== 'CMP_DEMO_APP' || credentials.migratorLogin !== 'CMP_DEMO_MIGRATOR') {
    throw new Error('The protected SQL credential file is missing or does not match the DEMO logins.');
  }
  return {
    runtimeUrl: buildDemoDatabaseUrl({ login: credentials.appLogin, password: credentials.appPassword }),
    migrationUrl: buildDemoDatabaseUrl({ login: credentials.migratorLogin, password: credentials.migratorPassword }),
  };
}

function assertLoopbackListener(port, netstatOutput) {
  const lines = String(netstatOutput).split(/\r?\n/).filter((line) => line.trim().startsWith('TCP'));
  const listeners = lines.map((line) => line.trim().split(/\s+/)).filter((parts) => parts[3] === 'LISTENING' && parts[1].endsWith(`:${port}`)).map((parts) => parts[1]);
  if (!listeners.length) throw new Error(`SQL TCP port ${port} has no listener.`);
  if (listeners.some((endpoint) => !endpoint.startsWith('127.0.0.1:') && !endpoint.startsWith('[::1]:'))) {
    throw new Error(`SQL TCP port ${port} is listening beyond loopback; refusing to start the demo.`);
  }
  if (!listeners.some((endpoint) => endpoint === `127.0.0.1:${port}`)) throw new Error(`SQL TCP port ${port} is not listening on 127.0.0.1.`);
  return listeners;
}

function runNpm(args, cwd, env) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    execFileSync(command, args, { cwd, env, stdio: 'inherit', windowsHide: false, shell: process.platform === 'win32' });
  } catch (error) {
    throw new Error(`Command failed in ${path.basename(cwd)}: npm ${args.join(' ')}`);
  }
}

function startDetached(command, args, cwd, env, logPath) {
  const output = fs.openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', output, output],
    shell: process.platform === 'win32',
  });
  fs.closeSync(output);
  child.unref();
  return child;
}

async function waitFor(url, label, child, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`${label} stopped during startup; see its local log.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        return contentType.includes('application/json') ? await response.json() : true;
      }
    } catch {
      // Keep polling the local health endpoint until the startup window expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function verifySqlIdentity(connectionUrl) {
  const { PrismaMssql } = require('@prisma/adapter-mssql');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ adapter: new PrismaMssql(connectionUrl) });
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        DB_NAME() AS database_name,
        CONVERT(nvarchar(128), SERVERPROPERTY('MachineName')) AS sql_machine,
        CONVERT(nvarchar(128), SERVERPROPERTY('InstanceName')) AS sql_instance
    `;
    const identity = rows?.[0];
    if (identity?.database_name !== DATABASE || String(identity?.sql_machine).toUpperCase() !== SERVER || String(identity?.sql_instance).toUpperCase() !== INSTANCE) {
      throw new Error('Connected SQL identity is outside the approved CMP DEMO target.');
    }
    return identity;
  } finally {
    await prisma.$disconnect();
  }
}

function startBrowser(url) {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  const root = dataRoot();
  const demoArtifacts = path.join(CMP_ROOT, 'artifacts', 'demo');
  const sqlLogs = path.join(CMP_ROOT, 'artifacts', 'sql', 'gate-a');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(demoArtifacts, { recursive: true });
  const launcherLog = path.join(demoArtifacts, 'launcher.log');
  const log = (message) => fs.appendFileSync(launcherLog, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  const gateA = findGateAProof(sqlLogs);
  const sqlCredentialsPath = process.env.CMP_DEMO_SQL_CREDENTIALS_PATH || path.join(root, 'sql-credentials.json');
  const sql = loadSqlCredentials(sqlCredentialsPath);
  const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
  const listeners = assertLoopbackListener(SQL_PORT, netstat);
  log(`gate_a=PASS database=${DATABASE} log=${path.basename(gateA.logPath)}`);
  log(`sql_listener=PASS port=${SQL_PORT} interfaces=${listeners.join(',')}`);

  let identity;
  try {
    identity = await verifySqlIdentity(sql.migrationUrl);
  } catch {
    throw new Error('The dedicated SQL login could not verify the expected instance and database.');
  }
  log(`sql_identity=PASS database=${identity.database_name} machine=${identity.sql_machine} instance=${identity.sql_instance}`);

  const baseEnv = {
    ...process.env,
    DATABASE_URL: sql.runtimeUrl,
    MIGRATION_DATABASE_URL: sql.migrationUrl,
    CMP_DEMO_DATABASE: DATABASE,
    CMP_DEMO_SQL_SERVER: SERVER,
    CMP_DEMO_SQL_INSTANCE: INSTANCE,
    CMP_DEMO_GATE_A_VERIFIED: 'YES',
    STORAGE_ROOT: path.join(root, 'storage'),
  };
  log('migrations=START prisma migrate deploy against the verified isolated database');
  runNpm(['run', 'db:migrate:deploy'], BACKEND_ROOT, baseEnv);
  runNpm(['run', 'db:seed'], BACKEND_ROOT, { ...baseEnv, DATABASE_URL: sql.migrationUrl });
  log('migrations=PASS reference roles seeded');

  const apiUrl = `http://${API_HOST}:${API_PORT}`;
  const frontendUrl = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
  const frontendEnv = {
    ...baseEnv,
    PORT: String(API_PORT),
    HOST: API_HOST,
    PUBLIC_BASE_URL: apiUrl,
    PUBLIC_API_BASE_URL: apiUrl,
    FRONTEND_BASE_URL: frontendUrl,
    CORS_ORIGINS: frontendUrl,
    SWAGGER_ENABLED: 'true',
    CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED: 'true',
    CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN: require('node:crypto').randomBytes(32).toString('base64url'),
    CMP_DEMO_API_BASE_URL: apiUrl,
    CMP_DEMO_APPLY: 'YES',
  };
  const existingApi = await fetch(`${apiUrl}/health/live`, { signal: AbortSignal.timeout(1200) }).then((response) => response.ok).catch(() => false);
  if (existingApi) throw new Error(`Port ${API_PORT} is already serving an API; close it before starting CMP DEMO.`);
  const backendLog = path.join(demoArtifacts, 'backend.log');
  const backend = startDetached('npm.cmd', ['run', 'start:cmp'], BACKEND_ROOT, frontendEnv, backendLog);
  await waitFor(`${apiUrl}/health`, 'Backend', backend);
  log('backend=PASS health/readiness reports SQL and schema ready');

  const manifestPath = path.join(root, 'manifest.json');
  const credentialsPath = path.join(root, 'credentials.json');
  const runnerEnv = { ...frontendEnv, CMP_DEMO_SQL_CREDENTIALS_PATH: sqlCredentialsPath };
  const runnerPath = path.join(BACKEND_ROOT, 'scripts', 'demo', 'cmp-workflow-runner.cjs');
  try {
    const runnerOutput = execFileSync(process.execPath, [runnerPath, '--apply', '--run-id', DEFAULT_RUN_ID, '--manifest', manifestPath, '--credentials', credentialsPath], {
      cwd: BACKEND_ROOT,
      env: runnerEnv,
      encoding: 'utf8',
      windowsHide: true,
    });
    process.stdout.write(runnerOutput);
    const workflowResult = JSON.parse(runnerOutput.trim());
    if (!['complete', 'already-complete'].includes(workflowResult.status)) throw new Error(`Workflow is ${workflowResult.status}; no PASS will be reported.`);
  } catch {
    throw new Error('Real API onboarding did not complete; see the protected workflow log and manifest.');
  }
  log('workflow=PASS API runner completed; check manifest status for application and tenant checks');

  const frontendLog = path.join(demoArtifacts, 'frontend.log');
  const frontend = startDetached('npm.cmd', ['run', 'dev', '--', '--host', FRONTEND_HOST, '--port', String(FRONTEND_PORT), '--strictPort'], FRONTEND_ROOT, {
    ...process.env,
    VITE_API_BASE_URL: apiUrl,
    VITE_PUBLIC_API_BASE_URL: apiUrl,
    VITE_DEPLOYMENT_TARGET: 'development',
  }, frontendLog);
  await waitFor(frontendUrl, 'Frontend', frontend);
  log('frontend=PASS Vite responded on the loopback demo port');
  startBrowser(frontendUrl);

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  process.stdout.write([
    'CMP DEMO đã sẵn sàng.',
    `Giao diện: ${frontendUrl}`,
    `Tài khoản quản trị: ${credentials.admin.username}`,
    `Mật khẩu được lưu trong tệp bảo vệ ACL: ${credentialsPath}`,
    `Manifest và log: ${root} và ${demoArtifacts}`,
  ].join('\n') + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[CMP DEMO] ${error instanceof Error ? error.message : 'Startup failed.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { assertLoopbackListener, buildDemoDatabaseUrl, dataRoot, findGateAProof, parseGateAProof };
