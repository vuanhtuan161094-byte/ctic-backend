import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');

// Resolve TypeScript from this backend project's own node_modules.
// Do not depend on a machine-specific global Node/TypeScript installation.
let ts;
try {
  const typescriptPath = require.resolve('typescript', { paths: [root] });
  ts = require(typescriptPath);
} catch (error) {
  throw new Error(
    'Không tìm thấy package TypeScript cục bộ của backend. Hãy chạy npm install (hoặc npm ci) trong ctic-backend rồi chạy lại regression.',
    { cause: error },
  );
}
const projectRoot = path.resolve(root, '..');
const frontendCandidates = [
  path.join(projectRoot, 'ctic-frontend'),
  path.join(projectRoot, 'frontend'),
];
const frontendRoot = frontendCandidates.find((candidate) => fs.existsSync(candidate));
if (!frontendRoot) throw new Error('Không tìm thấy source frontend cạnh backend.');

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readFrontend = (file) => fs.readFileSync(path.join(frontendRoot, file), 'utf8');

let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${label}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
}

const deploymentSource = read('src/common/deployment-config.ts');
const mainSource = read('src/main.ts');
const certificateSource = read('src/certificates/certificates.service.ts');
const backendEnv = read('.env.example');
const frontendDeploymentSource = readFrontend('app/lib/deployment-config.ts');
const frontendApiSource = readFrontend('app/lib/api.ts');
const frontendEnv = readFrontend('.env.example');
const issuanceSource = readFrontend('app/components/CertificateIssuanceWorkspaceModal.tsx');
const certificatesScreenSource = readFrontend('app/components/CertificatesScreen.tsx');

check(deploymentSource.includes('getDeploymentConfig'), 'Backend có helper deployment dùng chung');
check(deploymentSource.includes('PUBLIC_BASE_URL là bắt buộc khi NODE_ENV=production'), 'Production chặn thiếu PUBLIC_BASE_URL để QR không trỏ localhost');
check(deploymentSource.includes('CORS_ORIGINS không được dùng "*"'), 'CORS chặn wildcard khi credentials=true');
check(deploymentSource.includes('CORS_ALLOW_PRIVATE_NETWORK'), 'Có cấu hình riêng cho phép test mạng LAN/private');
check(deploymentSource.includes('TRUST_PROXY'), 'Có cấu hình trust proxy cho reverse proxy/HTTPS');
check(mainSource.includes("from './common/deployment-config'"), 'main.ts dùng deployment helper chung');
check(!mainSource.includes("'http://localhost:5173,http://localhost:3001'"), 'main.ts không còn hard-code danh sách CORS localhost');
check(!mainSource.includes('API documentation: http://localhost:'), 'Log Swagger không còn hard-code localhost');
check(mainSource.includes('deployment.host') && mainSource.includes('deployment.port'), 'Host/port backend lấy từ deployment config');
check(certificateSource.includes('getDeploymentConfig') && !certificateSource.includes("'http://localhost:3000'"), 'QR chứng chỉ dùng PUBLIC_BASE_URL chung thay vì fallback localhost riêng');
check(backendEnv.includes('PUBLIC_BASE_URL=') && backendEnv.includes('FRONTEND_BASE_URL='), '.env.example backend có URL công khai và frontend');
check(backendEnv.includes('CORS_ALLOW_PRIVATE_NETWORK=') && backendEnv.includes('TRUST_PROXY='), '.env.example backend có cấu hình LAN/proxy');
check(frontendDeploymentSource.includes('VITE_API_BASE_URL'), 'Frontend có cấu hình API nội bộ');
check(frontendDeploymentSource.includes('VITE_PUBLIC_API_BASE_URL'), 'Frontend có cấu hình API công khai riêng');
check(frontendDeploymentSource.includes('window.location') && frontendDeploymentSource.includes('same-origin'), 'Frontend có fallback same-origin khi deploy domain/reverse proxy');
check(frontendApiSource.includes('from "./deployment-config"'), 'Axios lấy API base URL từ helper deployment chung');
check(frontendEnv.includes('VITE_PUBLIC_API_BASE_URL='), '.env.example frontend có public API base URL');
check(issuanceSource.includes('buildPublicApiUrl') && certificatesScreenSource.includes('buildPublicApiUrl'), 'Link PDF/QR chứng chỉ trên UI dùng public URL helper chung');
check(!issuanceSource.includes('`${API_BASE_URL}/public/certificates/') && !certificatesScreenSource.includes('`${API_BASE_URL}/public/certificates/'), 'UI không còn ghép public certificate URL trực tiếp từ API nội bộ');

// Chạy thực tế logic helper backend bằng cách transpile TypeScript thuần sang CommonJS.
const transpiled = ts.transpileModule(deploymentSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-deploy-test-'));
const compiledPath = path.join(tempDir, 'deployment-config.cjs');
fs.writeFileSync(compiledPath, transpiled);
const deployment = require(compiledPath);

const lanConfig = deployment.getDeploymentConfig({
  NODE_ENV: 'development',
  PORT: '4000',
  PUBLIC_BASE_URL: 'http://192.168.1.50:4000/',
  CORS_ORIGINS: 'http://localhost:5173/,https://app.example.com',
  CORS_ALLOW_PRIVATE_NETWORK: 'false',
  TRUST_PROXY: '1',
});
check(lanConfig.publicBaseUrl === 'http://192.168.1.50:4000', 'PUBLIC_BASE_URL được chuẩn hóa bỏ slash cuối');
check(lanConfig.port === 4000 && lanConfig.trustProxy === 1, 'Port và trust proxy được parse đúng');
check(deployment.isCorsOriginAllowed('https://app.example.com', lanConfig) === true, 'CORS cho phép origin đã cấu hình');
check(deployment.isCorsOriginAllowed('http://192.168.1.99:5173', lanConfig) === false, 'CORS không tự mở LAN khi cấu hình đã tắt');

let productionMissingPublicUrlRejected = false;
try {
  deployment.getDeploymentConfig({ NODE_ENV: 'production', PORT: '3000' });
} catch {
  productionMissingPublicUrlRejected = true;
}
check(productionMissingPublicUrlRejected, 'Production thực tế reject khi thiếu PUBLIC_BASE_URL');

let wildcardRejected = false;
try {
  deployment.getDeploymentConfig({ CORS_ORIGINS: '*' });
} catch {
  wildcardRejected = true;
}
check(wildcardRejected, 'CORS wildcard thực tế bị reject');

fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`\nPatch 36B.3 deployment config regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
