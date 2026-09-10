import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { CertificateWorkspaceController } from './certificate-workspace.controller';
import { projectCertificateWorkspace } from './certificate-workspace.projection';
import { CertificatesService } from './certificates.service';

function harness(roles = ['DECISION_MAKER'], permissions = ['certificates.manage']) {
    const selected = { id: 'c2', certificate_series_id: 's', verification_code: 'v2', version_no: 2, status: 'active', certification_scope: 'Scope2',
        certificate_series: { project_id: 'case', id: 's' }, technical_reviews: { id: 'r', reports: { audit_plan_id: 'p' } } };
    const prisma = { certificates: { findFirst: jest.fn().mockResolvedValue({ id: 'c2' }), findMany: jest.fn().mockResolvedValue([selected]) },
        documentFile: { findMany: jest.fn().mockResolvedValue([]) }, certificate_status_histories: { findMany: jest.fn().mockResolvedValue([]) } };
    const access = { assertEntityAccess: jest.fn().mockResolvedValue(undefined) };
    const actions = { canPerformAction: jest.fn().mockResolvedValue(true) };
    const certificates = { findOne: jest.fn().mockResolvedValue(selected), findPublicCertificate: jest.fn().mockResolvedValue({ is_current_version: true, is_valid: true }) };
    const controller = new CertificateWorkspaceController(prisma as never, access as never, actions as never, certificates as never);
    const request = { user: { userId: 'actor', roles, permissions } };
    return { selected, prisma, access, actions, certificates, run: () => controller.getWorkspace('c2', 'case', request as never) };
}
describe('Step17.7 bounded certificate workspace', () => {
    it('retains internal read roles and permission metadata', () => {
        expect(Reflect.getMetadata('roles', CertificateWorkspaceController.prototype.getWorkspace)).toEqual(['ADMIN', 'STAFF', 'SALES', 'DECISION_MAKER']);
        expect(Reflect.getMetadata('permissions', CertificateWorkspaceController.prototype.getWorkspace)).toEqual(['certificates.read']);
    });
    it('denies resource before loading context or protected source', async () => {
        const h = harness(); h.access.assertEntityAccess.mockRejectedValue(new ForbiddenException());
        await expect(h.run()).rejects.toBeInstanceOf(ForbiddenException);
        expect(h.prisma.certificates.findFirst).not.toHaveBeenCalled(); expect(h.certificates.findOne).not.toHaveBeenCalled();
    });
    it('fails closed on case mismatch before source reads', async () => {
        const h = harness(); h.prisma.certificates.findFirst.mockResolvedValue(null);
        await expect(h.run()).rejects.toBeInstanceOf(ForbiddenException); expect(h.certificates.findOne).not.toHaveBeenCalled();
    });
    it('rechecks case binding and concurrent current-version drift', async () => {
        const h = harness(); h.selected.certificate_series.project_id = 'other';
        await expect(h.run()).rejects.toBeInstanceOf(ForbiddenException);
        h.selected.certificate_series.project_id = 'case'; h.certificates.findPublicCertificate.mockResolvedValue({ is_current_version: false, is_valid: false });
        await expect(h.run()).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('derives PDF capability from the same scoped action as the production upload', async () => {
        const h = harness(); const result = await h.run(); expect(result.can_upload_pdf).toBe(true);
        expect(h.actions.canPerformAction).toHaveBeenCalledWith(expect.objectContaining({ resource: { entityType: 'certificate', entityId: 'c2' }, assignment: { assignedRole: 'DECISION_MAKER' }, workflowState: 'ISSUED' }));
        expect(result.can_issue_certificate).toBe(false);
    });
    it.each(['ADMIN', 'STAFF', 'SALES', 'TECHNICAL_REVIEWER', 'AUDITOR', 'LEAD_AUDITOR', 'CUSTOMER'])('never grants PDF writes to %s alone', async role => {
        const h = harness([role]); expect((await h.run()).can_upload_pdf).toBe(false); expect(h.actions.canPerformAction).not.toHaveBeenCalled();
    });
    it('DM with only Decision authority or denied scoped action cannot upload', async () => {
        const h = harness(['DECISION_MAKER'], ['certification_decisions.issue']); expect((await h.run()).can_upload_pdf).toBe(false);
        const denied = harness(); denied.actions.canPerformAction.mockResolvedValue(false); expect((await denied.run()).can_upload_pdf).toBe(false);
    });
    it('bounds reads and preserves historical resource identity', async () => {
        const h = harness(); h.prisma.certificates.findMany.mockResolvedValue([{ ...h.selected, id: 'c3', version_no: 3 }, h.selected]);
        h.certificates.findPublicCertificate.mockResolvedValue({ is_current_version: false, is_valid: false });
        const result = await h.run(); expect(result.is_historical).toBe(true); expect(result.can_upload_pdf).toBe(false);
        expect(result.certificate.id).toBe('c2'); expect(result.current_certificate.id).toBe('c3');
        expect(h.prisma.certificates.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51, where: { certificate_series_id: 's' } }));
    });
    it('allowlists nested secrets and keeps exact version PDF/snapshot association', () => {
        const selected = { id: 'c1', verification_code: 'v1', certification_scope: 'OLD', site_snapshot_json: '[{"site_name":"Old site","secret":"LEAK"}]', raw: 'LEAK', technical_reviews: { reports: { audit_plan_id: 'p' }, secret: 'LEAK' } };
        const versions = [{ id: 'c2', certification_scope: 'NEW' }, selected];
        const documents = [{ id: 'f1', entity_id: 'c1', document_type: 'certificate_pdf', mime_type: 'application/pdf', is_current: true, storage_path: 'LEAK', hash: 'LEAK' }, { id: 'f2', entity_id: 'c2' }];
        const result = projectCertificateWorkspace(selected, versions, documents, [], { is_valid: false, is_current_version: false }, 'case', true);
        expect(JSON.stringify(result)).not.toContain('LEAK'); expect(result.certificate.certification_scope).toBe('OLD');
        expect(result.documents.map(file => file.id)).toEqual(['f1']); expect(result.version_timeline[0].documents.map(file => file.id)).toEqual(['f2']);
        expect(result.public_verification.pdf_path).toBeNull(); expect(result.public_verification.path).toBe('/public/certificates/v1'); expect(result.can_upload_pdf).toBe(false);
    });
    it.each(['suspended', 'withdrawn', 'expired', 'replaced'])('does not reinterpret %s or fabricate public validity', status => {
        const result = projectCertificateWorkspace({ id: 'c', status }, [{ id: 'c', status }], [], [], { is_valid: false, is_current_version: true }, 'case', false);
        expect(result.certificate.status).toBe(status); expect(result.public_verification.is_valid).toBe(false); expect(result.allowed_status_actions).toEqual([]);
    });
    it.each(['missing', 'incomplete', 'unapproved', 'unsent'])('existing issuance rejects %s prerequisite without writes', async mode => {
        const review = { status: mode === 'incomplete' ? 'pending' : 'completed', certification_decision: mode === 'missing' ? null : { status: 'issued', decision_result: mode === 'unapproved' ? 'rejected' : 'approved', decision_type: 'GRANT' }, audit_result_notification: { status: 'draft' } };
        const prisma = { certificates: { findFirst: jest.fn().mockResolvedValue(null) }, technical_reviews: { findUnique: jest.fn().mockResolvedValue(review) }, $transaction: jest.fn() };
        const service = new CertificatesService(prisma as never, {} as never);
        await expect(service.create({ technical_review_id: 'r', cert_number: 'n' })).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
