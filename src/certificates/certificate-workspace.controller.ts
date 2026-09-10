import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../security/resource-access.service';
import { getResourceActor, type SecurityRequest } from '../security/security-request';
import { ActionAuthorizationService } from '../work-items/action-authorization.service';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { CertificatesService } from './certificates.service';
import { projectCertificateWorkspace } from './certificate-workspace.projection';

@Controller('certificates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CertificateWorkspaceController {
    constructor(private readonly prisma: PrismaService, private readonly access: ResourceAccessService,
        private readonly actions: ActionAuthorizationService, private readonly certificates: CertificatesService) {}

    @Get(':id/case-workspace')
    @Roles('ADMIN', 'STAFF', 'SALES', 'DECISION_MAKER')
    @Permissions('certificates.read')
    async getWorkspace(@Param('id', ParseUUIDPipe) id: string, @Query('case_id', ParseUUIDPipe) caseId: string, @Req() request: SecurityRequest) {
        const actor = getResourceActor(request);
        await this.access.assertEntityAccess({ entity_type: 'certificate', entity_id: id }, actor);
        const context = await this.prisma.certificates.findFirst({ where: { id, certificate_series: { project_id: caseId } }, select: { id: true } });
        if (!context) throw new ForbiddenException();
        const selected = await this.certificates.findOne(id);
        if (selected.certificate_series.project_id !== caseId) throw new ForbiddenException();
        const versions = await this.prisma.certificates.findMany({ where: { certificate_series_id: selected.certificate_series_id }, orderBy: { version_no: 'desc' }, take: 51,
            include: { certification_decision: { select: { id: true, decision_number: true, decision_date: true, decision_type: true, decision_result: true } } } });
        const ids = [...new Set([id, ...versions.slice(0, 50).map(item => item.id)])];
        const documents = await this.prisma.documentFile.findMany({ where: { entity_type: 'certificate', entity_id: { in: ids }, document_type: 'certificate_pdf' },
            orderBy: [{ is_current: 'desc' }, { version_no: 'desc' }], take: 500 });
        const history = await this.prisma.certificate_status_histories.findMany({ where: { certificate_id: id }, orderBy: { created_at: 'desc' }, take: 50,
            include: { certification_decision: { select: { id: true, decision_number: true, decision_type: true, decision_result: true } }, changed_by_user: { select: { id: true, full_name: true } } } });
        const verification = await this.certificates.findPublicCertificate(selected.verification_code);
        // Detect concurrent lineage changes rather than presenting two different current versions.
        if (verification.is_current_version !== (versions[0]?.id === id)) throw new ForbiddenException();
        const roles = actor.roles.map(role => role.trim().toUpperCase());
        let upload = false;
        if (actor.userId && verification.is_current_version && roles.includes('DECISION_MAKER') && (roles.includes('ADMIN') || request.user?.permissions?.includes('certificates.manage'))) {
            upload = await this.actions.canPerformAction({ user: actor, actionCode: WORK_ITEM_ACTIONS.CERTIFICATE_ISSUE,
                resource: { entityType: 'certificate', entityId: id }, assignment: { assignedRole: 'DECISION_MAKER' }, workflowState: 'ISSUED' });
        }
        return projectCertificateWorkspace(selected, versions, documents, history, verification, caseId, upload);
    }
}
