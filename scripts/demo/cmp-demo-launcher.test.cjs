'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const launcher = require('./cmp-demo-launcher.cjs');
const workflowRunner = require('./cmp-workflow-runner.cjs');

function createFullRunnerManifest() {
  const manifest = workflowRunner.newManifest('CMP-DEMO-20261023-A');
  const append = (record) => workflowRunner.appendRecord(manifest, record);
  append({ type: 'admin_user', id: 'admin-1', code: 'admin' });
  append({ type: 'certification_scheme', id: 'scheme-1', code: 'QMS' });
  append({ type: 'standard_edition', id: 'edition-1', code: 'ISO 9001:2026', dependencies: [{ type: 'certification_scheme', id: 'scheme-1' }] });
  append({ type: 'scheme_configuration', id: 'configuration-1', code: 'QMS-v1', dependencies: [{ type: 'certification_scheme', id: 'scheme-1' }, { type: 'standard_edition', id: 'edition-1' }] });
  for (let index = 1; index <= 8; index += 1) append({ type: 'internal_user', id: `staff-${index}`, code: `staff-${index}` });
  for (let index = 1; index <= 20; index += 1) append({ type: 'customer', id: `customer-${index}`, code: `customer-${index}` });
  for (let index = 1; index <= 20; index += 1) {
    append({ type: 'portal_user', id: `portal-${index}`, code: `portal-${index}@example.invalid`, dependencies: [{ type: 'customer', id: `customer-${index}` }] });
    append({ type: 'customer_portal_access', id: `access-${index}`, dependencies: [{ type: 'customer', id: `customer-${index}` }, { type: 'portal_user', id: `portal-${index}` }] });
  }
  append({ type: 'certification_application', id: 'application-1', code: 'APP-2026-0001', dependencies: [{ type: 'customer', id: 'customer-1' }, { type: 'portal_user', id: 'portal-1' }] });
  append({ type: 'application_site', id: 'site-1', code: 'site-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] });
  append({ type: 'work_item', id: 'work-1', code: 'APP:application-1', dependencies: [{ type: 'certification_application', id: 'application-1' }] });
  manifest.status = 'complete';
  return manifest;
}

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
  const manifest = createFullRunnerManifest();
  const records = manifest.createdRecords;
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
    certification_scheme: [], standard_edition: [], scheme_configuration: [],
    certification_application: [], application_site: [], work_item: [],
  };
  for (const record of manifest.createdRecords) {
    const deps = Object.fromEntries((record.dependencies ?? []).map((dependency) => [dependency.type, dependency.id]));
    const common = { id: record.id, ...(record.code ? { code: record.code } : {}) };
    if (record.type === 'customer') rows.customer.push({ ...common });
    else if (['admin_user', 'internal_user', 'portal_user'].includes(record.type)) rows[record.type].push({ ...common });
    else if (record.type === 'certification_scheme') rows.certification_scheme.push({ ...common });
    else if (record.type === 'standard_edition') rows.standard_edition.push({ ...common, scheme_id: deps.certification_scheme, edition: record.code.slice(record.code.lastIndexOf(':') + 1) });
    else if (record.type === 'scheme_configuration') rows.scheme_configuration.push({ ...common, scheme_id: deps.certification_scheme, version_no: Number(record.code.match(/-v(\d+)$/)?.[1]) });
    else if (record.type === 'customer_portal_access') rows.customer_portal_access.push({ ...common, customer_id: deps.customer, user_id: deps.portal_user });
    else if (record.type === 'certification_application') rows.certification_application.push({ ...common, customer_id: deps.customer, status: 'accepted' });
    else if (record.type === 'application_site') rows.application_site.push({ ...common, application_id: deps.certification_application });
    else if (record.type === 'work_item') rows.work_item.push({ ...common, entity_id: deps.certification_application, status: 'DONE', assigned_role: 'TECHNICAL_REVIEWER' });
  }
  return rows;
}

function createReadOnlyPrisma(manifest, tableOverrides = {}) {
  const sqlRows = manifestedSqlRows(manifest);
  const rows = {
    users: manifest.createdRecords.filter((record) => ['admin_user', 'internal_user', 'portal_user'].includes(record.type)).map((record) => ({
      id: record.id,
      username: record.type === 'portal_user' ? `login-${record.id}` : record.code,
      email: record.type === 'portal_user' ? record.code : null,
    })),
    customers: sqlRows.customer.map((row) => ({ id: row.id, customer_code: row.code })),
    customer_user_access: sqlRows.customer_portal_access,
    certification_schemes: sqlRows.certification_scheme.map((row) => ({ id: row.id, code: row.code })),
    standard_editions: sqlRows.standard_edition.map((row) => ({
      id: row.id, scheme_id: row.scheme_id, standard_code: row.code, edition: row.code.slice(row.code.lastIndexOf(':') + 1),
    })),
    scheme_configuration_versions: sqlRows.scheme_configuration.map(({ id, scheme_id, version_no }) => ({ id, scheme_id, version_no })),
    certification_applications: sqlRows.certification_application.map((row) => ({ id: row.id, application_code: row.code, customer_id: row.customer_id, status: row.status })),
    certification_application_sites: sqlRows.application_site.map((row) => ({ id: row.id, application_id: row.application_id, site_no: 1 })),
    work_items: sqlRows.work_item.map((row) => ({ id: row.id, source_key: row.code, entity_id: row.entity_id, status: row.status, assigned_role: row.assigned_role })),
  };
  Object.assign(rows, tableOverrides);
  const calls = [];
  const delegate = (name) => ({
    findMany: async ({ where, select }) => {
      calls.push({ name, ids: where.id.in, select });
      return rows[name].filter((row) => where.id.in.includes(row.id)).map((row) => Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]])));
    },
  });
  return {
    calls,
    prisma: {
      $queryRaw: async () => [{ customers: 20, portal_access: 20, users: 49, applications: 1, work_items: 1, audit_logs: 1 }],
      users: delegate('users'),
      customers: delegate('customers'),
      customer_user_access: delegate('customer_user_access'),
      certification_schemes: delegate('certification_schemes'),
      standard_editions: delegate('standard_editions'),
      scheme_configuration_versions: delegate('scheme_configuration_versions'),
      certification_applications: delegate('certification_applications'),
      certification_application_sites: delegate('certification_application_sites'),
      work_items: delegate('work_items'),
    },
  };
}

