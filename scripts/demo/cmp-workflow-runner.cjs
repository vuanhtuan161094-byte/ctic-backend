#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_RUN_ID = 'CMP-DEMO-20261023-A';
const DEMO_DATABASE = 'CTIC_CMP_DEMO_2026';
const DEMO_SERVER = 'CTIC-LP-054';
const DEMO_INSTANCE = 'SQLEXPRESS';
const REQUIRED_INTERNAL_ROLES = [
  'SALES',
  'STAFF',
  'COORDINATOR',
  'LEAD_AUDITOR',
  'AUDITOR',
  'TECHNICAL_EXPERT',
  'TECHNICAL_REVIEWER',
  'DECISION_MAKER',
];

function buildWorkflowPlan(runId = DEFAULT_RUN_ID) {
  return {
    runId,
    mode: 'dry-run',
    apiCallsMade: 0,
    databaseWrites: 0,
    cleanupPerformed: false,
    steps: [
      { id: 'sandbox-gate', action: 'Xác minh đúng SQL sandbox và backup đã kiểm tra', method: 'SQL + API identity', status: 'blocked-until-verified' },
      { id: 'organization', action: 'Cấu hình hồ sơ tổ chức DEMO qua API', method: 'GET/PATCH', path: '/master-data-configuration/organization-profile', actor: 'ADMIN', dependsOn: ['sandbox-gate'] },
      { id: 'program-standard', action: 'Cấu hình QMS và edition ISO 9001 hiện hành qua API với nhãn DEMO', method: 'POST', path: '/master-data-configuration/schemes', actor: 'ADMIN', dependsOn: ['organization'] },
      { id: 'internal-accounts', action: 'Tạo tài khoản theo vai trò và xác minh SoD', method: 'POST', path: '/users', actor: 'ADMIN', dependsOn: ['organization'], roles: REQUIRED_INTERNAL_ROLES },
      { id: 'customers', action: 'Tạo 20 khách hàng hư cấu qua API', method: 'POST', path: '/customers', actor: 'ADMIN', dependsOn: ['internal-accounts'], checkpoints: [1, 5, 20] },
      { id: 'portal-access', action: 'Tạo Portal cho 20 khách hàng và kiểm tra tenant isolation', method: 'POST', path: '/customers/:id/portal-users', actor: 'ADMIN', dependsOn: ['customers'] },
      { id: 'first-application', action: 'Tạo và gửi một đơn qua Portal; xác minh hàng đợi Điều phối', method: 'POST', path: '/customer-portal/me/applications', actor: 'CUSTOMER then COORDINATOR', dependsOn: ['portal-access'], note: 'Chỉ tiếp tục nếu dữ liệu nghiệp vụ thực tế đáp ứng điều kiện.' },
    ],
    requiredBeforeApply: [
      `Exact SQL identity ${DEMO_SERVER}\\${DEMO_INSTANCE}/${DEMO_DATABASE} verified by the one-time API bootstrap guard.`,
      'A verified backup and migration state.',
      'A loopback-only API instance and external manifest/credential files.',
    ],
  };
}

function readManifest(manifestPath) {
  const resolvedPath = path.resolve(manifestPath);
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.runId !== 'string') {
    throw new Error('Manifest must contain a runId.');
  }
  return { resolvedPath, manifest: parsed };
}

function buildCleanupDryRun(manifestPath) {
  const { resolvedPath, manifest } = readManifest(manifestPath);
  const records = Array.isArray(manifest.createdRecords) ? manifest.createdRecords : [];
  const dependencies = records.flatMap((record) => (
    Array.isArray(record.dependencies) ? record.dependencies.map((dependency) => ({ recordId: record.id ?? null, ...dependency })) : []
  ));
  return {
    mode: 'cleanup-dry-run',
    runId: manifest.runId,
    manifestPath: resolvedPath,
    database: manifest.database ?? null,
    status: manifest.status ?? 'unspecified',
    createdRecordCount: records.length,
    createdRecords: records.map(({ type, id, code, createdAt }) => ({ type: type ?? null, id: id ?? null, code: code ?? null, createdAt: createdAt ?? null })),
    dependencyCount: dependencies.length,
    dependencies,
    cleanupPerformed: false,
    deleteCount: 0,
  };
}

