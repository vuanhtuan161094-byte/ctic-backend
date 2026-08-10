#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline/promises';

const baseUrl = (process.env.CTIC_TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const username = process.env.CTIC_TEST_USERNAME || 'admin';
let password = process.env.CTIC_TEST_PASSWORD || '';
let token = '';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${response.status}: ${body?.message || body?.error || raw}`);
  }
  return body;
}

function assertEqual(label, actual, expected) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.001) {
    throw new Error(`${label}: nhận ${actual}, cần ${expected}`);
  }
}

async function testCase(name, payload, expected) {
  const result = await request('/manday-calculations/suggest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  assertEqual('base_mandays', result.base_mandays, expected.base);
  assertEqual('effective_personnel', result.effective_personnel, payload.effective_personnel);
  assertEqual(
    'nhân sự tại địa điểm duy nhất',
    result.site_calculation?.per_site?.[0]?.effective_personnel,
    payload.effective_personnel,
  );

  if (expected.standardMandays) {
    const standards = result.site_calculation?.per_site?.[0]?.standards || [];
    for (const [token, value] of Object.entries(expected.standardMandays)) {
      const row = standards.find((item) => String(item.standard).includes(token));
      if (!row) throw new Error(`Không tìm thấy dòng tiêu chuẩn ${token}`);
      assertEqual(`MD ${token}`, row.mandays, value);
    }
  }

  console.log(`✓ ${name}: base=${result.base_mandays}, GD1=${result.stage1_mandays}, GD2=${result.stage2_mandays}`);
}

async function main() {
  console.log('=== KIỂM TRA HỒI QUY MAN-DAY PATCH 22A ===');
  console.log(`Backend: ${baseUrl}`);

  if (!password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('Mật khẩu ADMIN: ');
    rl.close();
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  token = login?.access_token || login?.token || '';
  if (!token) throw new Error('Không nhận được JWT');

  await testCase(
    'Một địa điểm, 1000 người, ISO 9001; site vẫn mang giá trị cũ = 1',
    {
      standards: ['ISO 9001:2015'],
      effective_personnel: 1000,
      audit_type: 'initial',
      site_sampling_mode: 'single',
      sites: [{ site_name: 'Trụ sở chính', employee_count: 1, is_headquarters: true }],
    },
    { base: 13, standardMandays: { '9001': 13 } },
  );

  await testCase(
    'Một địa điểm, 1000 người, ISO 9001 + ISO 14001 mức cao',
    {
      standards: ['ISO 9001:2015', 'ISO 14001:2015'],
      effective_personnel: 1000,
      audit_type: 'initial',
      ems_complexity: 'high',
      site_sampling_mode: 'single',
      sites: [{ site_name: 'Trụ sở chính', employee_count: 1, is_headquarters: true }],
      ims_integration_percent: 0,
      combined_audit_capability_percent: 0,
    },
    { base: 32, standardMandays: { '9001': 13, '14001': 19 } },
  );

  console.log('PASS: 2/2');
}

main().catch((error) => {
  console.error(`✗ FAIL: ${error.message}`);
  process.exitCode = 1;
});