test('read-only launcher verification accepts legitimate growth and progressed manifested records', () => {
  const manifest = createFullRunnerManifest();
  const records = manifest.createdRecords;
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

test('read-only verification queries and validates every record type emitted by the workflow runner', async () => {
  const manifest = createFullRunnerManifest();
  assert.equal(launcher.isCompleteManifest(manifest), true);
  const { prisma, calls } = createReadOnlyPrisma(manifest);
  const result = await launcher.verifyDemoDataWithClient(prisma, manifest);
  assert.equal(result.manifestedCustomers, 20);
  assert.equal(result.applicationCode, 'APP-2026-0001');
  for (const [name, type] of [
    ['certification_schemes', 'certification_scheme'], ['standard_editions', 'standard_edition'],
    ['scheme_configuration_versions', 'scheme_configuration'],
  ]) {
    const call = calls.find((item) => item.name === name);
    assert.deepEqual(call.ids, manifest.createdRecords.filter((record) => record.type === type).map((record) => record.id));
  }
});

test('read-only verification rejects missing configuration rows and inconsistent scheme relationships', () => {
  const manifest = createFullRunnerManifest();
  const rows = manifestedSqlRows(manifest);
  for (const type of ['certification_scheme', 'standard_edition', 'scheme_configuration']) {
    assert.throws(() => launcher.assertManifestRows(manifest, { ...rows, [type]: [] }), new RegExp(`manifested ${type} record is missing`));
  }
  const inconsistent = {
    ...rows,
    scheme_configuration: rows.scheme_configuration.map((row) => ({ ...row, scheme_id: 'another-scheme' })),
  };
  assert.throws(
    () => launcher.assertManifestRows(manifest, inconsistent),
    (error) => error.verification?.category === 'configuration_scheme_mismatch',
  );
  const badEditionForeignKey = {
    ...rows,
    scheme_configuration: rows.scheme_configuration.map((row) => ({ ...row, scheme_id: 'another-scheme' })),
    standard_edition: rows.standard_edition.map((row) => ({ ...row, scheme_id: 'another-scheme' })),
  };
  assert.throws(
    () => launcher.assertManifestRows(manifest, badEditionForeignKey),
    (error) => error.verification?.category === 'relationship_mismatch',
  );
});

test('read-only query checks the actual standard edition and configuration versions', async () => {
  const manifest = createFullRunnerManifest();
  const standardRows = manifestedSqlRows(manifest).standard_edition.map((row) => ({
    id: row.id, scheme_id: row.scheme_id, standard_code: row.code, edition: '2025',
  }));
  const mismatchedEditionClient = createReadOnlyPrisma(manifest, { standard_editions: standardRows });
  await assert.rejects(
    launcher.verifyDemoDataWithClient(mismatchedEditionClient.prisma, manifest),
    (error) => error.verification?.category === 'manifest_identity_mismatch' && error.verification.recordType === 'standard_edition',
  );

  const configurationRows = manifestedSqlRows(manifest).scheme_configuration.map(({ id, scheme_id }) => ({ id, scheme_id, version_no: 2 }));
  const mismatchedConfigurationClient = createReadOnlyPrisma(manifest, { scheme_configuration_versions: configurationRows });
  await assert.rejects(
    launcher.verifyDemoDataWithClient(mismatchedConfigurationClient.prisma, manifest),
    (error) => error.verification?.category === 'manifest_identity_mismatch' && error.verification.recordType === 'scheme_configuration',
  );
});

test('launcher diagnostics keep failure categories while excluding raw exception contents', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-demo-diagnostics-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const logPath = path.join(folder, 'launcher-diagnostics.log');
  const sensitive = new Error('sqlserver://demo:NeverLogThis@127.0.0.1;password=NeverLogThis');
  sensitive.code = 'P2021';
  sensitive.verification = { phase: 'row_read', category: 'database_read_error', recordType: 'scheme_configuration' };
  launcher.appendVerificationDiagnostic(logPath, sensitive);
  const log = fs.readFileSync(logPath, 'utf8');
  assert.match(log, /"phase":"row_read"/);
  assert.match(log, /"category":"database_read_error"/);
  assert.match(log, /"recordType":"scheme_configuration"/);
  assert.match(log, /"prismaCode":"P2021"/);
  assert.doesNotMatch(log, /NeverLogThis|sqlserver:\/\//);
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
