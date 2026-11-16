import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { P09F16Service } from './p09-f16.service';
import { P09F16Controller } from './p09-f16.controller';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';

const id='11111111-1111-4111-8111-111111111111';
const preparedBy='22222222-2222-4222-8222-222222222222';
const approvedBy='33333333-3333-4333-8333-333333333333';
const issuer='44444444-4444-4444-8444-444444444444';
const fileId='55555555-5555-4555-8555-555555555555';
const current={id:fileId,sha256:'a'.repeat(64),version_no:1,
  uploaded_by:approvedBy,original_name:'F16-signed.pdf'};
const version={id,revision_no:1,organizations_json:'[{"name":"Tổ chức A","recognition_scope":"ISO 9001"}]',
  prepared_by:preparedBy,approved_by:approvedBy,approved_at:new Date(),
  status:'approved',note:'approved',created_at:new Date()};

describe('F.16 independent controlled signed issuance',()=>{
  const db={
    p09_recognized_certification_bodies:{findUnique:jest.fn()},
    workflow_approvals:{findFirst:jest.fn(),create:jest.fn()},
    documentFile:{findFirst:jest.fn()},
    audit_logs:{create:jest.fn()},
    $queryRaw:jest.fn(),$transaction:jest.fn(),
  };
  const service=new P09F16Service(db as never);
  beforeEach(()=>{
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn)=>fn(db));
    db.p09_recognized_certification_bodies.findUnique.mockResolvedValue(version);
    db.documentFile.findFirst.mockResolvedValue(current);
    db.workflow_approvals.findFirst.mockResolvedValue(null);
    db.workflow_approvals.create.mockResolvedValue({id:'issue-1'});
  });
  const note='Đã kiểm tra bản ký của người lập và người phê duyệt đúng thẩm quyền';
  it('restricts issuer to ADMIN with documents.manage',()=>{
    const fn=P09F16Controller.prototype.issue;
    expect(Reflect.getMetadata(ROLES_KEY,fn)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,fn)).toEqual(['documents.manage']);
  });
  it('forbids unsigned draft, self-issued and self-uploaded evidence',async()=>{
    db.p09_recognized_certification_bodies.findUnique.mockResolvedValueOnce({...version,status:'draft'});
    await expect(service.issueOfficial(id,fileId,note,issuer)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.issueOfficial(id,fileId,note,preparedBy)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.issueOfficial(id,fileId,note,approvedBy)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requires nonempty verified SHA and substantive note',async()=>{
    db.documentFile.findFirst.mockResolvedValueOnce({...current,sha256:null});
    await expect(service.issueOfficial(id,fileId,note,issuer)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.issueOfficial(id,fileId,'short',issuer)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('records separate immutable release approval and audit log',async()=>{
    const v=await service.issueOfficial(id,fileId,note,issuer);
    expect(v).toMatchObject({official_issued:true,issued_by:issuer,signed_file_id:fileId});
    expect(db.workflow_approvals.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({entity_type:'P09_F16_OFFICIAL_ISSUE',status:'approved',approver_id:issuer}),
    }));
    expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({action:'P09_F16_OFFICIAL_ISSUE',user_id:issuer}),
    }));
  });
  it('invalidates an issued record when the signed scan changes',async()=>{
    db.workflow_approvals.findFirst.mockResolvedValue({approver_id:issuer,approved_at:new Date(),
      status:'approved',comment:JSON.stringify({signed_file_id:'old-file',sha256:current.sha256})});
    expect((await service.issueStatus(id)).official_issued).toBe(false);
  });
  it('prohibits repeated approval for same exact signed file',async()=>{
    db.workflow_approvals.findFirst.mockResolvedValue({status:'approved',step_no:1,
      comment:JSON.stringify({signed_file_id:fileId,sha256:current.sha256})});
    await expect(service.issueOfficial(id,fileId,note,issuer)).rejects.toBeInstanceOf(ConflictException);
  });
});
