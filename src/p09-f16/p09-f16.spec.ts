import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { P09F16Controller } from './p09-f16.controller';
import { P09F16Service } from './p09-f16.service';

const preparer = '11111111-1111-4111-8111-111111111111';
const approver = '22222222-2222-4222-8222-222222222222';
const revisionId = '33333333-3333-4333-8333-333333333333';
const row = {
    id: revisionId,
    revision_no: 1,
    organizations_json: JSON.stringify([
        { name: 'Tổ chức chứng nhận A', recognition_scope: 'Chứng nhận hệ thống quản lý chất lượng' },
    ]),
    status: 'draft', prepared_by: preparer, approved_by: null,
    approved_at: null, note: 'Rà soát thừa nhận dựa trên hồ sơ năng lực', created_at: new Date(),
};
const dto = {
    organizations: [{ name: 'Tổ chức chứng nhận A', recognition_scope: 'Chứng nhận hệ thống quản lý chất lượng' }],
    justification: 'Rà soát thừa nhận dựa trên hồ sơ năng lực',
};

describe('P09 F.16 independent recognized certification bodies registry', () => {
    const db = {
        p09_recognized_certification_bodies: {
            findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
            create: jest.fn(), updateMany: jest.fn(),
        },
        audit_logs: { create: jest.fn() },
        $transaction: jest.fn(),
    };
    const service = new P09F16Service(db as never);
    beforeEach(() => {
        jest.clearAllMocks();
        db.$transaction.mockImplementation(async (cb) => cb(db));
        db.p09_recognized_certification_bodies.findMany.mockResolvedValue([]);
        db.p09_recognized_certification_bodies.create.mockResolvedValue(row);
        db.p09_recognized_certification_bodies.findUnique.mockResolvedValue(row);
        db.p09_recognized_certification_bodies.findFirst.mockResolvedValue(row);
        db.p09_recognized_certification_bodies.updateMany.mockResolvedValue({ count: 1 });
        db.audit_logs.create.mockResolvedValue({ id: 'audit-1' });
    });
    it('only exposes F16 preparation internally and independent approval to ADMIN', () => {
        const proto = P09F16Controller.prototype;
        expect(Reflect.getMetadata(ROLES_KEY, proto.create)).toEqual(['ADMIN', 'STAFF']);
        expect(Reflect.getMetadata(ROLES_KEY, proto.approve)).toEqual(['ADMIN']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.approve)).toEqual(['documents.manage']);
    });
    it('blocks missing actor and duplicate body names', async () => {
        await expect(service.create(dto)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.create({
            ...dto,
            organizations: [dto.organizations[0], { ...dto.organizations[0], name: dto.organizations[0].name.toUpperCase() }],
        }, preparer)).rejects.toBeInstanceOf(BadRequestException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
    it('creates a draft revision with audit event, without manday authority', async () => {
        const actual = await service.create(dto, preparer);
        expect(actual.status).toBe('draft');
        expect(actual.manday_reduction_authorized).toBe(false);
        expect(actual.signed_original_attested).toBe(false);
        expect(db.p09_recognized_certification_bodies.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ revision_no: 1, prepared_by: preparer, status: 'draft' }) }),
        );
        expect(db.audit_logs.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ action: 'P09_F16_PREPARE', user_id: preparer }) }),
        );
    });
    it('rejects creating another draft before approval', async () => {
        db.p09_recognized_certification_bodies.findMany.mockResolvedValue([row]);
        await expect(service.create(dto, preparer)).rejects.toBeInstanceOf(ConflictException);
    });
    it('prevents preparer self-approval and stale/finished revision decisions', async () => {
        await expect(service.approve(revisionId, { approval_note: 'Căn cứ kiểm tra đã đầy đủ điều kiện' }, preparer))
            .rejects.toBeInstanceOf(ForbiddenException);
        db.p09_recognized_certification_bodies.findUnique.mockResolvedValue({ ...row, status: 'approved' });
        await expect(service.approve(revisionId, { approval_note: 'Căn cứ kiểm tra đã đầy đủ điều kiện' }, approver))
            .rejects.toBeInstanceOf(ConflictException);
    });
    it('approves one draft with actor, audit event and no legal signature assertion', async () => {
        db.p09_recognized_certification_bodies.findUnique
            .mockResolvedValueOnce(row)
            .mockResolvedValueOnce({ ...row, status: 'approved', approved_by: approver, approved_at: new Date() });
        const result = await service.approve(revisionId, { approval_note: 'Xác nhận chứng cứ phù hợp phạm vi thừa nhận' }, approver);
        expect(result.status).toBe('approved');
        expect(result.signed_original_attested).toBe(false);
        expect(db.p09_recognized_certification_bodies.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: revisionId, status: 'draft', approved_by: null },
        }));
        expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'P09_F16_APPROVE', user_id: approver }),
        }));
    });
});
