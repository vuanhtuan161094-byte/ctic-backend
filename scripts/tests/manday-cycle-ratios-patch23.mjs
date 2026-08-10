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

async function runCase(name, effectivePersonnel, expected) {
  const result = await request('/manday-calculations/suggest', {
    method: 'POST',
    body: JSON.stringify({
      standards: ['ISO 9001:2015'],
      effective_personnel: effectivePersonnel,
      audit_type: 'initial',
      site_sampling_mode: 'single',
      sites: [{
        site_name: 'Trụ sở chính',
        employee_count: effectivePersonnel,
        is_headquarters: true,
      }],
    }),
  });

  assertEqual('MD lần đầu', result.final_initial_mandays, expected.initial);
  assertEqual('Giám sát = 1/3', result.surveillance_mandays, expected.surveillance);
  assertEqual('Tái chứng nhận = 2/3', result.recertification_mandays, expected.recertification);

  console.log(
    `✓ ${name}: lần đầu=${result.final_initial_mandays}, giám sát=${result.surveillance_mandays}, tái chứng nhận=${result.recertification_mandays}`,
  );
}

async function main() {
  console.log('=== KIỂM TRA TỶ LỆ GIÁM SÁT / TÁI CHỨNG NHẬN PATCH 23 ===');
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

  await runCase('QMS 1 nhân sự', 1, {
    initial: 1.5,
    surveillance: 1,
    recertification: 1,
  });

  await runCase('QMS 100 nhân sự', 100, {
    initial: 7,
    surveillance: 2,
    recertification: 4.5,
  });

  console.log('PASS: 2/2');
}

main().catch((error) => {
  console.error(`✗ FAIL: ${error.message}`);
  process.exitCode = 1;
});
