require('dotenv/config');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');
const { translateIndustryTitle } = require('./lib/industry-title-vi-20260826.cjs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');

const URLS = {
  isic: 'https://unstats.un.org/unsd/classifications/Econ/Download/In%20Text/ISIC_Rev_4_english_structure.Txt',
  isicNace: 'https://unstats.un.org/unsd/classifications/Econ/tables/ISIC/ISIC4_NACE2/ISIC4_NACE2.txt',
  naceEurostat: 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/nace_r2?format=TSV',
  naceFallback: 'https://dd.eionet.europa.eu/vocabulary/eurostat/nace_r2/csv',
};

const IAF_ID1_SOURCE = 'IAF ID 1:2023 Issue 3 Version 2';
const IAF_MD22_SOURCE = 'IAF MD 22:2023 Issue 2 Version 2';
const ISIC_NACE_SOURCE = 'UNSD correspondence: ISIC Rev.4 - NACE Rev.2';

const IAF_SCOPES = [
  [1, 'Nông nghiệp, lâm nghiệp và thủy sản', 'Agriculture, forestry and fishing', '01, 02, 03'],
  [2, 'Khai khoáng', 'Mining and quarrying', '05, 06, 07, 08, 09'],
  [3, 'Thực phẩm, đồ uống và thuốc lá', 'Food products, beverages and tobacco', '10, 11, 12'],
  [4, 'Dệt và sản phẩm dệt', 'Textiles and textile products', '13, 14'],
  [5, 'Da và sản phẩm da', 'Leather and leather products', '15'],
  [6, 'Gỗ và sản phẩm gỗ', 'Wood and wood products', '16'],
  [7, 'Bột giấy, giấy và sản phẩm giấy', 'Pulp, paper and paper products', '17'],
  [8, 'Xuất bản', 'Publishing companies', '58.1, 59.2'],
  [9, 'In ấn', 'Printing companies', '18'],
  [10, 'Sản xuất than cốc và sản phẩm dầu mỏ tinh chế', 'Manufacture of coke and refined petroleum products', '19'],
  [11, 'Nhiên liệu hạt nhân', 'Nuclear fuel', '24.46'],
  [12, 'Hóa chất, sản phẩm hóa chất và sợi', 'Chemicals, chemical products and fibres', '20'],
  [13, 'Dược phẩm', 'Pharmaceuticals', '21'],
  [14, 'Cao su và sản phẩm nhựa', 'Rubber and plastic products', '22'],
  [15, 'Sản phẩm khoáng phi kim loại', 'Non-metallic mineral products', '23, trừ 23.5 và 23.6'],
  [16, 'Bê tông, xi măng, vôi, thạch cao', 'Concrete, cement, lime, plaster etc.', '23.5, 23.6'],
  [17, 'Kim loại cơ bản và sản phẩm kim loại gia công', 'Basic metals and fabricated metal products', '24 trừ 24.46; 25 trừ 25.4; 33.11'],
  [18, 'Máy móc và thiết bị', 'Machinery and equipment', '25.4, 28, 30.4, 33.12, 33.2'],
  [19, 'Thiết bị điện và quang học', 'Electrical and optical equipment', '26, 27, 33.13, 33.14, 95.1'],
  [20, 'Đóng tàu', 'Shipbuilding', '30.1, 33.15'],
  [21, 'Hàng không vũ trụ', 'Aerospace', '30.3, 33.16'],
  [22, 'Thiết bị vận tải khác', 'Other transport equipment', '29, 30.2, 30.9, 33.17'],
  [23, 'Sản xuất khác chưa được phân loại', 'Manufacturing not elsewhere classified', '31, 32, 33.19'],
  [24, 'Tái chế', 'Recycling', '38.3'],
  [25, 'Cung cấp điện', 'Electricity supply', '35.1'],
  [26, 'Cung cấp khí', 'Gas supply', '35.2'],
  [27, 'Cung cấp nước', 'Water supply', '35.3, 36'],
  [28, 'Xây dựng', 'Construction', '41, 42, 43'],
  [29, 'Bán buôn, bán lẻ và sửa chữa xe', 'Wholesale and retail trade; repair of motor vehicles, motorcycles and personal and household goods', '45, 46, 47, 95.2'],
  [30, 'Khách sạn và nhà hàng', 'Hotels and restaurants', '55, 56'],
  [31, 'Vận tải, kho bãi và truyền thông', 'Transport, storage and communication', '49, 50, 51, 52, 53, 61'],
  [32, 'Tài chính, bất động sản và cho thuê', 'Financial intermediation; real estate; renting', '64, 65, 66, 68, 77'],
  [33, 'Công nghệ thông tin', 'Information technology', '58.2, 62, 63.1'],
  [34, 'Dịch vụ kỹ thuật', 'Engineering services', '71, 72, 74 trừ 74.2 và 74.3'],
  [35, 'Dịch vụ khác', 'Other services', '69, 70, 73, 74.2, 74.3, 78, 80, 81, 82'],
  [36, 'Hành chính công', 'Public administration', '84'],
  [37, 'Giáo dục', 'Education', '85'],
  [38, 'Y tế và công tác xã hội', 'Health and social work', '75, 86, 87, 88'],
  [39, 'Dịch vụ xã hội khác', 'Other social services', '37, 38.1, 38.2, 39, 59.1, 60, 63.9, 79, 90, 91, 92, 93, 94, 96'],
];

