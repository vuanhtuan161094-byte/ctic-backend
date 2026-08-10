#!/usr/bin/env node

import process from 'node:process';
import readline from 'node:readline/promises';

function parseArgs(argv) {
  const result = {
    baseUrl: process.env.CTIC_TEST_BASE_URL || 'http://localhost:3000',
    username: process.env.CTIC_TEST_USERNAME || 'admin',
    password: process.env.CTIC_TEST_PASSWORD || '',
    projectCode: process.env.CTIC_TEST_PROJECT_CODE || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === '--base-url' && next) { result.baseUrl = next; i += 1; }
    else if (current === '--username' && next) { result.username = next; i += 1; }
    else if (current === '--password' && next) { result.password = next; i += 1; }
    else if (current === '--project-code' && next) { result.projectCode = next; i += 1; }
  }
  result.baseUrl = result.baseUrl.replace(/\/+$/, '');
  return result;
}

const config = parseArgs(process.argv.slice(2));
let token = '';
let pass = 0;
let warn = 0;
let fail = 0;

function result(status, name, detail = '') {
  if (status === 'PASS') pass += 1;
  if (status === 'WARN') warn += 1;
  if (status === 'FAIL') fail += 1;
  const marker = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗';
  console.log(`${marker} [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

async function request(path, options = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
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
    const message = typeof body === 'string' ? body : body?.message || body?.error || JSON.stringify(body);
    const error = new Error(`${response.status}: ${message}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function main() {
  console.log('\n=== KIỂM TRA SẴN SÀNG LUỒNG HỒ SƠ PATCH 32 ===');
  console.log(`Backend: ${config.baseUrl}`);

  if (!config.password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    config.password = await rl.question('Nhập mật khẩu ADMIN: ');
    rl.close();
  }

  try {
    await request('/health');
    result('PASS', 'Backend health');
  } catch (error) {
    result('FAIL', 'Backend health', error.message);
    summarize();
    return;
  }

  try {
    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: config.username, password: config.password }),
    });
    token = login?.access_token || login?.token || '';
    if (!token) throw new Error('Không có access_token');
    result('PASS', 'Đăng nhập');
  } catch (error) {
    result('FAIL', 'Đăng nhập', error.message);
    summarize();
    return;
  }

  let projects = [];
  try {
    projects = asArray(await request('/certification-projects'));
    result('PASS', 'Đọc danh sách hồ sơ', `${projects.length} hồ sơ`);
  } catch (error) {
    result('FAIL', 'Đọc danh sách hồ sơ', error.message);
    summarize();
    return;
  }

  const project = config.projectCode
    ? projects.find((item) => item.project_code === config.projectCode)
    : projects[0];

  if (!project) {
    result('FAIL', 'Chọn hồ sơ kiểm tra', config.projectCode || 'Không có hồ sơ');
    summarize();
    return;
  }

  result('PASS', 'Hồ sơ kiểm tra', project.project_code);

  try {
    const syncScopes = await request(`/certification-project-scopes/project/${project.id}/sync-from-review`, { method: 'POST' });
    const count = Number(syncScopes?.synchronized_count ?? syncScopes?.scopes?.length ?? 0);
    result('PASS', 'Đồng bộ ISIC/NACE/IAF', `${count} phạm vi`);
  } catch (error) {
    result('FAIL', 'Đồng bộ ISIC/NACE/IAF', error.message);
  }

  try {
    const scopes = asArray(await request(`/certification-project-scopes/project/${project.id}?status=APPROVED`));
    result(scopes.length ? 'PASS' : 'FAIL', 'Phạm vi đã duyệt cấp hồ sơ', `${scopes.length} phạm vi`);
  } catch (error) {
    result('FAIL', 'Phạm vi đã duyệt cấp hồ sơ', error.message);
  }

  try {
    const syncManday = await request(`/manday-calculations/project/${project.id}/sync-from-review`, { method: 'POST' });
    const calculation = syncManday?.calculation ?? syncManday;
    const initial = Number(calculation?.final_mandays ?? 0);
    const stage1 = Number(calculation?.stage1_mandays ?? 0);
    const stage2 = Number(calculation?.stage2_mandays ?? 0);
    const valid = initial >= 1.5 && stage1 >= 0.5 && stage2 >= 1 && Math.abs(stage1 + stage2 - initial) <= 0.01;
    result(valid ? 'PASS' : 'FAIL', 'Đồng bộ man-day', `Lần đầu=${initial}; Stage 1=${stage1}; Stage 2=${stage2}`);
  } catch (error) {
    result('FAIL', 'Đồng bộ man-day', error.message);
  }

  let appointment = null;
  try {
    appointment = await request(`/audit-team-appointments/project/${project.id}`);
    result('PASS', 'Chỉ định đoàn cấp hồ sơ', `${appointment.appointment_number} · ${appointment.status}`);
  } catch (error) {
    if (error.status === 404) result('WARN', 'Chỉ định đoàn cấp hồ sơ', 'Chưa lập');
    else result('FAIL', 'Chỉ định đoàn cấp hồ sơ', error.message);
  }

  if (appointment?.id) {
    try {
      const competency = await request(`/audit-team-appointments/${appointment.id}/check-competency`, { method: 'POST' });
      result(
        competency?.is_sufficient ? 'PASS' : 'FAIL',
        'Năng lực tổng thể đoàn',
        `${competency?.covered_scopes ?? 0}/${competency?.required_scopes ?? 0}; trưởng đoàn=${competency?.leader_qualified ? 'đạt' : 'chưa đạt'}`,
      );
    } catch (error) {
      result('FAIL', 'Năng lực tổng thể đoàn', error.message);
    }
  }

  try {
    const programs = asArray(await request(`/audit-programs/project/${project.id}`));
    result(programs.length ? 'PASS' : 'WARN', 'Chương trình đánh giá', programs.length ? `${programs.length} phiên bản` : 'Chưa tạo');
  } catch (error) {
    result('FAIL', 'Chương trình đánh giá', error.message);
  }

  summarize();
}

function summarize() {
  console.log('\n=== KẾT QUẢ ===');
  console.log(`PASS: ${pass}`);
  console.log(`WARN: ${warn}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

await main();
