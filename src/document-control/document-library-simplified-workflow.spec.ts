import { ForbiddenException } from '@nestjs/common';

import { DocumentLibraryService } from './document-library.service';

const creator = { userId: '10000000-0000-4000-8000-000000000001', roles: ['ADMIN'] };
const approver = { userId: '10000000-0000-4000-8000-000000000002', roles: ['STAFF'] };

function createHarness() {
    const prisma: any = {
        document_library_versions: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        audit_logs: {
            create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        },
    };
    return { prisma, service: new DocumentLibraryService(prisma) };
}

describe('DocumentLibraryService simplified workflow', () => {
    it('allows the creator to confirm content review', async () => {
        const harness = createHarness();
        harness.prisma.document_library_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            status: 'UNDER_REVIEW',
            file_id: 'file-1',
            created_by: creator.userId,
            reviewed_by: null,
            series: { library_kind: 'INTERNAL' },
        });
        harness.prisma.document_library_versions.update.mockResolvedValue({
            id: 'version-1',
            status: 'REVIEWED',
        });

        await expect(harness.service.review('version-1', {}, creator)).resolves.toEqual(
            expect.objectContaining({ status: 'REVIEWED' }),
        );
        expect(harness.prisma.document_library_versions.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'REVIEWED', reviewed_by: creator.userId }),
            }),
        );
    });

    it('still blocks the creator/reviewer from approving the same version', async () => {
        const harness = createHarness();
        harness.prisma.document_library_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            status: 'REVIEWED',
            file_id: 'file-1',
            created_by: creator.userId,
            reviewed_by: creator.userId,
            series: { library_kind: 'INTERNAL' },
        });

        await expect(harness.service.approve('version-1', {}, creator))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a different internal controller to approve', async () => {
        const harness = createHarness();
        harness.prisma.document_library_versions.findUnique.mockResolvedValue({
            id: 'version-1',
            status: 'REVIEWED',
            file_id: 'file-1',
            created_by: creator.userId,
            reviewed_by: creator.userId,
            series: { library_kind: 'INTERNAL' },
        });
        harness.prisma.document_library_versions.update.mockResolvedValue({
            id: 'version-1',
            status: 'APPROVED',
        });

        await expect(harness.service.approve('version-1', {}, approver)).resolves.toEqual(
            expect.objectContaining({ status: 'APPROVED' }),
        );
    });
});
