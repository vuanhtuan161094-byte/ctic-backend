import { randomUUID } from 'node:crypto';
import { MasterDataConfigurationService } from '../src/master-data-configuration/master-data-configuration.service';
import { TaxonomyRuntimePolicyService } from '../src/industry-classifications/taxonomy-runtime-policy.service';

const { createClient, parseSqlServerUrl } = require('../scripts/tests/run-p09-real-e2e.cjs');
jest.setTimeout(120_000);

describe('CFG-1C isolated SQL import transaction', () => {
  let prisma: any;
  let service: MasterDataConfigurationService;
  const classificationIds: string[] = [];
  const jobIds: string[] = [];
  let actor: string;
  const suffix = randomUUID().slice(0, 8);
  const sourceCode = `CFG${suffix}`;
  const targetCode = `CFGN${suffix}`;
  const otherCode = `CFGO${suffix}`;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (process.env.NODE_ENV !== 'test' || !url || url !== process.env.DATABASE_URL || parseSqlServerUrl(url).database !== 'CTIC_Certification_P09_test') throw new Error('Import E2E requires exact isolated P09 test connection');
    prisma = createClient(url);
    const database = await prisma.$queryRawUnsafe('SELECT DB_NAME() AS name');
    if (database[0].name !== 'CTIC_Certification_P09_test') throw new Error('Unexpected database');
    actor = (await prisma.users.findFirst({ select: { id: true } }))?.id;
    if (!actor) throw new Error('P09 test actor fixture missing');
    for (const [type, code] of [['ISIC', sourceCode], ['NACE', targetCode], ['NACE', otherCode]]) {
      const row = await prisma.industry_classifications.create({ data: { classification_type: type, revision: type === 'ISIC' ? 'ISIC_REV_4' : 'NACE_REV_2', code, title_en: 'CFG-1C isolated fixture', level: 4 } });
      classificationIds.push(row.id);
    }
    service = new MasterDataConfigurationService(prisma, { write: async () => undefined } as any);
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.audit_logs.deleteMany({ where: { entity_type: 'import_job', entity_id: { in: jobIds } } });
      await prisma.import_job_rows.deleteMany({ where: { job_id: { in: jobIds } } });
      await prisma.import_jobs.deleteMany({ where: { id: { in: jobIds } } });
      await prisma.industry_code_mappings.deleteMany({ where: { source_code_id: { in: classificationIds } } });
      await prisma.industry_classifications.deleteMany({ where: { id: { in: classificationIds } } });
    } finally { await prisma.$disconnect(); }
  });
  const preview = async (targets: string[]) => {
    const csv = 'isic_revision,isic_code,nace_revision,nace_code,mapping_type,note,valid_from,valid_to\n' + targets.map(code => `ISIC_REV_4,${sourceCode},NACE_REV_2,${code},EXACT,,,`).join('\n');
    const buffer = Buffer.from(csv);
    const job = await service.validateImport('ISIC_NACE_MAPPING', 'CREATE_ONLY', { originalname: 'cfg1c.csv', size: buffer.length, buffer } as any, actor);
    jobIds.push(job.id); return job;
  };
  it('commits one time, keeps drafts excluded, atomically rejects invalid batch then publishes with audit', async () => {
    const job = await preview([targetCode, otherCode]);
    expect(job.valid_rows).toBe(2);
    const results = await Promise.allSettled([service.commitImport(job.id, actor), service.commitImport(job.id, actor)]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
    const policy = new TaxonomyRuntimePolicyService(prisma);
    const operationalIds = async () => (await (policy as any).loadSnapshot()).industryMappings.filter((x: any) => x.source_code_id === classificationIds[0]);
    expect(await operationalIds()).toHaveLength(0);
    const mappings = await prisma.industry_code_mappings.findMany({ where: { source_code_id: classificationIds[0] } });
    await prisma.industry_code_mappings.update({ where: { id: mappings[1].id }, data: { mapping_type: 'MANY_TO_ONE' } });
    await expect(service.publishImport(job.id, actor)).rejects.toThrow();
    expect(await operationalIds()).toHaveLength(0);
    expect(await prisma.industry_code_mappings.count({ where: { source_code_id: classificationIds[0], mapping_status: 'DRAFT' } })).toBe(2);
    await prisma.industry_code_mappings.update({ where: { id: mappings[1].id }, data: { mapping_type: 'EXACT' } });
    expect((await service.publishImport(job.id, actor)).publication_state).toBe('OPERATIONAL');
    expect(await operationalIds()).toHaveLength(2);
    await expect(service.publishImport(job.id, actor)).rejects.toThrow();
    const audit = await prisma.audit_logs.findMany({ where: { entity_id: job.id }, orderBy: { created_at: 'asc' } });
    expect(audit.map((x: any) => x.action)).toEqual(['IMPORT_COMMITTED', 'IMPORT_PUBLISHED']);
    expect(audit.every((x: any) => x.user_id === actor)).toBe(true);
  });
});
