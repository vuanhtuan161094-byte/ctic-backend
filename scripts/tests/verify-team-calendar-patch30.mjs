import readline from 'node:readline/promises';
import process from 'node:process';

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
const username = process.env.ADMIN_USERNAME ?? 'admin';
const requestedProjectCode = process.argv[2]?.trim();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const password = process.env.ADMIN_PASSWORD ?? await rl.question('Nhập mật khẩu ADMIN: ');
rl.close();

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join('; ') : data?.message ?? text;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return data;
}

const login = await request('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const headers = { Authorization: `Bearer ${login.access_token}` };

const projects = await request('/certification-projects', { headers });
const project = requestedProjectCode
  ? projects.find((item) => item.project_code === requestedProjectCode)
  : projects.find((item) => item.project_code);

if (!project) throw new Error('Không tìm thấy hồ sơ chứng nhận để kiểm tra');

console.log(`\nHồ sơ: ${project.project_code}`);
const suitability = await request(
  `/audit-team-appointments/project/${project.id}/expert-suitability`,
  { headers },
);

console.log(`Phạm vi phải bao phủ: ${suitability.required_scope_count}`);
console.table(
  suitability.experts.map((expert) => ({
    'Chuyên gia': expert.full_name,
    'Phù hợp': expert.is_relevant ? 'Có' : 'Không',
    'Có thể trưởng đoàn': expert.can_lead ? 'Có' : 'Không',
    'Bao phủ': `${expert.coverage_count}/${expert.required_scope_count}`,
    'Tiêu chuẩn': expert.covered_standards.join(', ') || '—',
  })),
);

const relevantExpert = suitability.experts.find((expert) => expert.is_relevant);
if (!relevantExpert) throw new Error('Không có chuyên gia phù hợp để kiểm tra lịch');

const year = new Date().getUTCFullYear();
const busy = await request(
  `/audit-team-appointments/expert/${relevantExpert.expert_id}/busy-dates?start_date=${year}-01-01&end_date=${year + 3}-12-31`,
  { headers },
);

console.log(`\nLịch chuyên gia: ${relevantExpert.full_name}`);
console.log(`Số ngày đã có lịch: ${busy.busy_dates.length}`);
for (const assignment of busy.assignments) {
  console.log(`- ${assignment.customer_name} · ${assignment.plan_code ?? assignment.project_code} · ${String(assignment.start_date).slice(0, 10)} → ${String(assignment.end_date).slice(0, 10)}`);
}

console.log('\nPASS: API năng lực tổng thể đoàn và lịch bận hoạt động.');
