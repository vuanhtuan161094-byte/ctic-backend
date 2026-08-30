import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { DocumentControlService } from '../src/document-control/document-control.service';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(60_000);

function splitConnectionParts(value: string) {
    const parts: string[] = [];
    let current = '';
    let braces = 0;
    for (const character of value) {
        if (character === '{') braces += 1;
        if (character === '}' && braces > 0) braces -= 1;
        if (character === ';' && braces === 0) {
            parts.push(current);
            current = '';
        } else current += character;
    }
    if (current) parts.push(current);
    return parts;
}

function databaseName(url: string) {
    const parts = splitConnectionParts(url.replace(/^sqlserver:\/\//i, ''));
    parts.shift();
    for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        const key = part.slice(0, separator).trim().toLowerCase();
        if (key === 'database' || key === 'initial catalog') {
            const value = part.slice(separator + 1).trim();
            return value.startsWith('{') && value.endsWith('}')
                ? value.slice(1, -1)
                : value;
        }
    }
    return '';
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const configuredDatabase = databaseName(testDatabaseUrl);
const safeTestDatabase = configuredDatabase.toLowerCase().endsWith('_test') ||
    configuredDatabase.toLowerCase().endsWith('_ci');
if (testDatabaseUrl && !safeTestDatabase) {
    throw new Error(`[P09 E2E SAFETY] Refusing non-test database ${configuredDatabase || '<missing>'}`);
}
if (safeTestDatabase) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.NODE_ENV = 'test';
}

const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 5 controlled document lifecycle (real database e2e)', () => {
    let prisma: PrismaService;
    let service: DocumentControlService;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const actors = {
        creator: { userId: randomUUID(), roles: ['ADMIN'] },
        reviewer: { userId: randomUUID(), roles: ['STAFF'] },
        approver: { userId: randomUUID(), roles: ['ADMIN'] },
    };
    const entityId = randomUUID();
    const fileIds: string[] = [];
    const documentIds: string[] = [];
    const templateSeriesIds: string[] = [];
    const sequenceKeys = [`P5DOC-${suffix}`, `P5C-${suffix}`];
    let effectiveTemplateId = '';

    const resourceAccess = {
        assertDocumentEntityAccess: jest.fn().mockResolvedValue(undefined),
        filterDocumentEntities: jest.fn(async (rows: unknown[]) => rows),
    };

    async function assertTestDatabase() {
        const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>(
            'SELECT DB_NAME() AS database_name',
        );
        const actual = rows[0]?.database_name ?? '';
        if (!actual.toLowerCase().endsWith('_test') && !actual.toLowerCase().endsWith('_ci')) {
            throw new Error(`[P09 E2E SAFETY] Cleanup refused for ${actual || '<unknown>'}`);
        }
    }

    async function createFile(input: {
        entityType: string;
        entityId: string;
        kind: string;
        extension: '.docx' | '.pdf';
        sha?: string;
    }) {
        const id = randomUUID();
        const storedName = `${id}${input.extension}`;
        await prisma.documentFile.create({
            data: {
                id,
                entity_type: input.entityType,
                entity_id: input.entityId,
                document_type: 'phase5_e2e',
                file_kind: input.kind,
                original_name: `phase5-${suffix}${input.extension}`,
                stored_name: storedName,
                file_url: `/uploads/documents/${storedName}`,
                mime_type: input.extension === '.pdf'
                    ? 'application/pdf'
                    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                file_size: 128,
                sha256: input.sha ?? 'a'.repeat(64),
                uploaded_by: actors.creator.userId,
            },
        });
        fileIds.push(id);
        return id;
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect();
        await assertTestDatabase();
        service = new DocumentControlService(prisma, resourceAccess as any);
    });

    afterAll(async () => {
        await assertTestDatabase();
        const persistedDocuments = await prisma.controlled_documents.findMany({
            where: {
                OR: [
                    { id: { in: documentIds } },
                    { document_name: { contains: suffix } },
                ],
            },
            select: { id: true },
        });
        const persistedDocumentIds = persistedDocuments.map((row) => row.id);
        if (persistedDocumentIds.length) {
            const versions = await prisma.controlled_document_versions.findMany({
                where: { document_id: { in: persistedDocumentIds } },
                select: { id: true },
            });
            const versionIds = versions.map((row) => row.id);
            if (versionIds.length) {
                await prisma.controlled_document_actions.deleteMany({ where: { version_id: { in: versionIds } } });
                await prisma.controlled_document_versions.deleteMany({ where: { id: { in: versionIds } } });
            }
            await prisma.controlled_documents.deleteMany({ where: { id: { in: persistedDocumentIds } } });
        }
        if (templateSeriesIds.length) {
            await prisma.controlled_template_versions.deleteMany({ where: { series_id: { in: templateSeriesIds } } });
            await prisma.controlled_template_series.deleteMany({ where: { id: { in: templateSeriesIds } } });
        }
        if (fileIds.length) await prisma.documentFile.deleteMany({ where: { id: { in: fileIds } } });
        await prisma.controlled_number_sequences.deleteMany({ where: { series_key: { in: sequenceKeys } } });
        await prisma.$disconnect();
    });

    it('retains superseded template history and exact revision lineage', async () => {
        const series = await service.createTemplate({
            template_code: `P5-${suffix}`,
            template_name: 'Phase 5 lifecycle template',
            document_type: 'phase5_e2e',
            revision_label: 'R1',
        }, actors.creator);
        templateSeriesIds.push(series.id);
        const revision1 = series.versions[0];
        const source1 = await createFile({
            entityType: 'controlled_template_version',
            entityId: revision1.id,
            kind: 'attachment',
            extension: '.docx',
        });
        await service.attachTemplateSource(revision1.id, source1, actors.creator);
        await service.submitTemplateReview(revision1.id, {}, actors.creator);
        await service.reviewTemplate(revision1.id, {}, actors.reviewer);
        await service.approveTemplate(revision1.id, {}, actors.approver);
        await service.makeTemplateEffective(revision1.id, { effective_date: '2026-08-24' }, actors.approver);

        const revision2 = await service.createTemplateRevision(series.id, {
            revision_label: 'R2',
            change_note: 'Controlled revision 2',
        }, actors.creator);
        const source2 = await createFile({
            entityType: 'controlled_template_version',
            entityId: revision2.id,
            kind: 'attachment',
            extension: '.docx',
        });
        await service.attachTemplateSource(revision2.id, source2, actors.creator);
        await service.submitTemplateReview(revision2.id, {}, actors.creator);
        await service.reviewTemplate(revision2.id, {}, actors.reviewer);
        await service.approveTemplate(revision2.id, {}, actors.approver);
        await service.makeTemplateEffective(revision2.id, { effective_date: '2026-09-01' }, actors.approver);
        effectiveTemplateId = revision2.id;

        const history = await prisma.controlled_template_versions.findMany({
            where: { series_id: series.id },
            orderBy: { revision_no: 'asc' },
        });
        expect(history.map((row) => [row.revision_no, row.status])).toEqual([
            [1, 'SUPERSEDED'],
            [2, 'EFFECTIVE'],
        ]);
        expect(history[0].source_file_id).toBe(source1);
    });

    it('binds official PDF and authenticated approval to one immutable issued version', async () => {
        const document = await service.createDocument({
            document_code: 'F.09',
            document_name: 'Phase 5 controlled report',
            document_type: 'phase5_e2e',
            entity_type: 'report',
            entity_id: entityId,
            template_version_id: effectiveTemplateId,
            series_key: sequenceKeys[0],
            number_year: 2026,
        }, actors.creator);
        documentIds.push(document.id);
        const version1 = document.versions[0];
        const workingFile = await createFile({
            entityType: 'report', entityId, kind: 'generated_docx', extension: '.docx',
        });
        await service.attachWorkingFile(version1.id, workingFile, actors.creator);
        await service.submitDocumentReview(version1.id, {}, actors.creator);
        await service.reviewDocument(version1.id, {}, actors.reviewer);
        await service.approveDocument(version1.id, {}, actors.approver);
        const officialHash = 'b'.repeat(64);
        const officialFile = await createFile({
            entityType: 'report', entityId, kind: 'generated_pdf', extension: '.pdf', sha: officialHash,
        });
        await service.attachOfficialFile(version1.id, {
            file_id: officialFile,
            signature_method: 'AUTHENTICATED_APPROVAL',
        }, actors.approver);
        await service.issueDocument(version1.id, { note: 'Formal issue' }, actors.approver);

        const issued = await prisma.controlled_document_versions.findUniqueOrThrow({ where: { id: version1.id } });
        expect(issued.status).toBe('ISSUED');
        expect(issued.official_file_id).toBe(officialFile);
        expect(issued.signed_sha256).toBe(officialHash);
        expect(issued.signature_method).toBe('AUTHENTICATED_APPROVAL');
        await expect(service.attachWorkingFile(version1.id, workingFile, actors.creator))
            .rejects.toBeInstanceOf(ConflictException);
        await expect(service.attachOfficialFile(version1.id, {
            file_id: officialFile,
            signature_method: 'AUTHENTICATED_APPROVAL',
        }, actors.approver)).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a replacement version after issue and leaves historical version readable', async () => {
        const documentId = documentIds[0];
        const replacement = await service.reviseIssuedDocument(documentId, {
            change_note: 'Correction after issue',
        }, actors.creator);
        const detail = await service.findDocument(documentId, actors.creator);

        expect(replacement.version_no).toBe(2);
        expect(replacement.previous_version_id).toBe(detail.versions.find((row) => row.version_no === 1)?.id);
        expect(detail.versions.map((row) => [row.version_no, row.status])).toEqual([
            [2, 'DRAFT'],
            [1, 'ISSUED'],
        ]);
        expect(detail.versions[0].template_version_id).toBe(effectiveTemplateId);
        expect(detail.versions[1].official_file_id).toBeTruthy();
    });

    it('allocates unique document numbers under concurrent requests', async () => {
        const create = (index: number) => service.createDocument({
            document_code: 'P5C',
            document_name: `Concurrent ${suffix} ${index}`,
            document_type: 'phase5_concurrent',
            entity_type: 'report',
            entity_id: randomUUID(),
            series_key: sequenceKeys[1],
            number_year: 2026,
        }, actors.creator);
        const created = await Promise.all([create(1), create(2), create(3)]);
        documentIds.push(...created.map((row) => row.id));
        expect(new Set(created.map((row) => row.document_number)).size).toBe(3);
        expect(created.map((row) => row.document_number).sort()).toEqual([
            `${sequenceKeys[1]}-2026-0001`,
            `${sequenceKeys[1]}-2026-0002`,
            `${sequenceKeys[1]}-2026-0003`,
        ]);
    });
});
