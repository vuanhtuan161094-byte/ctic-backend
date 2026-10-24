#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const CMP_ROOT = path.resolve(BACKEND_ROOT, '..');
const FRONTEND_ROOT = path.join(CMP_ROOT, 'frontend');
const DEFAULT_RUN_ID = 'CMP-DEMO-20261023-A';
const SQL_HOST = '127.0.0.1';
const SQL_PORT = 1433;
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
    .map((name) => {
      const logPath = path.join(logDirectory, name);
      const logText = fs.readFileSync(logPath, 'utf8');
      const starts = [...logText.matchAll(/^\uFEFF?\[([^\]]+)\]\s+START mode=apply-requested\b/gm)]
        .map((match) => ({ startedAt: Date.parse(match[1]), line: match[0] }))
        .filter((entry) => Number.isFinite(entry.startedAt));
      return starts.map((entry) => ({ ...entry, path: logPath, logText }));
    })
    .flat()
    .sort((left, right) => right.startedAt - left.startedAt);
  const latest = logs[0];
  if (!latest) throw new Error('Gate A log folder has no apply run; SQL bootstrap has not been evidenced.');
  const proof = parseGateAProof(latest.logText);
  if (!proof) throw new Error('The newest Gate A process did not finish with a verified backup for CTIC_CMP_DEMO_2026.');
  if (!latest.logText.includes(' END')) throw new Error('The newest Gate A process did not close cleanly after verification.');
  return { ...proof, logPath: latest.path, startedAt: new Date(latest.startedAt).toISOString() };
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
  if (credentials.schema !== 'cmp-demo-sql-credentials/v1' || credentials.appLogin !== 'CMP_DEMO_APP') {
    throw new Error('The protected SQL credential file is missing or does not match the DEMO application login.');
  }
  return buildDemoDatabaseUrl({ login: credentials.appLogin, password: credentials.appPassword });
}

function assertLocalSqlEndpoint(port, netstatOutput) {
  if (Number(port) !== SQL_PORT) throw new Error(`Only the existing SQLEXPRESS TCP port ${SQL_PORT} is allowed.`);
  const lines = String(netstatOutput).split(/\r?\n/).filter((line) => line.trim().startsWith('TCP'));
  const listeners = lines.map((line) => line.trim().split(/\s+/)).filter((parts) => parts[3] === 'LISTENING' && parts[1].endsWith(`:${port}`)).map((parts) => parts[1]);
  if (!listeners.length) throw new Error(`SQL TCP port ${port} has no listener.`);
  const localOrWildcard = listeners.some((endpoint) => endpoint === `127.0.0.1:${port}` || endpoint === `0.0.0.0:${port}` || endpoint === `[::]:${port}` || endpoint === `[::1]:${port}`);
  if (!localOrWildcard) throw new Error(`SQL TCP port ${port} has no listener reachable through the local loopback endpoint.`);
  return listeners;
}

function countManifestRecords(manifest) {
  if (!Array.isArray(manifest?.createdRecords)) return {};
  return manifest.createdRecords.reduce((counts, record) => {
    if (typeof record?.type === 'string') counts[record.type] = (counts[record.type] ?? 0) + 1;
    return counts;
  }, {});
}

function isCompleteManifest(manifest, runId = DEFAULT_RUN_ID) {
  if (manifest?.schema !== 'cmp-demo-workflow-manifest/v1' || manifest.runId !== runId || manifest.status !== 'complete' || manifest.cleanupPerformed !== false) return false;
  const counts = countManifestRecords(manifest);
  return counts.admin_user === 1
    && counts.internal_user === 8
    && counts.customer === 20
    && counts.portal_user === 20
    && counts.customer_portal_access === 20
    && counts.certification_application === 1
    && counts.application_site === 1
    && counts.work_item === 1;
}

function findListeningPid(port, netstatOutput) {
  const lines = String(netstatOutput).split(/\r?\n/).filter((line) => line.trim().startsWith('TCP'));
  const pids = [...new Set(lines.map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[3] === 'LISTENING' && parts[1].endsWith(`:${port}`))
    .map((parts) => Number(parts[4])).filter(Number.isInteger))];
  if (pids.length > 1) throw new Error(`Port ${port} has multiple listener processes; refusing to start CMP DEMO.`);
  return pids[0] ?? null;
}

function readRuntimeMarker(filePath, expected) {
  if (!fs.existsSync(filePath)) return null;
  let marker;
  try { marker = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { throw new Error('The local runtime marker is invalid; verify the process and marker before restarting.'); }
  if (marker.schema !== 'cmp-demo-runtime/v1'
    || marker.database?.name !== expected.database
    || marker.database?.machine !== expected.machine
    || marker.database?.instance !== expected.instance
    || marker.urls?.backend !== expected.backendUrl
    || marker.urls?.frontend !== expected.frontendUrl) {
    throw new Error('The local runtime marker targets a different database or URL; refusing to reuse services.');
  }
  return marker;
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
    shell: false,
  });
  fs.closeSync(output);
  child.once('error', (error) => {
    child.startupError = error;
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] process_start_error type=${error.name} code=${error.code ?? 'unknown'}\n`, 'utf8');
  });
  child.once('exit', (code, signal) => {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] process_exit code=${code ?? 'null'} signal=${signal ?? 'none'}\n`, 'utf8');
  });
  child.unref();
  return child;
}