function parseArguments(argv) {
  const args = { runId: DEFAULT_RUN_ID, apply: false, cleanupManifest: null, manifestPath: null, credentialsPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') continue;
    if (argument === '--run-id') {
      args.runId = argv[index + 1] ?? '';
      if (!args.runId || args.runId.startsWith('--')) throw new Error('--run-id requires a value.');
      index += 1;
    } else if (argument === '--manifest') {
      args.manifestPath = argv[index + 1] ?? '';
      if (!args.manifestPath || args.manifestPath.startsWith('--')) throw new Error('--manifest requires a path.');
      index += 1;
    } else if (argument === '--credentials') {
      args.credentialsPath = argv[index + 1] ?? '';
      if (!args.credentialsPath || args.credentialsPath.startsWith('--')) throw new Error('--credentials requires a path.');
      index += 1;
    } else if (argument === '--cleanup-dry-run') {
      args.cleanupManifest = argv[index + 1] ?? '';
      if (!args.cleanupManifest || args.cleanupManifest.startsWith('--')) throw new Error('--cleanup-dry-run requires a manifest path.');
      index += 1;
    } else if (argument === '--apply') {
      args.apply = true;
    } else if (argument === '--help' || argument === '-h') {
      return { help: true };
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (args.apply && args.cleanupManifest) throw new Error('Apply and cleanup dry-run cannot be combined.');
  return args;
}

function privateDataRoot(env = process.env) {
  const root = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(root, 'CMP', 'DEMO');
}

function defaultManifestPath(env = process.env) {
  return path.join(privateDataRoot(env), 'manifest.json');
}

function defaultCredentialsPath(env = process.env) {
  return path.join(privateDataRoot(env), 'credentials.json');
}

function assertOutsideRepository(filePath) {
  const resolved = path.resolve(filePath);
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const relative = path.relative(repositoryRoot, resolved);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Manifest and credentials must be stored outside the Git repository.');
  }
  return resolved;
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  if (process.platform !== 'win32') {
    fs.chmodSync(directory, 0o700);
    return;
  }
  const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).trim();
  const sid = identity.match(/S-1-[0-9-]+/i)?.[0];
  if (!sid) throw new Error('Could not identify the current Windows user to protect demo credentials.');
  execFileSync('icacls.exe', [
    directory,
    '/inheritance:r',
    '/grant:r',
    `*${sid}:(OI)(CI)F`,
    '*S-1-5-18:(OI)(CI)F',
    '*S-1-5-32-544:(OI)(CI)F',
  ], { encoding: 'utf8', windowsHide: true, stdio: 'ignore' });
}

function writeJsonAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, filePath);
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function makeRunSlug(runId) {
  return `${runId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)}_${crypto.createHash('sha256').update(runId).digest('hex').slice(0, 6)}`;
}

function requireLoopbackApi(baseUrl) {
  const parsed = new URL(baseUrl);
  if (!['127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Demo API must use a loopback URL without embedded credentials, query, or fragment.');
  }
  return parsed.toString().replace(/\/$/, '');
}

function validateApplyEnvironment(env = process.env) {
  if (env.CMP_DEMO_APPLY !== 'YES') throw new Error('Set CMP_DEMO_APPLY=YES only in the dedicated DEMO launcher.');
  if (env.CMP_DEMO_GATE_A_VERIFIED !== 'YES') throw new Error('Apply is blocked until a current Gate A backup-verification log has been confirmed.');
  if (env.CMP_DEMO_DATABASE !== DEMO_DATABASE || env.CMP_DEMO_SQL_SERVER?.toUpperCase() !== DEMO_SERVER || env.CMP_DEMO_SQL_INSTANCE?.toUpperCase() !== DEMO_INSTANCE) {
    throw new Error('Apply is blocked: expected the exact CTIC-LP-054\\SQLEXPRESS / CTIC_CMP_DEMO_2026 target.');
  }
  if (env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED !== 'true' || String(env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN ?? '').length < 32) {
    throw new Error('Apply is blocked: the one-time, local-only bootstrap guard is not configured.');
  }
  if (typeof fetch !== 'function') throw new Error('Node.js with built-in fetch is required.');
  return requireLoopbackApi(env.CMP_DEMO_API_BASE_URL || 'http://127.0.0.1:3100');
}

function safeMessage(body) {
  if (typeof body === 'string') return body.slice(0, 1000);
  if (body && typeof body.message === 'string') return body.message.slice(0, 1000);
  return 'API request failed.';
}

function createApiClient(baseUrl, log, fetchImpl = fetch) {
  return async function apiRequest(method, endpoint, { token, body, headers = {}, allowStatus = [] } = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      log({ event: 'api_error', method, endpoint, message: error instanceof Error ? error.message : 'network error' });
      throw new Error(`Cannot reach the local CMP DEMO API at ${baseUrl}.`);
    }
    const text = await response.text();
    let value = null;
    if (text) {
      try { value = JSON.parse(text); } catch { value = text; }
    }
    log({ event: 'api_response', method, endpoint, status: response.status });
    if (!response.ok && !allowStatus.includes(response.status)) {
      throw new Error(`${method} ${endpoint} returned ${response.status}: ${safeMessage(value)}`);
    }
    return { status: response.status, body: value };
  };
}

