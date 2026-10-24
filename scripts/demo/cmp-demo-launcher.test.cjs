'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const launcher = require('./cmp-demo-launcher.cjs');

test('DEMO SQL connection strings use the existing SQL port and only the isolated loopback users and database', () => {
  const url = launcher.buildDemoDatabaseUrl({ login: 'CMP_DEMO_APP', password: 'SafePassword_12345678901234567890' });
  assert.match(url, /^sqlserver:\/\/127\.0\.0\.1:1433;database=CTIC_CMP_DEMO_2026;user=CMP_DEMO_APP;/);
  assert.throws(() => launcher.buildDemoDatabaseUrl({ port: 14331, login: 'CMP_DEMO_APP', password: 'SafePassword_12345678901234567890' }), /Only the loopback CMP DEMO/);
  assert.throws(() => launcher.buildDemoDatabaseUrl({ database: 'CTIC_Certification', login: 'CMP_DEMO_APP', password: 'SafePassword_12345678901234567890' }), /Only the loopback CMP DEMO/);
  assert.throws(() => launcher.buildDemoDatabaseUrl({ login: 'thanvu_app', password: 'SafePassword_12345678901234567890' }), /Unexpected SQL login/);
  assert.throws(() => launcher.buildDemoDatabaseUrl({ login: 'CMP_DEMO_APP', password: 'bad;database=CTIC_Certification' }), /credential file is invalid/);
});

test('Gate A proof requires the verified backup marker for the DEMO database', () => {
  const proof = launcher.parseGateAProof('[2026-10-23] RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED database=CTIC_CMP_DEMO_2026 backup_path=E:\\SQL\\demo.bak');
  assert.equal(proof?.verified, true);
  assert.equal(proof?.database, 'CTIC_CMP_DEMO_2026');
  assert.equal(launcher.parseGateAProof('RESULT PENDING_EXISTING_DATABASE_REQUIRES_REVIEW'), null);
  assert.equal(launcher.parseGateAProof('RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED database=CTIC_Certification backup_path=x'), null);
});

test('launcher chooses the newest Gate A process start, even if an older parent log was written later', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-gate-proof-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const child = path.join(folder, 'CMP_GATE_A_child.log');
  const parent = path.join(folder, 'CMP_GATE_A_parent.log');
  fs.writeFileSync(child, '\uFEFF[2026-10-23T17:03:13.634+07:00] START mode=apply-requested pid=24568 windows_identity=Administrator elevated=True\n[2026-10-23T17:03:18.131+07:00] RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED database=CTIC_CMP_DEMO_2026 backup_path=x\n[2026-10-23T17:03:18.141+07:00] END');
  fs.writeFileSync(parent, '\uFEFF[2026-10-23T17:03:02.264+07:00] START mode=apply-requested pid=6900 elevated=False\n[2026-10-23T17:03:18.418+07:00] ELEVATED_PROCESS_EXIT code=0 pid=24568\n[2026-10-23T17:03:18.436+07:00] END');
  const now = Date.now() / 1000;
  fs.utimesSync(child, now - 10, now - 10);
  fs.utimesSync(parent, now, now);
  const proof = launcher.findGateAProof(folder);
  assert.equal(path.basename(proof.logPath), 'CMP_GATE_A_child.log');
  assert.equal(proof.verified, true);
});

test('launcher refuses the newest Gate A process when it did not verify its backup', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-gate-proof-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, 'CMP_GATE_A_older.log'), '\uFEFF[2026-10-23T17:00:00.000+07:00] START mode=apply-requested pid=1 elevated=True\n[2026-10-23T17:00:02.000+07:00] RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED database=CTIC_CMP_DEMO_2026 backup_path=x\n[2026-10-23T17:00:03.000+07:00] END');
  fs.writeFileSync(path.join(folder, 'CMP_GATE_A_newer.log'), '\uFEFF[2026-10-23T17:01:00.000+07:00] START mode=apply-requested pid=2 elevated=False\n[2026-10-23T17:01:01.000+07:00] RESULT FAILED_BEFORE_SQL_WRITE\n[2026-10-23T17:01:02.000+07:00] END');
  assert.throws(() => launcher.findGateAProof(folder), /newest Gate A process did not finish/);
});

