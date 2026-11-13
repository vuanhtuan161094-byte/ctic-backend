import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { GlobalSearchService, type GlobalSearchQuery } from './global-search.service';

@Controller('me/global-search')
@ApiBearerAuth('jwt')
@ApiTags('Tìm kiếm nghiệp vụ')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GlobalSearchController {
    constructor(private readonly searchService: GlobalSearchService) {}

    @Get()
    @Roles('ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'LEAD_AUDITOR',
        'AUDITOR', 'TECHNICAL_EXPERT', 'TECHNICAL_REVIEWER', 'DECISION_MAKER')
    @ApiOperation({ summary: 'Tìm hồ sơ, khách hàng, đơn, chứng chỉ và công việc theo quyền thực tế' })
    find(@Req() request: SecurityRequest, @Query() query: GlobalSearchQuery) {
        return this.searchService.search({
            userId: getActorUserId(request)!,
            roles: request.user?.roles ?? [],
            permissions: request.user?.permissions ?? [],
        }, query);
    }
}
