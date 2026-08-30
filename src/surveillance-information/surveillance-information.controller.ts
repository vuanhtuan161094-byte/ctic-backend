import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
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
import { SaveSurveillanceInformationDto } from './dto/save-surveillance-information.dto';
import { ReviewSurveillanceChangeDto } from './dto/review-surveillance-change.dto';
import { SurveillanceInformationService } from './surveillance-information.service';

@Controller('surveillance-information')
@ApiTags('08A. Cập nhật thông tin giám sát')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SurveillanceInformationController {
    constructor(
        private readonly service: SurveillanceInformationService,
        private readonly resourceAccess: ResourceAccessService,
    ) { }

    private actor(request: SecurityRequest) {
        const userId = getActorUserId(request);
        if (!userId) throw new UnauthorizedException('Authenticated user id is required');
        return { userId, roles: request.user?.roles ?? [] };
    }

    @Get('project/:projectId/event/:eventId')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR', 'AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('projects.read')
    @ApiOperation({ summary: 'Lấy thông tin hiện hành và snapshot của kỳ giám sát' })
    @ApiOkResponse({ description: 'Baseline, thay đổi và quyết định MD của GS1/GS2' })
    async get(
        @Param('projectId') projectId: string,
        @Param('eventId') eventId: string,
        @Req() request: SecurityRequest,
    ) {
        await this.resourceAccess.assertProjectAccess(projectId, this.actor(request));
        return this.service.get(projectId, eventId);
    }

    @Put('project/:projectId/event/:eventId')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR')
    @Permissions('projects.manage')
    @ApiOperation({ summary: 'Lưu nháp phiếu cập nhật thông tin trước giám sát' })
    async saveDraft(
        @Param('projectId') projectId: string,
        @Param('eventId') eventId: string,
        @Body() dto: SaveSurveillanceInformationDto,
        @Req() request: SecurityRequest,
    ) {
        const actor = this.actor(request);
        await this.resourceAccess.assertProjectAccess(projectId, actor);
        return this.service.saveDraft(projectId, eventId, dto, actor.userId);
    }

    @Post('project/:projectId/event/:eventId/confirm')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR')
    @Permissions('projects.manage')
    @ApiOperation({ summary: 'Xác nhận snapshot thông tin áp dụng cho kỳ giám sát' })
    async confirm(
        @Param('projectId') projectId: string,
        @Param('eventId') eventId: string,
        @Body() dto: SaveSurveillanceInformationDto,
        @Req() request: SecurityRequest,
    ) {
        const actor = this.actor(request);
        await this.resourceAccess.assertProjectAccess(projectId, actor);
        return this.service.confirm(projectId, eventId, dto, actor.userId);
    }

    @Post('project/:projectId/event/:eventId/revision')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR')
    @Permissions('projects.manage')
    @ApiOperation({ summary: 'Tạo bản cập nhật mới từ snapshot giám sát hiệu lực gần nhất' })
    async createRevision(
        @Param('projectId') projectId: string,
        @Param('eventId') eventId: string,
        @Req() request: SecurityRequest,
    ) {
        const actor = this.actor(request);
        await this.resourceAccess.assertProjectAccess(projectId, actor);
        return this.service.createRevision(projectId, eventId, actor.userId);
    }

    @Post('project/:projectId/event/:eventId/review-change')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR')
    @Permissions('projects.manage')
    @ApiOperation({ summary: 'Xem xét thay đổi và quyết định ngày công giám sát' })
    async reviewChange(
        @Param('projectId') projectId: string,
        @Param('eventId') eventId: string,
        @Body() dto: ReviewSurveillanceChangeDto,
        @Req() request: SecurityRequest,
    ) {
        const actor = this.actor(request);
        await this.resourceAccess.assertProjectAccess(projectId, actor);
        return this.service.reviewChange(projectId, eventId, dto, actor.userId);
    }
}