const IAF_RULES = [
  { iaf: 1, include: ['01', '02', '03'] },
  { iaf: 2, include: ['05', '06', '07', '08', '09'] },
  { iaf: 3, include: ['10', '11', '12'] },
  { iaf: 4, include: ['13', '14'] },
  { iaf: 5, include: ['15'] },
  { iaf: 6, include: ['16'] },
  { iaf: 7, include: ['17'] },
  { iaf: 8, include: ['58.1', '59.2'] },
  { iaf: 9, include: ['18'] },
  { iaf: 10, include: ['19'] },
  { iaf: 11, include: ['24.46'] },
  { iaf: 12, include: ['20'] },
  { iaf: 13, include: ['21'] },
  { iaf: 14, include: ['22'] },
  { iaf: 15, include: ['23'], exclude: ['23.5', '23.6'] },
  { iaf: 16, include: ['23.5', '23.6'] },
  { iaf: 17, include: ['24', '25', '33.11'], exclude: ['24.46', '25.4'] },
  { iaf: 18, include: ['25.4', '28', '30.4', '33.12', '33.2'] },
  { iaf: 19, include: ['26', '27', '33.13', '33.14', '95.1'] },
  { iaf: 20, include: ['30.1', '33.15'] },
  { iaf: 21, include: ['30.3', '33.16'] },
  { iaf: 22, include: ['29', '30.2', '30.9', '33.17'] },
  { iaf: 23, include: ['31', '32', '33.19'] },
  { iaf: 24, include: ['38.3'] },
  { iaf: 25, include: ['35.1'] },
  { iaf: 26, include: ['35.2'] },
  { iaf: 27, include: ['35.3', '36'] },
  { iaf: 28, include: ['41', '42', '43'] },
  { iaf: 29, include: ['45', '46', '47', '95.2'] },
  { iaf: 30, include: ['55', '56'] },
  { iaf: 31, include: ['49', '50', '51', '52', '53', '61'] },
  { iaf: 32, include: ['64', '65', '66', '68', '77'] },
  { iaf: 33, include: ['58.2', '62', '63.1'] },
  { iaf: 34, include: ['71', '72', '74'], exclude: ['74.2', '74.3'] },
  { iaf: 35, include: ['69', '70', '73', '74.2', '74.3', '78', '80', '81', '82'] },
  { iaf: 36, include: ['84'] },
  { iaf: 37, include: ['85'] },
  { iaf: 38, include: ['75', '86', '87', '88'] },
  { iaf: 39, include: ['37', '38.1', '38.2', '39', '59.1', '60', '63.9', '79', '90', '91', '92', '93', '94', '96'] },
];

function parseDbName(url) {
  const match = String(url).match(/(?:database|initial catalog)=([^;]+)/i);
  return match ? match[1].replace(/^\{|\}$/g, '') : '';
}

function assertDevTarget() {
  const db = parseDbName(DATABASE_URL);
  if (db !== 'CTIC_Certification') throw new Error(`DEV loader only. Expected CTIC_Certification, actual ${db || 'UNKNOWN'}.`);
  if (!/sqlserver:\/\/(localhost|127\.0\.0\.1)(?::\d+)?;/i.test(DATABASE_URL)) {
    throw new Error('DEV loader only accepts localhost/127.0.0.1.');
  }
}

