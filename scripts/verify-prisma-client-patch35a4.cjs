const fs = require('fs');
const path = require('path');

const root = process.cwd();
const candidates = [
  path.resolve(root, 'node_modules', '.prisma', 'client', 'index.d.ts'),
  path.resolve(root, 'node_modules', '.prisma', 'client', 'default.d.ts'),
  path.resolve(root, 'node_modules', '@prisma', 'client', 'index.d.ts'),
  path.resolve(root, 'node_modules', '@prisma', 'client', 'default.d.ts'),
];

const readable = candidates.filter((file) => fs.existsSync(file));
const content = readable.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

const requiredTokens = [
  // Patch 35A.3/35A.4 - IMS manday allocation
  'audit_program_manday_requirements',
  'audit_member_program_mandays',
  'audit_manday_allocation_versions',
  'program_mandays',
  'program_manday_requirements',
  'manday_allocation_versions',
  // Patch 36B.5 - file integrity
  'DocumentFile',
  'sha256',
  // Patch 36B.6 - security audit metadata
  'audit_logs',
  'request_id',
  'outcome',
  'status_code',
  'duration_ms',
];

const missing = requiredTokens.filter((token) => !content.includes(token));

if (!readable.length || missing.length) {
  console.error('');
  console.error('PRISMA CLIENT DANG CU HOAC CHUA DUOC GENERATE THEO schema.prisma HIEN TAI.');
  if (!readable.length) {
    console.error('Khong tim thay generated Prisma Client trong node_modules.');
  }
  if (missing.length) {
    console.error(`Generated client dang thieu: ${missing.join(', ')}`);
  }
  console.error('');
  console.error('Hay DUNG backend dang chay (Ctrl+C), sau do chay:');
  console.error('  npm run prisma:generate');
  console.error('  npm run build');
  console.error('  npm run start:dev');
  console.error('');
  process.exit(1);
}

console.log('Prisma Client da dong bo voi schema hien tai (IMS + sha256 + audit security).');
