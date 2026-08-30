import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CommercialManagementReportingService } from './commercial-management-reporting.service';
import {
    CreateBillingMilestoneDto,
    CreateQuotationDto,
    QuotationTransitionDto,
    ReportingQueryDto,
    UpdateBillingMilestoneDto,
    UpdateQuotationDto,
} from './dto/commercial-management-reporting.dto';

type AuthRequest = { user: { userId?: string; id?: string; sub?: string; roles?: string[] } };
const MANAGEMENT_ROLES = ['ADMIN', 'STAFF', 'SALES', 'COORDINATOR'];
const COMMERCIAL_WRITE_ROLES = ['ADMIN', 'STAFF', 'SALES'];

@Controller('commercial-management-reporting')
@ApiTags('Commercial control and management reporting')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CommercialManagementReportingController {
    constructor(private readonly service: CommercialManagementReportingService) { }

    private actor(request: AuthRequest) {
        return request.user.userId ?? request.user.id ?? request.user.sub ?? '';
    }

    @Get('quotations')
    @Roles(...MANAGEMENT_ROLES)
    @Permissions('contracts.read')
    quotations(
        @Query('status') status?: string,
        @Query('customer_id') customerId?: string,
        @Query('project_id') projectId?: string,
        @Query('scheme_id') schemeId?: string,
        @Query('page') page?: string,
        @Query('page_size') pageSize?: string,
    ) {
        return this.service.listQuotations({ status, customer_id: customerId, project_id: projectId, scheme_id: schemeId, page: Number(page || 1), page_size: Number(pageSize || 25) });
    }

    @Get('quotations/:id')
    @Roles(...MANAGEMENT_ROLES)
    @Permissions('contracts.read')
    quotation(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getQuotation(id);
    }

    @Post('quotations')
    @Roles(...COMMERCIAL_WRITE_ROLES)
    @Permissions('contracts.manage')
    createQuotation(@Body() dto: CreateQuotationDto, @Req() request: AuthRequest) {
        return this.service.createQuotation(dto, this.actor(request));
    }

    @Patch('quotations/:id')
    @Roles(...COMMERCIAL_WRITE_ROLES)
    @Permissions('contracts.manage')
    updateQuotation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuotationDto, @Req() request: AuthRequest) {
        return this.service.updateQuotation(id, dto, this.actor(request));
    }

    @Post('quotations/:id/transition')
    @Roles(...COMMERCIAL_WRITE_ROLES)
    @Permissions('contracts.manage')
    transitionQuotation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QuotationTransitionDto, @Req() request: AuthRequest) {
        return this.service.transitionQuotation(id, dto.action, this.actor(request));
    }

    @Post('quotations/:id/revisions')
    @Roles(...COMMERCIAL_WRITE_ROLES)
    @Permissions('contracts.manage')
    reviseQuotation(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.service.reviseQuotation(id, this.actor(request));
    }

    @Get('billing-milestones')
    @Roles(...MANAGEMENT_ROLES)
    @Permissions('contracts.read')
    billingMilestones(@Query('contract_id') contractId?: string, @Query('page') page?: string, @Query('page_size') pageSize?: string) {
        return this.service.listBillingMilestones(contractId, Number(page || 1), Number(pageSize || 25));
    }

    @Post('billing-milestones')
    @Roles(...COMMERCIAL_WRITE_ROLES)
    @Permissions('contracts.manage')
    createBillingMilestone(@Body() dto: CreateBillingMilestoneDto, @Req() request: AuthRequest) {
        return this.service.createBillingMilestone(dto, this.actor(request));
    }

    @Patch('billing-milestones/:id')
    @Roles(...COMMERCIAL_WRITE_ROLES)
    @Permissions('contracts.manage')
    updateBillingMilestone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBillingMilestoneDto, @Req() request: AuthRequest) {
        return this.service.updateBillingMilestone(id, dto, this.actor(request));
    }

    @Get('cockpit')
    @Roles(...MANAGEMENT_ROLES)
    @Permissions('dashboard.read')
    cockpit(@Query() query: ReportingQueryDto, @Req() request: AuthRequest) {
        return this.service.getCockpit(query, request.user.roles ?? []);
    }

    @Get('cockpit/export.csv')
    @Roles(...MANAGEMENT_ROLES)
    @Permissions('dashboard.read')
    async exportCockpit(@Query() query: ReportingQueryDto, @Req() request: AuthRequest, @Res() response: Response) {
        const csv = await this.service.exportCockpitCsv(query, request.user.roles ?? [], this.actor(request));
        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', 'attachment; filename="cmp-management-report.csv"');
        response.send(csv);
    }
}
