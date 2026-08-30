import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DocumentControlService } from './document-control.service';

const actor = { userId: '10000000-0000-4000-8000-000000000001', roles: ['ADMIN'] };

function createHarness() {
    const tx: any = {
        $queryRaw: jest.fn().mockResolvedValue([{ prefix: 'F.04', next_value: 2 }]),
        controlled_template_series: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        controlled_template_versions: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        controlled_number_sequences: {},
        controlled_documents: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        controlled_document_versions: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        controlled_document_actions: { create: jest.fn() },
        documentFile: { findUnique: jest.fn() },
    };
    const prisma: any = {
        ...tx,
        $transaction: jest.fn(async (operation: any, options?: any) =>
            typeof operation === 'function' ? operation(tx) : Promise.all(operation),
        ),
    };
    const resourceAccess: any = {
        assertDocumentEntityAccess: jest.fn().mockResolvedValue(undefined),
        filterDocumentEntities: jest.fn(async (rows: any[]) => rows),
    };
    return {
        tx,
        prisma,
        resourceAccess,
        service: new DocumentControlService(prisma, resourceAccess),
    };
}

describe('DocumentControlService', () => {
    it('keeps effective template content immutable', async () => {
        const harness = createHarness();
        harness.prisma.controlled_template_versions.findUnique.mockResolvedValue({
            id: '20000000-0000-4000-8000-000000000001',
            status: 'EFFECTIVE',
        });
        harness.prisma.documentFile.findUnique.mockResolvedValue({ id: 'file' });

        await expect(harness.service.attachTemplateSource(
            '20000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000001',
            actor,
        )).rejects.toBeInstanceOf(ConflictException);
        expect(harness.prisma.controlled_template_versions.update).not.toHaveBeenCalled();
    });

    it('makes a new effective revision supersede, not delete, the previous revision', async () => {
        const harness = createHarness();
        harness.tx.controlled_template_versions.findUnique.mockResolvedValue({
            id: 'version-2',
            series_id: 'series-1',
            status: 'APPROVED',
            source_file_id: 'source-file-v2',
            validation_json: JSON.stringify({ valid: true, unknown_tokens: [] }),
            change_note: 'Revision 2',
        });
        harness.tx.controlled_template_versions.update.mockResolvedValue({ id: 'version-2', status: 'EFFECTIVE' });

        await harness.service.makeTemplateEffective(
            '20000000-0000-4000-8000-000000000002',
            { effective_date: '2026-08-24' },
            actor,
        );

        expect(harness.tx.controlled_template_versions.updateMany).toHaveBeenCalledWith({
            where: { series_id: 'series-1', status: 'EFFECTIVE', id: { not: '20000000-0000-4000-8000-000000000002' } },
            data: { status: 'SUPERSEDED', superseded_at: expect.any(Date) },
        });
        expect(harness.tx.controlled_template_versions.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'EFFECTIVE' }) }),
        );
    });


    it('rejects making an approved template effective when no Word/Excel source file is attached', async () => {
        const harness = createHarness();
        harness.tx.controlled_template_versions.findUnique.mockResolvedValue({
            id: 'version-no-source',
            series_id: 'series-1',
            status: 'APPROVED',
            source_file_id: null,
            validation_json: JSON.stringify({ valid: true, unknown_tokens: [] }),
        });

        await expect(harness.service.makeTemplateEffective(
            '20000000-0000-4000-8000-000000000010',
            { effective_date: '2026-08-24' },
            actor,
        )).rejects.toBeInstanceOf(ConflictException);

        expect(harness.tx.controlled_template_versions.updateMany).not.toHaveBeenCalled();
        expect(harness.tx.controlled_template_versions.update).not.toHaveBeenCalled();
    });

    it('rejects making an approved template effective when placeholder validation failed', async () => {
        const harness = createHarness();
        harness.tx.controlled_template_versions.findUnique.mockResolvedValue({
            id: 'version-invalid-template',
            series_id: 'series-1',
            status: 'APPROVED',
            source_file_id: 'source-file-invalid',
            validation_json: JSON.stringify({
                valid: false,
                unknown_tokens: ['unknown.token'],
            }),
        });

        await expect(harness.service.makeTemplateEffective(
            '20000000-0000-4000-8000-000000000011',
            { effective_date: '2026-08-24' },
            actor,
        )).rejects.toBeInstanceOf(ConflictException);

        expect(harness.tx.controlled_template_versions.updateMany).not.toHaveBeenCalled();
        expect(harness.tx.controlled_template_versions.update).not.toHaveBeenCalled();
    });

    it('allows a template creator to confirm content review', async () => {
        const harness = createHarness();
        harness.prisma.controlled_template_versions.findUnique.mockResolvedValue({
            id: 'template-version-1',
            status: 'UNDER_REVIEW',
            source_file_id: 'source-file',
            created_by: actor.userId,
            reviewed_by: null,
            change_note: 'Initial template',
        });
        harness.prisma.controlled_template_versions.update.mockResolvedValue({
            id: 'template-version-1',
            status: 'REVIEWED',
        });

        await expect(harness.service.reviewTemplate('template-version-1', {}, actor)).resolves.toEqual(
            expect.objectContaining({ status: 'REVIEWED' }),
        );
        expect(harness.prisma.controlled_template_versions.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'REVIEWED', reviewed_by: actor.userId }),
            }),
        );
    });

    it('still blocks a template creator/reviewer from approving the same version', async () => {
        const harness = createHarness();
        harness.prisma.controlled_template_versions.findUnique.mockResolvedValue({
            id: 'template-version-1',
            status: 'REVIEWED',
            source_file_id: 'source-file',
            created_by: actor.userId,
            reviewed_by: actor.userId,
            change_note: 'Initial template',
        });

        await expect(harness.service.approveTemplate('template-version-1', {}, actor))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('snapshots the exact effective template revision on document version 1', async () => {
        const harness = createHarness();
        harness.tx.controlled_template_versions.findUnique.mockResolvedValue({
            id: 'template-v3',
            status: 'EFFECTIVE',
            source_file_id: 'source-file',
            revision_label: 'R3',
            series: { template_code: 'F.04-P.09' },
        });
        harness.tx.controlled_documents.create.mockImplementation(async ({ data }: any) => data);

        const result: any = await harness.service.createDocument({
            document_code: 'F.04',
            document_name: 'Quyết định thành lập đoàn',
            document_type: 'audit_team_assignment',
            entity_type: 'audit_plan',
            entity_id: '40000000-0000-4000-8000-000000000001',
            template_version_id: '20000000-0000-4000-8000-000000000003',
            number_year: 2026,
        }, actor);

        expect(result.document_number).toBe('F.04-2026-0001');
        expect(result.versions.create).toEqual(expect.objectContaining({
            template_version_id: 'template-v3',
            template_code: 'F.04-P.09',
            template_revision: 'R3',
        }));
        expect(harness.prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    });

    it('allows the creator to confirm review content but still records the reviewer', async () => {
        const harness = createHarness();
        harness.prisma.controlled_document_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            document_id: 'document-1',
            status: 'UNDER_REVIEW',
            working_file_id: 'working-file',
            created_by: actor.userId,
            reviewed_by: null,
            document: { entity_type: 'audit_plan', entity_id: 'plan-1' },
        });
        harness.tx.controlled_document_versions.update.mockResolvedValue({ id: 'version-1', status: 'REVIEWED' });

        await expect(harness.service.reviewDocument('version-1', {}, actor)).resolves.toEqual(
            expect.objectContaining({ status: 'REVIEWED' }),
        );
        expect(harness.tx.controlled_document_versions.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'REVIEWED', reviewed_by: actor.userId }),
            }),
        );
    });

    it('still blocks the creator from approving the same exact version', async () => {
        const harness = createHarness();
        harness.prisma.controlled_document_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            document_id: 'document-1',
            status: 'REVIEWED',
            working_file_id: 'working-file',
            created_by: actor.userId,
            reviewed_by: actor.userId,
            document: { entity_type: 'audit_plan', entity_id: 'plan-1' },
        });

        await expect(harness.service.approveDocument('version-1', {}, actor))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('never silently overwrites an official PDF on an approved version', async () => {
        const harness = createHarness();
        harness.prisma.controlled_document_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            status: 'APPROVED',
            official_file_id: 'official-existing',
            document: { entity_type: 'report', entity_id: 'report-1' },
        });
        harness.prisma.documentFile.findUnique.mockResolvedValue({
            id: 'official-new',
            mime_type: 'application/pdf',
            original_name: 'official.pdf',
            sha256: 'a'.repeat(64),
        });

        await expect(harness.service.attachOfficialFile(
            'version-1',
            { file_id: '30000000-0000-4000-8000-000000000001', signature_method: 'AUTHENTICATED_APPROVAL' },
            actor,
        )).rejects.toBeInstanceOf(ConflictException);
    });

    it('binds signature acknowledgement to the official file hash and exact version', async () => {
        const harness = createHarness();
        const hash = 'b'.repeat(64);
        harness.prisma.controlled_document_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            status: 'APPROVED',
            official_file_id: null,
            document: { entity_type: 'report', entity_id: 'report-1' },
        });
        harness.prisma.documentFile.findUnique.mockResolvedValue({
            id: 'official-new',
            entity_type: 'report',
            entity_id: 'report-1',
            mime_type: 'application/pdf',
            original_name: 'official.pdf',
            sha256: hash,
        });
        harness.tx.controlled_document_versions.update.mockResolvedValue({ id: 'version-1' });

        await harness.service.attachOfficialFile(
            'version-1',
            { file_id: '30000000-0000-4000-8000-000000000001', signature_method: 'AUTHENTICATED_APPROVAL' },
            actor,
        );

        expect(harness.tx.controlled_document_versions.update).toHaveBeenCalledWith({
            where: { id: 'version-1' },
            data: expect.objectContaining({
                official_file_id: 'official-new',
                signed_by: actor.userId,
                signed_sha256: hash,
                signature_method: 'AUTHENTICATED_APPROVAL',
            }),
        });
    });

    it('requires a new controlled version for corrections after issue', async () => {
        const harness = createHarness();
        harness.prisma.controlled_documents.findUnique.mockResolvedValue({
            id: 'document-1',
            entity_type: 'report',
            entity_id: 'report-1',
            versions: [],
        });
        harness.tx.controlled_documents.findUnique.mockResolvedValue({
            id: 'document-1',
            versions: [{
                id: 'version-1',
                version_no: 1,
                status: 'ISSUED',
                template_version_id: 'template-v1',
                template_code: 'F.09',
                template_revision: 'R1',
            }],
        });
        harness.tx.controlled_document_versions.create.mockImplementation(async ({ data }: any) => data);

        const result: any = await harness.service.reviseIssuedDocument(
            'document-1',
            { change_note: 'Formal correction' },
            actor,
        );

        expect(result).toEqual(expect.objectContaining({
            version_no: 2,
            previous_version_id: 'version-1',
        }));
        expect(harness.tx.controlled_documents.update).toHaveBeenCalledWith({
            where: { id: 'document-1' },
            data: { status: 'DRAFT', current_version_no: 2 },
        });
    });

    it('rejects issue when the bound official hash no longer matches', async () => {
        const harness = createHarness();
        harness.prisma.controlled_document_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            status: 'APPROVED',
            official_file_id: 'official-file',
            signed_sha256: 'a'.repeat(64),
            official_file: { sha256: 'b'.repeat(64) },
            document: { entity_type: 'report', entity_id: 'report-1' },
        });

        await expect(harness.service.issueDocument('version-1', {}, actor))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('retries document ISSUE once for transient SQL ENOTBEGUN and keeps Serializable semantics', async () => {
        const harness = createHarness();
        const sha256 = 'a'.repeat(64);
        harness.prisma.controlled_document_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            document_id: 'document-1',
            status: 'APPROVED',
            official_file_id: 'official-file',
            signed_sha256: sha256,
            official_file: { sha256 },
            document: { entity_type: 'report', entity_id: 'report-1' },
        });
        harness.prisma.$transaction
            .mockRejectedValueOnce({
                meta: {
                    driverAdapterError: {
                        originalError: {
                            code: 'ENOTBEGUN',
                            message: 'Transaction has not begun. Call begin() first.',
                        },
                    },
                },
            })
            .mockImplementationOnce(async (operation: any) => operation(harness.tx));
        harness.tx.controlled_document_versions.update.mockResolvedValue({ id: 'version-1', status: 'ISSUED' });

        const result: any = await harness.service.issueDocument('version-1', { note: 'Issue after retry' }, actor);

        expect(result).toEqual(expect.objectContaining({ id: 'version-1', status: 'ISSUED' }));
        expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(harness.prisma.$transaction).toHaveBeenLastCalledWith(
            expect.any(Function),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        expect(harness.tx.controlled_documents.update).toHaveBeenCalledWith({
            where: { id: 'document-1' },
            data: { status: 'ISSUED', issued_at: expect.any(Date) },
        });
    });

    it('stops Serializable ENOTBEGUN recovery after two total attempts', async () => {
        const harness = createHarness();
        harness.prisma.$transaction.mockRejectedValue({
            code: 'ENOTBEGUN',
            message: 'Transaction has not begun. Call begin() first.',
        });

        await expect(harness.service.createDocument({
            document_code: 'P5',
            document_name: 'Retry ceiling',
            document_type: 'phase5_retry',
            entity_type: 'report',
            entity_id: '40000000-0000-4000-8000-000000000010',
        }, actor)).rejects.toMatchObject({ code: 'ENOTBEGUN' });

        expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry a database connectivity failure inside document business transactions', async () => {
        const harness = createHarness();
        harness.prisma.$transaction.mockRejectedValue({
            code: 'P1001',
            message: 'Failed to connect to localhost:1433 in 15000ms',
        });

        await expect(harness.service.createDocument({
            document_code: 'P5',
            document_name: 'No connection retry',
            document_type: 'phase5_retry',
            entity_type: 'report',
            entity_id: '40000000-0000-4000-8000-000000000011',
        }, actor)).rejects.toMatchObject({ code: 'P1001' });

        expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('retries the whole Serializable transaction for nested SQL ENOTBEGUN', async () => {
        const harness = createHarness();
        harness.tx.$queryRaw.mockResolvedValue([{ prefix: 'P5', next_value: 2 }]);
        harness.prisma.$transaction.mockRejectedValueOnce({
            meta: {
                driverAdapterError: {
                    originalError: {
                        code: 'ENOTBEGUN',
                        message: 'Transaction has not begun. Call begin() first.',
                    },
                },
            },
        });
        harness.tx.controlled_documents.create.mockImplementation(async ({ data }: any) => data);

        const result: any = await harness.service.createDocument({
            document_code: 'P5',
            document_name: 'Retry contract',
            document_type: 'phase5_retry',
            entity_type: 'report',
            entity_id: '40000000-0000-4000-8000-000000000009',
        }, actor);

        expect(result.document_number).toMatch(/^P5-\d{4}-0001$/);
        expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(harness.prisma.$transaction).toHaveBeenLastCalledWith(
            expect.any(Function),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    });
});