test('SQL client uses the existing local endpoint without changing the SQL listener', () => {
  const output = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:1433           0.0.0.0:0              LISTENING       1234',
  ].join('\n');
  assert.deepEqual(launcher.assertLocalSqlEndpoint(1433, output), ['0.0.0.0:1433']);
  assert.throws(() => launcher.assertLocalSqlEndpoint(14331, output), /Only the existing SQLEXPRESS/);
  assert.throws(() => launcher.assertLocalSqlEndpoint(1433, output.replace('0.0.0.0:1433', '192.168.1.20:1433')), /local loopback endpoint/);
  assert.throws(() => launcher.assertLocalSqlEndpoint(1433, ''), /has no listener/);
});

test('runtime-only manifest guard requires the complete manifested DEMO setup', () => {
  const records = [
    { type: 'admin_user', id: 'admin-1', code: 'admin' },
    ...Array.from({ length: 8 }, (_, index) => ({ type: 'internal_user', id: `staff-${index + 1}`, code: `staff-${index + 1}` })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'customer', id: `customer-${index + 1}`, code: `customer-${index + 1}` })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'portal_user', id: `portal-${index + 1}`, code: `portal-${index + 1}`, dependencies: [{ type: 'customer', id: `customer-${index + 1}` }] })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'customer_portal_access', id: `access-${index + 1}`, dependencies: [{ type: 'customer', id: `customer-${index + 1}` }, { type: 'portal_user', id: `portal-${index + 1}` }] })),
    { type: 'certification_application', id: 'application-1', code: 'APP-2026-0001', dependencies: [{ type: 'customer', id: 'customer-1' }, { type: 'portal_user', id: 'portal-1' }] },
    { type: 'application_site', id: 'site-1', code: 'site-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] },
    { type: 'work_item', id: 'work-1', code: 'work-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] },
  ];
  const manifest = { schema: 'cmp-demo-workflow-manifest/v1', runId: 'CMP-DEMO-20261023-A', status: 'complete', cleanupPerformed: false, createdRecords: records };
  assert.equal(launcher.isCompleteManifest(manifest), true);
  assert.equal(launcher.countManifestRecords(manifest).customer, 20);
  assert.equal(launcher.isCompleteManifest({ ...manifest, status: 'running' }), false);
  assert.equal(launcher.isCompleteManifest({ ...manifest, runId: 'another-run' }), false);
  assert.equal(launcher.isCompleteManifest({ ...manifest, createdRecords: records.filter((record) => record.type !== 'work_item') }), false);
  assert.equal(launcher.isCompleteManifest({ ...manifest, cleanupPerformed: true }), false);
  assert.equal(launcher.isCompleteManifest({ ...manifest, createdRecords: [...records, records[0]] }), false);
});

function manifestedSqlRows(manifest) {
  const rows = {
    admin_user: [], internal_user: [], portal_user: [], customer: [], customer_portal_access: [],
    certification_application: [], application_site: [], work_item: [],
  };
  for (const record of manifest.createdRecords) {
    const deps = Object.fromEntries((record.dependencies ?? []).map((dependency) => [dependency.type, dependency.id]));
    const common = { id: record.id, ...(record.code ? { code: record.code } : {}) };
    if (record.type === 'customer') rows.customer.push({ ...common });
    else if (['admin_user', 'internal_user', 'portal_user'].includes(record.type)) rows[record.type].push({ ...common });
    else if (record.type === 'customer_portal_access') rows.customer_portal_access.push({ ...common, customer_id: deps.customer, user_id: deps.portal_user });
    else if (record.type === 'certification_application') rows.certification_application.push({ ...common, customer_id: deps.customer, status: 'accepted' });
    else if (record.type === 'application_site') rows.application_site.push({ ...common, application_id: deps.certification_application });
    else if (record.type === 'work_item') rows.work_item.push({ ...common, entity_id: deps.certification_application, status: 'DONE', assigned_role: 'TECHNICAL_REVIEWER' });
  }
  return rows;
}

