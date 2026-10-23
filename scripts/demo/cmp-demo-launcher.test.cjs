'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const launcher = require('./cmp-demo-launcher.cjs');

test('DEMO SQL connection strings accept only the isolated loopback users and database', () => {
  const url = launcher.buildDemoDatabaseUrl({ login: 'CMP_DEMO_APP', password: 'SafePassword_12345678901234567890' });
  assert.match(url, /^sqlserver:\/\/127\.0\.0\.1:14331;database=CTIC_CMP_DEMO_2026;user=CMP_DEMO_APP;/);
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

test('launcher refuses a stale Gate A PASS when a newer Gate A run failed', (context) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-gate-proof-'));
  context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const older = path.join(folder, 'CMP_GATE_A_older.log');
  const newer = path.join(folder, 'CMP_GATE_A_newer.log');
  fs.writeFileSync(older, 'RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED database=CTIC_CMP_DEMO_2026 backup_path=x');
  fs.writeFileSync(newer, 'RESULT PENDING_EXISTING_DATABASE_REQUIRES_REVIEW');
  const now = Date.now() / 1000;
  fs.utimesSync(older, now - 10, now - 10);
  fs.utimesSync(newer, now, now);
  assert.throws(() => launcher.findGateAProof(folder), /latest Gate A run did not finish/);
});

test('SQL listener validation allows only loopback interfaces', () => {
  const output = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    127.0.0.1:14331        0.0.0.0:0              LISTENING       1234',
  ].join('\n');
  assert.deepEqual(launcher.assertLoopbackListener(14331, output), ['127.0.0.1:14331']);
  assert.throws(() => launcher.assertLoopbackListener(14331, output.replace('127.0.0.1:14331', '0.0.0.0:14331')), /beyond loopback/);
  assert.throws(() => launcher.assertLoopbackListener(14331, ''), /has no listener/);
});
