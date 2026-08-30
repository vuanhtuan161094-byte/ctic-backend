import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getResourceActor } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { CreateAppealDto, CreateComplaintDto } from './dto/governance-case.dto';
import { GovernanceCasesService } from './governance-cases.service';

@Controller('customer-portal/me/cases')
@ApiTags('29. Customer-safe complaints and appeals')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('CUSTOMER')
@Permissions('customer_portal.access')
export class GovernanceCasesPortalController {
    constructor(private readonly service: GovernanceCasesService) {}

    @Get('changes')
    changes(@Req() request: SecurityRequest) {
        return this.service.portalChangeCases(getResourceActor(request));
    }

    @Get('complaints')
    complaints(@Req() request: SecurityRequest) {
        return this.service.portalComplaints(getResourceActor(request));
    }

    @Post('complaints')
    createComplaint(@Body() dto: CreateComplaintDto, @Req() request: SecurityRequest) {
        return this.service.createComplaint(dto, getResourceActor(request), true);
    }

    @Get('appeals')
    appeals(@Req() request: SecurityRequest) {
        return this.service.portalAppeals(getResourceActor(request));
    }

    @Post('appeals')
    createAppeal(@Body() dto: CreateAppealDto, @Req() request: SecurityRequest) {
        return this.service.createAppeal(dto, getResourceActor(request), true);
    }
}
