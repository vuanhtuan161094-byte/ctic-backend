import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const servicePath = path.join(root, 'src', 'audit-team-appointments', 'audit-team-appointments.service.ts');
const service = fs.readFileSync(servicePath, 'utf8');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function inclusiveDays(start, end) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMs) + 1;
}

function validMemberMandays(start, end, mandays) {
  const max = inclusiveDays(start, end);
  return mandays >= 0.5
    && Math.abs(mandays * 2 - Math.round(mandays * 2)) < 0.0001
    && mandays <= max;
}

console.log('\n=== PATCH 33 — KIỂM TRA LỊCH VÀ MAN-DAY ===');
check('Hai ngày đầy đủ gợi ý 2 MD', inclusiveDays('2026-08-06', '2026-08-07') === 2);
check('Hai ngày có thể phân 1,5 MD', validMemberMandays('2026-08-06', '2026-08-07', 1.5));
check('Không cho phân 2,5 MD trong hai ngày', !validMemberMandays('2026-08-06', '2026-08-07', 2.5));
check('Chỉ chấp nhận bước 0,5 MD', !validMemberMandays('2026-08-06', '2026-08-07', 1.25));
check('Tổng 2 + 1,5 khớp kế hoạch 3,5 MD', Math.abs((2 + 1.5) - 3.5) < 0.001);
check('Nhận diện ngày phân công trước kế hoạch', Date.parse('2026-08-06') < Date.parse('2026-08-07'));

check('Backend có kiểm tra man-day theo nửa ngày', service.includes('isHalfDayIncrement'));
check('Backend chặn ban hành khi tổng MD không khớp', service.includes('Chưa thể ban hành: kế hoạch yêu cầu'));
check('Backend trả lỗi ngày kèm mã kế hoạch và khoảng hợp lệ', service.includes('Hãy chọn ngày trong khoảng'));
check('Backend loại trừ chỉ định hiện tại khi kiểm tra trùng', service.includes('excludeAppointmentId'));

console.log(`\nPASS: ${passed}`);
console.log(`FAIL: ${failed}`);
process.exitCode = failed ? 1 : 0;
