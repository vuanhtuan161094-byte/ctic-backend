'use strict';

// Read-only staging probe. Tokens stay in process env; never echo credentials.
const { performance } = require('node:perf_hooks');

const CONFIRM = 'I_CONFIRM_READ_ONLY_ISOLATED_P09_STAGING';
function environment() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
    process.env.P09_PERF_CONFIRM !== CONFIRM) {
    throw new Error('Refusing production or missing isolated staging confirmation.');
  }
  const raw = String(process.env.P09_PERF_BASE_URL || '').trim();
  const url = new URL(raw);
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase());
  if (!['http:', 'https:'].includes(url.protocol) || (!local &&
    !/(?:staging|uat|test)/i.test(url.hostname)) || url.username || url.password ||
    url.pathname !== '/' || url.search) {
    throw new Error('Base URL must be a dedicated staging/UAT host or localhost origin.');
  }
  if (!process.env.P09_PERF_TOKEN || process.env.P09_PERF_TOKEN.length < 16) {
    throw new Error('Missing authorized read-only staging user bearer token.');
  }
  const samples = Number(process.env.P09_PERF_SAMPLES || 20);
  const concurrency = Number(process.env.P09_PERF_CONCURRENCY || 2);
  if (!Number.isInteger(samples) || samples < 10 || samples > 200 ||
    !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('Samples must be 10–200, concurrency 1–8.');
  }
  const keyword = String(process.env.P09_PERF_KEYWORD || '').trim();
  if (keyword.length < 2 || keyword.length > 80) {
    throw new Error('Provide a 2–80-character search keyword from authorized staging records.');
  }
  return { base: url.origin, samples, concurrency, keyword,
    token: process.env.P09_PERF_TOKEN };
}
function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}
async function measure(path, cfg) {
  const samples = []; let errors = 0; let total = null; let index = 0;
  async function worker() {
    while (index < cfg.samples) {
      index += 1;
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 30000);
      const started = performance.now();
      try {
        const response = await fetch(cfg.base + path, {
          method: 'GET', signal: abort.signal,
          headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
        });
        // Consume body to include payload latency, but never store PII.
        const parsed = await response.json();
        if (!response.ok || !parsed || !parsed.pagination ||
          !Array.isArray(parsed.items)) errors += 1;
        if (Number.isFinite(parsed?.pagination?.total)) total = parsed.pagination.total;
      } catch { errors += 1; }
      finally { samples.push(performance.now() - started); clearTimeout(timeout); }
    }
  }
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  return { path: path.split('?')[0], samples: samples.length, concurrency: cfg.concurrency,
    errors, page_total: total, p50_ms: Number(percentile(samples, 0.50).toFixed(1)),
    p95_ms: Number(percentile(samples, 0.95).toFixed(1)),
    max_ms: Number(Math.max(...samples).toFixed(1)) };
}
if (require.main === module) {
  (async () => {
    const cfg = environment();
    const term = encodeURIComponent(cfg.keyword);
    const endpoints = [
      `/me/global-search?q=${term}&type=customer&page=1&limit=20`,
      `/me/global-search?q=${term}&type=application&page=1&limit=20`,
      `/me/global-search?q=${term}&type=project&page=1&limit=20`,
      `/me/global-search?q=${term}&type=certificate&page=1&limit=20`,
      `/me/global-search?q=${term}&type=work&page=1&limit=20`,
      `/my-work?search=${term}&status=ALL&page=1&limit=20`,
    ];
    const results = [];
    for (const path of endpoints) results.push(await measure(path, cfg));
    console.log(JSON.stringify({ environment: 'ISOLATED_STAGING_READ_ONLY',
      measured_at: new Date().toISOString(), results }, null, 2));
    if (results.some((row) => row.errors)) process.exitCode = 1;
    // No arbitrary latency PASS threshold. Approve limits in release review.
  })().catch(() => {
    console.error('P09 performance probe: safety or execution error; check isolated staging settings.');
    process.exitCode = 2;
  });
}
module.exports = { environment, percentile };