test('read-only launcher verification accepts legitimate growth and progressed manifested records', () => {
  const records = [
    { type: 'admin_user', id: 'admin-1', code: 'admin' },
    ...Array.from({ length: 8 }, (_, index) => ({ type: 'internal_user', id: `staff-${index + 1}`, code: `staff-${index + 1}` })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'customer', id: `customer-${index + 1}`, code: `customer-${index + 1}` })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'portal_user', id: `portal-${index + 1}`, code: `portal-${index + 1}`, dependencies: [{ type: 'customer', id: `customer-${index + 1}` }] })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'customer_portal_access', id: `access-${index + 1}`, dependencies: [{ type: 'customer', id: `customer-${index + 1}` }, { type: 'portal_user', id: `portal-${index + 1}` }] })),
    { type: 'certification_application', id: 'application-1', code: 'APP-2026-0001', dependencies: [{ type: 'customer', id: 'customer-1' }, { type: 'portal_user', id: 'portal-1' }] },
    { type: 'application_site', id: 'site-1', code: 'site-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] },
    { type: 'work_item', id: 'work-1', code: 'work-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] },
  ];
  const manifest = { schema: 'cmp-demo-workflow-manifest/v1', runId: 'CMP-DEMO-20261023-A', status: 'complete', cleanupPerformed: false, createdRecords: records };
  const rows = manifestedSqlRows(manifest);
  rows.certification_application.push({ id: 'application-extra-1', code: 'APP-2026-0002', customer_id: 'customer-2', status: 'submitted' });
  for (let index = 0; index < 40; index += 1) rows.work_item.push({ id: `work-extra-${index + 1}`, code: `work-extra-${index + 1}`, entity_id: 'application-1', status: 'OPEN', assigned_role: 'COORDINATOR' });
  assert.equal(launcher.assertManifestRows(manifest, rows), true);
});

test('read-only launcher verification fails when an original manifest row is missing or relinked', () => {
  const records = [
    { type: 'customer', id: 'customer-1', code: 'customer-1' },
    { type: 'portal_user', id: 'portal-1', code: 'portal-1', dependencies: [{ type: 'customer', id: 'customer-1' }] },
    { type: 'customer_portal_access', id: 'access-1', dependencies: [{ type: 'customer', id: 'customer-1' }, { type: 'portal_user', id: 'portal-1' }] },
    { type: 'certification_application', id: 'application-1', code: 'APP-2026-0001', dependencies: [{ type: 'customer', id: 'customer-1' }, { type: 'portal_user', id: 'portal-1' }] },
    { type: 'application_site', id: 'site-1', code: 'site-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] },
    { type: 'work_item', id: 'work-1', code: 'work-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] },
  ];
  const manifest = { createdRecords: records };
  const rows = manifestedSqlRows(manifest);
  assert.throws(() => launcher.assertManifestRows(manifest, { ...rows, customer: [] }), /manifested customer record is missing/);
  const relinked = { ...rows, customer_portal_access: [{ ...rows.customer_portal_access[0], customer_id: 'customer-2' }] };
  assert.throws(() => launcher.assertManifestRows(manifest, relinked), /relationship/);
});

test('runtime service reuse is grounded by the actual listening PID', () => {
  const output = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    127.0.0.1:3100         0.0.0.0:0              LISTENING       4100',
  ].join('\n');
  assert.equal(launcher.findListeningPid(3100, output), 4100);
  assert.equal(launcher.findListeningPid(5174, output), null);
  assert.throws(() => launcher.findListeningPid(3100, `${output}\n  TCP    0.0.0.0:3100 0.0.0.0:0 LISTENING 5200`), /multiple listener processes/);
});

test('runtime marker is scoped to the verified database and URLs', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-runtime-marker-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const markerPath = path.join(folder, 'runtime.json');
  fs.writeFileSync(markerPath, JSON.stringify({
    schema: 'cmp-demo-runtime/v1',
    database: { name: 'CTIC_CMP_DEMO_2026', machine: 'CTIC-LP-054', instance: 'SQLEXPRESS' },
    urls: { backend: 'http://127.0.0.1:3100', frontend: 'http://127.0.0.1:5174' },
    backend: { pid: 4100 },
  }));
  const expected = { database: 'CTIC_CMP_DEMO_2026', machine: 'CTIC-LP-054', instance: 'SQLEXPRESS', backendUrl: 'http://127.0.0.1:3100', frontendUrl: 'http://127.0.0.1:5174' };
  assert.equal(launcher.readRuntimeMarker(markerPath, expected).backend.pid, 4100);
  assert.throws(() => launcher.readRuntimeMarker(markerPath, { ...expected, database: 'CTIC_Certification' }), /different database or URL/);
});

test('the DEMO command launchers explicitly request read-only runtime mode', () => {
  const rootLauncher = fs.readFileSync(path.resolve(__dirname, '../../CMP_DEMO_ONE_CLICK.cmd'), 'utf8');
  const demoLauncher = fs.readFileSync(path.join(__dirname, 'CMP_DEMO_ONE_CLICK.cmd'), 'utf8');
  assert.match(rootLauncher, /node "%LAUNCHER%" --runtime-only/);
  assert.match(demoLauncher, /cmp-demo-launcher\.cjs --runtime-only/);
});
