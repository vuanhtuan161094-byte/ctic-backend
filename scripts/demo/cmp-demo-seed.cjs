#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SANDBOX_DATABASE_PATTERN = /^CTIC_CMP_DEMO_\d{4}$/i;

function buildDemoCustomers() {
  return Array.from({ length: 20 }, (_, index) => {
    const sequence = String(index + 1).padStart(3, '0');
    return {
      customer_code: `DEMO-CMP-${sequence}`,
      company_name: `Công ty Mẫu CMP ${sequence} - Thiết bị công nghiệp`,
      country_code: 'VN',
      country_name: 'Việt Nam',
      tax_code: null,
      address: 'Địa chỉ mẫu phục vụ kiểm thử giao diện',
      phone: null,
      email: `demo-cmp-${sequence}@example.invalid`,
      status: 'active',
    };
  });
}

function parseArguments(argv) {
  let apply = false;
  let envFile = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      apply = true;
    } else if (argument === '--dry-run') {
      if (apply) throw new Error('--apply and --dry-run cannot be combined.');
    } else if (argument === '--env-file') {
      envFile = argv[index + 1] ?? null;
      if (!envFile || envFile.startsWith('--')) throw new Error('--env-file requires a file path.');
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      return { help: true, apply: false, envFile: null };
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (apply && !envFile) throw new Error('--apply requires an explicit --env-file outside the repository.');
  if (!apply && envFile) throw new Error('--env-file is accepted only together with --apply.');
  return { help: false, apply, envFile };
}

function databaseTargetFromUrl(connectionString) {
  const value = String(connectionString ?? '').trim();
  if (!/^sqlserver:\/\//i.test(value)) throw new Error('Only an explicit SQL Server sandbox connection is supported.');

  const authority = value.match(/^sqlserver:\/\/(?:[^@;]*@)?([^:;/?]+)/i);
  const databaseMatch = value.match(/(?:^|;)\s*(?:database|initial catalog)\s*=\s*([^;]+)/i);
  const host = String(authority?.[1] ?? '').trim().replace(/^\[|\]$/g, '').split('\\')[0].toLowerCase();
  const database = String(databaseMatch?.[1] ?? '').trim();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '.', '(local)']);

  if (!localHosts.has(host)) throw new Error('The demo runner only accepts a loopback SQL Server host.');
  if (!database || /^ctic_certification$/i.test(database) || /prod(?:uction)?/i.test(database)) {
    throw new Error('The requested database is empty, production-like, or explicitly denied.');
  }
  if (!SANDBOX_DATABASE_PATTERN.test(database)) {
    throw new Error('The database name must match CTIC_CMP_DEMO_YYYY.');
  }

  return { host, database };
}

function assertEnvFileIsExternal(envFile) {
  const resolved = path.resolve(envFile);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('The credential file must be stored outside the Git repository.');
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('The explicit credential file does not exist.');
  }
  return resolved;
}

function validateDemoNamespace(existingRows, customers) {
  const expected = new Map(customers.map((customer) => [customer.customer_code, customer]));
  for (const row of existingRows) {
    const seedRecord = expected.get(row.customer_code);
    if (!seedRecord || row.company_name !== seedRecord.company_name || row.email !== seedRecord.email) {
      throw new Error(`Refusing to update a row outside the owned demo namespace (${row.customer_code}).`);
    }
  }
}

function preview() {
  const customers = buildDemoCustomers();
  return {
    mode: 'dry-run',
    databaseConnection: 'none',
    databaseWrites: 0,
    databaseCreatedOrMigrated: false,
    customers: customers.length,
    customerCodeRange: [customers[0].customer_code, customers.at(-1).customer_code],
    emailsUseReservedDomain: customers.every((customer) => customer.email.endsWith('@example.invalid')),
    taxIdentifiers: customers.filter((customer) => customer.tax_code !== null).length,
    workflowRecordsWritten: 0,
    certificatesWritten: 0,
  };
}

