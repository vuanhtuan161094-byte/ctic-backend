'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { translateIndustryTitle } = require('../lib/industry-title-vi-20260826.cjs');

const root = path.resolve(__dirname, '..', '..');
let passed = 0;
function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`PASS: ${name}`);
}

const loader = fs.readFileSync(path.join(root, 'scripts/load-official-industry-reference-20260826.cjs'), 'utf8');
const backfill = fs.readFileSync(path.join(root, 'scripts/backfill-industry-vietnamese-titles-20260826.cjs'), 'utf8');

check('Loader imports Vietnamese industry title translator', loader.includes("industry-title-vi-20260826.cjs"));
check('Loader writes title_vi for ISIC', /classification_type:\s*'ISIC'[\s\S]{0,350}title_vi:\s*translateIndustryTitle\(row\.title\)/.test(loader));
check('Loader writes title_vi for NACE', /classification_type:\s*'NACE'[\s\S]{0,350}title_vi:\s*translateIndustryTitle\(row\.title\)/.test(loader));
check('Loader fails closed when Vietnamese titles are missing', loader.includes('Vietnamese title coverage incomplete'));
check('Backfill is DEV-only and locked to CTIC_Certification', backfill.includes("db !== 'CTIC_Certification'") && backfill.includes('localhost'));
check('Backfill updates title_vi from title_en', backfill.includes('data: { title_vi: titleVi }') && backfill.includes('translateIndustryTitle(row.title_en)'));
check('ISIC/NACE plastics title is Vietnamese', translateIndustryTitle('Manufacture of plastic products') === 'Sản xuất sản phẩm nhựa');
check('Other plastics title is Vietnamese', translateIndustryTitle('Manufacture of other plastic products') === 'Sản xuất sản phẩm nhựa khác');
check('Electrical transformer title is Vietnamese', translateIndustryTitle('Manufacture of electric motors, generators and transformers') === 'Sản xuất động cơ điện, máy phát điện và máy biến áp');
check('Agriculture title is Vietnamese', translateIndustryTitle('Growing of cereals (except rice), leguminous crops and oil seeds') === 'Trồng cây ngũ cốc (trừ lúa), cây họ đậu và cây lấy hạt có dầu');
check('Insurance support title is Vietnamese', translateIndustryTitle('Activities auxiliary to insurance and pension funding') === 'Hoạt động hỗ trợ bảo hiểm và quỹ hưu trí');
check('Official English is not overwritten by translator module', !loader.includes('title_en: translateIndustryTitle'));

console.log(`\nINDUSTRY VIETNAMESE TITLE REGRESSION: PASS (${passed} pass, 0 fail)`);
