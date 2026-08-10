const strict = process.argv.includes('--strict') || process.env.NODE_ENV === 'production';
const major = Number(process.versions.node.split('.')[0]);
const supported = major === 22 || major === 24;

if (supported) {
  console.log(`Runtime Node.js ${process.versions.node}: supported for this project baseline.`);
  process.exit(0);
}

const message = [
  `Node.js ${process.versions.node} đang nằm ngoài dải runtime đã chốt cho backend Prisma 7.`,
  'Dùng Node.js 24 LTS (khuyến nghị) hoặc Node.js 22 LTS để giảm lỗi driver/build không tái hiện.',
].join(' ');

if (strict) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

console.warn(`WARN: ${message}`);
