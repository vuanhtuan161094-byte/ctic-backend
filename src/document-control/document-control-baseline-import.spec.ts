import { ConflictException } from '@nestjs/common';

import { DocumentControlService } from './document-control.service';
import { DocumentLibraryService } from './document-library.service';

const admin = { userId: '10000000-0000-4000-8000-000000000001', roles: ['ADMIN'] };

describe('Document Control baseline import', () => {
    it('imports the first internal document version directly as effective', async () => {
        const tx: any = {
            document_library_versions: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'version-1',
                    revision_no: 1,
                    revision_label: 'Rev.01',
                    status: 'REVIEWED',
                    file_id: 'file-1',
                    effective_date: null,
                    expiry_date: null,
                    series_id: 'series-1',
                    series: { library_kind: 'INTERNAL' },
                }),
                count: jest.fn().mockResolvedValue(1),
                update: jest.fn().mockResolvedValue({ id: 'version-1', status: 'EFFECTIVE', effective_date: new Date('2026-01-01') }),
            },
            audit_logs: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
        };
        const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
        const service = new DocumentLibraryService(prisma);

        await expect(service.importExistingEffective('version-1', { effective_date: '2026-01-01' }, admin))
            .resolves.toEqual(expect.objectContaining({ status: 'EFFECTIVE' }));
        expect(tx.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'DOCUMENT_LIBRARY_BASELINE_IMPORTED' }),
        }));
    });

    it('never allows baseline import for a later internal revision', async () => {
        const tx: any = {
            document_library_versions: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'version-2', revision_no: 2, status: 'DRAFT', file_id: 'file-2', series_id: 'series-1', series: { library_kind: 'INTERNAL' },
                }),
            },
        };
        const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
        const service = new DocumentLibraryService(prisma);
        await expect(service.importExistingEffective('version-2', {}, admin)).rejects.toBeInstanceOf(ConflictException);
    });

    it('imports only the first validated template revision as a baseline', async () => {
        const tx: any = {
            controlled_template_versions: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'template-version-1',
                    revision_no: 1,
                    status: 'REVIEWED',
                    source_file_id: 'file-1',
                    validation_json: JSON.stringify({ valid: true, unknown_tokens: [] }),
                    series_id: 'template-series-1',
                    change_note: null,
                }),
                count: jest.fn().mockResolvedValue(1),
                update: jest.fn().mockResolvedValue({ id: 'template-version-1', status: 'EFFECTIVE' }),
            },
            audit_logs: { create: jest.fn().mockResolvedValue({ id: 'audit-2' }) },
        };
        const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
        const resourceAccess: any = {};
        const service = new DocumentControlService(prisma, resourceAccess);

        await expect(service.importExistingTemplateEffective(
            'template-version-1',
            { effective_date: '2026-01-01' },
            admin,
        )).resolves.toEqual(expect.objectContaining({ status: 'EFFECTIVE' }));
        expect(tx.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'CONTROLLED_TEMPLATE_BASELINE_IMPORTED' }),
        }));
    });
});
