import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CertificationAgreementsService } from './certification-agreements.service';

const actor = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const contractId = '33333333-3333-4333-8333-333333333333';
const agreementId = '44444444-4444-4444-8444-444444444444';
const dto = {
    customer_id: customerId, contract_id: contractId,
    agreement_number: '01/TTCN/C001', sign_date: '2026-11-16',
};

describe('P.09 F.18 signed-document governance and audit', () => {
    const db = {
        customers: { findUnique: jest.fn() },
        contracts: { findUnique: jest.fn() },
        certification_agreements: { findUnique: jest.fn(), create: jest.fn() },
        audit_logs: { create: jest.fn() },
        $transaction: jest.fn(),
    };
    const service = new CertificationAgreementsService(db as never);
    beforeEach(() => {
        jest.clearAllMocks();
        db.customers.findUnique.mockResolvedValue({ id: customerId, status: 'active' });
        db.contracts.findUnique.mockResolvedValue({ id: contractId, customer_id: customerId });
        db.certification_agreements.findUnique.mockResolvedValue(null);
        db.certification_agreements.create.mockResolvedValue({ id: agreementId, ...dto });
        db.audit_logs.create.mockResolvedValue({ id: 'audit-1' });
        db.$transaction.mockImplementation(async (callback) => callback(db));
    });
    it('rejects an unauthenticated creation before any database action', async () => {
        await expect(service.create(dto)).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.customers.findUnique).not.toHaveBeenCalled();
    });
    it('rejects contract crossing customer boundaries', async () => {
        db.contracts.findUnique.mockResolvedValue({ id: contractId, customer_id: 'other-customer' });
        await expect(service.create(dto, actor)).rejects.toBeInstanceOf(BadRequestException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
    it('creates F.18 and the actor audit log in the same transaction, without inventing a signed scan', async () => {
        await expect(service.create(dto, actor)).resolves.toEqual(expect.objectContaining({ id: agreementId }));
        expect(db.$transaction).toHaveBeenCalledTimes(1);
        expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                user_id: actor,
                action: 'CREATE_P09_F18_AGREEMENT',
                entity_type: 'certification_agreement',
                entity_id: agreementId,
            }),
        }));
        const payload = db.audit_logs.create.mock.calls[0][0].data.details_json;
        expect(JSON.parse(payload).signed_evidence_verified).toBe(false);
    });
});
