require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');

function integerEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(output) {
  return /\bP1001\b|\bP1002\b|\bP1017\b|ECONNRESET|ECONNREFUSED|ETIMEOUT|ESOCKET|EINVALIDSTATE|Failed to connect|Can't reach database server|connection.*closed|socket.*closed/i.test(
    output,
  );
}

function fail(message) {
  console.error(`MIGRATION DEPLOY: FAIL - ${message}`);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(PRISMA_CLI)) {
    fail(`Không tìm thấy Prisma CLI cục bộ tại ${PRISMA_CLI}. Chạy npm install trước.`);
  }

  const maxAttempts = integerEnv('DB_MIGRATION_MAX_ATTEMPTS', 6, 1, 20);
  const baseDelayMs = integerEnv('DB_MIGRATION_RETRY_DELAY_MS', 2500, 250, 60000);
  const maxDelayMs = integerEnv('DB_MIGRATION_MAX_RETRY_DELAY_MS', 15000, baseDelayMs, 120000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`Prisma migrate deploy attempt ${attempt}/${maxAttempts}...`);
    const result = spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
      env: process.env,
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error) {
      fail(result.error.stack || result.error.message || String(result.error));
    }

    if (result.status === 0) {
      console.log('MIGRATION DEPLOY: PASS');
      return;
    }

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;

    if (/\bP3005\b/i.test(output)) {
      fail(
        'Database hiện hữu chưa được baseline. Chạy "npm run db:adopt-existing" rồi chạy lại ổn định hóa.',
      );
    }

    if (!isTransient(output)) {
      fail(
        `Prisma migrate deploy lỗi không phải lỗi kết nối tạm thời (exit ${String(result.status)}). Không retry mù.`,
      );
    }

    if (attempt === maxAttempts) {
      fail(`SQL Server vẫn không ổn định sau ${maxAttempts} lần migrate deploy.`);
    }

    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    console.warn(`WARN: Lỗi kết nối tạm thời khi migrate. Thử lại sau ${delay} ms...`);
    await wait(delay);
  }
}

main().catch((error) => {
  fail(error?.stack || error?.message || String(error));
});