async function fetchText(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const response = await fetch(url, {
        headers: { 'user-agent': 'CMP-IndustryReferenceLoader/2026-08-26' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.trim()) throw new Error('empty response');
      console.log(`FETCH PASS: ${label} (${text.length.toLocaleString()} chars)`);
      return text.replace(/^\uFEFF/, '');
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`Cannot fetch ${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function parseCsv(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
}

function parentForLevel(code, level, latest) {
  if (level === 1) return null;
  if (level === 2) return latest[1] || null;
  if (level === 3) return latest[2] || null;
  return latest[3] || null;
}

function parseIsic(text) {
  const rows = parseCsv(text);
  const latest = {};
  const result = [];
  for (const [codeRaw, titleRaw] of rows.slice(1)) {
    const code = String(codeRaw || '').trim();
    const title = String(titleRaw || '').trim();
    if (!code || !title || !/^(?:[A-U]|\d{2}|\d{3}|\d{4})$/.test(code)) continue;
    const level = /^[A-U]$/.test(code) ? 1 : code.length;
    const parent = parentForLevel(code, level, latest);
    result.push({ code, title, level, parent_code: parent });
    latest[level] = code;
    for (let deeper = level + 1; deeper <= 4; deeper += 1) delete latest[deeper];
  }
  if (result.length < 760 || result.length > 770) throw new Error(`Unexpected ISIC Rev.4 structure count: ${result.length}`);
  return result;
}

function normalizeNaceNotation(rawValue) {
  const raw = String(rawValue || '').trim().replace(/^"|"$/g, '');
  if (/^[A-U]$/.test(raw)) return { code: raw, level: 1 };
  let match = raw.match(/^[A-U](\d{2})$/); if (match) return { code: match[1], level: 2 };
  match = raw.match(/^[A-U](\d{2})(\d)$/); if (match) return { code: `${match[1]}.${match[2]}`, level: 3 };
  match = raw.match(/^[A-U](\d{2})(\d{2})$/); if (match) return { code: `${match[1]}.${match[2]}`, level: 4 };
  if (/^\d{2}$/.test(raw)) return { code: raw, level: 2 };
  if (/^\d{2}\.\d$/.test(raw)) return { code: raw, level: 3 };
  if (/^\d{2}\.\d{2}$/.test(raw)) return { code: raw, level: 4 };
  return null;
}

function sectionForNaceRaw(rawValue) {
  const raw = String(rawValue || '').trim().replace(/^"|"$/g, '');
  return /^[A-U]/.test(raw) ? raw[0] : null;
}

function buildNaceParents(rows) {
  const sectionsByDivision = new Map();
  for (const row of rows) {
    if (row.level === 2 && row.section) sectionsByDivision.set(row.code, row.section);
  }
  return rows.map((row) => {
    if (row.level === 1) return { ...row, parent_code: null };
    if (row.level === 2) return { ...row, parent_code: row.section || null };
    if (row.level === 3) return { ...row, parent_code: row.code.slice(0, 2) };
    return { ...row, parent_code: row.code.slice(0, 4) };
  });
}

function validateNace(rows) {
  const unique = new Map(rows.map((row) => [row.code, row]));
  const values = [...unique.values()].sort((a, b) => a.code.localeCompare(b.code));
  const counts = values.reduce((acc, row) => { acc[row.level] = (acc[row.level] || 0) + 1; return acc; }, {});
  if (counts[1] !== 21 || counts[2] !== 88 || counts[3] !== 272 || counts[4] !== 615 || values.length !== 996) {
    throw new Error(`Unexpected NACE Rev.2 canonical counts: total=${values.length}, levels=${JSON.stringify(counts)}`);
  }
  return buildNaceParents(values);
}

function parseNaceTsv(text) {
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    let notationIndex = -1;
    let normalized = null;
    for (let i = 0; i < cells.length; i += 1) {
      const candidate = normalizeNaceNotation(cells[i]);
      if (candidate) { notationIndex = i; normalized = candidate; break; }
    }
    if (!normalized) continue;
    const labels = cells.filter((cell, index) => index !== notationIndex && /[A-Za-z]/.test(cell) && cell.length > 2);
    const title = labels.sort((a, b) => b.length - a.length)[0];
    if (!title) continue;
    result.push({ ...normalized, title, section: sectionForNaceRaw(cells[notationIndex]) });
  }
  return validateNace(result);
}

function parseNaceCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Empty NACE CSV');
  const headers = rows[0].map((value) => value.toLowerCase());
  const codeIndex = Math.max(0, headers.findIndex((value) => value.includes('notation') || value === 'id' || value.includes('code')));
  let labelIndex = headers.findIndex((value) => value.includes('label') || value.includes('preflabel') || value.includes('name'));
  if (labelIndex < 0) labelIndex = codeIndex === 0 ? 1 : 0;
  const result = [];
  for (const row of rows.slice(1)) {
    const raw = row[codeIndex];
    const normalized = normalizeNaceNotation(raw);
    if (!normalized) continue;
    const title = String(row[labelIndex] || '').trim();
    if (!title) continue;
    result.push({ ...normalized, title, section: sectionForNaceRaw(raw) });
  }
  return validateNace(result);
}

function parseCorrespondence(text) {
  const rows = parseCsv(text);
  const parsed = rows.slice(1).map((row) => ({
    isic: row[0], isicPart: Number(row[1] || 0), nace: row[2], nacePart: Number(row[3] || 0),
  })).filter((row) => row.isic && row.nace);
  if (parsed.length !== 996) throw new Error(`Unexpected ISIC→NACE correspondence row count: ${parsed.length}`);
  const sourceCounts = new Map();
  for (const row of parsed) sourceCounts.set(row.isic, (sourceCounts.get(row.isic) || 0) + 1);
  return parsed.map((row) => ({
    ...row,
    mappingType: sourceCounts.get(row.isic) > 1 ? 'ONE_TO_MANY' : (row.isicPart || row.nacePart ? 'PARTIAL' : 'EXACT'),
  }));
}

function prefixMatch(code, prefix) { return code === prefix || code.startsWith(prefix); }
function matchesRule(code, rule) {
  const included = rule.include.some((prefix) => prefixMatch(code, prefix));
  const excluded = (rule.exclude || []).some((prefix) => prefixMatch(code, prefix));
  return included && !excluded;
}

function iafCandidatesForNace(code, system) {
  const base = IAF_RULES.filter((rule) => matchesRule(code, rule)).map((rule) => ({ iaf: rule.iaf, note: null }));
  if (system !== 'OHSMS') return base;
  if (code === '20.13') {
    return [
      { iaf: 11, note: 'IAF MD 22:2023: IAF 11 applies only to the radioactive-material scope of NACE 20.13.' },
      { iaf: 12, note: 'IAF MD 22:2023: IAF 12 applies to NACE 20 except the radioactive-material scope; reviewer confirmation is required for NACE 20.13.' },
    ];
  }
  return base;
}

async function main() {
  assertDevTarget();
  if (!process.argv.includes('--commit')) throw new Error('Refusing to write. Run with --commit.');
  const replace = process.argv.includes('--replace');
  console.log('============================================================');
  console.log('CMP OFFICIAL INDUSTRY REFERENCE LOADER');
  console.log('Chain: ISIC Rev.4 -> NACE Rev.2 -> IAF');
  console.log('Target: CTIC_Certification (DEV)');
  console.log(`Mode: ${replace ? 'replace reference data' : 'idempotent upsert'}`);
  console.log('============================================================');

  const [isicText, correspondenceText, nacePrimaryText] = await Promise.all([
    fetchText(URLS.isic, 'UNSD ISIC Rev.4 structure'),
    fetchText(URLS.isicNace, 'UNSD ISIC Rev.4 -> NACE Rev.2 correspondence'),
    fetchText(URLS.naceEurostat, 'Eurostat NACE Rev.2 codelist').catch(() => null),
  ]);

  const isicRows = parseIsic(isicText);
  const correspondence = parseCorrespondence(correspondenceText);
  let naceRows;
  if (nacePrimaryText) {
    try { naceRows = parseNaceTsv(nacePrimaryText); }
    catch (error) { console.warn(`Eurostat TSV parse failed: ${error.message}`); }
  }
  if (!naceRows) {
    const fallback = await fetchText(URLS.naceFallback, 'EEA/Eionet mirror of Eurostat NACE Rev.2');
    naceRows = parseNaceCsv(fallback);
  }

  console.log(`PARSE PASS: ISIC=${isicRows.length}, NACE=${naceRows.length}, ISIC->NACE rows=${correspondence.length}, IAF=${IAF_SCOPES.length}`);

  const prisma = new PrismaClient({ adapter: new PrismaMssql(DATABASE_URL) });
  try {
    if (replace) {
      const projectScopeCount = await prisma.certification_project_scopes.count();
      if (projectScopeCount) throw new Error(`Cannot replace reference data: ${projectScopeCount} project scope row(s) already reference mappings.`);
      await prisma.nace_iaf_mappings.deleteMany();
      await prisma.industry_code_mappings.deleteMany();
      await prisma.iaf_scopes.deleteMany();
      await prisma.industry_classifications.deleteMany({ where: { classification_type: { in: ['ISIC', 'NACE'] } } });
      console.log('CLEAN PASS: existing industry reference data removed (no business project scopes existed).');
    }

    let done = 0;
    for (const row of isicRows) {
      await prisma.industry_classifications.upsert({
        where: { classification_type_revision_code: { classification_type: 'ISIC', revision: 'ISIC_REV_4', code: row.code } },
        create: { classification_type: 'ISIC', revision: 'ISIC_REV_4', code: row.code, title_en: row.title, title_vi: translateIndustryTitle(row.title), parent_code: row.parent_code, level: row.level, is_active: true },
        update: { title_en: row.title, title_vi: translateIndustryTitle(row.title), parent_code: row.parent_code, level: row.level, is_active: true },
      });
      done += 1; if (done % 200 === 0) console.log(`ISIC progress: ${done}/${isicRows.length}`);
    }

    done = 0;
    for (const row of naceRows) {
      await prisma.industry_classifications.upsert({
        where: { classification_type_revision_code: { classification_type: 'NACE', revision: 'NACE_REV_2', code: row.code } },
        create: { classification_type: 'NACE', revision: 'NACE_REV_2', code: row.code, title_en: row.title, title_vi: translateIndustryTitle(row.title), parent_code: row.parent_code, level: row.level, is_active: true },
        update: { title_en: row.title, title_vi: translateIndustryTitle(row.title), parent_code: row.parent_code, level: row.level, is_active: true },
      });
      done += 1; if (done % 200 === 0) console.log(`NACE progress: ${done}/${naceRows.length}`);
    }

    for (const [number, vi, en, naceScope] of IAF_SCOPES) {
      const iafCode = String(number);
      const description = `Tên chính thức (EN): ${en}. Phạm vi NACE Rev.2: ${naceScope}. Nguồn QMS/EMS: ${IAF_ID1_SOURCE}; nguồn OH&SMS: ${IAF_MD22_SOURCE}.`;
      await prisma.iaf_scopes.upsert({
        where: { iaf_code: iafCode },
        create: { iaf_code: iafCode, iaf_name: vi, description, is_active: true },
        update: { iaf_name: vi, description, is_active: true },
      });
    }

    const classifications = await prisma.industry_classifications.findMany({
      where: { OR: [
        { classification_type: 'ISIC', revision: 'ISIC_REV_4' },
        { classification_type: 'NACE', revision: 'NACE_REV_2' },
      ] },
      select: { id: true, classification_type: true, code: true, level: true },
    });
    const isicByCode = new Map(classifications.filter((row) => row.classification_type === 'ISIC').map((row) => [row.code, row]));
    const naceByCode = new Map(classifications.filter((row) => row.classification_type === 'NACE').map((row) => [row.code, row]));
    const iafRows = await prisma.iaf_scopes.findMany({ select: { id: true, iaf_code: true } });
    const iafByCode = new Map(iafRows.map((row) => [row.iaf_code, row]));

    done = 0;
    const approvedAt = new Date();
    for (const row of correspondence) {
      const isic = isicByCode.get(row.isic);
      const nace = naceByCode.get(row.nace);
      if (!isic || !nace) throw new Error(`Missing classification for correspondence ${row.isic} -> ${row.nace}`);
      await prisma.industry_code_mappings.upsert({
        where: { source_code_id_target_code_id: { source_code_id: isic.id, target_code_id: nace.id } },
        create: { source_code_id: isic.id, target_code_id: nace.id, mapping_type: row.mappingType, mapping_status: 'APPROVED', note: ISIC_NACE_SOURCE, approved_at: approvedAt },
        update: { mapping_type: row.mappingType, mapping_status: 'APPROVED', note: ISIC_NACE_SOURCE, approved_at: approvedAt },
      });
      done += 1; if (done % 250 === 0) console.log(`ISIC->NACE progress: ${done}/${correspondence.length}`);
    }

    const naceClasses = [...naceByCode.values()].filter((row) => row.level === 4);
    let mappingCount = 0;
    for (const system of ['QMS', 'EMS', 'OHSMS']) {
      let systemCount = 0;
      for (const nace of naceClasses) {
        const candidates = iafCandidatesForNace(nace.code, system);
        const outsideIafModel = /^(?:97|98|99)/.test(nace.code);
        if (!candidates.length && !outsideIafModel) throw new Error(`No IAF mapping for ${system} NACE ${nace.code}`);
        for (const candidate of candidates) {
          const iaf = iafByCode.get(String(candidate.iaf));
          if (!iaf) throw new Error(`Missing IAF ${candidate.iaf}`);
          const source = system === 'OHSMS' ? IAF_MD22_SOURCE : IAF_ID1_SOURCE;
          await prisma.nace_iaf_mappings.upsert({
            where: { nace_code_id_iaf_scope_id_management_system: { nace_code_id: nace.id, iaf_scope_id: iaf.id, management_system: system } },
            create: { nace_code_id: nace.id, iaf_scope_id: iaf.id, management_system: system, mapping_status: 'APPROVED', source_document: source, note: candidate.note, approved_at: approvedAt },
            update: { mapping_status: 'APPROVED', source_document: source, note: candidate.note, approved_at: approvedAt },
          });
          systemCount += 1; mappingCount += 1;
        }
      }
      console.log(`NACE->IAF ${system}: ${systemCount} approved mapping row(s).`);
    }

    const [isicCount, naceCount, iafCount, isicNaceCount, naceIafCount, missingViCount] = await Promise.all([
      prisma.industry_classifications.count({ where: { classification_type: 'ISIC', revision: 'ISIC_REV_4', is_active: true } }),
      prisma.industry_classifications.count({ where: { classification_type: 'NACE', revision: 'NACE_REV_2', is_active: true } }),
      prisma.iaf_scopes.count({ where: { is_active: true } }),
      prisma.industry_code_mappings.count({ where: { mapping_status: 'APPROVED' } }),
      prisma.nace_iaf_mappings.count({ where: { mapping_status: 'APPROVED' } }),
      prisma.industry_classifications.count({ where: { classification_type: { in: ['ISIC', 'NACE'] }, OR: [{ title_vi: null }, { title_vi: '' }] } }),
    ]);
    if (missingViCount !== 0) throw new Error(`Vietnamese title coverage incomplete: ${missingViCount} row(s) missing title_vi`);

    const isic2220 = isicByCode.get('2220');
    if (!isic2220) throw new Error('Sanity check missing ISIC 2220');
    const plasticMappings = await prisma.industry_code_mappings.findMany({ where: { source_code_id: isic2220.id, mapping_status: 'APPROVED' }, include: { target_code: true } });
    const plasticTargets = plasticMappings.map((row) => row.target_code.code).sort();
    const expectedPlastic = ['22.21', '22.22', '22.23', '22.29'];
    if (JSON.stringify(plasticTargets) !== JSON.stringify(expectedPlastic)) throw new Error(`Sanity check ISIC 2220 mismatch: ${plasticTargets.join(', ')}`);

    const nace2229 = naceByCode.get('22.29');
    const iaf14 = iafByCode.get('14');
    if (!nace2229 || !iaf14) throw new Error('Sanity check missing NACE 22.29 / IAF 14');
    for (const system of ['QMS', 'EMS', 'OHSMS']) {
      const found = await prisma.nace_iaf_mappings.findFirst({ where: { nace_code_id: nace2229.id, iaf_scope_id: iaf14.id, management_system: system, mapping_status: 'APPROVED' } });
      if (!found) throw new Error(`Sanity check missing NACE 22.29 -> IAF 14 for ${system}`);
    }

    console.log('============================================================');
    console.log('OFFICIAL INDUSTRY REFERENCE LOAD: PASS');
    console.log(`ISIC Rev.4: ${isicCount} codes (full hierarchy)`);
    console.log(`NACE Rev.2: ${naceCount} codes (21 sections / 88 divisions / 272 groups / 615 classes)`);
    console.log(`Vietnamese labels: ${isicCount + naceCount} / ${isicCount + naceCount} populated`);
    console.log(`IAF: ${iafCount} scopes`);
    console.log(`ISIC -> NACE: ${isicNaceCount} approved correspondence rows`);
    console.log(`NACE -> IAF: ${naceIafCount} approved QMS/EMS/OHSMS rows`);
    console.log(`Generated this run: ${mappingCount} NACE -> IAF rows evaluated`);
    console.log('Sanity: ISIC 2220 -> NACE 22.21/22.22/22.23/22.29 -> IAF 14 PASS');
    console.log('============================================================');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`OFFICIAL INDUSTRY REFERENCE LOAD: FAIL - ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
