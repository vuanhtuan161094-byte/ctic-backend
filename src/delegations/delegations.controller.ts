import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId, type SecurityRequest } from '../security/security-request';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { DelegationsService } from './delegations.service';

const INTERNAL_ROLES = ['ADMIN', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR', 'AUDITOR', 'TECHNICAL_EXPERT', 'TECHNICAL_REVIEWER', 'DECISION_MAKER'];

@Controller('delegations')
@ApiTags('Ủy quyền và thay thế tạm thời')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DelegationsController {
    constructor(private readonly delegations: DelegationsService) {}

    private actor(request: SecurityRequest) {
        return { userId: getActorUserId(request)!, roles: request.user?.roles ?? [] };
    }

    @Get('candidates')
    @Roles(...INTERNAL_ROLES)
    candidates(@Req() request: SecurityRequest) {
        return this.delegations.candidates(this.actor(request));
    }

    @Get('me')
    @Roles(...INTERNAL_ROLES)
    mine(@Req() request: SecurityRequest) {
        return this.delegations.listMine(this.actor(request));
    }

    @Get()
    @Roles('ADMIN')
    governance(@Req() request: SecurityRequest, @Query() query: Record<string, string | undefined>) {
        return this.delegations.listGovernance(this.actor(request), query);
    }

    @Post()
    @Roles(...INTERNAL_ROLES)
    create(@Body() dto: CreateDelegationDto, @Req() request: SecurityRequest) {
        return this.delegations.create(dto, this.actor(request));
    }

    @Patch(':id/revoke')
    @Roles(...INTERNAL_ROLES)
    revoke(@Param('id') id: string, @Req() request: SecurityRequest) {
        return this.delegations.revoke(id, this.actor(request));
    }
}
