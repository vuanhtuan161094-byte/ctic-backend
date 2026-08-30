const baseUrl = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('HTTP SECURITY SMOKE: FAIL - Set SMOKE_BASE_URL or PUBLIC_BASE_URL.');
  process.exit(1);
}

(async () => {
  const response = await fetch(`${baseUrl}/health/live`, { redirect: 'manual' });
  const requiredHeaders = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'no-referrer',
  };
  const failures = [];
  if (!response.ok) failures.push(`/health/live returned ${response.status}`);
  for (const [name, expected] of Object.entries(requiredHeaders)) {
    if (response.headers.get(name) !== expected) failures.push(`${name} != ${expected}`);
  }
  if (!response.headers.get('x-request-id')) failures.push('x-request-id missing');
  if (response.headers.get('x-powered-by')) failures.push('x-powered-by must be disabled');
  const body = await response.text();
  if (/DATABASE_URL|JWT_SECRET|password|connection string|\\uploads|\/uploads/i.test(body)) {
    failures.push('public health response appears to expose sensitive metadata');
  }
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exit(1);
  }
  console.log('HTTP SECURITY SMOKE: PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
