#!/usr/bin/env node

import process from 'node:process';
import readline from 'node:readline/promises';

function parseArgs(argv) {
  const result = {
    baseUrl: process.env.CTIC_TEST_BASE_URL || 'http://localhost:3000',
    username: process.env.CTIC_TEST_USERNAME || 'admin',
    password: process.env.CTIC_TEST_PASSWORD || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--base-url' && next) {
      result.baseUrl = next;
      index += 1;
    } else if (current === '--username' && next) {
      result.username = next;
      index += 1;
    } else if (current === '--password' && next) {
      result.password = next;
      index += 1;
    }
  }

  result.baseUrl = result.baseUrl.replace(/\/+$/, '');
  return result;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function normalizeText(value) {
  return String(value ?? '').trim().toUpperCase();
}

function approximatelyEqual(actual, expected, tolerance = 0.001) {
  return Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) <= tolerance;
}

const config = parseArgs(process.argv.slice(2));
const results = [];
let token = '';

function addResult(name, status, detail = '') {
  results.push({ name, status, detail });
  const marker = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗';
  console.log(`${marker} [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers,
  });

  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    const message = typeof body === 'string'
      ? body
      : body?.message || body?.error || JSON.stringify(body);
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }

  return body;
}

async function testGet(name, path, critical = true) {
  try {
    const body = await request(path);
    addResult(name, 'PASS', 'HTTP 200');
    return body;
  } catch (error) {
    addResult(name, critical ? 'FAIL' : 'WARN', error.message);
    return null;
  }
}

async function testMandayCase({ name, payload, expected }) {
  try {
    const body = await request('/manday-calculations/suggest', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const mismatches = [];
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (!approximatelyEqual(body?.[field], expectedValue)) {
        mismatches.push(`${field}: nhận ${body?.[field]}, cần ${expectedValue}`);
      }
    }

    if (mismatches.length) {
      addResult(name, 'FAIL', mismatches.join('; '));
    } else {
      addResult(
        name,
        'PASS',
        `base=${body.base_mandays}, initial=${body.final_initial_mandays}, GD1=${body.stage1_mandays}, GD2=${body.stage2_mandays}`,
      );
    }

    return body;
  } catch (error) {
    addResult(name, 'FAIL', error.message);
    return null;
  }
}

function competencySupports(competency, standardToken) {
  const haystack = normalizeText([
    competency.standard_code,
    competency.management_system,
  ].filter(Boolean).join(' '));

  if (standardToken === '9001') return haystack.includes('9001') || haystack.includes('QMS');
  if (standardToken === '14001') return haystack.includes('14001') || haystack.includes('EMS');
  if (standardToken === '45001') {
    return haystack.includes('45001') || haystack.includes('OHSMS') || haystack.includes('OH&SMS');
  }
  return false;
}

function isCompetencyCurrentlyValid(competency) {
  if (normalizeText(competency.approval_status) !== 'APPROVED') return false;
  if (!competency.expiry_date) return true;
  const expiry = new Date(competency.expiry_date);
  return Number.isNaN(expiry.getTime()) || expiry.getTime() >= Date.now();
}

async function main() {
  console.log('');
  console.log('=== KIỂM THỬ NHANH NỀN TẢNG CHỨNG NHẬN ===');
  console.log(`Backend: ${config.baseUrl}`);
  console.log(`Tài khoản: ${config.username}`);
  console.log('');

  if (!config.password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    config.password = await rl.question('Nhập mật khẩu ADMIN (ký tự sẽ hiển thị): ');
    rl.close();
  }

  try {
    await request('/health');
    addResult('Backend health', 'PASS', 'HTTP 200');
  } catch (error) {
    addResult('Backend health', 'FAIL', error.message);
    summarizeAndExit();
    return;
  }

  try {
    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: config.username, password: config.password }),
    });
    token = login?.access_token || login?.token || '';
    if (!token) throw new Error('Đăng nhập thành công nhưng response không có access_token');
    addResult('Đăng nhập', 'PASS', 'Đã nhận JWT');
  } catch (error) {
    addResult('Đăng nhập', 'FAIL', error.message);
    summarizeAndExit();
    return;
  }

  console.log('\n--- 1. API lõi ---');
  await testGet('Danh sách đơn đăng ký', '/certification-applications');
  await testGet('Danh sách xem xét đơn', '/application-reviews');
  await testGet('Danh sách chuyên gia', '/experts');
  await testGet('Danh sách năng lực chuyên gia', '/expert-competencies');
  await testGet('Bảng tra man-day', '/manday-calculations/reference-tables');
  await testGet('Danh mục ISIC 2220', '/industry-classifications/codes?classification_type=ISIC&search=2220&active=true');

  console.log('\n--- 2. Tra ISIC → NACE → IAF ---');
  for (const system of ['QMS', 'EMS', 'OHSMS']) {
    await testGet(
      `Tra ISIC 2220 cho ${system}`,
      `/industry-classifications/resolve?classification_type=ISIC&revision=ISIC_REV_4&code=2220&management_system=${encodeURIComponent(system)}`,
      false,
    );
  }

  console.log('\n--- 3. Kiểm tra bảng man-day ---');
  await testMandayCase({
    name: 'QMS — 100 nhân sự',
    payload: {
      standards: ['ISO 9001:2015'],
      effective_personnel: 100,
      audit_type: 'initial',
    },
    expected: {
      base_mandays: 7,
      final_initial_mandays: 7,
      stage1_mandays: 1,
      stage2_mandays: 6,
      surveillance_mandays: 2,
      recertification_mandays: 4.5,
    },
  });

  await testMandayCase({
    name: 'EMS trung bình — 100 nhân sự',
    payload: {
      standards: ['ISO 14001:2015'],
      effective_personnel: 100,
      audit_type: 'initial',
      ems_complexity: 'medium',
    },
    expected: {
      base_mandays: 8,
      final_initial_mandays: 8,
      stage1_mandays: 1.5,
      stage2_mandays: 6.5,
      surveillance_mandays: 2.5,
      recertification_mandays: 5,
    },
  });

  await testMandayCase({
    name: 'OH&SMS thấp — 100 nhân sự',
    payload: {
      standards: ['ISO 45001:2018'],
      effective_personnel: 100,
      audit_type: 'initial',
      ohsms_complexity: 'low',
    },
    expected: {
      base_mandays: 5.5,
      final_initial_mandays: 5.5,
      stage1_mandays: 1,
      stage2_mandays: 4.5,
      surveillance_mandays: 1.5,
      recertification_mandays: 3.5,
    },
  });

  await testMandayCase({
    name: 'QMS tối thiểu — 1 nhân sự',
    payload: {
      standards: ['ISO 9001:2015'],
      effective_personnel: 1,
      audit_type: 'initial',
    },
    expected: {
      base_mandays: 1.5,
      final_initial_mandays: 1.5,
      stage1_mandays: 0.5,
      stage2_mandays: 1,
      surveillance_mandays: 1,
      recertification_mandays: 1,
    },
  });

  await testMandayCase({
    name: 'IMS 9001+14001+45001 — 100 nhân sự',
    payload: {
      standards: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'],
      effective_personnel: 100,
      audit_type: 'initial',
      ems_complexity: 'medium',
      ohsms_complexity: 'low',
      ims_integration_percent: 42.86,
      combined_audit_capability_percent: 50,
    },
    expected: {
      base_mandays: 20.5,
      calculated_ims_reduction_percent: 10,
      ims_reduction_percent: 10,
      final_initial_mandays: 18,
      stage1_mandays: 3.5,
      stage2_mandays: 14.5,
      surveillance_mandays: 6,
      recertification_mandays: 12,
    },
  });

  console.log('\n--- 4. Ma trận năng lực chuyên gia IAF 14 / NACE 22.29 ---');
  let competencies = [];
  try {
    const body = await request('/expert-competencies?status=APPROVED&iaf_code=14&nace_code=22.29');
    competencies = asArray(body).filter(isCompetencyCurrentlyValid);
    addResult('Đọc năng lực IAF 14 / NACE 22.29', 'PASS', `${competencies.length} hồ sơ năng lực còn hiệu lực`);
  } catch (error) {
    addResult('Đọc năng lực IAF 14 / NACE 22.29', 'FAIL', error.message);
  }

  if (competencies.length) {
    const byExpert = new Map();
    for (const competency of competencies) {
      const expert = competency.experts || competency.expert || {};
      const key = expert.id || competency.expert_id || expert.email || 'UNKNOWN';
      const current = byExpert.get(key) || {
        name: expert.full_name || expert.email || competency.expert_id || 'Không rõ',
        qms: false,
        ems: false,
        ohsms: false,
      };
      current.qms ||= competencySupports(competency, '9001');
      current.ems ||= competencySupports(competency, '14001');
      current.ohsms ||= competencySupports(competency, '45001');
      byExpert.set(key, current);
    }

    console.table([...byExpert.values()].map((item) => ({
      'Chuyên gia': item.name,
      'ISO 9001': item.qms ? 'Đủ' : '—',
      'ISO 14001': item.ems ? 'Đủ' : '—',
      'ISO 45001': item.ohsms ? 'Đủ' : '—',
    })));

    const collective = [...byExpert.values()].reduce(
      (value, item) => ({
        qms: value.qms || item.qms,
        ems: value.ems || item.ems,
        ohsms: value.ohsms || item.ohsms,
      }),
      { qms: false, ems: false, ohsms: false },
    );

    addResult('Nguồn lực ISO 9001 — IAF 14', collective.qms ? 'PASS' : 'WARN', collective.qms ? 'Có chuyên gia phù hợp' : 'Chưa có');
    addResult('Nguồn lực ISO 14001 — IAF 14', collective.ems ? 'PASS' : 'WARN', collective.ems ? 'Có chuyên gia phù hợp' : 'Chưa có');
    addResult(
      'Nguồn lực ISO 45001 — IAF 14',
      collective.ohsms ? 'PASS' : 'WARN',
      collective.ohsms
        ? 'Có chuyên gia phù hợp'
        : 'Chưa có năng lực ISO 45001 được phê duyệt. Đây là nguyên nhân hệ thống không thể xác nhận đầy đủ đoàn tích hợp 3 tiêu chuẩn.',
    );
  } else {
    addResult('Ma trận năng lực IAF 14', 'WARN', 'Không có dữ liệu để kiểm tra');
  }

  summarizeAndExit();
}

function summarizeAndExit() {
  const failed = results.filter((item) => item.status === 'FAIL');
  const warnings = results.filter((item) => item.status === 'WARN');
  const passed = results.filter((item) => item.status === 'PASS');

  console.log('\n=== KẾT QUẢ ===');
  console.log(`PASS: ${passed.length}`);
  console.log(`WARN: ${warnings.length}`);
  console.log(`FAIL: ${failed.length}`);

  if (failed.length) {
    console.log('\nCác lỗi cần sửa trước:');
    failed.forEach((item) => console.log(`- ${item.name}: ${item.detail}`));
  }

  if (warnings.length) {
    console.log('\nCác cảnh báo dữ liệu/cấu hình:');
    warnings.forEach((item) => console.log(`- ${item.name}: ${item.detail}`));
  }

  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error('\nLỗi không xử lý được:', error);
  process.exitCode = 1;
});