function printHelp() {
  process.stdout.write([
    'CMP demo customer seed (customer rows only; no DDL or workflow transitions)',
    '  node scripts/demo/cmp-demo-seed.cjs [--dry-run]',
    '  node scripts/demo/cmp-demo-seed.cjs --apply --env-file <secure-file-outside-repo>',
    '  Apply also requires CMP_DEMO_SEED=YES, CMP_DEMO_SNAPSHOT_ID, a loopback SQL host,',
    '  a CTIC_CMP_DEMO_YYYY database, and a matching database identity after connect.',
    '  No portal credentials, applications, plans, findings, decisions, or certificates are created.',
    '',
  ].join('\n'));
}

async function applyToVerifiedSandbox(envFile) {
  const externalEnvFile = assertEnvFileIsExternal(envFile);
  const dotenv = require('dotenv');
  const env = dotenv.parse(fs.readFileSync(externalEnvFile));
  if (env.CMP_DEMO_SEED !== 'YES') throw new Error('CMP_DEMO_SEED=YES is required in the explicit credential file.');
  if (!String(env.CMP_DEMO_SNAPSHOT_ID ?? '').trim()) throw new Error('A verified CMP_DEMO_SNAPSHOT_ID is required before writing.');

  const target = databaseTargetFromUrl(env.DATABASE_URL);
  const customers = buildDemoCustomers();
  const updates = {
    company_name: true,
    country_code: true,
    country_name: true,
    tax_code: true,
    address: true,
    phone: true,
    email: true,
    status: true,
  };

  let prisma;
  try {
    const { PrismaClient } = require('@prisma/client');
    const { PrismaMssql } = require('@prisma/adapter-mssql');
    prisma = new PrismaClient({ adapter: new PrismaMssql(env.DATABASE_URL) });
    await prisma.$connect();
    const [identity] = await prisma.$queryRawUnsafe(
      "SELECT DB_NAME() AS database_name, CONVERT(nvarchar(128), SERVERPROPERTY('MachineName')) AS server_name, CONVERT(nvarchar(128), SERVERPROPERTY('InstanceName')) AS instance_name",
    );
    if (String(identity?.database_name ?? '').toLowerCase() !== target.database.toLowerCase()) {
      throw new Error('Connected database identity did not match the explicitly named sandbox.');
    }
    if (!SANDBOX_DATABASE_PATTERN.test(String(identity.database_name ?? ''))) {
      throw new Error('The connected database is outside the demo sandbox allowlist.');
    }

    const existingRows = await prisma.customers.findMany({
      where: { customer_code: { in: customers.map((customer) => customer.customer_code) } },
      select: { customer_code: true, company_name: true, email: true },
    });
    validateDemoNamespace(existingRows, customers);

    await prisma.$transaction(customers.map((customer) => prisma.customers.upsert({
      where: { customer_code: customer.customer_code },
      create: customer,
      update: Object.fromEntries(Object.keys(updates).map((key) => [key, customer[key]])),
    })));

    process.stdout.write(`${JSON.stringify({
      mode: 'apply',
      database: identity.database_name,
      server: identity.server_name,
      instance: identity.instance_name,
      snapshot: String(env.CMP_DEMO_SNAPSHOT_ID).trim(),
      customersUpserted: customers.length,
      workflowRecordsWritten: 0,
      certificatesWritten: 0,
    }, null, 2)}\n`);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArguments(argv);
    if (args.help) return printHelp();
    if (args.apply) return await applyToVerifiedSandbox(args.envFile);
    process.stdout.write(`${JSON.stringify(preview(), null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    process.stderr.write(`[CMP DEMO SEED] ${message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  assertEnvFileIsExternal,
  buildDemoCustomers,
  databaseTargetFromUrl,
  parseArguments,
  preview,
  validateDemoNamespace,
};