function appendRecord(manifest, { type, id, code, createdAt = new Date().toISOString(), dependencies = [] }) {
  if (!id) throw new Error(`API did not return an ID for ${type}.`);
  const existing = manifest.createdRecords.find((record) => record.type === type && record.id === id);
  if (!existing) manifest.createdRecords.push({ type, id, ...(code ? { code } : {}), createdAt, dependencies });
  manifest.updatedAt = new Date().toISOString();
  return manifest;
}

function saveProgress(manifestPath, credentialsPath, manifest, credentials) {
  writeJsonAtomically(manifestPath, manifest);
  writeJsonAtomically(credentialsPath, credentials);
}

function newManifest(runId) {
  return {
    schema: 'cmp-demo-workflow-manifest/v1',
    runId,
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    database: { server: DEMO_SERVER, instance: DEMO_INSTANCE, name: DEMO_DATABASE, verifiedByBootstrapApi: false },
    steps: {},
    createdRecords: [],
    cleanupPerformed: false,
  };
}

function makeOrganizationProfile() {
  return {
    legal_name: 'CTIC DEMO — Tổ chức chứng nhận',
    display_name: 'CTIC DEMO',
    short_name: 'CTIC-DEMO',
    address: 'Môi trường thử nghiệm CMP; không phải địa chỉ giao dịch.',
    email: 'demo@example.invalid',
    document_footer: 'Tài liệu tạo trong môi trường CMP DEMO.',
    portal_title: 'Cổng khách hàng CTIC DEMO',
    timezone: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
    date_format: 'DD/MM/YYYY',
    default_language: 'vi',
    certificate_reminder_days: 90,
    file_retention_days: 30,
  };
}

