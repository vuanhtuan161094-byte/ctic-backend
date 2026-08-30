const baseUrl = String(process.env.PERF_BASE_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('PERFORMANCE SMOKE: FAIL - Set PERF_BASE_URL or PUBLIC_BASE_URL.');
  process.exit(1);
}

const samples = Math.max(3, Math.min(100, Number(process.env.PERF_SAMPLES || 10)));
const timeoutMs = Math.max(1000, Math.min(60000, Number(process.env.PERF_TIMEOUT_MS || 10000)));
const endpoints = String(process.env.PERF_ENDPOINTS || '/health/live,/health')
  .split(',').map((value) => value.trim()).filter(Boolean);

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

async function measure(endpoint) {
  const durations = [];
  let errors = 0;
  for (let i = 0; i < samples; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      durations.push(performance.now() - started);
      if (!response.ok) errors += 1;
      await response.arrayBuffer();
    } catch {
      durations.push(performance.now() - started);
      errors += 1;
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    endpoint,
    samples,
    errors,
    median_ms: Number(percentile(durations, 0.5).toFixed(1)),
    p95_ms: Number(percentile(durations, 0.95).toFixed(1)),
    max_ms: Number(Math.max(...durations).toFixed(1)),
  };
}

(async () => {
  const results = [];
  for (const endpoint of endpoints) results.push(await measure(endpoint));
  console.table(results);
  if (results.some((item) => item.errors > 0)) {
    console.error('PERFORMANCE SMOKE: FAIL - one or more requests failed.');
    process.exit(1);
  }
  console.log('PERFORMANCE SMOKE: PASS (informational latency; no arbitrary millisecond CI gate).');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
