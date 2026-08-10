const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');

function parseArg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : '';
}

function privateIpv4Candidates() {
  const values = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const ip = entry.address;
      if (
        /^10\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
      ) {
        values.push(ip);
      }
    }
  }
  return [...new Set(values)];
}

function setEnvLine(source, key, value) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(source)) return source.replace(regex, line);
  return `${source.replace(/\s*$/, '')}\n${line}\n`;
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`Không tìm thấy ${ENV_FILE}`);
  }

  const explicitHost = parseArg('host');
  const candidates = privateIpv4Candidates();
  const host = explicitHost || (candidates.length === 1 ? candidates[0] : '');

  if (!host) {
    throw new Error(
      `Không thể chọn IP LAN duy nhất. Các IP phát hiện: ${candidates.join(', ') || '(none)'}. ` +
      'Hãy chạy lại, ví dụ: npm run env:lan -- --host=192.168.1.47',
    );
  }

  const backendPort = Number(parseArg('backend-port') || process.env.PORT || 3000);
  const frontendPort = Number(parseArg('frontend-port') || 5173);

  const publicBaseUrl = `http://${host}:${backendPort}`;
  const frontendBaseUrl = `http://${host}:${frontendPort}`;

  let source = fs.readFileSync(ENV_FILE, 'utf8');
  source = setEnvLine(source, 'PUBLIC_BASE_URL', publicBaseUrl);
  source = setEnvLine(source, 'FRONTEND_BASE_URL', frontendBaseUrl);
  source = setEnvLine(source, 'CORS_ORIGINS', frontendBaseUrl);
  source = setEnvLine(source, 'CORS_ALLOW_PRIVATE_NETWORK', 'true');

  fs.writeFileSync(ENV_FILE, source, 'utf8');

  console.log(`LAN backend:  ${publicBaseUrl}`);
  console.log(`LAN frontend: ${frontendBaseUrl}`);
  console.log('Đã cập nhật .env nhưng giữ nguyên DATABASE_URL/JWT_SECRET và các cấu hình khác.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error);
  process.exit(1);
}
