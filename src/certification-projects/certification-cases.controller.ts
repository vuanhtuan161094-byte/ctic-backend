import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ResourceAccessService } from '../security/resource-access.service';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { CertificationCaseProjectionService } from './certification-case-projection.service';

const caseReaderRoles = [
  'ADMIN',
  'STAFF',
  'SALES',
  'COORDINATOR',
  'LEAD_AUDITOR',
  'AUDITOR',
  'TECHNICAL_EXPERT',
  'TECHNICAL_REVIEWER',
  'DECISION_MAKER',
];

@Controller('certification-cases')
@ApiTags('07. Hồ sơ chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CertificationCasesController {
  constructor(
    private readonly projection: CertificationCaseProjectionService,
    private readonly resourceAccess: ResourceAccessService,
  ) {}

  private actor(request: SecurityRequest) {
    return {
      userId: getActorUserId(request),
      roles: request.user?.roles ?? [],
    };
  }

  @Get(':id/workspace')
  @Roles(...caseReaderRoles)
  @Permissions('projects.read')
  @ApiOperation({ summary: 'Lấy read projection của hồ sơ chứng nhận' })
  @ApiOkResponse({ description: 'Certification Case workspace contract v2' })
  async workspace(@Param('id') id: string, @Req() request: SecurityRequest) {
    const actor = this.actor(request);
    await this.resourceAccess.assertProjectAccess(id, actor);
    return this.projection.getWorkspace(id, actor);
  }

  @Get(':id/activity')
  @Roles(...caseReaderRoles)
  @Permissions('projects.read')
  @ApiOperation({
    summary: 'Lấy dòng hoạt động nghiệp vụ của hồ sơ chứng nhận',
  })
  @ApiOkResponse({
    description: 'Dòng hoạt động có cursor, đã giới hạn và lọc quyền',
  })
  async activity(
    @Param('id') id: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cycle') cycle: string | undefined,
    @Query('types') types: string | undefined,
    @Req() request: SecurityRequest,
  ) {
    const actor = this.actor(request);
    await this.resourceAccess.assertProjectAccess(id, actor);
    return this.projection.getActivity(id, actor, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      cycle,
      types: types
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }
}