function customerInputs(runId) {
  const slug = makeRunSlug(runId);
  const regions = ['Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'Bình Dương', 'Đồng Nai', 'Quảng Ninh', 'Lâm Đồng', 'Nghệ An', 'Thừa Thiên Huế'];
  const industries = ['Cơ khí An Phúc', 'Thiết bị Minh Hải', 'Thực phẩm Sao Mai', 'Bao bì Tân Lộc', 'Điện tử Hướng Dương', 'Dệt may Bình Minh', 'Nông sản Hạt Ngọc', 'Nhựa Đại Phong', 'Nội thất Mộc Việt', 'Dược liệu Lam Sơn', 'Vật liệu Đông Á', 'Kho vận Cánh Buồm', 'Năng lượng Gió Việt', 'Thiết bị Y tế Sen Việt', 'Hóa chất Sông Xanh', 'In ấn Bách Khoa', 'Thủy sản Biển Ngọc', 'Công nghệ Mây Tre', 'Thủ công Việt An', 'Linh kiện Bảo Long'];
  return industries.map((industry, index) => {
    const number = String(index + 1).padStart(2, '0');
    const country = index === 17 ? { country_code: 'JP', country_name: 'Nhật Bản' } : index === 18 ? { country_code: 'SG', country_name: 'Singapore' } : { country_code: 'VN' };
    return {
      customer_code: `D26${crypto.createHash('sha256').update(`${slug}:${number}`).digest('hex').slice(0, 8).toUpperCase()}`,
      company_name: `DEMO ${runId} — ${industry}`,
      ...country,
      address: `Địa chỉ giả lập ${number}, khu công nghiệp thử nghiệm, ${regions[index % regions.length]}`,
      email: `cmpdemo.${slug}.customer${number}@example.invalid`,
    };
  });
}

function unwrapList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function findId(value) {
  return value?.id ?? value?.user?.id ?? value?.customer?.id ?? value?.application?.id ?? value?.data?.id ?? null;
}

function makeCredentials(runId) {
  const slug = makeRunSlug(runId);
  return {
    schema: 'cmp-demo-credentials/v1',
    runId,
    admin: {
      username: `cmpdemo_${slug}_admin`.slice(0, 50),
      email: `cmpdemo.admin.${slug}@example.invalid`,
      full_name: 'Quản trị viên CMP DEMO',
      password: randomSecret(32),
      bootstrapToken: randomSecret(32),
    },
    internalAccounts: {},
    portalAccounts: {},
  };
}

async function runWorkflow({ runId, manifestPath, credentialsPath, env = process.env, fetchImpl = fetch, log = () => {} }) {
  const baseUrl = validateApplyEnvironment(env);
  const resolvedManifestPath = assertOutsideRepository(manifestPath || defaultManifestPath(env));
  const resolvedCredentialsPath = assertOutsideRepository(credentialsPath || defaultCredentialsPath(env));
  if (path.resolve(resolvedManifestPath) === path.resolve(resolvedCredentialsPath)) throw new Error('Manifest and credentials must use separate files.');
  const directory = path.dirname(resolvedManifestPath);
  if (path.dirname(resolvedCredentialsPath).toLowerCase() !== directory.toLowerCase()) throw new Error('Keep the manifest and private credentials in the same protected DEMO folder.');
  ensurePrivateDirectory(directory);

  let manifest = fs.existsSync(resolvedManifestPath) ? JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8')) : newManifest(runId);
  let credentials = fs.existsSync(resolvedCredentialsPath) ? JSON.parse(fs.readFileSync(resolvedCredentialsPath, 'utf8')) : makeCredentials(runId);
  if (manifest.runId !== runId || credentials.runId !== runId) throw new Error('Existing manifest or credentials belong to a different runId.');
  if (manifest.status === 'complete') return { status: 'already-complete', runId, manifestPath: resolvedManifestPath };
  if (manifest.database?.name && manifest.database.name !== DEMO_DATABASE) throw new Error('Manifest target database does not match the DEMO allowlist.');
  if (!manifest.steps.sandboxGate?.status) credentials.admin.bootstrapToken = env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN;
  const request = createApiClient(baseUrl, log, fetchImpl);

  try {
    if (!manifest.steps.sandboxGate?.status) {
      await request('POST', '/auth/demo-bootstrap-admin', {
        headers: { 'x-cmp-demo-bootstrap-token': credentials.admin.bootstrapToken },
        body: {
          username: credentials.admin.username,
          email: credentials.admin.email,
          password: credentials.admin.password,
          full_name: credentials.admin.full_name,
        },
        allowStatus: [409],
      });
    }
    const login = await request('POST', '/auth/login', { body: { username: credentials.admin.username, password: credentials.admin.password } });
    if (!login.body?.access_token || !login.body?.user?.roles?.some((role) => String(role).toUpperCase() === 'ADMIN')) throw new Error('Initial-admin bootstrap did not produce a usable ADMIN session.');
    manifest.database.verifiedByBootstrapApi = true;
    manifest.steps.sandboxGate = { status: 'verified', at: new Date().toISOString() };
    credentials.admin.bootstrapToken = '';
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    let adminToken = login.body?.access_token;
    if (!adminToken || !login.body?.user?.roles?.some((role) => String(role).toUpperCase() === 'ADMIN')) throw new Error('The DEMO administrator login did not return an ADMIN session.');
    credentials.admin.id = login.body.user.id;
    appendRecord(manifest, { type: 'admin_user', id: login.body.user.id, code: credentials.admin.username });
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const profileResponse = await request('GET', '/master-data-configuration/organization-profile', { token: adminToken });
    const desiredProfile = makeOrganizationProfile();
    const currentProfile = profileResponse.body ?? {};
    if (Object.entries(desiredProfile).some(([key, value]) => currentProfile[key] !== value)) {
      await request('PATCH', '/master-data-configuration/organization-profile', { token: adminToken, body: desiredProfile });
    }
    manifest.steps.organization = { status: 'configured', at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const marker = `CMP DEMO ${runId}`;
    const schemes = unwrapList((await request('GET', '/master-data-configuration/schemes?search=QMS&active_only=false', { token: adminToken })).body);
    let scheme = schemes.find((item) => String(item.code).toUpperCase() === 'QMS');
    if (!scheme) {
      scheme = (await request('POST', '/master-data-configuration/schemes', {
        token: adminToken,
        body: {
          code: 'QMS',
          name: 'Hệ thống quản lý chất lượng — DEMO',
          description: `${marker}; dữ liệu cấu hình thử nghiệm, không phải tuyên bố phạm vi công nhận.`,
          status: 'ACTIVE',
          accreditation_metadata: JSON.stringify({ demo: true, runId, accreditationClaim: false }),
        },
      })).body;
      appendRecord(manifest, { type: 'certification_scheme', id: findId(scheme), code: 'QMS' });
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    } else if (scheme.status !== 'ACTIVE' || !String(scheme.description ?? '').includes(marker)) {
      throw new Error('An existing QMS scheme is not owned by this DEMO run; no scheme update was attempted.');
    } else {
      appendRecord(manifest, { type: 'certification_scheme', id: findId(scheme), code: 'QMS' });
    }
    const schemeId = findId(scheme);
    if (!schemeId) throw new Error('The QMS scheme API did not return its ID.');

    const masterStandards = unwrapList((await request('GET', '/master-data-configuration/standards?search=ISO%209001&selectable=false', { token: adminToken })).body);
    let standardEdition = masterStandards.find((item) => String(item.standard_code).toUpperCase() === 'ISO 9001:2026' && String(item.edition) === '2026');
    if (!standardEdition) {
      standardEdition = (await request('POST', '/master-data-configuration/standards', {
        token: adminToken,
        body: {
          scheme_id: schemeId,
          standard_code: 'ISO 9001:2026',
          standard_name: `${marker} — ISO 9001:2026`,
          edition: '2026',
          effective_from: '2026-09-16',
          status: 'ACTIVE',
        },
      })).body;
      appendRecord(manifest, { type: 'standard_edition', id: findId(standardEdition), code: 'ISO 9001:2026', dependencies: [{ type: 'certification_scheme', id: schemeId }] });
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    } else if (
      standardEdition.status !== 'ACTIVE' ||
      standardEdition.scheme_id !== schemeId ||
      !String(standardEdition.standard_name ?? '').includes(marker)
    ) {
      throw new Error('An existing ISO 9001:2026 edition is not owned by this DEMO run; no standard update was attempted.');
    } else {
      appendRecord(manifest, { type: 'standard_edition', id: findId(standardEdition), code: 'ISO 9001:2026', dependencies: [{ type: 'certification_scheme', id: schemeId }] });
    }
    const standardId = findId(standardEdition);
    if (!standardId) throw new Error('The ISO 9001:2026 edition API did not return its ID.');

    const configurations = unwrapList((await request('GET', `/master-data-configuration/scheme-configurations?scheme_id=${encodeURIComponent(schemeId)}`, { token: adminToken })).body);
    let configuration = configurations.find((item) => Number(item.version_no) === 1);
    if (!configuration) {
      configuration = (await request('POST', '/master-data-configuration/scheme-configurations', {
        token: adminToken,
        body: {
          scheme_id: schemeId,
          version_no: 1,
          effective_from: '2026-09-16',
          cycle_duration_months: 36,
          surveillance_frequency_months: 12,
          stage1_applicable: true,
          validity_duration_months: 36,
          renewal_window_days: 90,
          reminder_lead_days: 90,
          required_audit_types: ['INITIAL_STAGE_1', 'INITIAL_STAGE_2', 'SURVEILLANCE', 'RECERTIFICATION'],
          required_decision_types: ['GRANT', 'MAINTAIN', 'RENEW', 'EXTEND_SCOPE', 'REDUCE_SCOPE'],
        },
      })).body;
      appendRecord(manifest, { type: 'scheme_configuration', id: findId(configuration), code: 'QMS-v1', dependencies: [{ type: 'certification_scheme', id: schemeId }, { type: 'standard_edition', id: standardId }] });
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    } else if (
      configuration.status !== 'ACTIVE' ||
      String(configuration.effective_from).slice(0, 10) !== '2026-09-16' ||
      configuration.cycle_duration_months !== 36 ||
      configuration.surveillance_frequency_months !== 12
    ) {
      throw new Error('An existing QMS configuration does not match the approved DEMO setup; no configuration update was attempted.');
    } else {
      appendRecord(manifest, { type: 'scheme_configuration', id: findId(configuration), code: 'QMS-v1', dependencies: [{ type: 'certification_scheme', id: schemeId }, { type: 'standard_edition', id: standardId }] });
    }
    manifest.steps.programStandard = { status: 'configured', schemeId, standardId, configurationId: findId(configuration), standard: 'ISO 9001:2026', source: 'https://www.iso.org/standard/9001', effectiveFrom: '2026-09-16', accreditationClaim: false, at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const roleRows = unwrapList((await request('GET', '/users/roles', { token: adminToken })).body);
    const availableRoles = new Set(roleRows.map((role) => String(role.role_name ?? '').trim().toUpperCase()));
    const missingRoles = REQUIRED_INTERNAL_ROLES.filter((role) => !availableRoles.has(role));
    if (missingRoles.length) throw new Error(`Required seeded roles are missing: ${missingRoles.join(', ')}.`);
    const slug = makeRunSlug(runId);
    for (const role of REQUIRED_INTERNAL_ROLES) {
      const key = role.toLowerCase();
      let account = credentials.internalAccounts[key];
      if (!account) {
        account = {
          username: `cmpd_${slug}_${key}`.slice(0, 50),
          email: `cmpdemo.${slug}.${key}@example.invalid`,
          full_name: `Tài khoản DEMO — ${role}`,
          password: randomSecret(32),
          role,
        };
        credentials.internalAccounts[key] = account;
        saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
      }
      const existing = unwrapList((await request('GET', `/users?search=${encodeURIComponent(account.username)}`, { token: adminToken })).body)
        .find((user) => String(user.username).toLowerCase() === account.username.toLowerCase());
      let user = existing;
      if (!user) {
        const response = await request('POST', '/users', {
          token: adminToken,
          body: { username: account.username, email: account.email, password: account.password, full_name: account.full_name, role_names: [role] },
        });
        user = response.body;
      }
      const userId = findId(user);
      if (!userId) throw new Error(`The API did not return the ${role} user ID.`);
      const verifiedUser = (await request('GET', `/users/${encodeURIComponent(userId)}`, { token: adminToken })).body;
      const actualRoles = (verifiedUser.roles ?? verifiedUser.user_roles ?? []).map((item) => String(item.role_name ?? item.roles?.role_name ?? item).trim().toUpperCase());
      if (actualRoles.length !== 1 || actualRoles[0] !== role) throw new Error(`Account ${account.username} does not have exactly the expected ${role} role.`);
      account.id = userId;
      appendRecord(manifest, { type: 'internal_user', id: userId, code: account.username });
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    }
    const coordinator = credentials.internalAccounts.coordinator;
    const reviewer = credentials.internalAccounts.technical_reviewer;
    if (!coordinator?.id || !reviewer?.id || coordinator.id === reviewer.id) throw new Error('Coordinator/reviewer role separation could not be verified.');
    manifest.steps.internalAccounts = { status: 'created', count: REQUIRED_INTERNAL_ROLES.length, coordinatorId: coordinator.id, technicalReviewerId: reviewer.id, at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const allCustomers = unwrapList((await request('GET', '/customers', { token: adminToken })).body);
    const inputs = customerInputs(runId);
    const customerRecords = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      let customer = allCustomers.find((item) => item.customer_code === input.customer_code);
      if (!customer) {
        const response = await request('POST', '/customers', { token: adminToken, body: input });
        customer = response.body;
        allCustomers.push(customer);
      } else if (customer.company_name !== input.company_name) {
        throw new Error(`Customer code collision for ${input.customer_code}; no update was attempted.`);
      }
      const customerId = findId(customer);
      if (!customerId) throw new Error(`The API did not return a customer ID for ${input.customer_code}.`);
      appendRecord(manifest, { type: 'customer', id: customerId, code: input.customer_code });
      customerRecords.push({ ...input, id: customerId });
      manifest.steps.customers = { status: 'creating', count: index + 1, at: new Date().toISOString() };
      if ([0, 4, 19].includes(index)) saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    }
    manifest.steps.customers = { status: 'created', count: customerRecords.length, at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    for (let index = 0; index < customerRecords.length; index += 1) {
      const customer = customerRecords[index];
      const key = customer.customer_code;
      let account = credentials.portalAccounts[key];
      if (!account) {
        account = {
          email: `cmpdemo.portal.${slug}.${String(index + 1).padStart(2, '0')}@example.invalid`,
          username: `cmpdp_${slug}_${String(index + 1).padStart(2, '0')}`.slice(0, 50),
          full_name: `Người dùng Portal DEMO ${String(index + 1).padStart(2, '0')}`,
        };
        credentials.portalAccounts[key] = account;
      }
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
      const accessResponse = await request('GET', `/customers/${encodeURIComponent(customer.id)}/user-access`, { token: adminToken });
      const accessRows = unwrapList(accessResponse.body);
      const linked = accessRows.find((row) => row.user?.email?.toLowerCase() === account.email.toLowerCase());
      let provisioned;
      if (linked && account.password) {
        provisioned = { user: linked.user, access: linked };
      } else if (linked) {
        const reset = await request('POST', `/customers/${encodeURIComponent(customer.id)}/portal-users/${encodeURIComponent(linked.user.id)}/reset-password`, { token: adminToken });
        provisioned = { user: linked.user, access: linked, temporary_password: reset.body?.temporary_password };
      } else {
        const response = await request('POST', `/customers/${encodeURIComponent(customer.id)}/portal-users`, {
          token: adminToken,
          body: { full_name: account.full_name, email: account.email, username: account.username },
        });
        provisioned = response.body;
        if (!provisioned?.temporary_password) {
          const userId = provisioned?.user?.id;
          if (!userId) throw new Error(`Portal provisioning did not return the new user for ${key}.`);
          const reset = await request('POST', `/customers/${encodeURIComponent(customer.id)}/portal-users/${encodeURIComponent(userId)}/reset-password`, { token: adminToken });
          provisioned = { ...provisioned, temporary_password: reset.body?.temporary_password };
        }
      }
      account.id = provisioned?.user?.id ?? linked?.user?.id;
      account.password = provisioned?.temporary_password;
      account.customerId = customer.id;
      if (!account.id || !account.password) throw new Error(`A one-time Portal password was not returned for ${key}.`);
      appendRecord(manifest, { type: 'portal_user', id: account.id, code: account.email, dependencies: [{ type: 'customer', id: customer.id }] });
      if (provisioned.access?.id) {
        appendRecord(manifest, { type: 'customer_portal_access', id: provisioned.access.id, dependencies: [{ type: 'customer', id: customer.id }, { type: 'portal_user', id: account.id }] });
      }
      manifest.steps.portalAccounts = { status: 'creating', count: index + 1, at: new Date().toISOString() };
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    }
    manifest.steps.portalAccounts = { status: 'created', count: 20, at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const firstCustomer = customerRecords[0];
    const firstPortal = credentials.portalAccounts[firstCustomer.customer_code];
    const secondPortal = credentials.portalAccounts[customerRecords[1].customer_code];
    const portalLogin = await request('POST', '/auth/login', { body: { username: firstPortal.username ?? firstPortal.email, password: firstPortal.password } });
    const secondLogin = await request('POST', '/auth/login', { body: { username: secondPortal.username ?? secondPortal.email, password: secondPortal.password } });
    const portalToken = portalLogin.body?.access_token;
    const secondToken = secondLogin.body?.access_token;
    if (!portalToken || !secondToken) throw new Error('Portal account login verification failed.');
    const standardsResponse = await request('GET', '/customer-portal/me/operational-standards', { token: portalToken });
    const operationalStandards = unwrapList(standardsResponse.body);
    const standard = operationalStandards.find((item) => /ISO\s*9001/i.test(`${item.standard_name ?? ''} ${item.standard_code ?? ''}`)) ?? operationalStandards[0];
    if (!standard?.standard_name) {
      manifest.status = 'blocked_no_operational_standard';
      manifest.blocker = 'No active operational standard was returned by the real Portal API; no application was created.';
      saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
      return { status: manifest.status, runId, manifestPath: resolvedManifestPath, customersCreated: customerRecords.length, portalAccountsCreated: 20 };
    }

    const scope = 'Lắp ráp thiết bị đo lường và bộ điều khiển công nghiệp tại một địa điểm DEMO.';
    const draftPayload = {
      application_date: new Date().toISOString().slice(0, 10),
      certification_type: 'INITIAL',
      standard_name: standard.label ?? standard.standard_code ?? standard.standard_name,
      certification_scope: scope,
      headquarters_address: firstCustomer.address,
      representative_name: 'Đại diện doanh nghiệp DEMO 01',
      representative_position: 'Người đại diện (dữ liệu hư cấu)',
      representative_email: firstCustomer.email,
      contact_name: 'Đầu mối hồ sơ DEMO 01',
      contact_position: 'Điều phối hồ sơ (dữ liệu hư cấu)',
      contact_email: firstCustomer.email,
      total_employee_count: 24,
      employee_count: 24,
      shift_count: 1,
      shift1_count: 24,
      external_provider_used: false,
      other_management_systems: false,
      certificate_languages: ['vi'],
      other_requests: marker,
      declaration_accepted: true,
      sites: [{ site_no: 1, site_name: 'Địa điểm DEMO 01', address: firstCustomer.address, activities: scope, employee_count: 24 }],
    };
    const priorApplications = unwrapList((await request('GET', '/customer-portal/me/applications', { token: portalToken })).body);
    const expectedStandardName = standard.label ?? standard.standard_code ?? standard.standard_name;
    let application = priorApplications.find((item) => item.other_requests === marker && item.standard_name === expectedStandardName && item.certification_scope === scope);
    if (!application) application = (await request('POST', '/customer-portal/me/applications', { token: portalToken, body: draftPayload })).body;
    const applicationId = findId(application);
    if (!applicationId) throw new Error('Portal API did not return the application ID.');
    appendRecord(manifest, { type: 'certification_application', id: applicationId, code: application.application_code, dependencies: [{ type: 'customer', id: firstCustomer.id }, { type: 'portal_user', id: firstPortal.id }] });
    for (const site of Array.isArray(application.sites) ? application.sites : []) {
      if (site.id) appendRecord(manifest, { type: 'application_site', id: site.id, code: `site-${site.site_no}`, dependencies: [{ type: 'certification_application', id: applicationId }] });
    }
    manifest.steps.application = { status: 'draft_created', id: applicationId, at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const status = String(application.status ?? '').toLowerCase();
    let submitted = application;
    if (!['submitted', 'under_review'].includes(status)) {
      submitted = (await request('POST', `/customer-portal/me/applications/${encodeURIComponent(applicationId)}/submit`, { token: portalToken })).body;
    }
    manifest.steps.application = { status: 'submitted', id: applicationId, applicationCode: submitted.application_code ?? application.application_code, at: new Date().toISOString() };
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);

    const portalApplications = unwrapList((await request('GET', '/customer-portal/me/applications', { token: portalToken })).body);
    const otherCustomerApplications = unwrapList((await request('GET', '/customer-portal/me/applications', { token: secondToken })).body);
    if (!portalApplications.some((item) => item.id === applicationId)) throw new Error('Submitting Portal does not list its own application.');
    if (otherCustomerApplications.some((item) => item.id === applicationId)) throw new Error('Tenant isolation failed: another customer can see this application.');
    const coordinatorLogin = await request('POST', '/auth/login', { body: { username: coordinator.username, password: coordinator.password } });
    const coordinatorToken = coordinatorLogin.body?.access_token;
    if (!coordinatorToken) throw new Error('Coordinator login verification failed.');
    const intakeQueue = unwrapList((await request('GET', '/certification-applications', { token: coordinatorToken })).body);
    if (!intakeQueue.some((item) => item.id === applicationId)) throw new Error('Submitted application was not visible in the real coordinator workflow list.');
    const workItems = unwrapList((await request('GET', '/my-work?status=OPEN&work_type=CUSTOMER_APPLICATION_INTAKE&limit=200', { token: coordinatorToken })).body);
    const intakeWorkItem = workItems.find((item) => item.entity_id === applicationId && item.work_type === 'CUSTOMER_APPLICATION_INTAKE' && item.assigned_role === 'COORDINATOR');
    if (!intakeWorkItem) throw new Error('Submission did not create an actionable intake work item for the coordinator.');
    appendRecord(manifest, { type: 'work_item', id: intakeWorkItem.id, code: intakeWorkItem.source_key, dependencies: [{ type: 'certification_application', id: applicationId }] });

    manifest.steps.application = { status: 'submitted_and_in_coordinator_queue', id: applicationId, applicationCode: submitted.application_code ?? application.application_code, intakeWorkItemId: intakeWorkItem.id, tenantIsolation: 'PASS', coordinatorQueue: 'PASS', nextStage: 'intake review; not advanced without verified classification, evidence, and competence', at: new Date().toISOString() };
    manifest.status = 'complete';
    manifest.completedAt = new Date().toISOString();
    manifest.cleanupPerformed = false;
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    return { status: 'complete', runId, manifestPath: resolvedManifestPath, customersCreated: customerRecords.length, portalAccountsCreated: 20, applicationId, applicationCode: submitted.application_code ?? application.application_code };
  } catch (error) {
    manifest.status = 'failed_or_incomplete';
    manifest.lastError = error instanceof Error ? error.message : 'Unknown workflow failure.';
    manifest.updatedAt = new Date().toISOString();
    saveProgress(resolvedManifestPath, resolvedCredentialsPath, manifest, credentials);
    log({ event: 'workflow_error', message: manifest.lastError });
    throw error;
  }
}

function printHelp() {
  process.stdout.write([
    'CMP workflow runner — plan-only by default; apply uses the real, loopback-only API.',
    `  node scripts/demo/cmp-workflow-runner.cjs --dry-run [--run-id ${DEFAULT_RUN_ID}]`,
    '  node scripts/demo/cmp-workflow-runner.cjs --apply --run-id CMP-DEMO-20261023-A [--manifest <external.json>] [--credentials <external.json>]',
    '  node scripts/demo/cmp-workflow-runner.cjs --cleanup-dry-run <external-manifest.json>',
    'Apply requires CMP_DEMO_APPLY=YES and the exact guarded SQL sandbox environment.',
    '',
  ].join('\n'));
}

async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArguments(argv);
    if (args.help) return printHelp();
    if (args.cleanupManifest) {
      process.stdout.write(`${JSON.stringify(buildCleanupDryRun(args.cleanupManifest), null, 2)}\n`);
      return;
    }
    if (!args.apply) {
      process.stdout.write(`${JSON.stringify(buildWorkflowPlan(args.runId), null, 2)}\n`);
      return;
    }
    validateApplyEnvironment();
    const logDirectory = path.dirname(assertOutsideRepository(args.manifestPath || defaultManifestPath()));
    fs.mkdirSync(logDirectory, { recursive: true });
    const logPath = path.join(logDirectory, 'workflow.log');
    const writeLog = (record) => fs.appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, { encoding: 'utf8', mode: 0o600 });
    const result = await runWorkflow({ ...args, log: writeLog });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[CMP WORKFLOW] ${error instanceof Error ? error.message : 'Unknown failure.'}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  appendRecord,
  buildCleanupDryRun,
  buildWorkflowPlan,
  customerInputs,
  defaultCredentialsPath,
  defaultManifestPath,
  main,
  makeOrganizationProfile,
  newManifest,
  parseArguments,
  requireLoopbackApi,
  runWorkflow,
  validateApplyEnvironment,
};
