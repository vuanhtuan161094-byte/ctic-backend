import { ForbiddenException } from '@nestjs/common';
import { DocumentFilesService } from './document-files.service';
import { DocumentFilesController } from './document-files.controller';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Reflector } from '@nestjs/core';
import { validateUploadedFile, promoteValidatedUpload, verifyStoredFileIntegrity } from '../common/upload-security';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn(() => true), unlinkSync: jest.fn() }));

jest.mock('../common/upload-security', () => ({
  ...jest.requireActual('../common/upload-security'),
  validateUploadedFile: jest.fn(() => ({ originalName: 'evidence.pdf', mimeType: 'application/pdf', fileSize: 1, sha256: 'hash', extension: '.pdf' })),
  promoteValidatedUpload: jest.fn(() => ({ storedName: 'unit-test-not-written.pdf', absolutePath: 'unit-test-not-written.pdf' })),
  verifyStoredFileIntegrity: jest.fn(),
}));
function harness(status = 'DRAFT') {
  const db: any = {
    expert_competency_evidences: { findFirst: jest.fn(async ({ where }) => where.id === 'own-evidence' && where.competency.experts.user_id === 'owner'
      ? { id: 'own-evidence', status: 'ACTIVE', competency: { approval_status: status } } : null) },
    documentFile: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, stored_name: 'unit-test-not-written.pdf', original_name: 'evidence.pdf', file_size: 1, sha256: 'hash', entity_type: where.id === 'project-file' ? 'project' : 'expert_competency_evidence', entity_id: where.id === 'own-file' ? 'own-evidence' : 'foreign-evidence' })),
      findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _max: { version_no: 0 } })), updateMany: jest.fn(), create: jest.fn(async ({ data }) => ({ id: 'new-file', ...data })) },
  };
  db.$transaction = jest.fn(fn => fn(db));
  const access: any = { assertDocumentEntityAccess: jest.fn() };
  return { db, access, service: new DocumentFilesService(db, access) };
}
describe('narrow self-service competency attachments', () => {
  beforeEach(() => jest.clearAllMocks());
  it('downloads owned evidence with storage integrity validation', async () => {
    const h = harness('APPROVED');
    const result = await h.service.downloadOwnCompetencyFile('own-file', 'owner');
    expect(result.documentFile.id).toBe('own-file');
    expect(verifyStoredFileIntegrity).toHaveBeenCalledWith(expect.any(String), 1, 'hash');
    expect(h.access.assertDocumentEntityAccess).not.toHaveBeenCalled();
  });
  it.each(['foreign-file', 'project-file'])('rejects direct metadata/download guesses for %s', async id => {
    const h = harness(); await expect(h.service.ownCompetencyFile(id, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.downloadOwnCompetencyFile(id, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects foreign evidence listing and upload before storage promotion', async () => {
    const h = harness(); await expect(h.service.ownCompetencyEvidenceFiles('foreign-evidence', 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.uploadOwnCompetencyEvidence('foreign-evidence', {} as any, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    expect(validateUploadedFile).not.toHaveBeenCalled(); expect(promoteValidatedUpload).not.toHaveBeenCalled();
  });
  it.each(['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED'])('allows own read but rejects file mutation in %s', async status => {
    const h = harness(status); await expect(h.service.ownCompetencyFile('own-file', 'owner')).resolves.toMatchObject({ id: 'own-file' });
    await expect(h.service.uploadOwnCompetencyEvidence('own-evidence', {} as any, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.db.documentFile.create).not.toHaveBeenCalled();
  });
  it.each(['DRAFT', 'RETURNED'])('uploads own file in %s using fixed entity/type and rechecking transaction', async status => {
    const h = harness(status); await h.service.uploadOwnCompetencyEvidence('own-evidence', {} as any, 'owner');
    expect(h.db.expert_competency_evidences.findFirst).toHaveBeenCalledTimes(2);
    expect(h.db.documentFile.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entity_type: 'expert_competency_evidence', entity_id: 'own-evidence', uploaded_by: 'owner', file_kind: 'attachment' }) });
    expect(h.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(h.access.assertDocumentEntityAccess).not.toHaveBeenCalled();
  });
  it('rejects a concurrent transition before creating a file version', async () => {
    const h = harness(); h.db.expert_competency_evidences.findFirst.mockResolvedValueOnce({ status: 'ACTIVE', competency: { approval_status: 'DRAFT' } })
      .mockResolvedValueOnce({ status: 'ACTIVE', competency: { approval_status: 'PENDING_APPROVAL' } });
    await expect(h.service.uploadOwnCompetencyEvidence('own-evidence', {} as any, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.db.documentFile.create).not.toHaveBeenCalled();
  });
  it('retains generic document permissions and admin upload path', async () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, DocumentFilesController.prototype.upload)).toEqual(['documents.manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, DocumentFilesController.prototype.findAll)).toEqual(['documents.read']);
    const h = harness('APPROVED'); await h.service.upload({ entity_type: 'expert_competency_evidence', entity_id: 'foreign-evidence', document_type: 'competency_evidence', file_kind: 'attachment' }, {} as any, 'admin', { userId: 'admin', roles: ['ADMIN'] });
    expect(h.access.assertDocumentEntityAccess).toHaveBeenCalled(); expect(h.db.documentFile.create).toHaveBeenCalled();
  });
  it('generic listing and download remain denied without document permissions', () => {
    const guard = new PermissionsGuard(new Reflector());
    for (const method of ['findAll', 'download', 'findOne']) {
      const handler = DocumentFilesController.prototype[method];
      expect(handler).toBeDefined();
      const context: any = { getHandler: () => handler, getClass: () => DocumentFilesController,
        switchToHttp: () => ({ getRequest: () => ({ user: { roles: ['AUDITOR'], permissions: [] } }) }) };
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });
  it('admin still reads document metadata through the existing resource authority', async () => {
    const h = harness(); const actor = { userId: 'admin', roles: ['ADMIN'] };
    await h.service.findOne('foreign-file', actor);
    expect(h.access.assertDocumentEntityAccess).toHaveBeenCalledWith(expect.objectContaining({ entity_id: 'foreign-evidence' }), actor);
  });
  it('empty identity and void evidence cannot upload', async () => {
    const h = harness();
    await expect(h.service.uploadOwnCompetencyEvidence('own-evidence', {} as any, '')).rejects.toBeInstanceOf(ForbiddenException);
    h.db.expert_competency_evidences.findFirst.mockResolvedValue({ status: 'VOIDED', competency: { approval_status: 'DRAFT' } });
    await expect(h.service.uploadOwnCompetencyEvidence('own-evidence', {} as any, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    expect(promoteValidatedUpload).not.toHaveBeenCalled();
  });
});
