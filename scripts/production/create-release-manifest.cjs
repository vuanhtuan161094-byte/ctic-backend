const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const migrationsDir = path.join(root, 'prisma', 'migrations');
const migrationNames = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

const files = ['package.json', 'package-lock.json', 'prisma/schema.prisma']
  .filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => ({ file, sha256: hashFile(path.join(root, file)) }));

const manifest = {
  product: 'Certification Management Platform',
  application_version: process.env.APP_VERSION?.trim() || packageJson.version,
  build_identifier: process.env.APP_BUILD_ID?.trim() || null,
  release_channel: process.env.APP_RELEASE_CHANNEL?.trim() || null,
  generated_at: new Date().toISOString(),
  node_version: process.version,
  migrations: {
    count: migrationNames.length,
    latest: migrationNames.at(-1) || null,
  },
  files,
  contains_secrets: false,
};

const outputDir = path.join(root, 'release');
fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, 'release-manifest.json');
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Release manifest written: ${output}`);