async function waitFor(url, label, child, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.startupError) throw new Error(`${label} could not be started; see its local log.`);
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
  if (child.exitCode === null && !child.killed) child.kill();
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

async function verifyDemoData(connectionUrl, manifest) {
  const { PrismaMssql } = require('@prisma/adapter-mssql');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ adapter: new PrismaMssql(connectionUrl) });
  try {
    const counts = (await prisma.$queryRaw`
      SELECT
        (SELECT COUNT_BIG(*) FROM customers) AS customers,
        (SELECT COUNT_BIG(*) FROM customer_user_access) AS portal_access,
        (SELECT COUNT_BIG(*) FROM users) AS users,
        (SELECT COUNT_BIG(*) FROM certification_applications) AS applications,
        (SELECT COUNT_BIG(*) FROM work_items) AS work_items,
        (SELECT COUNT_BIG(*) FROM audit_logs) AS audit_logs
    `)[0];
    const app = (await prisma.$queryRaw`
      SELECT id, application_code, status FROM certification_applications WHERE application_code='APP-2026-0001'
    `)[0];
    if (!app) throw new Error('The manifested application is missing from SQL DEMO.');
    const work = (await prisma.$queryRaw`
      SELECT status, assigned_role FROM work_items WHERE entity_id=${app.id}
    `)[0];
    const manifestCounts = countManifestRecords(manifest);
    const count = (value) => Number(value);
    if (count(counts.customers) !== manifestCounts.customer
      || count(counts.portal_access) !== manifestCounts.customer_portal_access
      || count(counts.users) !== 29 || count(counts.applications) !== 1
      || count(counts.work_items) !== 1 || count(counts.audit_logs) < 1
      || app.status !== 'submitted' || work?.status !== 'OPEN' || work?.assigned_role !== 'COORDINATOR') {
      throw new Error('Read-only SQL counts or workflow status do not match the completed DEMO manifest.');
    }
    return {
      customers: count(counts.customers), portalAccess: count(counts.portal_access), users: count(counts.users),
      applications: count(counts.applications), workItems: count(counts.work_items), auditLogs: count(counts.audit_logs),
      applicationCode: app.application_code, applicationStatus: app.status, intakeStatus: work.status, assignedRole: work.assigned_role,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}

async function startOrReuse({ name, port, probeUrl, readyUrl, command, args, cwd, env, logPath, marker, netstatOutput, readiness = false }) {
  const pid = findListeningPid(port, netstatOutput);
  const existing = await probe(probeUrl);
  if (pid !== null) {
    if (!existing.ok || marker?.[name]?.pid !== pid) throw new Error(`Port ${port} is in use by a service that this DEMO launcher cannot verify; it was left untouched.`);
    if (readiness) {
      const ready = await fetch(readyUrl, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!ready?.ok) throw new Error(`${name} is running but the database readiness check failed; it was left untouched.`);
    }
    return { pid, reused: true };
  }
  if (existing.ok) throw new Error(`${name} responded without a matching local listener; refusing to start a duplicate.`);
  const child = startDetached(command, args, cwd, env, logPath);
  await waitFor(readyUrl, name, child, name === 'backend' ? 120000 : 60000);
  return { pid: child.pid, reused: false };
}

function writeRuntimeMarker(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  fs.renameSync(temporary, filePath);
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
  if (!process.argv.includes('--runtime-only')) throw new Error('This launcher is read-only. Start it with --runtime-only; onboarding writes are disabled.');
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
  const listeners = assertLocalSqlEndpoint(SQL_PORT, netstat);
  log(`gate_a=PASS database=${DATABASE} log=${path.basename(gateA.logPath)}`);
  log(`sql_local_endpoint=PASS host=${SQL_HOST} port=${SQL_PORT} listener=${listeners.join(',')}`);

  let identity;
  try {
    identity = await verifySqlIdentity(sql);
  } catch {
    throw new Error('The dedicated SQL login could not verify the expected instance and database.');
  }
  log(`sql_identity=PASS database=${identity.database_name} machine=${identity.sql_machine} instance=${identity.sql_instance}`);

  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!isCompleteManifest(manifest)) throw new Error('The protected DEMO manifest is not complete; runtime-only startup will not create or repair data.');
  let dataSummary;
  try { dataSummary = await verifyDemoData(sql, manifest); }
  catch (error) { throw new Error(`Read-only DEMO data verification failed (${error?.code ?? error?.name ?? 'unknown'}); inspect the protected local log.`); }
  log(`demo_data=PASS customers=${dataSummary.customers} portal_access=${dataSummary.portalAccess} users=${dataSummary.users} applications=${dataSummary.applications} work_items=${dataSummary.workItems} audit_logs=${dataSummary.auditLogs} application=${dataSummary.applicationCode}:${dataSummary.applicationStatus} intake=${dataSummary.intakeStatus}:${dataSummary.assignedRole}`);

  const baseEnv = {
    ...process.env,
    DATABASE_URL: sql,
    CMP_DEMO_DATABASE: DATABASE,
    CMP_DEMO_SQL_SERVER: SERVER,
    CMP_DEMO_SQL_INSTANCE: INSTANCE,
    CMP_DEMO_GATE_A_VERIFIED: 'YES',
    STORAGE_ROOT: path.join(root, 'storage'),
    CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED: 'false',
  };
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
  };
  delete frontendEnv.MIGRATION_DATABASE_URL;
  delete frontendEnv.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN;
  const nestCli = path.join(BACKEND_ROOT, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
  if (!fs.existsSync(nestCli)) throw new Error('The local Nest CLI entrypoint is missing; install backend dependencies.');
  const backendLog = path.join(demoArtifacts, 'backend.log');
  const frontendLog = path.join(demoArtifacts, 'frontend.log');
  const viteCli = path.join(FRONTEND_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteCli)) throw new Error('The local Vite entrypoint is missing; install frontend dependencies.');
  const runtimeMarkerPath = path.join(root, 'runtime.json');
  const expected = {
    database: DATABASE,
    machine: identity.sql_machine,
    instance: identity.sql_instance,
    backendUrl: apiUrl,
    frontendUrl,
  };
  const marker = readRuntimeMarker(runtimeMarkerPath, expected);
  const expectedMarker = {
    schema: 'cmp-demo-runtime/v1',
    database: { name: DATABASE, machine: identity.sql_machine, instance: identity.sql_instance },
    urls: { backend: apiUrl, frontend: frontendUrl },
  };
  const backend = await startOrReuse({
    name: 'backend', port: API_PORT, probeUrl: `${apiUrl}/health/live`, readyUrl: `${apiUrl}/health`,
    command: process.execPath,
    args: [nestCli, 'start', '--config', 'nest-cli.cmp-launcher.json', '--path', 'tsconfig.cmp-launcher.json'],
    cwd: BACKEND_ROOT, env: frontendEnv, logPath: backendLog, marker, netstatOutput: netstat, readiness: true,
  });
  log(`backend=${backend.reused ? 'REUSE' : 'PASS'} pid=${backend.pid} readiness=ready`);
  writeRuntimeMarker(runtimeMarkerPath, {
    ...expectedMarker,
    backend: { pid: backend.pid, startedAt: backend.reused ? marker.backend.startedAt : new Date().toISOString() },
    ...(marker?.frontend ? { frontend: marker.frontend } : {}),
  });

  const frontendNetstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
  const frontend = await startOrReuse({
    name: 'frontend', port: FRONTEND_PORT, probeUrl: frontendUrl, readyUrl: frontendUrl,
    command: process.execPath,
    args: [viteCli, '--config', 'vite.ctic.config.ts', '--host', FRONTEND_HOST, '--port', String(FRONTEND_PORT), '--strictPort'],
    cwd: FRONTEND_ROOT,
    env: { ...process.env, VITE_API_BASE_URL: apiUrl, VITE_PUBLIC_API_BASE_URL: apiUrl, VITE_DEPLOYMENT_TARGET: 'development' },
    logPath: frontendLog, marker, netstatOutput: frontendNetstat,
  });
  log(`frontend=${frontend.reused ? 'REUSE' : 'PASS'} pid=${frontend.pid} url=${frontendUrl}`);
  writeRuntimeMarker(runtimeMarkerPath, {
    ...expectedMarker,
    backend: { pid: backend.pid, startedAt: backend.reused ? marker.backend.startedAt : new Date().toISOString() },
    frontend: { pid: frontend.pid, startedAt: frontend.reused ? marker.frontend.startedAt : new Date().toISOString() },
  });

  if (process.env.CMP_DEMO_NO_OPEN !== '1') startBrowser(frontendUrl);

  const credentialsPath = path.join(root, 'credentials.json');
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  process.stdout.write([
    'CMP DEMO runtime-only đã sẵn sàng; không tạo hoặc sửa dữ liệu.',
    `Giao diện: ${frontendUrl}`,
    `Tài khoản quản trị DEMO: ${credentials.admin.username}`,
    `Backend: ${apiUrl} (${backend.reused ? 'đã dùng tiến trình hiện có' : `PID ${backend.pid}`})`,
    `Frontend: ${frontendUrl} (${frontend.reused ? 'đã dùng tiến trình hiện có' : `PID ${frontend.pid}`})`,
    `SQL xác minh chỉ đọc: ${dataSummary.customers} khách hàng, ${dataSummary.portalAccess} Portal, ${dataSummary.applicationCode} (${dataSummary.applicationStatus}).`,
    `Manifest và log: ${root} và ${demoArtifacts}`,
  ].join('\n') + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[CMP DEMO] ${error instanceof Error ? error.message : 'Startup failed.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { assertLocalSqlEndpoint, buildDemoDatabaseUrl, countManifestRecords, dataRoot, findGateAProof, findListeningPid, isCompleteManifest, loadSqlCredentials, parseGateAProof, readRuntimeMarker, writeRuntimeMarker };
