const net = require('node:net');
const { execFileSync } = require('node:child_process');
function splitConnectionParts(value) {
  const parts = [];
  let current = '';
  let braceDepth = 0;

  for (const character of value) {
    if (character === '{') braceDepth += 1;
    if (character === '}' && braceDepth > 0) braceDepth -= 1;

    if (character === ';' && braceDepth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  if (current) parts.push(current);
  return parts;
}

function unwrap(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSqlServerEndpoint(databaseUrl) {
  const withoutScheme = String(databaseUrl ?? '').replace(/^sqlserver:\/\//i, '');
  const parts = splitConnectionParts(withoutScheme);
  const hostPart = String(parts.shift() || 'localhost:1433').trim();
  const lastColon = hostPart.lastIndexOf(':');
  const server = lastColon > 0 ? hostPart.slice(0, lastColon) : hostPart;
  const portCandidate = lastColon > 0 ? Number(hostPart.slice(lastColon + 1)) : 1433;
  const port = Number.isFinite(portCandidate) && portCandidate > 0 ? portCandidate : 1433;

  const parameters = new Map();
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    parameters.set(
      part.slice(0, separator).trim().toLowerCase(),
      unwrap(part.slice(separator + 1)),
    );
  }

  return {
    server: server || 'localhost',
    port,
    database: parameters.get('database') || parameters.get('initial catalog') || '',
  };
}

function positiveInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isLocalHost(server) {
  return ['localhost', '127.0.0.1', '::1', '(local)', '.'].includes(
    String(server || '').trim().toLowerCase(),
  );
}

function tcpProbe(server, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: server, port });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, reason: 'timeout' }));
    socket.once('error', (error) =>
      finish({
        ok: false,
        reason: error?.code || error?.message || 'socket_error',
      }),
    );
  });
}

function getLocalSqlServices() {
  if (process.platform !== 'win32') return [];

  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-Service -Name 'MSSQL*' -ErrorAction SilentlyContinue | Select-Object Name,Status,DisplayName | ConvertTo-Json -Compress",
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 },
    ).trim();

    if (!output) return [];
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function printLocalSqlServices(services) {
  if (!services.length) {
    console.warn('WARN: Không phát hiện SQL Server Database Engine service dạng MSSQL* trên Windows.');
    return;
  }

  console.log('SQL Server services trên máy:');
  for (const service of services) {
    console.log(`  - ${service.Name}: ${service.Status} (${service.DisplayName || ''})`);
  }
}

function tryStartSingleLocalSqlService(services) {
  const stopped = services.filter(
    (service) => String(service.Status).toLowerCase() !== 'running',
  );

  if (services.length !== 1 || stopped.length !== 1) {
    console.warn(
      'WARN: Không tự khởi động SQL Server vì không xác định được duy nhất một Database Engine service đang dừng.',
    );
    return false;
  }

  const serviceName = String(stopped[0].Name || '');
  if (!/^MSSQL(?:SERVER|\$[A-Za-z0-9_.-]+)$/i.test(serviceName)) {
    console.warn(`WARN: Tên service SQL không hợp lệ để auto-start: ${serviceName}`);
    return false;
  }

  try {
    console.log(`Đang thử khởi động Windows service ${serviceName}...`);
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Service -Name '${serviceName.replace(/'/g, "''")}' -ErrorAction Stop`,
      ],
      { stdio: 'inherit', windowsHide: true, timeout: 30000 },
    );
    console.log(`Đã gửi lệnh khởi động ${serviceName}.`);
    return true;
  } catch (error) {
    console.error(
      `ERROR: Không thể tự khởi động ${serviceName}. Có thể cần mở Terminal bằng quyền Administrator.`,
    );
    return false;
  }
}

