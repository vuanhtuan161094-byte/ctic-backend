'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const seed = require('./cmp-demo-seed.cjs');

test('demo customers use a bounded synthetic namespace and no tax identifiers', () => {
  const customers = seed.buildDemoCustomers();
  assert.equal(customers.length, 20);
  assert.equal(new Set(customers.map((customer) => customer.customer_code)).size, 20);
  assert.ok(customers.every((customer) => customer.customer_code.length <= 20));
  assert.ok(customers.every((customer) => customer.email.endsWith('@example.invalid')));
  assert.ok(customers.every((customer) => customer.tax_code === null));
});

test('dry run has no database connection or writes', () => {
  assert.deepEqual(seed.preview(), {
    mode: 'dry-run',
    databaseConnection: 'none',
    databaseWrites: 0,
    databaseCreatedOrMigrated: false,
    customers: 20,
    customerCodeRange: ['DEMO-CMP-001', 'DEMO-CMP-020'],
    emailsUseReservedDomain: true,
    taxIdentifiers: 0,
    workflowRecordsWritten: 0,
    certificatesWritten: 0,
  });
});

test('database target parser allows only loopback demo databases', () => {
  assert.deepEqual(seed.databaseTargetFromUrl('sqlserver://localhost:1433;database=CTIC_CMP_DEMO_2026;encrypt=true'), {
    host: 'localhost',
    database: 'CTIC_CMP_DEMO_2026',
  });
  assert.throws(() => seed.databaseTargetFromUrl('sqlserver://host.example.invalid;database=CTIC_CMP_DEMO_2026'), /loopback/);
  assert.throws(() => seed.databaseTargetFromUrl('sqlserver://localhost;database=CTIC_Certification'), /production-like/);
  assert.throws(() => seed.databaseTargetFromUrl('sqlserver://localhost;database=CTIC_CMP_PRODUCTION'), /production-like/);
  assert.throws(() => seed.databaseTargetFromUrl('sqlserver://localhost;database=OtherDb'), /CTIC_CMP_DEMO/);
});

test('namespace validation refuses an existing non-demo customer collision', () => {
  const customers = seed.buildDemoCustomers();
  assert.doesNotThrow(() => seed.validateDemoNamespace([customers[0]], customers));
  assert.throws(() => seed.validateDemoNamespace([{
    customer_code: customers[0].customer_code,
    company_name: 'A real customer',
    email: 'person@example.com',
  }], customers), /outside the owned demo namespace/);
});

test('apply refuses to run without an explicit secure environment file', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'cmp-demo-seed.cjs'), '--apply'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit --env-file outside the repository/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret|password=|DATABASE_URL=/i);
});
