import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { existsSync, unlinkSync } from 'fs';

import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import {
  promoteValidatedUpload,
  validateUploadedFile,
} from '../common/upload-security';
import { PrismaService } from '../prisma/prisma.service';
import type { ResourceAccessService } from '../security/resource-access.service';
import { DocumentFilesController } from './document-files.controller';
import { DocumentFilesService } from './document-files.service';

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn(),
}));

jest.mock('../common/upload-security', () => ({
  createSecureUploadOptions: jest.fn(() => ({})),
  promoteValidatedUpload: jest.fn(),
  TempUploadCleanupInterceptor: class TempUploadCleanupInterceptor {
    intercept(
      _context: unknown,
      next: {
        handle: () => unknown;
      },
    ) {
      return next.handle();
    }
  },
  validateGeneratedDocument: jest.fn(),
  validateUploadedFile: jest.fn(),
  verifyStoredFileIntegrity: jest.fn(),
}));

type DatabaseMock = {
  corrective_actions: {
    findUnique: jest.Mock;
  };
  documentFile: {
    aggregate: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

const actionId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';

const actor = {
  userId: actorUserId,
  roles: ['CUSTOMER'],
};

const file = {
  originalname: 'evidence.pdf',
  mimetype: 'application/pdf',
  path: 'temp/evidence.upload',
} as Express.Multer.File;

function createDatabaseMock(): DatabaseMock {
  const database: DatabaseMock = {
    corrective_actions: {
      findUnique: jest.fn(),
    },
    documentFile: {
      aggregate: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  database.$transaction.mockImplementation(
    async (callback: (transaction: DatabaseMock) => Promise<unknown>) =>
      callback(database),
  );

  return database;
}

function createResourceAccessMock() {
  return {
    assertCustomerEntityAccess: jest.fn(),
    assertDocumentEntityAccess: jest.fn(),
    filterDocumentEntities: jest.fn(),
  };
}

describe('P.09 customer CAP evidence', () => {
  let database: DatabaseMock;
  let resourceAccess: ReturnType<typeof createResourceAccessMock>;
  let service: DocumentFilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    database = createDatabaseMock();
    resourceAccess = createResourceAccessMock();
    service = new DocumentFilesService(
      database as unknown as PrismaService,
      resourceAccess as unknown as ResourceAccessService,
    );

    jest.mocked(existsSync).mockReturnValue(true);
    jest.mocked(validateUploadedFile).mockReturnValue({
      extension: '.pdf',
      originalName: 'evidence.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      sha256: 'a'.repeat(64),
    });
    jest.mocked(promoteValidatedUpload).mockReturnValue({
      storedName: 'safe-evidence.pdf',
      absolutePath: 'documents/safe-evidence.pdf',
    });
    database.corrective_actions.findUnique.mockResolvedValue({
      id: actionId,
      status: 'submitted',
      audit_findings: {
        status: 'response_submitted',
        corrective_actions: [
          {
            id: actionId,
          },
        ],
      },
    });
    database.documentFile.aggregate.mockResolvedValue({
      _max: {
        version_no: 1,
      },
    });
    database.documentFile.updateMany.mockResolvedValue({
      count: 1,
    });
    database.documentFile.create.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      original_name: 'evidence.pdf',
      mime_type: 'application/pdf',
      file_size: 100,
      version_no: 2,
      is_current: true,
      note: 'Customer evidence',
      created_at: new Date('2026-08-11T00:00:00.000Z'),
      updated_at: new Date('2026-08-11T00:00:00.000Z'),
    });
  });

  it('uploads owned evidence through locked server metadata and SHA-256', async () => {
    const result = await service.uploadCustomerCorrectiveActionEvidence(
      actionId,
      {
        note: ' Customer evidence ',
      },
      file,
      actorUserId,
      actor,
    );

    expect(resourceAccess.assertCustomerEntityAccess).toHaveBeenCalledTimes(2);
    expect(database.documentFile.create).toHaveBeenCalledWith({
      // Jest asymmetric matchers are intentionally typed as any.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        entity_type: 'corrective_action',
        entity_id: actionId,
        document_type: 'corrective_action_evidence',
        file_kind: 'attachment',
        sha256: 'a'.repeat(64),
        version_no: 2,
        uploaded_by: actorUserId,
      }),
    });
    expect(result).not.toHaveProperty('stored_name');
    expect(result.download_url).toBe(
      `/document-files/customer/33333333-3333-4333-8333-333333333333/download`,
    );
  });

  it('rejects cross-customer upload before validation or database mutation', async () => {
    resourceAccess.assertCustomerEntityAccess.mockRejectedValueOnce(
      new ForbiddenException('Denied'),
    );

    await expect(
      service.uploadCustomerCorrectiveActionEvidence(
        actionId,
        {},
        file,
        actorUserId,
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(validateUploadedFile).not.toHaveBeenCalled();
    expect(database.documentFile.create).not.toHaveBeenCalled();
  });

  it('rejects invalid content before promotion or database mutation', async () => {
    jest.mocked(validateUploadedFile).mockImplementation(() => {
      throw new BadRequestException('Invalid content');
    });

    await expect(
      service.uploadCustomerCorrectiveActionEvidence(
        actionId,
        {},
        file,
        actorUserId,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(promoteValidatedUpload).not.toHaveBeenCalled();
    expect(database.documentFile.create).not.toHaveBeenCalled();
  });

  it('removes the promoted file when the database write fails', async () => {
    database.documentFile.create.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(
      service.uploadCustomerCorrectiveActionEvidence(
        actionId,
        {},
        file,
        actorUserId,
        actor,
      ),
    ).rejects.toThrow('Database unavailable');
    expect(unlinkSync).toHaveBeenCalledWith('documents/safe-evidence.pdf');
  });

  it('rejects evidence for an older or already reviewed CAP version', async () => {
    database.corrective_actions.findUnique.mockResolvedValue({
      id: actionId,
      status: 'revision_required',
      audit_findings: {
        status: 'revision_required',
        corrective_actions: [
          {
            id: '44444444-4444-4444-8444-444444444444',
          },
        ],
      },
    });

    await expect(
      service.uploadCustomerCorrectiveActionEvidence(
        actionId,
        {},
        file,
        actorUserId,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.documentFile.create).not.toHaveBeenCalled();
    expect(unlinkSync).toHaveBeenCalledWith('documents/safe-evidence.pdf');
  });

  it('keeps generic upload unavailable to CUSTOMER accounts', () => {
    const genericRoles = Reflect.getMetadata(
      ROLES_KEY,
      // Reflection needs the original method reference, not a bound copy.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      DocumentFilesController.prototype.upload,
    ) as string[];

    expect(genericRoles).not.toContain('CUSTOMER');
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        // Reflection needs the original method reference, not a bound copy.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        DocumentFilesController.prototype.upload,
      ),
    ).toEqual(['documents.manage']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // Reflection needs the original method reference, not a bound copy.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        DocumentFilesController.prototype
          .uploadCustomerCorrectiveActionEvidence,
      ),
    ).toEqual(['CUSTOMER']);
  });

  it('downloads only owned CAP evidence through the customer allowlist', async () => {
    database.documentFile.findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      entity_type: 'corrective_action',
      entity_id: actionId,
      document_type: 'corrective_action_evidence',
      file_kind: 'attachment',
      original_name: 'evidence.pdf',
      stored_name: 'safe-evidence.pdf',
      mime_type: 'application/pdf',
      file_size: 100,
      sha256: 'a'.repeat(64),
      version_no: 2,
      is_current: true,
      note: null,
      created_at: new Date('2026-08-11T00:00:00.000Z'),
      updated_at: new Date('2026-08-11T00:00:00.000Z'),
    });

    const result = await service.getCustomerCorrectiveActionEvidenceDownload(
      '33333333-3333-4333-8333-333333333333',
      actor,
    );

    expect(resourceAccess.assertCustomerEntityAccess).toHaveBeenCalledWith(
      {
        entity_type: 'corrective_action',
        entity_id: actionId,
      },
      actor,
    );
    expect(result.documentFile).not.toHaveProperty('stored_name');
  });

  it('denies cross-customer evidence download', async () => {
    database.documentFile.findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      entity_type: 'corrective_action',
      entity_id: actionId,
      document_type: 'corrective_action_evidence',
      file_kind: 'attachment',
    });
    resourceAccess.assertCustomerEntityAccess.mockRejectedValue(
      new ForbiddenException('Denied'),
    );

    await expect(
      service.getCustomerCorrectiveActionEvidenceDownload(
        '33333333-3333-4333-8333-333333333333',
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose unrelated document types through the customer route', async () => {
    database.documentFile.findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      entity_type: 'audit_plan',
      entity_id: actionId,
      document_type: 'audit_plan_f05',
      file_kind: 'generated_pdf',
    });

    await expect(
      service.getCustomerCorrectiveActionEvidenceDownload(
        '33333333-3333-4333-8333-333333333333',
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resourceAccess.assertCustomerEntityAccess).not.toHaveBeenCalled();
  });
});
