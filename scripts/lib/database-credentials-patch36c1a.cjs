const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '../..');
let loaded = false;

function loadEnvironment() {
  if (loaded) return;
  loaded = true;

  const runtimeEnv = path.join(ROOT, '.env');
  if (fs.existsSync(runtimeEnv)) {
    dotenv.config({ path: runtimeEnv, override: false, quiet: true });
  }

  const migrationEnv = path.join(ROOT, '.env.migration');
  if (fs.existsSync(migrationEnv)) {
    dotenv.config({ path: migrationEnv, override: false, quiet: true });
  }
}

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
    } else {
      current += character;
    }
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

function parseSqlServerUrl(url) {
  if (!url || !/^sqlserver:\/\//i.test(url)) {
    throw new Error('Database URL phải dùng định dạng sqlserver://...');
  }

  const body = url.replace(/^sqlserver:\/\//i, '');
  const parts = splitConnectionParts(body);
  const hostPart = String(parts.shift() || '').trim();
  const lastColon = hostPart.lastIndexOf(':');
  const host = (lastColon > 0 ? hostPart.slice(0, lastColon) : hostPart || 'localhost').trim();
  const portToken = lastColon > 0 ? hostPart.slice(lastColon + 1) : '1433';
  const port = Number(portToken) > 0 ? Number(portToken) : 1433;

  const params = new Map();
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    params.set(
      part.slice(0, index).trim().toLowerCase(),
      unwrap(part.slice(index + 1)),
    );
  }

  const database = params.get('database') || params.get('initial catalog') || '';
  const user = params.get('user') || params.get('username') || params.get('uid') || '';

  return {
    host,
    port,
    database,
    user,
    schema: params.get('schema') || 'dbo',
  };
}

function normalizedTarget(url) {
  const parsed = parseSqlServerUrl(url);
  const host = parsed.host.toLowerCase();
  return {
    host: host === '127.0.0.1' || host === '::1' ? 'localhost' : host,
    port: parsed.port,
    database: parsed.database.toLowerCase(),
    schema: parsed.schema.toLowerCase(),
  };
}

function sameTarget(a, b) {
  const x = normalizedTarget(a);
  const y = normalizedTarget(b);
  return x.host === y.host && x.port === y.port && x.database === y.database && x.schema === y.schema;
}

function getRuntimeDatabaseUrl() {
  loadEnvironment();
  const value = String(process.env.DATABASE_URL || '').trim();
  if (!value) throw new Error('Thiếu DATABASE_URL trong .env.');
  return value;
}

function runtimeFallbackAllowed() {
  loadEnvironment();
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ALLOW_RUNTIME_MIGRATION_CREDENTIALS || '').trim().toLowerCase(),
  );
}

function getMigrationDatabaseUrl(options = {}) {
  loadEnvironment();
  const required = options.required !== false;
  const explicit = String(process.env.MIGRATION_DATABASE_URL || '').trim();
  const runtime = getRuntimeDatabaseUrl();

  if (explicit) {
    if (!sameTarget(runtime, explicit)) {
      throw new Error(
        'MIGRATION_DATABASE_URL không trỏ cùng host/port/database/schema với DATABASE_URL. Dừng để tránh migrate nhầm database.',
      );
    }
    return explicit;
  }

  if (runtimeFallbackAllowed()) return runtime;

  if (!required) return null;

  throw new Error(
    'Chưa cấu hình MIGRATION_DATABASE_URL. Production/commercial phải dùng tài khoản migration riêng. Trên Windows development có thể chạy STABILIZE_36C1A.cmd để cấp quyền DDL tạm thời rồi tự thu hồi.',
  );
}

function migrationChildEnv(baseEnv = process.env) {
  const migrationUrl = getMigrationDatabaseUrl();
  return {
    ...baseEnv,
    DATABASE_URL: migrationUrl,
    CMP_DATABASE_CONNECTION_ROLE: 'migration',
  };
}

function describeTarget(url) {
  const parsed = parseSqlServerUrl(url);
  return `${parsed.host}:${parsed.port}/${parsed.database || '<database?>'}/${parsed.schema || 'dbo'}`;
}

function describePrincipal(url) {
  const parsed = parseSqlServerUrl(url);
  return parsed.user || '<integrated/unspecified>';
}

function migrationCredentialSource() {
  loadEnvironment();
  if (String(process.env.MIGRATION_DATABASE_URL || '').trim()) return 'MIGRATION_DATABASE_URL';
  if (runtimeFallbackAllowed()) return 'temporary runtime credential elevation';
  return 'not configured';
}

module.exports = {
  ROOT,
  loadEnvironment,
  parseSqlServerUrl,
  sameTarget,
  getRuntimeDatabaseUrl,
  getMigrationDatabaseUrl,
  migrationChildEnv,
  describeTarget,
  describePrincipal,
  migrationCredentialSource,
  runtimeFallbackAllowed,
};