async function queryProbe(databaseUrl) {
  const { PrismaMssql } = require('@prisma/adapter-mssql');
  const { PrismaClient } = require('@prisma/client');

  const prisma = new PrismaClient({
    adapter: new PrismaMssql(databaseUrl),
  });

  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe('SELECT 1 AS connection_ok');
    return { ok: true };
  } catch (error) {
    const code = String(error?.code || error?.cause?.code || '').toUpperCase();
    const message = String(error?.message || 'Database query failed');
    return { ok: false, code, message };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function safeDatabaseLabel(endpoint) {
  return `${endpoint.server}:${endpoint.port}${endpoint.database ? `/${endpoint.database}` : ''}`;
}

async function main() {
  require('dotenv/config');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL trong .env');
  }

  const endpoint = parseSqlServerEndpoint(databaseUrl);
  const autoStart = process.argv.includes('--auto-start-local-sql');
  const attempts = positiveInteger(
    process.env.DB_PREFLIGHT_MAX_ATTEMPTS,
    10,
    1,
    60,
  );
  const stableSuccessesRequired = positiveInteger(
    process.env.DB_PREFLIGHT_STABLE_SUCCESSES,
    3,
    1,
    10,
  );
  const delayMs = positiveInteger(
    process.env.DB_PREFLIGHT_RETRY_DELAY_MS,
    2500,
    250,
    60000,
  );
  const tcpTimeoutMs = positiveInteger(
    process.env.DB_PREFLIGHT_TCP_TIMEOUT_MS,
    2500,
    250,
    15000,
  );

  console.log(`Database preflight: ${safeDatabaseLabel(endpoint)}`);
  console.log(
    `Probe attempts: ${attempts}, stable query successes required: ${stableSuccessesRequired}, TCP timeout: ${tcpTimeoutMs} ms`,
  );

  let localServices = [];
  let autoStartTried = false;
  let consecutiveQuerySuccesses = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const tcp = await tcpProbe(endpoint.server, endpoint.port, tcpTimeoutMs);

    if (!tcp.ok) {
      console.warn(
        `WARN: TCP ${endpoint.server}:${endpoint.port} chưa mở (${attempt}/${attempts}, ${tcp.reason}).`,
      );

      if (
        autoStart &&
        !autoStartTried &&
        process.platform === 'win32' &&
        isLocalHost(endpoint.server)
      ) {
        localServices = getLocalSqlServices();
        printLocalSqlServices(localServices);
        autoStartTried = true;
        if (tryStartSingleLocalSqlService(localServices)) {
          await wait(5000);
        }
      }

      if (attempt < attempts) {
        await wait(delayMs);
        continue;
      }

      if (process.platform === 'win32' && isLocalHost(endpoint.server)) {
        if (!localServices.length) localServices = getLocalSqlServices();
        printLocalSqlServices(localServices);
        console.error(
          `ERROR: Không có tiến trình SQL Server lắng nghe ${endpoint.server}:${endpoint.port}. Kiểm tra SQL Server service, TCP/IP và TCP Port trong SQL Server Configuration Manager.`,
        );
        console.error(
          `Gợi ý Windows: Test-NetConnection ${endpoint.server} -Port ${endpoint.port}`,
        );
      } else {
        console.error(
          `ERROR: Không kết nối TCP được tới SQL Server ${endpoint.server}:${endpoint.port}. Kiểm tra network/firewall/port.`,
        );
      }

      process.exitCode = 1;
      return;
    }

    console.log(`PASS: TCP ${endpoint.server}:${endpoint.port} reachable.`);

    const query = await queryProbe(databaseUrl);
    if (query.ok) {
      consecutiveQuerySuccesses += 1;
      console.log(
        `PASS: SQL Server query probe ${consecutiveQuerySuccesses}/${stableSuccessesRequired} (${safeDatabaseLabel(endpoint)}).`,
      );

      if (consecutiveQuerySuccesses >= stableSuccessesRequired) {
        console.log('DATABASE STABILITY GATE: PASS');
        console.log('DATABASE PREFLIGHT: PASS');
        return;
      }

      if (attempt < attempts) {
        await wait(delayMs);
        continue;
      }

      console.error(
        `ERROR: Chưa đạt ${stableSuccessesRequired} query thành công liên tiếp trước khi hết ${attempts} lần probe.`,
      );
      process.exitCode = 1;
      return;
    }

    consecutiveQuerySuccesses = 0;

    const authenticationFailure =
      ['P1000', 'ELOGIN'].includes(query.code) ||
      /login failed|authentication failed/i.test(query.message);

    if (authenticationFailure) {
      console.error(
        `ERROR: TCP mở nhưng SQL login thất bại tại ${safeDatabaseLabel(endpoint)}. Kiểm tra user/password/database trong DATABASE_URL.`,
      );
      process.exitCode = 1;
      return;
    }

    console.warn(
      `WARN: SQL Server nhận TCP nhưng query chưa thành công (${attempt}/${attempts}).`,
    );

    if (attempt < attempts) {
      await wait(delayMs);
      continue;
    }

    console.error(
      `ERROR: SQL Server reachable nhưng không thực hiện được query tại ${safeDatabaseLabel(endpoint)}.`,
    );
    console.error(String(query.message).split('\n')[0]);
    process.exitCode = 1;
    return;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}

module.exports = {
  parseSqlServerEndpoint,
  isLocalHost,
  tcpProbe,
  safeDatabaseLabel,
};
