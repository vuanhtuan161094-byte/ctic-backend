const path = require('node:path');

require('dotenv/config');

function fail(message) {
  console.error(`PRODUCTION ENVIRONMENT: FAIL - ${message}`);
  process.exit(1);
}

try {
  if (String(process.env.NODE_ENV || '').trim() !== 'production') {
    fail('NODE_ENV must be exactly production.');
  }

  const deploymentModule = require(path.resolve(process.cwd(), 'dist/common/deployment-config.js'));
  const securityModule = require(path.resolve(process.cwd(), 'dist/security/security-config.js'));
  const readinessModule = require(path.resolve(process.cwd(), 'dist/common/production-readiness.js'));

  const deployment = deploymentModule.getDeploymentConfig(process.env);
  const security = securityModule.getSecurityConfig(process.env);
  securityModule.validateSecurityEnvironment(true, process.env);
  const result = readinessModule.validateRuntimeEnvironment({ deployment, security, env: process.env, cwd: process.cwd() });

  console.log('PRODUCTION ENVIRONMENT: PASS');
  console.log(`Public base URL: ${deployment.publicBaseUrl}`);
  console.log(`Swagger: ${deployment.swaggerEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Trust proxy: ${String(deployment.trustProxy)}`);
  console.log(`Warnings: ${result.warnings.length}`);
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
} catch (error) {
  fail(error?.message || String(error));
}
