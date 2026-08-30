import { resolve } from 'node:path';
import { validateRuntimeEnvironment } from './production-readiness';

const deployment = {
  nodeEnv: 'production',
  isProduction: true,
  host: '0.0.0.0',
  port: 3000,
  publicBaseUrl: 'https://api.example.com',
  corsOrigins: ['https://app.example.com'],
  allowPrivateNetworkOrigins: false,
  trustProxy: 1,
  swaggerEnabled: false,
};

const security = {
  publicRegistrationEnabled: false,
  loginRateLimitWindowMs: 900000,
  loginRateLimitMaxAttempts: 10,
  loginRateLimitMaxAttemptsPerIp: 50,
  publicCertificateRateLimitWindowMs: 60000,
  publicCertificateRateLimitMaxRequests: 120,
  rateLimitMaxEntries: 10000,
  securityHeadersEnabled: true,
};

const testCwd = resolve(process.cwd(), 'cmp-app-root');
const persistentStorage = resolve(process.cwd(), '..', 'cmp-persistent-data', 'storage');

const baseEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'sqlserver://db.example:1433;database=CMP;user=runtime;password={redacted}',
  STORAGE_ROOT: persistentStorage,
  APP_VERSION: '1.0.0',
};

describe('production readiness environment guard', () => {
  it('accepts a production runtime contract with persistent storage', () => {
    expect(() => validateRuntimeEnvironment({ deployment, security, env: baseEnv, cwd: testCwd })).not.toThrow();
  });

  it('rejects test-only flags in production', () => {
    expect(() => validateRuntimeEnvironment({ deployment, security, env: { ...baseEnv, P09_DISABLE_NOTIFICATION_SCHEDULER: '1' }, cwd: testCwd })).toThrow(/test-only/i);
  });

  it('rejects test database targets in production', () => {
    expect(() => validateRuntimeEnvironment({ deployment, security, env: { ...baseEnv, DATABASE_URL: 'sqlserver://db:1433;database=CMP_test;user=x;password=y' }, cwd: testCwd })).toThrow(/_test\/_ci/i);
  });

  it('rejects migration credentials in the backend runtime', () => {
    expect(() => validateRuntimeEnvironment({ deployment, security, env: { ...baseEnv, MIGRATION_DATABASE_URL: 'sqlserver://db:1433;database=CMP;user=migrator;password=x' }, cwd: testCwd })).toThrow(/MIGRATION_DATABASE_URL/);
  });

  it('rejects storage inside the application deployment directory', () => {
    expect(() => validateRuntimeEnvironment({ deployment, security, env: { ...baseEnv, STORAGE_ROOT: resolve(testCwd, 'uploads') }, cwd: testCwd })).toThrow(/deploy\/source/i);
  });
});
