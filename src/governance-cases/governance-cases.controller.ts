import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getResourceActor } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import {
    AppealReviewDto,
    AssessCertificationChangeDto,
    AssignAppealDto,
    AssignComplaintDto,
    CaseListQueryDto,
    CloseComplaintDto,
    ComplaintInvestigationDto,
    CreateAppealDto,
    CreateCertificationChangeCaseDto,
    CreateComplaintDto,
    CreateSpecialAuditDto,
    DecideAppealDto,
    LinkControlledOutputDto,
    LinkResultingDecisionDto,
    LinkSpecialAuditPlanDto,
    RecordSpecialAuditResultDto,
} from './dto/governance-case.dto';
import { GovernanceCasesService } from './governance-cases.service';

const INTERNAL_CASE_ROLES = [
    'ADMIN',
    'COORDINATOR',
    'AUDITOR',
    'LEAD_AUDITOR',
    'TECHNICAL_REVIEWER',
    'DECISION_MAKER',
] as const;

@Controller('governance-cases')
@ApiTags('29. Thay đổi, đánh giá đặc biệt, khiếu nại và kháng nghị')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...INTERNAL_CASE_ROLES)
@Permissions('projects.read')
export class GovernanceCasesController {
    constructor(private readonly service: GovernanceCasesService) {}

    private actor(request: SecurityRequest) {
        return getResourceActor(request);
    }

    @Get('changes')
    changeCases(@Query() query: CaseListQueryDto, @Req() request: SecurityRequest) {
        return this.service.listChangeCases(query, this.actor(request));
    }

    @Post('changes')
    @Roles('ADMIN', 'COORDINATOR')
    createChange(@Body() dto: CreateCertificationChangeCaseDto, @Req() request: SecurityRequest) {
        return this.service.createChangeCase(dto, this.actor(request));
    }

    @Post('changes/:id/assessment')
    @Roles('ADMIN', 'COORDINATOR', 'TECHNICAL_REVIEWER')
    assessChange(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssessCertificationChangeDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.assessChangeCase(id, dto, this.actor(request));
    }

    @Post('changes/:id/resulting-decision')
    @Roles('ADMIN', 'COORDINATOR', 'DECISION_MAKER')
    linkChangeDecision(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: LinkResultingDecisionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.linkResultingDecision('change', id, dto, this.actor(request));
    }

    @Post('special-audits')
    @Roles('ADMIN', 'COORDINATOR')
    createSpecialAudit(@Body() dto: CreateSpecialAuditDto, @Req() request: SecurityRequest) {
        return this.service.createSpecialAudit(dto, this.actor(request));
    }

    @Get('special-audits')
    specialAudits(@Query() query: CaseListQueryDto, @Req() request: SecurityRequest) {
        return this.service.listSpecialAudits(query, this.actor(request));
    }

    @Post('special-audits/:id/plan')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR')
    linkSpecialAuditPlan(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: LinkSpecialAuditPlanDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.linkSpecialAuditPlan(id, dto, this.actor(request));
    }

    @Post('special-audits/:id/result')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR')
    specialAuditResult(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RecordSpecialAuditResultDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.recordSpecialAuditResult(id, dto, this.actor(request));
    }

    @Post('special-audits/:id/resulting-decision')
    @Roles('ADMIN', 'COORDINATOR', 'DECISION_MAKER')
    linkSpecialAuditDecision(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: LinkResultingDecisionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.linkResultingDecision('special-audit', id, dto, this.actor(request));
    }

    @Get('complaints')
    complaints(@Query() query: CaseListQueryDto, @Req() request: SecurityRequest) {
        return this.service.listComplaints(query, this.actor(request));
    }

    @Post('complaints')
    @Roles('ADMIN', 'COORDINATOR')
    createComplaint(@Body() dto: CreateComplaintDto, @Req() request: SecurityRequest) {
        return this.service.createComplaint(dto, this.actor(request));
    }

    @Post('complaints/:id/assign')
    @Roles('ADMIN', 'COORDINATOR')
    assignComplaint(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignComplaintDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.assignComplaint(id, dto, this.actor(request));
    }

    @Post('complaints/:id/acknowledge')
    @Roles('ADMIN', 'COORDINATOR')
    acknowledgeComplaint(@Param('id', ParseUUIDPipe) id: string, @Req() request: SecurityRequest) {
        return this.service.acknowledgeComplaint(id, this.actor(request));
    }

    @Post('complaints/:id/investigation')
    @Roles('ADMIN', 'COORDINATOR', 'AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    investigateComplaint(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ComplaintInvestigationDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.investigateComplaint(id, dto, this.actor(request));
    }

    @Post('complaints/:id/close')
    @Roles('ADMIN', 'COORDINATOR', 'DECISION_MAKER')
    closeComplaint(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CloseComplaintDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.closeComplaint(id, dto, this.actor(request));
    }

    @Get('appeals')
    appeals(@Query() query: CaseListQueryDto, @Req() request: SecurityRequest) {
        return this.service.listAppeals(query, this.actor(request));
    }

    @Post('appeals')
    @Roles('ADMIN', 'COORDINATOR')
    createAppeal(@Body() dto: CreateAppealDto, @Req() request: SecurityRequest) {
        return this.service.createAppeal(dto, this.actor(request));
    }

    @Post('appeals/:id/assign')
    @Roles('ADMIN', 'COORDINATOR')
    assignAppeal(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignAppealDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.assignAppeal(id, dto, this.actor(request));
    }

    @Post('appeals/:id/review')
    @Roles('ADMIN', 'TECHNICAL_REVIEWER')
    reviewAppeal(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AppealReviewDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.reviewAppeal(id, dto, this.actor(request));
    }

    @Post('appeals/:id/decision')
    @Roles('ADMIN', 'DECISION_MAKER')
    decideAppeal(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: DecideAppealDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.decideAppeal(id, dto, this.actor(request));
    }

    @Post('appeals/:id/resulting-decision')
    @Roles('ADMIN', 'COORDINATOR', 'DECISION_MAKER')
    linkAppealDecision(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: LinkResultingDecisionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.linkResultingDecision('appeal', id, dto, this.actor(request));
    }

    @Post(':domain/:id/controlled-output')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER', 'DECISION_MAKER')
    linkControlledOutput(
        @Param('domain') domain: 'change' | 'special-audit' | 'complaint' | 'appeal',
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: LinkControlledOutputDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.linkControlledOutput(domain, id, dto, this.actor(request));
    }

    @Get(':entityType/:id/history')
    history(
        @Param('entityType') entityType: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: SecurityRequest,
    ) {
        return this.service.history(entityType, id, this.actor(request));
    }
}
