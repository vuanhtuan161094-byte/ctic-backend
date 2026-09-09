import { BadRequestException, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../security/resource-access.service';
import { getResourceActor, type SecurityRequest } from '../security/security-request';
import { ActionAuthorizationService } from '../work-items/action-authorization.service';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { CertificationResultsService } from '../certification-results/certification-results.service';
import { TechnicalReviewsService } from '../technical-reviews/technical-reviews.service';
import { CertificationDecisionsService } from './certification-decisions.service';
import { projectDecisionWorkspace } from './decision-workspace.projection';

@Controller('certification-decisions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DecisionWorkspaceController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ResourceAccessService,
        private readonly actions: ActionAuthorizationService,
        private readonly results: CertificationResultsService,
        private readonly reviews: TechnicalReviewsService,
        private readonly decisions: CertificationDecisionsService,
    ) {}

    @Get('plan/:planId/case-workspace')
    @Roles('ADMIN', 'TECHNICAL_REVIEWER', 'DECISION_MAKER')
    @Permissions('certification_decisions.read')
    async getWorkspace(
        @Param('planId', ParseUUIDPipe) planId: string,
        @Query('case_id', ParseUUIDPipe) caseId: string,
        @Query('technical_review_id') reviewId: string | undefined,
        @Req() request: SecurityRequest,
    ) {
        const actor = getResourceActor(request);
        await this.access.assertEntityAccess({ entity_type: 'audit_plan', entity_id: planId }, actor);
        const context = await this.prisma.audit_plans.findFirst({ where: { id: planId, project_id: caseId }, select: { id: true } });
        if (!context) throw new ForbiddenException();
        const workspace = await this.results.getWorkspace(planId);
        if (workspace.plan.project_id !== caseId || (reviewId && workspace.technical_review?.id !== reviewId)) throw new ForbiddenException();
        const upstream = await this.reviews.getCaseWorkspace(planId, caseId);
        if (upstream.report?.id !== workspace.report?.id || upstream.review?.id !== workspace.technical_review?.id) throw new ForbiddenException();
        const roles = actor.roles.map(role => role.trim().toUpperCase());
        const permitted = roles.includes('ADMIN') || (request.user?.permissions ?? []).includes('certification_decisions.issue');
        let issue = false;
        let independence = 'NOT_CHECKED';
        if (actor.userId && roles.includes('DECISION_MAKER') && permitted && workspace.technical_review) {
            issue = await this.actions.canPerformAction({ user: actor, actionCode: WORK_ITEM_ACTIONS.CERTIFICATION_DECISION,
                resource: { entityType: 'technical_review', entityId: workspace.technical_review.id },
                assignment: { assignedRole: 'DECISION_MAKER' }, workflowState: 'OPEN' });
            if (issue) {
                const review = await this.prisma.technical_reviews.findUnique({ where: { id: workspace.technical_review.id }, select: { reviewer_id: true, reports: { select: { audit_plan_id: true } } } });
                if (!review || review.reports.audit_plan_id !== planId) throw new ForbiddenException();
                try {
                    await this.decisions.assertDecisionMakerIndependent(review, actor.userId);
                    independence = 'CONFIRMED';
                } catch (error) {
                    if (!(error instanceof BadRequestException)) throw error;
                    issue = false;
                    independence = 'CONFLICT';
                }
            }
        }
        return projectDecisionWorkspace(workspace, upstream, caseId, {
            issue, independence,
            generate: permitted && roles.some(role => ['ADMIN', 'DECISION_MAKER'].includes(role)),
        });
    }
}
