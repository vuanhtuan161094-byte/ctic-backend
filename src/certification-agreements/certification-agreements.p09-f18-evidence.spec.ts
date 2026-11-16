import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CertificationAgreementsService } from './certification-agreements.service';

const agreementId = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const uploader = '33333333-3333-4333-8333-333333333333';
const fileId = '44444444-4444-4444-8444-444444444444';
const doc = {
    id: fileId, entity_type: 'certification_agreement', entity_id: agreementId,
    document_type: 'signed_certification_agreement', file_kind: 'signed_scan',
    is_current: true, sha256: 'a'.repeat(64), version_no: 2, uploaded_by: uploader,
    created_at: new Date(),
};
describe('P.09 F.18 independent signed evidence attestation', () => {
    const db = {
        certification_agreements: { findUnique: jest.fn() },
        documentFile: { findFirst: jest.fn() },
        workflow_approvals: { findFirst: jest.fn(), create: jest.fn() },
        audit_logs: { create: jest.fn() },
        $queryRaw: jest.fn(), $transaction: jest.fn(),
    };
    const service = new CertificationAgreementsService(db as never);
    beforeEach(() => {
        jest.clearAllMocks();
        db.$transaction.mockImplementation(async (fn) => fn(db));
        db.certification_agreements.findUnique.mockResolvedValue({
            id: agreementId, agreement_number: 'TTCN-001', customer_id: 'customer-1',
            customers: {}, contracts: null,
        });
        db.documentFile.findFirst.mockResolvedValue(doc);
        db.workflow_approvals.findFirst.mockResolvedValue(null);
        db.workflow_approvals.create.mockResolvedValue({ id: 'approval-1' });
        db.audit_logs.create.mockResolvedValue({ id: 'audit-1' });
    });
    const dto = { signed_file_id: fileId, verification_note: 'Đã đối chiếu bản có đủ hai chữ ký, đúng số thỏa thuận' };
    it('denies missing reviewer and short attestation', async () => {
        await expect(service.verifyEvidence(agreementId, dto)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.verifyEvidence(agreementId, { ...dto, verification_note: 'x' }, actor))
            .rejects.toBeInstanceOf(BadRequestException);
    });
    it('denies same-account upload and independent attestation', async () => {
        await expect(service.verifyEvidence(agreementId, dto, uploader)).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.workflow_approvals.create).not.toHaveBeenCalled();
    });
    it('rejects missing file SHA-256 and stale repeated approval', async () => {
        db.documentFile.findFirst.mockResolvedValueOnce({ ...doc, sha256: null });
        await expect(service.verifyEvidence(agreementId, dto, actor)).rejects.toBeInstanceOf(BadRequestException);
        db.workflow_approvals.findFirst.mockResolvedValueOnce({
            status: 'approved', step_no: 1,
            comment: JSON.stringify({ signed_file_id: fileId, sha256: doc.sha256 }),
        });
        await expect(service.verifyEvidence(agreementId, dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });
    it('approves exact-version signed evidence with audit log, not a synthetic signature', async () => {
        await expect(service.verifyEvidence(agreementId, dto, actor))
            .resolves.toEqual(expect.objectContaining({ evidence_verified: true, signed_file_id: fileId }));
        expect(db.workflow_approvals.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                entity_type: 'P09_F18_SIGNED_EVIDENCE',
                approver_id: actor, status: 'approved',
            }),
        }));
        expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'P09_F18_SIGNED_EVIDENCE_VERIFIED', user_id: actor }),
        }));
    });
    it('invalidates prior verification if a different signed file is now current', async () => {
        db.workflow_approvals.findFirst.mockResolvedValue({
            status: 'approved', approver_id: actor, approved_at: new Date(),
            comment: JSON.stringify({ signed_file_id: 'older-file', sha256: doc.sha256 }),
        });
        const result = await service.evidenceStatus(agreementId);
        expect(result.evidence_verified).toBe(false);
        expect(result.legal_signatures_independently_validated).toBe(false);
    });
});
