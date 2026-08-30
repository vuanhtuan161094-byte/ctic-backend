'use strict';
require('dotenv/config');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');
const { translateIndustryTitle } = require('./lib/industry-title-vi-20260826.cjs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');

function parseDbName(url) {
  const match = String(url).match(/(?:database|initial catalog)=([^;]+)/i);
  return match ? match[1].replace(/^\{|\}$/g, '') : '';
}

function assertDevTarget() {
  const db = parseDbName(DATABASE_URL);
  if (db !== 'CTIC_Certification') throw new Error(`DEV backfill only. Expected CTIC_Certification, actual ${db || 'UNKNOWN'}.`);
  if (!/sqlserver:\/\/(localhost|127\.0\.0\.1)(?::\d+)?;/i.test(DATABASE_URL)) {
    throw new Error('DEV backfill only accepts localhost/127.0.0.1.');
  }
}

async function main() {
  assertDevTarget();
  console.log('============================================================');
  console.log('CMP INDUSTRY VIETNAMESE TITLE BACKFILL');
  console.log('Target: CTIC_Certification (DEV)');
  console.log('Scope: ISIC Rev.4 + NACE Rev.2 title_vi only');
  console.log('Official English title_en remains unchanged.');
  console.log('============================================================');

  const prisma = new PrismaClient({ adapter: new PrismaMssql(DATABASE_URL) });
  try {
    const rows = await prisma.industry_classifications.findMany({
      where: {
        is_active: true,
        OR: [
          { classification_type: 'ISIC', revision: 'ISIC_REV_4' },
          { classification_type: 'NACE', revision: 'NACE_REV_2' },
        ],
      },
      select: { id: true, classification_type: true, code: true, title_en: true },
      orderBy: [{ classification_type: 'asc' }, { code: 'asc' }],
    });

    if (!rows.length) throw new Error('No ISIC/NACE reference rows found. Load Step 3 official industry master first.');

    let changed = 0;
    for (const row of rows) {
      const titleVi = translateIndustryTitle(row.title_en);
      if (!titleVi) throw new Error(`Translation empty for ${row.classification_type} ${row.code}`);
      await prisma.industry_classifications.update({ where: { id: row.id }, data: { title_vi: titleVi } });
      changed += 1;
      if (changed % 250 === 0) console.log(`Vietnamese title progress: ${changed}/${rows.length}`);
    }

    const [total, missing, isic2220, nace2711] = await Promise.all([
      prisma.industry_classifications.count({ where: { is_active: true, classification_type: { in: ['ISIC', 'NACE'] } } }),
      prisma.industry_classifications.count({ where: { is_active: true, classification_type: { in: ['ISIC', 'NACE'] }, OR: [{ title_vi: null }, { title_vi: '' }] } }),
      prisma.industry_classifications.findUnique({ where: { classification_type_revision_code: { classification_type: 'ISIC', revision: 'ISIC_REV_4', code: '2220' } }, select: { title_vi: true } }),
      prisma.industry_classifications.findUnique({ where: { classification_type_revision_code: { classification_type: 'NACE', revision: 'NACE_REV_2', code: '27.11' } }, select: { title_vi: true } }),
    ]);

    if (missing !== 0) throw new Error(`Vietnamese title coverage incomplete: ${missing}/${total} missing`);
    if (isic2220?.title_vi !== 'Sản xuất sản phẩm nhựa') throw new Error(`Sanity ISIC 2220 unexpected Vietnamese label: ${isic2220?.title_vi || 'NULL'}`);
    if (nace2711?.title_vi !== 'Sản xuất động cơ điện, máy phát điện và máy biến áp') throw new Error(`Sanity NACE 27.11 unexpected Vietnamese label: ${nace2711?.title_vi || 'NULL'}`);

    console.log('============================================================');
    console.log('INDUSTRY VIETNAMESE TITLE BACKFILL: PASS');
    console.log(`Vietnamese labels populated: ${total}/${total}`);
    console.log('Sanity ISIC 2220: Sản xuất sản phẩm nhựa PASS');
    console.log('Sanity NACE 27.11: Sản xuất động cơ điện, máy phát điện và máy biến áp PASS');
    console.log('============================================================');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`INDUSTRY VIETNAMESE TITLE BACKFILL: FAIL - ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
