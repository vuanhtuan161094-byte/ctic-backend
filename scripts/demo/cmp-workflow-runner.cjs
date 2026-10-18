#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_RUN_ID = 'CMP-UX-20261018-A';

function buildWorkflowPlan(runId = DEFAULT_RUN_ID) {
  return {
    runId,
    mode: 'dry-run',
    apiCallsMade: 0,
    databaseWrites: 0,
    cleanupPerformed: false,
    steps: [
      {
        id: 'sandbox-gate',
        action: 'Xác minh danh tính SQL sandbox và snapshot trước mọi ghi dữ liệu',
        method: 'manual-verification',
        status: 'blocked-until-verified',
      },
      {
        id: 'organization',
        action: 'Đọc và cấu hình hồ sơ tổ chức qua giao diện quản trị/API hiện có',
        method: 'GET/PATCH',
        path: '/master-data-configuration/organization-profile',
        actor: 'ADMIN',
        dependsOn: ['sandbox-gate'],
      },
      {
        id: 'internal-accounts',
        action: 'Tạo tài khoản riêng theo vai trò và xác minh quyền hiệu lực, SoD',
        method: 'POST',
        path: '/users',
        actor: 'ADMIN',
        dependsOn: ['organization'],
        roles: ['SALES', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR', 'AUDITOR', 'TECHNICAL_EXPERT', 'TECHNICAL_REVIEWER', 'DECISION_MAKER'],
      },
      {
        id: 'customers',
        action: 'Tạo 20 khách hàng khác nhau qua màn Khách hàng/API, kiểm tra sau nhóm 1, 5 và 20',
        method: 'POST',
        path: '/customers',
        actor: 'ADMIN',
        dependsOn: ['internal-accounts'],
        checkpoints: [1, 5, 20],
        constraints: ['email example.invalid', 'tax_code để trống', 'mã chạy riêng', 'không cập nhật khách hàng có sẵn'],
      },
      {
        id: 'portal-access',
        action: 'Cấp Portal theo khách hàng qua endpoint quản trị hiện có; kiểm tra tenant isolation',
        method: 'POST',
        path: '/customers/:id/portal-users',
        actor: 'ADMIN',
        dependsOn: ['customers'],
      },
      {
        id: 'first-application',
        action: 'Tạo và nộp đúng một đơn đăng ký trong Portal, tiếp nhận bằng vai trò điều phối',
        method: 'UI workflow',
        path: '/customer-portal/me/applications',
        actor: 'CUSTOMER then COORDINATOR',
        dependsOn: ['portal-access'],
        note: 'Chỉ đi tiếp theo chuyển trạng thái nghiệp vụ mà hệ thống cho phép.',
      },
    ],
    requiredBeforeApply: [
      'A verified non-production SQL sandbox identity, not CTIC_Certification.',
      'A verified snapshot ID and an external manifest path.',
      'A dedicated API instance connected to that sandbox and an ADMIN session.',
      'An approved, role-specific input file stored outside Git with no real customer data.',
    ],
  };
}

function readManifest(manifestPath) {
  const resolvedPath = path.resolve(manifestPath);
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.runId !== 'string') {
    throw new Error('Manifest must contain a runId.');
  }
  return { resolvedPath, manifest: parsed };
}

function buildCleanupDryRun(manifestPath) {
  const { resolvedPath, manifest } = readManifest(manifestPath);
  const records = Array.isArray(manifest.createdRecords) ? manifest.createdRecords : [];
  const dependencies = records.flatMap((record) => (
    Array.isArray(record.dependencies) ? record.dependencies.map((dependency) => ({ recordId: record.id ?? null, ...dependency })) : []
  ));
  return {
    mode: 'cleanup-dry-run',
    runId: manifest.runId,
    manifestPath: resolvedPath,
    database: manifest.database ?? null,
    status: manifest.status ?? 'unspecified',
    createdRecordCount: records.length,
    createdRecords: records.map(({ type, id, code, createdAt }) => ({ type: type ?? null, id: id ?? null, code: code ?? null, createdAt: createdAt ?? null })),
    dependencyCount: dependencies.length,
    dependencies,
    cleanupPerformed: false,
    deleteCount: 0,
  };
}

function parseArguments(argv) {
  const args = { runId: DEFAULT_RUN_ID, cleanupManifest: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') continue;
    if (argument === '--run-id') {
      args.runId = argv[index + 1] ?? '';
      if (!args.runId || args.runId.startsWith('--')) throw new Error('--run-id requires a value.');
      index += 1;
    } else if (argument === '--cleanup-dry-run') {
      args.cleanupManifest = argv[index + 1] ?? '';
      if (!args.cleanupManifest || args.cleanupManifest.startsWith('--')) throw new Error('--cleanup-dry-run requires a manifest path.');
      index += 1;
    } else if (argument === '--apply') {
      throw new Error('Apply mode is disabled until the SQL sandbox, snapshot, dedicated API instance and external manifest are verified.');
    } else if (argument === '--help' || argument === '-h') {
      return { help: true };
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return args;
}

function printHelp() {
  process.stdout.write([
    'CMP workflow runner — plan-only; no API or database connections',
    '  node scripts/demo/cmp-workflow-runner.cjs --dry-run [--run-id CMP-UX-20261018-A]',
    '  node scripts/demo/cmp-workflow-runner.cjs --cleanup-dry-run <external-manifest.json>',
    '  --apply is disabled until the verified sandbox and snapshot gates are available.',
    '',
  ].join('\n'));
}

async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArguments(argv);
    if (args.help) return printHelp();
    const result = args.cleanupManifest
      ? buildCleanupDryRun(args.cleanupManifest)
      : buildWorkflowPlan(args.runId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[CMP WORKFLOW] ${error instanceof Error ? error.message : 'Unknown failure.'}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = { buildCleanupDryRun, buildWorkflowPlan, main, parseArguments };
